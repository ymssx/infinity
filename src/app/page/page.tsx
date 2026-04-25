"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { savePage, getPage as getCachedPage, clearPageHtml, buildAncestryContext } from "@/lib/client-store";
import { SelectionContext } from "@/types";
import { isConfigured, getBasePath } from "@/lib/config";
import { streamGeneratePage } from "@/lib/openai";

// ============================================================
// Incremental DOM Streaming Engine
// ============================================================

/**
 * Interaction scripts injected once into the iframe document.
 * Handles: link interception, text selection (highlight-to-ask), parent click notification.
 */
const INTERACTION_SCRIPT = `
  // Link click interception — post to parent instead of navigating
  document.addEventListener('click', function(e) {
    var anchor = e.target.closest ? e.target.closest('a') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({ type: 'iframe-link-click', href: href }, '*');
  }, true);

  // Text selection listener — detect when user finishes selecting text
  var _selTimeout = null;
  document.addEventListener('mouseup', function() {
    clearTimeout(_selTimeout);
    _selTimeout = setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        window.parent.postMessage({ type: 'iframe-selection-clear' }, '*');
        return;
      }
      var selected = sel.toString().trim();
      if (selected.length < 2) return;

      var range = sel.getRangeAt(0);
      var container = range.commonAncestorContainer;
      while (container && container.nodeType !== 1) container = container.parentNode;
      var fullText = container ? container.textContent || '' : '';
      var selStart = fullText.indexOf(selected);
      var before = '', after = '';
      if (selStart >= 0) {
        before = fullText.slice(Math.max(0, selStart - 100), selStart);
        after = fullText.slice(selStart + selected.length, selStart + selected.length + 100);
      }

      var rect = range.getBoundingClientRect();
      window.parent.postMessage({
        type: 'iframe-selection',
        selected: selected,
        before: before,
        after: after,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width }
      }, '*');
    }, 200);
  });

  document.addEventListener('mousedown', function() {
    clearTimeout(_selTimeout);
    window.parent.postMessage({ type: 'iframe-click' }, '*');
  });
`;

const INTERACTION_STYLE = "body{padding-bottom:60px!important;} ::selection{background:rgba(99,102,241,0.25);}";

/**
 * Manages incremental DOM updates to an iframe using doc.write() in append mode.
 *
 * Key insight: when you call doc.open() once and then doc.write() multiple times
 * WITHOUT calling doc.close(), each write() APPENDS to the document. The browser
 * parses the new HTML incrementally, building the DOM without destroying existing nodes.
 * This preserves user selection, scroll position, hover states, and link clickability.
 *
 * Flow:
 *   1. First update: doc.open() once, then doc.write(chunk)
 *   2. Subsequent updates: doc.write(newChunk) — appends only
 *   3. Finalize: doc.close() + inject interaction scripts
 */
class IncrementalIframeWriter {
  private iframe: HTMLIFrameElement;
  private opened = false;       // whether doc.open() has been called
  private committedLength = 0;  // how many chars of the buffer we've already written
  private injectedDuringStream = false; // whether interaction scripts were injected via doc.write()

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  /**
   * Called with the growing buffer on each animation frame.
   * Finds the safe boundary (last '>') and writes only the new portion.
   */
  update(buffer: string) {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    if (!this.opened) {
      doc.open();
      this.opened = true;
      // Inject interaction scripts immediately so links and text selection
      // work during streaming, not just after finalize().
      // We write a small inline <script> that sets up event listeners on
      // the document as it's being parsed — they'll capture all future
      // elements thanks to event delegation (listeners on `document`).
      doc.write(`<script>${INTERACTION_SCRIPT}<\/script><style>${INTERACTION_STYLE}</style>`);
      this.injectedDuringStream = true;
    }

    // Find the safe boundary — up to the last complete '>'
    const lastGt = buffer.lastIndexOf(">");
    if (lastGt === -1) return;

    const safeEnd = lastGt + 1;
    if (safeEnd <= this.committedLength) return; // nothing new

    // Extract only the new portion and write it (appends to existing doc)
    const newChunk = buffer.slice(this.committedLength, safeEnd);
    this.committedLength = safeEnd;

    doc.write(newChunk);
  }

