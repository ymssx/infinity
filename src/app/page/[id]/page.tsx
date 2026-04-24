"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ============================================================
// HTML Auto-Close Tag Engine
// ============================================================

/** Void elements that never need closing tags */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Given a partial HTML string, find the "safe" portion (up to the last `>`)
 * and compute the closing tags needed to make it well-formed.
 *
 * Returns { safeHtml, closingTags }
 * - safeHtml: the portion of `raw` up to and including the last `>`
 * - closingTags: string of `</tag>` in reverse-open order to close all open tags
 */
function autoCloseHtml(raw: string): { safeHtml: string; closingTags: string } {
  // Find the last '>' — everything after it is an incomplete tag, discard it
  const lastGt = raw.lastIndexOf(">");
  if (lastGt === -1) {
    // No complete tag yet — return empty
    return { safeHtml: "", closingTags: "" };
  }

  const safeHtml = raw.slice(0, lastGt + 1);

  // Parse open/close tags from safeHtml to build a tag stack
  const tagStack: string[] = [];
  // Match opening tags: <tagname ...> and closing tags: </tagname>
  // Skip comments, doctype, self-closing
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(safeHtml)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    // Skip comments / doctype
    if (fullMatch.startsWith("<!--") || fullMatch.startsWith("<!")) continue;

    // Skip self-closing tags like <br/> <img />
    if (fullMatch.endsWith("/>")) continue;

    // Skip void elements
    if (VOID_ELEMENTS.has(tagName)) continue;

    if (fullMatch.startsWith("</")) {
      // Closing tag — pop from stack if matches
      const idx = tagStack.lastIndexOf(tagName);
      if (idx !== -1) {
        tagStack.splice(idx, 1);
      }
    } else {
      // Opening tag
      tagStack.push(tagName);
    }
  }

  // Build closing tags in reverse order (innermost first)
  const closingTags = tagStack
    .slice()
    .reverse()
    .map((t) => `</${t}>`)
    .join("");

  return { safeHtml, closingTags };
}

// ============================================================
// Streaming Page Component
// ============================================================

function PageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [phase, setPhase] = useState<"streaming" | "done" | "error">("streaming");
  const [progress, setProgress] = useState(0); // rough char count for progress hint

  // Capsule state — single instance, always
  const capsuleRef = useRef<HTMLDivElement>(null);
  const capsuleInputRef = useRef<HTMLInputElement>(null);
  const [capsuleExpanded, setCapsuleExpanded] = useState(false);
  const [capsuleQuery, setCapsuleQuery] = useState(query);
  const isComposingRef = useRef(false); // Track IME composition (Chinese input)

  /**
   * Simple iframe renderer — just doc.open/write/close.
   * NO event listeners inside iframe. All click handling is done
   * externally via a transparent overlay + elementFromPoint.
   */
  const renderToIframe = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    // Inject bottom padding so content isn't hidden behind the capsule
    try {
      const style = doc.createElement("style");
      style.textContent = "body{padding-bottom:60px!important;}";
      (doc.head || doc.documentElement || doc).appendChild(style);
    } catch { /* ignore */ }
  }, []);

  // Cleanup: abort generation when navigating away or unmounting
  useEffect(() => {
    const cleanup = () => {
      readerRef.current?.cancel().catch(() => {});
      abortRef.current?.abort();
    };

    // Listen for page navigation / tab close
    window.addEventListener("beforeunload", cleanup);

    return () => {
      window.removeEventListener("beforeunload", cleanup);
      // Also cleanup on React unmount (e.g. client-side navigation)
      cleanup();
    };
  }, []);

  /**
   * Navigate to a URL detected from an iframe link.
   * Stops generation, then opens external links in new tab, internal links in place.
   */
  const navigateToHref = useCallback((href: string) => {
    // Stop the current generation immediately (safe even if already done)
    readerRef.current?.cancel().catch(() => {});
    abortRef.current?.abort();

    if (href.startsWith("#")) {
      // Anchor links — scroll within iframe
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.defaultView) doc.defaultView.location.hash = href;
      } catch { /* ignore */ }
    } else if (href.startsWith("http://") || href.startsWith("https://")) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = href;
    }
  }, []);

  /**
   * Given a mouse event on the overlay, find the corresponding <a> element
   * inside the iframe via elementFromPoint.
   */
  const findIframeLinkAt = useCallback((clientX: number, clientY: number): HTMLAnchorElement | null => {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;

    // Convert parent-page coordinates to iframe-local coordinates
    const rect = iframe.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    try {
      const el = doc.elementFromPoint(x, y);
      if (!el) return null;
      // Walk up to find the nearest <a> ancestor
      return el.closest("a") as HTMLAnchorElement | null;
    } catch {
      return null; // cross-origin or no doc
    }
  }, []);

  // Overlay ref for cursor management
  const overlayRef = useRef<HTMLDivElement>(null);

  /**
   * Overlay: handle click — detect link in iframe and navigate
   */
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    const anchor = findIframeLinkAt(e.clientX, e.clientY);
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        navigateToHref(href);
      }
    } else {
      // Not a link click — forward the click to the iframe by briefly hiding the overlay
      // This allows normal interactions (buttons, forms, etc.) inside the iframe
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.pointerEvents = "none";
        // Re-enable after a tick so future clicks are still intercepted
        requestAnimationFrame(() => {
          if (overlay) overlay.style.pointerEvents = "auto";
        });
      }
    }
  }, [findIframeLinkAt, navigateToHref]);

  /**
   * Overlay: handle mouse move — change cursor to pointer when hovering a link
   */
  const handleOverlayMouseMove = useCallback((e: React.MouseEvent) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const anchor = findIframeLinkAt(e.clientX, e.clientY);
    overlay.style.cursor = anchor ? "pointer" : "default";
  }, [findIframeLinkAt]);

  /**
   * Forward scroll events from the overlay to the iframe's contentWindow.
   * Without this, the overlay blocks all scrolling on the iframe.
   */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const handleWheel = (e: WheelEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin) return;
      // Scroll the iframe's window by the same delta
      iframeWin.scrollBy({ left: e.deltaX, top: e.deltaY });
      e.preventDefault(); // Prevent parent page from scrolling
    };

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!query) return;

    // Local flag — set to true on cleanup so the async loop stops.
    // This is Strict-Mode safe: first mount's cleanup sets cancelled=true,
    // the second mount starts fresh with its own cancelled=false.
    let cancelled = false;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const generate = async () => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, history: [] }),
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          if (!cancelled) setPhase("error");
          return;
        }

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = ""; // All received content so far
        let rafId: number | null = null;
        let needsRender = false;

        // Throttled render — at most once per animation frame
        const scheduleRender = () => {
          needsRender = true;
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!needsRender || cancelled) return;
            needsRender = false;

            const { safeHtml, closingTags } = autoCloseHtml(buffer);
            if (safeHtml) {
              renderToIframe(safeHtml + closingTags);
              setProgress(safeHtml.length);
            }
          });
        };

        // Read the stream
        while (true) {
          if (cancelled) break;
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Check for error marker
          if (buffer.includes("<!--STREAM_ERROR:")) {
            if (!cancelled) setPhase("error");
            return;
          }

          scheduleRender();
        }

        if (cancelled) return;

        // Final render — clean up any markdown fences and write the complete buffer
        if (rafId !== null) cancelAnimationFrame(rafId);
        // Strip markdown code fences that some models wrap around HTML
        buffer = buffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
        buffer = buffer.replace(/\n?```\s*$/, "");
        renderToIframe(buffer);
        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        // If aborted by user, render what we have and mark done
        if (err instanceof DOMException && err.name === "AbortError") {
          setPhase("done");
          return;
        }
        console.error(err);
        setPhase("error");
      } finally {
        abortRef.current = null;
        readerRef.current = null;
      }
    };

    generate();

    // Cleanup: abort everything when unmounting or re-running
    return () => {
      cancelled = true;
      readerRef.current?.cancel().catch(() => {});
      abortController.abort();
    };
  }, [query, renderToIframe]);

  // Stop generation handler
  const handleStop = useCallback(() => {
    // Cancel the reader first, then abort the fetch
    readerRef.current?.cancel().catch(() => {});
    abortRef.current?.abort();
  }, []);

  // Capsule: submit new query
  const handleCapsuleSubmit = useCallback(() => {
    const trimmed = capsuleQuery.trim();
    if (!trimmed || trimmed === query) return;
    window.location.href = `/search?q=${encodeURIComponent(trimmed)}`;
  }, [capsuleQuery, query]);

  // Capsule: click input area to expand
  const handleCapsuleInputClick = useCallback(() => {
    if (!capsuleExpanded) {
      setCapsuleExpanded(true);
      setTimeout(() => capsuleInputRef.current?.focus(), 80);
    }
  }, [capsuleExpanded]);

  // Capsule: click outside to collapse
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
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-3xl text-indigo-400/40 mb-4">∞</p>
          <p className="text-gray-400 mb-4">加载失败，请返回重试</p>
          <a href="/" className="text-indigo-500 hover:text-indigo-600 text-sm">
            ← 返回首页
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-white">
      {/* Fullscreen iframe for rendered HTML */}
      <iframe
        ref={iframeRef}
        className="absolute inset-0 w-full h-full border-none"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
        title="Generated Page"
      />

      {/*
        Transparent overlay — sits on top of the iframe to intercept clicks.
        Uses elementFromPoint to detect <a> tags inside the iframe.
        This approach works regardless of doc.open/write/close cycles during streaming.
      */}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10"
        onClick={handleOverlayClick}
        onMouseMove={handleOverlayMouseMove}
        style={{ background: "transparent" }}
      />

      {/* Unified bottom capsule — single instance, always visible */}
      <div
        ref={capsuleRef}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`
            flex items-center bg-white/90 backdrop-blur-md rounded-full border border-gray-200/80 shadow-lg
            transition-all duration-300 ease-in-out overflow-hidden
            ${capsuleExpanded ? "w-[560px] px-5 py-3" : "w-auto max-w-[320px] px-3 py-2"}
          `}
        >
          {/* Search icon */}
          <svg className={`${capsuleExpanded ? "h-5 w-5" : "h-3.5 w-3.5"} text-gray-400 shrink-0 transition-all`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>

          {/* Input area — compact or expanded */}
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
              className="flex-1 bg-transparent px-3 py-1 text-base text-gray-800 placeholder-gray-400 outline-none min-w-0"
            />
          ) : (
            <span
              onClick={handleCapsuleInputClick}
              className="text-xs text-gray-500 truncate px-2 cursor-text select-none"
            >
              {query}
            </span>
          )}

          {/* Submit button — visible when expanded */}
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

          {/* Divider + Streaming status — shown during generation */}
          {phase === "streaming" && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-2 shrink-0" />
              <svg className="h-3.5 w-3.5 animate-spin text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-400 ml-1 shrink-0 whitespace-nowrap">
                {progress > 0 ? `${Math.round(progress / 1024)}KB` : "加载中"}
              </span>
              <div className="w-px h-4 bg-gray-200 mx-2 shrink-0" />
              <button
                onClick={handleStop}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                <span className="text-xs">停止</span>
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