  /**
   * Called once streaming is complete.
   * Writes any remaining content, closes the document, and injects interaction scripts.
   */
  finalize(finalHtml: string) {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    if (!this.opened) {
      // Stream never started (or was reset); do a full write
      doc.open();
      doc.write(finalHtml);
      doc.close();
      // Need to inject since we did a fresh doc.open()
      this.injectInteraction();
    } else {
      // Write any remaining content beyond what we've committed
      if (finalHtml.length > this.committedLength) {
        doc.write(finalHtml.slice(this.committedLength));
      }
      doc.close();

      // Only inject if we didn't already inject during streaming
      if (!this.injectedDuringStream) {
        this.injectInteraction();
      }
    }

    this.committedLength = finalHtml.length;
    this.opened = false;
    this.injectedDuringStream = false;
  }

  /**
   * Write complete HTML in one shot (used for cached pages, no streaming).
   */
  writeComplete(html: string) {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    this.committedLength = html.length;
    this.opened = false;

    this.injectInteraction();
  }

  /** Inject interaction styles + scripts into the current document */
  private injectInteraction() {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    try {
      const style = doc.createElement("style");
      style.textContent = INTERACTION_STYLE;
      (doc.head || doc.documentElement || doc).appendChild(style);

      const script = doc.createElement("script");
      script.textContent = INTERACTION_SCRIPT;
      (doc.body || doc.documentElement || doc).appendChild(script);
    } catch { /* ignore */ }
  }

  /** Reset state for a new stream */
  reset() {
    this.opened = false;
    this.committedLength = 0;
    this.injectedDuringStream = false;
  }
}

// ============================================================
// Streaming Page Component
// ============================================================

function PageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const parentId = searchParams.get("parentId") || undefined;
  const scParam = searchParams.get("sc") || undefined;
  const pageId = searchParams.get("id") || "";

  // Parse selection context from URL if present (from highlight-to-ask)
  const urlSelectionContext: SelectionContext | undefined = (() => {
    if (!scParam) return undefined;
    try { return JSON.parse(scParam) as SelectionContext; }
    catch { return undefined; }
  })();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const writerRef = useRef<IncrementalIframeWriter | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<"loading" | "streaming" | "done" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const finalHtmlRef = useRef<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Capsule state
  const capsuleRef = useRef<HTMLDivElement>(null);
  const capsuleInputRef = useRef<HTMLInputElement>(null);
  const [capsuleExpanded, setCapsuleExpanded] = useState(false);
  const [capsuleQuery, setCapsuleQuery] = useState(query);
  const isComposingRef = useRef(false);

  /** Get or create the incremental writer for the current iframe */
  const getWriter = useCallback(() => {
    if (!iframeRef.current) return null;
    if (!writerRef.current) {
      writerRef.current = new IncrementalIframeWriter(iframeRef.current);
    }
    return writerRef.current;
  }, []);

  // Cleanup: abort generation when navigating away or unmounting
  useEffect(() => {
    const cleanup = () => {
      abortRef.current?.abort();
    };

    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, []);

  /**
   * Navigate to a URL detected from an iframe link.
   */
  const navigateToHref = useCallback((href: string) => {
    if (href.startsWith("#")) {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.defaultView) doc.defaultView.location.hash = href;
      } catch { /* ignore */ }
    } else if (href.startsWith("http://") || href.startsWith("https://")) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else if (href === "/" || href === "") {
      // Home link — navigate to homepage with basePath
      window.location.href = `${getBasePath()}/`;
    } else {
      // Handle /search?q=... links by generating a new pageId client-side
      let targetHref = href;
      try {
        const url = new URL(href, window.location.origin);
        if (url.pathname === "/search") {
          const q = url.searchParams.get("q");
          if (q) {
            const newPageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const dest = new URL(`${getBasePath()}/page`, window.location.origin);
            dest.searchParams.set("id", newPageId);
            dest.searchParams.set("q", q);
            dest.searchParams.set("parentId", pageId);
            const sc = url.searchParams.get("sc");
            if (sc) dest.searchParams.set("sc", sc);
            targetHref = dest.pathname + dest.search;
          }
        } else {
          url.searchParams.set("parentId", pageId);
          targetHref = url.pathname + url.search;
        }
      } catch {
        const sep = href.includes("?") ? "&" : "?";
        targetHref = `${href}${sep}parentId=${encodeURIComponent(pageId)}`;
      }
      window.open(targetHref, "_blank", "noopener,noreferrer");
    }
  }, [pageId]);

  // ============================================================
  // Text selection (highlight-to-ask) state
  // ============================================================
  const [selectionCtx, setSelectionCtx] = useState<SelectionContext | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selectionQuery, setSelectionQuery] = useState("");
  const selectionPanelRef = useRef<HTMLDivElement>(null);
  const selectionInputRef = useRef<HTMLInputElement>(null);

  /**
   * Listen for postMessage events from the iframe:
   * - iframe-link-click: navigate to link
   * - iframe-selection: user selected text
   * - iframe-selection-clear: user cleared selection
   */
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data.type !== "string") return;

      if (e.data.type === "iframe-link-click") {
        const href = e.data.href as string;
        if (!href) return;
        navigateToHref(href);
      }

      if (e.data.type === "iframe-selection") {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const iframeRect = iframe.getBoundingClientRect();
        const r = e.data.rect;

        setSelectionCtx({
          selected: e.data.selected,
          before: e.data.before,
          after: e.data.after,
        });
        setSelectionRect({
          top: iframeRect.top + r.bottom + 8,
          left: iframeRect.left + r.left + r.width / 2,
          width: r.width,
        });
        setSelectionQuery("");
        // Auto-focus the input after render
        setTimeout(() => selectionInputRef.current?.focus(), 100);
      }

      if (e.data.type === "iframe-selection-clear") {
        // Only clear if user isn't interacting with our panel
        if (selectionPanelRef.current?.contains(document.activeElement)) return;
        setSelectionCtx(null);
        setSelectionRect(null);
      }

      if (e.data.type === "iframe-click") {
        // Collapse capsule when clicking inside iframe
        setCapsuleExpanded(false);
        setCapsuleQuery(query);
        // Close selection panel if user clicks away in the iframe
        if (!selectionPanelRef.current?.contains(document.activeElement)) {
          setSelectionCtx(null);
          setSelectionRect(null);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigateToHref, query]);

  // Close selection panel when clicking outside
  useEffect(() => {
    if (!selectionCtx) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (selectionPanelRef.current && !selectionPanelRef.current.contains(e.target as Node)) {
        setSelectionCtx(null);
        setSelectionRect(null);
      }
    };
    // Delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectionCtx]);

  // Submit selection-based question (supports direct text or input value)
  const handleSelectionSubmit = useCallback((directQuery?: string) => {
    const trimmed = (directQuery ?? selectionQuery).trim();
    if (!trimmed || !selectionCtx) return;

    const newPageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const sc = encodeURIComponent(JSON.stringify(selectionCtx));
    window.open(
      `${getBasePath()}/page?id=${newPageId}&q=${encodeURIComponent(trimmed)}&parentId=${encodeURIComponent(pageId)}&sc=${sc}`,
      "_blank",
      "noopener,noreferrer"
    );
    setSelectionCtx(null);
    setSelectionRect(null);
    setSelectionQuery("");
  }, [selectionQuery, selectionCtx, pageId]);

  // Quick-action shortcuts for selection popup
  const selectionShortcuts = [
    { label: "解释一下", icon: "💡", query: "解释一下这段内容" },
    { label: "深入展开", icon: "🔍", query: "深入展开讲讲这部分" },
    { label: "举个例子", icon: "📝", query: "举个具体的例子" },
    { label: "翻译", icon: "🌐", query: "翻译这段内容为中文（如已是中文则翻译为英文）" },
  ];

  useEffect(() => {
    if (!query) return;

    // Check if API key is configured
    if (!isConfigured()) {
      setPhase("error");
      return;
    }

    const writer = getWriter();

    // Check localStorage cache first (skip if refreshing)
    if (refreshKey === 0) {
      const cached = getCachedPage(pageId);
      if (cached && cached.html) {
        writer?.writeComplete(cached.html);
        finalHtmlRef.current = cached.html;
        setPhase("done");
        return;
      }
    }

    // No cache — start streaming (direct LLM call from browser)
    writer?.reset();
    setPhase("streaming");
    setProgress(0);

    let cancelled = false;
    const abortController = new AbortController();
    abortRef.current = abortController;

    const generate = async () => {
      try {
        // Build ancestry context from localStorage
        const contextHistory = buildAncestryContext(parentId);

        // Stream AI-generated HTML directly from browser (single LLM call)
        let buffer = "";
        let rafId: number | null = null;
        let needsRender = false;

        const scheduleRender = () => {
          needsRender = true;
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!needsRender || cancelled) return;
            needsRender = false;
            writer?.update(buffer);
            setProgress(buffer.length);
          });
        };

        const fullHtml = await streamGeneratePage(
          query,
          undefined,
          undefined,
          contextHistory,
          (token: string) => {
            if (cancelled || abortController.signal.aborted) return;
            buffer += token;
            scheduleRender();
          },
          undefined, // no prefetched data
          urlSelectionContext,
          abortController.signal
        );

        if (cancelled) return;

        if (rafId !== null) cancelAnimationFrame(rafId);

        let finalHtml = fullHtml;

        // Extract AI-generated summary from meta tag
        let summary = "";
        const metaMatch = finalHtml.match(/<meta\s+name=["']page-summary["']\s+content=["']([^"']*)["']/i);
        summary = metaMatch?.[1] || "";

        // Final clean render
        writer?.finalize(finalHtml);
        finalHtmlRef.current = finalHtml;

        // Persist to localStorage
        const titleMatch = finalHtml.match(/<title>(.*?)<\/title>/i);
        const linkMatches = [...finalHtml.matchAll(/data-q="([^"]*)"/g)];
        const links = linkMatches.map((m) => m[1]).slice(0, 15);

        savePage({
          id: pageId,
          query,
          html: finalHtml,
          createdAt: Date.now(),
          parentId,
          title: titleMatch?.[1] || query,
          links,
          summary,
        });

        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setPhase("done");
          return;
        }
        console.error(err);
        setPhase("error");
      } finally {
        abortRef.current = null;
      }
    };

    generate();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, getWriter, refreshKey]);

  // Stop generation handler
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Refresh: clear cache and re-generate the page
  const handleRefresh = useCallback(() => {
    abortRef.current?.abort();
    clearPageHtml(pageId);
    finalHtmlRef.current = "";
    writerRef.current?.reset();
    setPhase("streaming");
    setProgress(0);
    setRefreshKey((k) => k + 1);
  }, [pageId]);

  // Export: download iframe content as HTML file
  const handleExport = useCallback(() => {
    let html = "";
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.documentElement) {
        html = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
      }
    } catch { /* cross-origin fallback */ }

    if (!html) {
      html = finalHtmlRef.current;
    }

    if (!html) return;

    // Remove the injected padding style
    html = html.replace(/<style>body\{padding-bottom:60px!important;\}<\/style>/g, "");

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = query
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "page";
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [query]);

  // Capsule: submit new query
  const handleCapsuleSubmit = useCallback(() => {
    const trimmed = capsuleQuery.trim();
    if (!trimmed || trimmed === query) return;
    const newPageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.open(
      `${getBasePath()}/page?id=${newPageId}&q=${encodeURIComponent(trimmed)}&parentId=${encodeURIComponent(pageId)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setCapsuleExpanded(false);
    setCapsuleQuery(query);
  }, [capsuleQuery, query, pageId]);

  const handleCapsuleInputClick = useCallback(() => {
    if (!capsuleExpanded) {
      setCapsuleExpanded(true);
      setTimeout(() => capsuleInputRef.current?.focus(), 80);
    }
  }, [capsuleExpanded]);

  useEffect(() => {
    if (!capsuleExpanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (capsuleRef.current && !capsuleRef.current.contains(e.target as Node)) {
        setCapsuleExpanded(false);
        setCapsuleQuery(query);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [capsuleExpanded, query]);

  // Error state
  if (phase === "error") {
    const configured = isConfigured();
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl text-indigo-400/40 mb-4">∞</p>
          {!configured ? (
            <>
              <p className="text-gray-400 mb-4">请先配置 API Key</p>
              <a href={`${getBasePath()}/`} className="text-indigo-500 hover:text-indigo-600 text-sm">
                ← 返回首页设置
              </a>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">加载失败，请返回重试</p>
              <a href={`${getBasePath()}/`} className="text-indigo-500 hover:text-indigo-600 text-sm">
                ← 返回首页
              </a>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-white">
      {/* Fullscreen iframe for rendered HTML — no overlay, direct interaction */}
      <iframe
        ref={iframeRef}
        className="absolute inset-0 w-full h-full border-none"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
        title="Generated Page"
      />

      {/* Text selection popup — appears when user highlights text */}
      {selectionCtx && selectionRect && (
        <div
          ref={selectionPanelRef}
          className="fixed z-30"
          style={{
            top: Math.min(selectionRect.top, window.innerHeight - 200),
            left: Math.max(16, Math.min(selectionRect.left, window.innerWidth - 360)),
            transform: "translateX(-50%)",
            animation: "sel-pop-in 0.18s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <style>{`
            @keyframes sel-pop-in {
              from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(0.97); }
              to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
            }
          `}</style>
          <div className="bg-white/60 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.10),0_1.5px_6px_rgba(0,0,0,0.06)] p-3 w-[340px]">
            {/* Selected text preview */}
            <div className="text-xs text-gray-500/80 mb-2.5 flex items-center gap-1.5 px-0.5">
              <svg className="h-3 w-3 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">
                &ldquo;{selectionCtx.selected.length > 50 ? selectionCtx.selected.slice(0, 50) + "…" : selectionCtx.selected}&rdquo;
              </span>
            </div>

            {/* Quick-action shortcut chips */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {selectionShortcuts.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSelectionSubmit(s.query)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/70 backdrop-blur-sm border border-gray-200/60 text-gray-600 hover:bg-indigo-50/80 hover:text-indigo-600 hover:border-indigo-200/60 transition-all active:scale-95 cursor-pointer"
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            {/* Custom input row */}
            <div className="flex items-center gap-2">
              <input
                ref={selectionInputRef}
                type="text"
                value={selectionQuery}
                onChange={(e) => setSelectionQuery(e.target.value)}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isComposingRef.current) handleSelectionSubmit();
                  if (e.key === "Escape") {
                    setSelectionCtx(null);
                    setSelectionRect(null);
                  }
                }}
                placeholder="或输入自定义问题..."
                className="flex-1 bg-white/50 backdrop-blur-sm rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-300/40 border border-white/60 min-w-0"
              />
              <button
                onClick={() => handleSelectionSubmit()}
                disabled={!selectionQuery.trim()}
                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-500/90 backdrop-blur-sm text-white transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom capsule */}
      <div
        ref={capsuleRef}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`
            flex items-center bg-white/90 backdrop-blur-2xl backdrop-saturate-150 rounded-full border border-gray-200/80 shadow-[0_8px_40px_rgba(0,0,0,0.08),0_1.5px_6px_rgba(0,0,0,0.05)]
            transition-all duration-300 ease-in-out overflow-hidden
            ${capsuleExpanded ? "w-[560px] px-5 py-3" : "w-auto max-w-[320px] px-3 py-2"}
          `}
        >
          {/* Home button */}
          <a
            href={`${getBasePath()}/`}
            title="返回首页"
            className="shrink-0 text-indigo-400 hover:text-indigo-600 transition-colors font-serif text-lg leading-none px-1 cursor-pointer"
          >
            ∞
          </a>
          <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

          {/* Search icon */}
          <svg className={`${capsuleExpanded ? "h-5 w-5" : "h-3.5 w-3.5"} text-gray-600 shrink-0 transition-all`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>

          {/* Input area */}
          {capsuleExpanded ? (
            <input
              ref={capsuleInputRef}
              type="text"
              value={capsuleQuery}
              onChange={(e) => setCapsuleQuery(e.target.value)}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isComposingRef.current) handleCapsuleSubmit();
                if (e.key === "Escape") {
                  setCapsuleExpanded(false);
                  setCapsuleQuery(query);
                }
              }}
              placeholder="输入新的问题..."
              className="flex-1 bg-transparent px-3 py-1 text-base text-gray-900 placeholder-gray-400 outline-none min-w-0"
            />
          ) : (
            <span
              onClick={handleCapsuleInputClick}
              className="text-xs text-gray-900 font-medium truncate px-2 cursor-text select-none"
            >
              {query}
            </span>
          )}

          {/* Submit button */}
          {capsuleExpanded && (
            <button
              onClick={handleCapsuleSubmit}
              disabled={!capsuleQuery.trim() || capsuleQuery.trim() === query}
              className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-500 text-white transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Streaming status */}
          {(phase === "streaming" || phase === "loading") && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <svg className="h-3.5 w-3.5 animate-spin text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-600 ml-1 shrink-0 whitespace-nowrap">
                {progress > 0 ? `${Math.round(progress / 1024)}KB` : "加载中"}
              </span>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleStop}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                <span className="text-xs font-medium">停止</span>
              </button>
            </>
          )}

          {/* Export & Refresh buttons */}
          {phase === "done" && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleRefresh}
                title="重新生成此页面"
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.51 15A9 9 0 0 0 18.36 18.36L20 15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium">刷新</span>
              </button>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleExport}
                title="保存为 HTML 文件"
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M12 19l-5-5M12 19l5-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 21h16" strokeLinecap="round" />
                </svg>
                <span className="text-xs font-medium">保存</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GeneratedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-gray-400 text-sm">加载中...</div>
        </main>
      }
    >
      <PageContent />
    </Suspense>
  );
}
