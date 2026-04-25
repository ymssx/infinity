"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { savePage, getPage as getCachedPage, clearPageHtml, buildAncestryContext } from "@/lib/client-store";
import { SelectionContext } from "@/types";
import { isConfigured, getBasePath } from "@/lib/config";
import { streamGeneratePage, streamRevisionPage } from "@/lib/openai";
import { RevisionComment, buildAnnotatedHtml } from "@/lib/prompt";
import { buildImageComponentScript } from "@/lib/image-component";
import SettingsModal from "@/components/SettingsModal";

// ============================================================
// Incremental DOM Streaming Engine
// ============================================================

/**
 * Interaction scripts injected once into the iframe document.
 * Handles: link interception, text selection (highlight-to-ask), parent click notification.
 */
const INTERACTION_SCRIPT = `
  var _revisionMode = false;

  // Link click interception — post to parent instead of navigating
  document.addEventListener('click', function(e) {
    if (_revisionMode) return; // Don't intercept clicks in revision mode
    var anchor = e.target.closest ? e.target.closest('a') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({ type: 'iframe-link-click', href: href }, '*');
  }, true);

  // Store the last selection range so parent can request highlighting
  var _lastRange = null;

  // Text selection listener — detect when user finishes selecting text
  var _selTimeout = null;
  document.addEventListener('mouseup', function() {
    clearTimeout(_selTimeout);
    _selTimeout = setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        _lastRange = null;
        window.parent.postMessage({ type: 'iframe-selection-clear' }, '*');
        return;
      }
      var selected = sel.toString().trim();
      if (selected.length < 2) return;

      _lastRange = sel.getRangeAt(0).cloneRange();

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

  // Listen for highlight requests from parent
  window.addEventListener('message', function(e) {
    if (!e.data) return;

    // Toggle revision mode in iframe
    if (e.data.type === 'set-revision-mode') {
      _revisionMode = !!e.data.enabled;
      // In revision mode, prevent link navigation via CSS
      if (_revisionMode) {
        // Replace <a> with <inf-link> to prevent drag behavior
        var anchors = document.querySelectorAll('a');
        for (var li = anchors.length - 1; li >= 0; li--) {
          var a = anchors[li];
          var span = document.createElement('inf-link');
          // Copy all attributes
          for (var ai = 0; ai < a.attributes.length; ai++) {
            span.setAttribute(a.attributes[ai].name, a.attributes[ai].value);
          }
          span.style.cssText = a.style.cssText;
          span.innerHTML = a.innerHTML;
          span.style.cursor = 'text';
          a.parentNode.replaceChild(span, a);
        }
      } else {
        // Restore <inf-link> back to <a>
        var spans = document.querySelectorAll('inf-link');
        for (var si = spans.length - 1; si >= 0; si--) {
          var sp = spans[si];
          var newA = document.createElement('a');
          for (var bi = 0; bi < sp.attributes.length; bi++) {
            if (sp.attributes[bi].name === 'style') continue; // drop injected style
            newA.setAttribute(sp.attributes[bi].name, sp.attributes[bi].value);
          }
          newA.innerHTML = sp.innerHTML;
          sp.parentNode.replaceChild(newA, sp);
        }
      }
      return;
    }

    // Re-trigger current selection (used when entering revision mode with existing selection)
    if (e.data.type === '__trigger-selection') {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
      var selected = sel.toString().trim();
      _lastRange = sel.getRangeAt(0).cloneRange();
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
      return;
    }

    if (e.data.type !== 'highlight-selection') return;
    var comment = e.data.comment;
    var rcId = e.data.rcId;

    if (!_lastRange) return;
    var range = _lastRange;

    // Get rects BEFORE any DOM modifications
    var rects = range.getClientRects();
    var selectedText = range.toString().trim();

    // 1) Semantic wrap: insert <inf-comment> tags around text nodes (no style)
    var textNodes = [];
    var startNode = range.startContainer;
    var endNode = range.endContainer;

    if (startNode === endNode && startNode.nodeType === 3) {
      textNodes.push({ node: startNode, start: range.startOffset, end: range.endOffset });
    } else {
      var tw2 = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      var inRange = false;
      while (tw2.nextNode()) {
        var tn = tw2.currentNode;
        if (tn === startNode) {
          inRange = true;
          textNodes.push({ node: tn, start: range.startOffset, end: tn.textContent.length });
        } else if (tn === endNode) {
          textNodes.push({ node: tn, start: 0, end: range.endOffset });
          break;
        } else if (inRange) {
          textNodes.push({ node: tn, start: 0, end: tn.textContent.length });
        }
      }
    }

    for (var i = textNodes.length - 1; i >= 0; i--) {
      var info = textNodes[i];
      var txt = info.node.textContent.slice(info.start, info.end);
      if (!txt.trim()) continue;
      info.node.splitText(info.end);
      var selNode = info.node.splitText(info.start);
      var wrapper = document.createElement('inf-comment');
      wrapper.setAttribute('data-rc-id', rcId);
      selNode.parentNode.replaceChild(wrapper, selNode);
      wrapper.appendChild(selNode);
    }

    // 2) Insert an HTML comment annotation before the selection's nearest block ancestor
    var ancestor = range.startContainer;
    while (ancestor && ancestor.nodeType !== 1) ancestor = ancestor.parentNode;
    // Walk up to find the nearest block-level element
    var blockTags = ['P','DIV','H1','H2','H3','H4','H5','H6','LI','SECTION','ARTICLE','BLOCKQUOTE','TD','TH','HEADER','FOOTER','MAIN','FIGURE','FIGCAPTION'];
    var blockEl = ancestor;
    while (blockEl && blockEl !== document.body) {
      if (blockEl.nodeType === 1 && blockTags.indexOf(blockEl.tagName) !== -1) break;
      blockEl = blockEl.parentNode;
    }
    if (!blockEl || blockEl === document.body) blockEl = ancestor;

    // Get the selected text for the annotation
    var annotationText = 'Revision: regarding "' + selectedText.slice(0, 50) + (selectedText.length > 50 ? '…' : '') + '" —— ' + comment;
    var commentNode = document.createComment(' [REVISION id=' + rcId + '] ' + annotationText + ' ');
    if (blockEl && blockEl.parentNode) {
      blockEl.parentNode.insertBefore(commentNode, blockEl);
    }

    // 2) Visual overlay: absolute positioned divs for background highlight
    for (var j = 0; j < rects.length; j++) {
      var r = rects[j];
      if (r.width < 1 || r.height < 1) continue;
      var ov = document.createElement('div');
      ov.setAttribute('data-rc-overlay', rcId);
      ov.style.cssText = 'position:absolute;pointer-events:none;z-index:0;'
        + 'left:' + (r.left + window.scrollX) + 'px;'
        + 'top:' + (r.top + window.scrollY) + 'px;'
        + 'width:' + r.width + 'px;'
        + 'height:' + r.height + 'px;'
        + 'background:rgba(251,191,36,0.3);border-radius:2px;';
      document.body.appendChild(ov);
    }

    // 3) Comment bubble under the last rect (clickable to delete)
    if (rects.length > 0) {
      var last = rects[rects.length - 1];
      var bubble = document.createElement('div');
      bubble.setAttribute('data-rc-bubble', rcId);
      bubble.style.cssText = 'position:absolute;z-index:999;cursor:pointer;'
        + 'left:' + (last.left + window.scrollX) + 'px;'
        + 'top:' + (last.bottom + window.scrollY + 2) + 'px;'
        + 'display:inline-flex;align-items:center;gap:4px;'
        + 'background:#059669;color:#fff;font-size:11px;line-height:1.2;'
        + 'padding:2px 6px 2px 8px;border-radius:4px;font-weight:500;white-space:nowrap;'
        + 'box-shadow:0 2px 6px rgba(0,0,0,0.15);';

      var textSpan = document.createElement('span');
      textSpan.textContent = comment;
      bubble.appendChild(textSpan);

      var closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'opacity:0.6;font-size:10px;padding:0 2px;margin-left:2px;';
      closeBtn.onmouseenter = function() { closeBtn.style.opacity = '1'; };
      closeBtn.onmouseleave = function() { closeBtn.style.opacity = '0.6'; };
      bubble.appendChild(closeBtn);

      // Only ✕ button triggers delete, not the whole bubble
      closeBtn.onclick = function(ev) {
        ev.stopPropagation();
        window.parent.postMessage({ type: 'iframe-delete-comment', rcId: rcId }, '*');
      };

      // Hover: highlight all overlays of the same group
      function highlightGroup(bright) {
        var ovs = document.querySelectorAll('[data-rc-overlay="' + rcId + '"]');
        for (var oi = 0; oi < ovs.length; oi++) {
          ovs[oi].style.background = bright ? 'rgba(251,191,36,0.55)' : 'rgba(251,191,36,0.3)';
        }
      }
      bubble.onmouseenter = function() { highlightGroup(true); };
      bubble.onmouseleave = function() { highlightGroup(false); };

      document.body.appendChild(bubble);
    }

    // Also add hover listeners to overlay rects
    (function(id) {
      function highlightGroup(bright) {
        var ovs = document.querySelectorAll('[data-rc-overlay="' + id + '"]');
        for (var oi = 0; oi < ovs.length; oi++) {
          ovs[oi].style.background = bright ? 'rgba(251,191,36,0.55)' : 'rgba(251,191,36,0.3)';
        }
        var bubs = document.querySelectorAll('[data-rc-bubble="' + id + '"]');
        for (var bi = 0; bi < bubs.length; bi++) {
          bubs[bi].style.background = bright ? '#047857' : '#059669';
        }
      }
      var ovs = document.querySelectorAll('[data-rc-overlay="' + id + '"]');
      for (var oi = 0; oi < ovs.length; oi++) {
        ovs[oi].style.pointerEvents = 'auto';
        ovs[oi].onmouseenter = function() { highlightGroup(true); };
        ovs[oi].onmouseleave = function() { highlightGroup(false); };
      }
    })(rcId);

    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    _lastRange = null;
  });

  // ── Auto-fix critically low contrast text (real-time) ──
  // Only fixes egregiously unreadable text (ratio < 2.5:1).
  // Skips elements with gradient/image backgrounds where we can't reliably compute contrast.
  // Composites semi-transparent background layers when walking up the DOM.
  (function() {
    function lum(r, g, b) {
      var a = [r, g, b].map(function(v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    // Parse rgba with alpha support
    function parseRGBA(str) {
      if (!str || str === 'transparent') return null;
      var m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }

    // Composite fg color over bg color using alpha blending
    function composite(fg, bg) {
      var a = fg.a;
      return {
        r: Math.round(fg.r * a + bg.r * (1 - a)),
        g: Math.round(fg.g * a + bg.g * (1 - a)),
        b: Math.round(fg.b * a + bg.b * (1 - a)),
        a: 1
      };
    }

    function contrastRatio(fg, bg) {
      var l1 = lum(fg.r, fg.g, fg.b) + 0.05;
      var l2 = lum(bg.r, bg.g, bg.b) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    }

    function hasVisualBg(style) {
      // Check if element has gradient or image background (not reliably computable)
      var img = style.backgroundImage;
      if (img && img !== 'none') return true;
      return false;
    }

    // Walk up DOM, compositing semi-transparent bg layers.
    // Returns null if any ancestor has gradient/image bg (= can't compute reliably).
    function getEffectiveBg(el) {
      var layers = [];
      var node = el;
      while (node && node.nodeType === 1) {
        var style = getComputedStyle(node);
        // If any ancestor has gradient/image bg, we can't compute — bail out
        if (hasVisualBg(style)) return null;
        var c = parseRGBA(style.backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a >= 1) break; // opaque — no need to go further
        }
        node = node.parentElement;
      }
      // Start from white (page default), composite layers from back to front
      var bg = { r: 255, g: 255, b: 255, a: 1 };
      for (var i = layers.length - 1; i >= 0; i--) {
        bg = composite(layers[i], bg);
      }
      return bg;
    }

    function isLight(c) {
      return lum(c.r, c.g, c.b) > 0.179;
    }

    var TEXT_TAGS = {H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,P:1,SPAN:1,A:1,LI:1,TD:1,TH:1,LABEL:1,DIV:1,BLOCKQUOTE:1,FIGCAPTION:1,DT:1,DD:1,SUMMARY:1,CAPTION:1,STRONG:1,EM:1,B:1,I:1,SMALL:1};
    var _checked = new WeakSet();

    // Only fix truly unreadable text — contrast ratio below 2.5:1
    var MIN_RATIO = 2.5;

    function checkEl(el) {
      if (!TEXT_TAGS[el.tagName] || _checked.has(el)) return;
      var hasText = false;
      for (var ci = 0; ci < el.childNodes.length; ci++) {
        if (el.childNodes[ci].nodeType === 3 && el.childNodes[ci].textContent.trim()) { hasText = true; break; }
      }
      if (!hasText) return;
      _checked.add(el);

      var style = getComputedStyle(el);
      // Skip gradient text (background-clip: text)
      if (style.webkitBackgroundClip === 'text' || style.backgroundClip === 'text') return;

      var fg = parseRGBA(style.color);
      if (!fg) return;

      var bg = getEffectiveBg(el);
      // bg is null when gradient/image bg detected — skip, can't reliably judge
      if (!bg) return;

      var ratio = contrastRatio(fg, bg);
      if (ratio < MIN_RATIO) {
        if (isLight(bg)) {
          el.style.color = '#1a1a1a';
        } else {
          el.style.color = '#ededed';
        }
      }
    }

    function checkTree(root) {
      if (root.nodeType === 1) {
        checkEl(root);
        var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (var i = 0; i < els.length; i++) checkEl(els[i]);
      }
    }

    var _pending = [];
    var _rafId = null;
    function flush() {
      _rafId = null;
      var nodes = _pending;
      _pending = [];
      for (var i = 0; i < nodes.length; i++) checkTree(nodes[i]);
    }

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) _pending.push(added[j]);
      }
      if (_pending.length > 0 && _rafId === null) {
        _rafId = requestAnimationFrame(flush);
      }
    });

    observer.observe(document.documentElement || document, { childList: true, subtree: true });
  })();
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
  private opened = false;
  private committedLength = 0;
  private injectedDuringStream = false;
  private imageScript: string;

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    this.imageScript = buildImageComponentScript();
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
      doc.write(`<script>${INTERACTION_SCRIPT}<\/script><script>${this.imageScript}<\/script><style>${INTERACTION_STYLE}</style>`);
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
      doc.write(`<script>${this.imageScript}<\/script><script>${INTERACTION_SCRIPT}<\/script><style>${INTERACTION_STYLE}</style>`);
      doc.write(finalHtml);
      doc.close();
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
    doc.write(`<script>${this.imageScript}<\/script><script>${INTERACTION_SCRIPT}<\/script><style>${INTERACTION_STYLE}</style>`);
    doc.write(html);
    doc.close();

    this.committedLength = html.length;
    this.opened = false;
  }

  /** Inject interaction styles + scripts + image component into the current document */
  private injectInteraction() {
    const doc = this.iframe.contentDocument;
    if (!doc) return;

    try {
      const style = doc.createElement("style");
      style.textContent = INTERACTION_STYLE;
      (doc.head || doc.documentElement || doc).appendChild(style);

      // Inject <inf-image> Web Component BEFORE interaction script
      // so any <inf-image> elements already in the DOM get upgraded
      const imgScript = doc.createElement("script");
      imgScript.textContent = this.imageScript;
      (doc.body || doc.documentElement || doc).appendChild(imgScript);

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

  // Revision mode state
  const [revisionMode, setRevisionMode] = useState(false);

  // Settings modal state (opened e.g. when clicking unconfigured <inf-image>)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"llm" | "image">("llm");
  const [revisionComments, setRevisionComments] = useState<RevisionComment[]>([]);
  const [revisionInput, setRevisionInput] = useState("");
  const [revisionPrompt, setRevisionPrompt] = useState(""); // additional instruction for revision

  // Notify iframe when revision mode changes
  useEffect(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: "set-revision-mode", enabled: revisionMode }, "*");
    } catch { /* ignore */ }
  }, [revisionMode]);

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
        // In revision mode, suppress link navigation
        if (revisionMode) return;
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

        if (revisionMode) {
          // In revision mode, prepare for adding a comment
          setRevisionInput("");
        } else {
          setSelectionQuery("");
        }
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

      if (e.data.type === "iframe-delete-comment") {
        const rcId = e.data.rcId as string;
        if (rcId) {
          setRevisionComments((prev) => prev.filter((c) => c.id !== rcId));
          try {
            const doc = iframeRef.current?.contentDocument;
            if (doc) {
              doc.querySelectorAll(`[data-rc-overlay="${rcId}"]`).forEach((el) => el.remove());
              doc.querySelectorAll(`[data-rc-bubble="${rcId}"]`).forEach((el) => el.remove());
              doc.querySelectorAll(`inf-comment[data-rc-id="${rcId}"]`).forEach((el) => {
                const parent = el.parentNode;
                if (parent) {
                  while (el.firstChild) parent.insertBefore(el.firstChild, el);
                  parent.removeChild(el);
                  parent.normalize();
                }
              });
              const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
              const toRemove: Comment[] = [];
              while (walker.nextNode()) {
                const node = walker.currentNode as Comment;
                if (node.textContent?.includes(`[REVISION id=${rcId}]`)) toRemove.push(node);
              }
              toRemove.forEach((n) => n.remove());
            }
          } catch { /* ignore */ }
        }
      }
      if (e.data.type === "open-image-settings") {
        setSettingsTab("image");
        setSettingsOpen(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigateToHref, query, revisionMode]);

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

  // Add a revision comment (revision mode)
  const handleAddRevisionComment = useCallback(() => {
    const trimmed = revisionInput.trim();
    if (!trimmed || !selectionCtx) return;

    const newComment: RevisionComment = {
      id: `rc-${Date.now().toString(36)}`,
      selected: selectionCtx.selected,
      comment: trimmed,
      before: selectionCtx.before,
      after: selectionCtx.after,
    };
    setRevisionComments((prev) => [...prev, newComment]);

    // Tell iframe to highlight using the saved range
    try {
      iframeRef.current?.contentWindow?.postMessage({
        type: "highlight-selection",
        comment: trimmed,
        rcId: newComment.id,
      }, "*");
    } catch { /* ignore */ }

    setSelectionCtx(null);
    setSelectionRect(null);
    setRevisionInput("");
  }, [revisionInput, selectionCtx]);

  // Remove a revision comment + its highlight in iframe
  const handleRemoveComment = useCallback((id: string) => {
    setRevisionComments((prev) => prev.filter((c) => c.id !== id));
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        doc.querySelectorAll(`[data-rc-overlay="${id}"]`).forEach((el) => el.remove());
        doc.querySelectorAll(`[data-rc-bubble="${id}"]`).forEach((el) => el.remove());
        // Unwrap inf-comment elements
        doc.querySelectorAll(`inf-comment[data-rc-id="${id}"]`).forEach((el) => {
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
            parent.normalize();
          }
        });
        // Remove HTML comment nodes
        const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
        const toRemove: Comment[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode as Comment;
          if (node.textContent?.includes(`[REVISION id=${id}]`)) {
            toRemove.push(node);
          }
        }
        toRemove.forEach((n) => n.remove());
      }
    } catch { /* ignore */ }
  }, []);

  // Apply revision — re-generate with comments
  // Revision: store annotated HTML in ref, trigger via key
  const revisionHtmlRef = useRef<string>("");
  const [revisionKey, setRevisionKey] = useState(0);

  const handleApplyRevision = useCallback(() => {
    if (revisionComments.length === 0 && !revisionPrompt.trim()) return;

    // Get live HTML from iframe (contains <!-- [REVISION] --> comment nodes)
    let annotatedHtml = "";
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.documentElement) {
        const clone = doc.documentElement.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("[data-rc-overlay]").forEach((el) => el.remove());
        clone.querySelectorAll("[data-rc-bubble]").forEach((el) => el.remove());
        // Remove injected interaction scripts (keep Tailwind CDN <script>)
        clone.querySelectorAll("script").forEach((el) => {
          const src = el.getAttribute("src") || "";
          if (!src.includes("tailwindcss")) el.remove();
        });
        // Remove Tailwind-generated runtime styles (huge) but keep author <style> tags (short)
        clone.querySelectorAll("style").forEach((el) => {
          const text = el.textContent || "";
          // Tailwind CDN injects styles with thousands of rules; author styles are < 20 lines
          if (text.length > 2000 || text.includes("padding-bottom:60px")) el.remove();
        });
        clone.querySelectorAll("inf-comment").forEach((el) => {
          const parent = el.parentNode;
          if (parent) {
            while (el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
          }
        });
        // Restore inf-link back to <a> in clone
        clone.querySelectorAll("inf-link").forEach((el) => {
          const a = document.createElement("a");
          for (let i = 0; i < el.attributes.length; i++) {
            a.setAttribute(el.attributes[i].name, el.attributes[i].value);
          }
          a.innerHTML = el.innerHTML;
          el.parentNode?.replaceChild(a, el);
        });
        annotatedHtml = "<!DOCTYPE html>\n" + clone.outerHTML;
      }
    } catch { /* ignore */ }

    if (!annotatedHtml) {
      annotatedHtml = buildAnnotatedHtml(finalHtmlRef.current, revisionComments);
    }

    revisionHtmlRef.current = annotatedHtml;
    setRevisionMode(false);
    setRevisionKey((k) => k + 1);
  }, [revisionComments, revisionPrompt]);

  // Revision generation effect — triggered by revisionKey
  useEffect(() => {
    if (revisionKey === 0) return;
    const annotatedHtml = revisionHtmlRef.current;
    if (!annotatedHtml) return;

    abortRef.current?.abort();
    const writer = getWriter();
    writer?.reset();
    setPhase("streaming");
    setProgress(0);

    let cancelled = false;
    const abortController = new AbortController();
    abortRef.current = abortController;

    const revise = async () => {
      try {
        const contextHistory = buildAncestryContext(parentId);
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

        const fullHtml = await streamRevisionPage(
          annotatedHtml,
          contextHistory,
          revisionPrompt.trim(),
          (token: string) => {
            if (cancelled || abortController.signal.aborted) return;
            buffer += token;
            scheduleRender();
          },
          abortController.signal
        );

        if (cancelled) return;
        if (rafId !== null) cancelAnimationFrame(rafId);

        writer?.finalize(fullHtml);
        finalHtmlRef.current = fullHtml;

        let summary = "";
        const metaMatch = fullHtml.match(/<meta\s+name=["']page-summary["']\s+content=["']([^"']*)["']/i);
        summary = metaMatch?.[1] || "";

        const titleMatch = fullHtml.match(/<title>(.*?)<\/title>/i);
        const linkMatches = [...fullHtml.matchAll(/data-q="([^"]*)"/g)];
        const links = linkMatches.map((m) => m[1]).slice(0, 15);

        savePage({
          id: pageId,
          query,
          html: fullHtml,
          createdAt: Date.now(),
          parentId,
          title: titleMatch?.[1] || query,
          links,
          summary,
        });

        setRevisionComments([]);
        setRevisionPrompt("");
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

    revise();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionKey]);

  // Quick-action shortcuts for selection popup
  const selectionShortcuts = [
    { label: "Explain", icon: "💡", query: "Explain this content" },
    { label: "Go deeper", icon: "🔍", query: "Go deeper into this topic" },
    { label: "Example", icon: "📝", query: "Give a concrete example" },
    { label: "Translate", icon: "🌐", query: "Translate this text (if in English, translate to Chinese; if in Chinese, to English)" },
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
          abortController.signal,
          { width: window.innerWidth, mobile: window.innerWidth < 640, lang: navigator.language || "en" }
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
              <p className="text-gray-400 mb-4">Please configure your API Key first</p>
              <a href={`${getBasePath()}/`} className="text-indigo-500 hover:text-indigo-600 text-sm">
                ← Back to Home
              </a>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">Failed to load. Please go back and try again.</p>
              <a href={`${getBasePath()}/`} className="text-indigo-500 hover:text-indigo-600 text-sm">
                ← Back to Home
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
          <div className="bg-white/60 backdrop-blur-2xl backdrop-saturate-150 rounded-2xl border border-white/40 shadow-[0_8px_40px_rgba(0,0,0,0.10),0_1.5px_6px_rgba(0,0,0,0.06)] p-3 w-[min(340px,calc(100vw-2rem))]">
            {/* Selected text preview */}
            <div className="text-xs text-gray-500/80 mb-2.5 flex items-center gap-1.5 px-0.5">
              <svg className="h-3 w-3 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">
                &ldquo;{selectionCtx.selected.length > 50 ? selectionCtx.selected.slice(0, 50) + "…" : selectionCtx.selected}&rdquo;
              </span>
            </div>

            {revisionMode ? (
              /* ── Revision mode: comment input + existing comments ── */
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={selectionInputRef}
                    type="text"
                    value={revisionInput}
                    onChange={(e) => setRevisionInput(e.target.value)}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={() => { isComposingRef.current = false; }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isComposingRef.current) handleAddRevisionComment();
                      if (e.key === "Escape") {
                        setSelectionCtx(null);
                        setSelectionRect(null);
                      }
                    }}
                    placeholder="Add revision comment..."
                    className="flex-1 bg-amber-50/80 backdrop-blur-sm rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-amber-400/70 outline-none focus:ring-2 focus:ring-amber-300/40 border border-amber-200/60 min-w-0"
                  />
                  <button
                    onClick={handleAddRevisionComment}
                    disabled={!revisionInput.trim()}
                    className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/90 backdrop-blur-sm text-white transition-all hover:bg-amber-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                {revisionComments.length > 0 && (
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {revisionComments.map((c) => (
                      <div key={c.id} className="flex items-center gap-1.5 bg-emerald-600 rounded-lg px-2.5 py-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-emerald-200 truncate">&ldquo;{c.selected.length > 20 ? c.selected.slice(0, 20) + "…" : c.selected}&rdquo;</div>
                          <div className="text-xs text-white font-medium truncate">{c.comment}</div>
                        </div>
                        <button
                          onClick={() => handleRemoveComment(c.id)}
                          className="shrink-0 h-4 w-4 flex items-center justify-center rounded text-emerald-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* ── Normal mode: explore shortcuts + custom input ── */
              <>
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
                    placeholder="Or type a custom question..."
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom capsule */}
      <div
        ref={capsuleRef}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-[560px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`
            bg-white/90 backdrop-blur-2xl backdrop-saturate-150 border border-gray-200/80 shadow-[0_8px_40px_rgba(0,0,0,0.08),0_1.5px_6px_rgba(0,0,0,0.05)]
            transition-all duration-300 ease-in-out overflow-hidden mx-auto
            ${(capsuleExpanded || revisionMode) ? "rounded-2xl px-4 py-3 w-full" : "rounded-full px-3 py-2 w-fit max-w-full"}
          `}
        >
          {/* Row 1: Input (only when expanded/revision) */}
          {(capsuleExpanded || revisionMode) && (
            <div className="flex items-center gap-2 mb-2">
              {revisionMode ? (
                <input
                  type="text"
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  onCompositionStart={() => { isComposingRef.current = true; }}
                  onCompositionEnd={() => { isComposingRef.current = false; }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isComposingRef.current && (revisionComments.length > 0 || revisionPrompt.trim())) handleApplyRevision();
                    if (e.key === "Escape") { setRevisionMode(false); setRevisionComments([]); setRevisionPrompt(""); }
                  }}
                  placeholder="Revision instructions..."
                  className="flex-1 bg-gray-50/80 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-amber-200/50 border border-gray-200/60 min-w-0"
                />
              ) : (
                <>
                  <input
                    ref={capsuleInputRef}
                    type="text"
                    value={capsuleQuery}
                    onChange={(e) => setCapsuleQuery(e.target.value)}
                    onCompositionStart={() => { isComposingRef.current = true; }}
                    onCompositionEnd={() => { isComposingRef.current = false; }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isComposingRef.current) handleCapsuleSubmit();
                      if (e.key === "Escape") { setCapsuleExpanded(false); setCapsuleQuery(query); }
                    }}
                    placeholder="Ask a new question..."
                    className="flex-1 bg-gray-50/80 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-200/50 border border-gray-200/60 min-w-0"
                  />
                  <button
                    onClick={handleCapsuleSubmit}
                    disabled={!capsuleQuery.trim() || capsuleQuery.trim() === query}
                    className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-500 text-white transition-all hover:bg-indigo-600 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Row 2 (or only row when collapsed): toolbar buttons */}
          <div className="flex items-center">
            {/* Home button */}
            <a
              href={`${getBasePath()}/`}
              title="Home"
              className="shrink-0 text-indigo-400 hover:text-indigo-600 transition-colors font-serif text-lg leading-none px-1 cursor-pointer"
            >
              ∞
            </a>
            <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

            {/* Collapsed: query text + search icon (click to expand) */}
            {!capsuleExpanded && !revisionMode && (
              <>
                <svg className="h-3.5 w-3.5 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                </svg>
                <span
                  onClick={handleCapsuleInputClick}
                  className="text-xs text-gray-900 font-medium truncate px-2 cursor-text select-none"
                >
                  {query}
                </span>
              </>
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
                {progress > 0 ? `${Math.round(progress / 1024)}KB` : "Loading"}
              </span>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleStop}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                <span className="text-xs font-medium">Stop</span>
              </button>
            </>
          )}

          {/* Export & Refresh & Revision buttons */}
          {phase === "done" && !revisionMode && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={() => {
                  setRevisionMode(true);
                  setCapsuleExpanded(false);
                  // If text is already selected in iframe, trigger revision popup
                  try {
                    const sel = iframeRef.current?.contentWindow?.getSelection();
                    if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
                      // Re-trigger selection event from iframe
                      iframeRef.current?.contentWindow?.postMessage({ type: '__trigger-selection' }, '*');
                    }
                  } catch { /* ignore */ }
                }}
                title="Revision mode"
                className="flex items-center gap-1 text-gray-500 hover:text-amber-500 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium">Revise</span>
              </button>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleRefresh}
                title="Regenerate this page"
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.51 15A9 9 0 0 0 18.36 18.36L20 15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium">Refresh</span>
              </button>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleExport}
                title="Save as HTML file"
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M12 19l-5-5M12 19l5-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 21h16" strokeLinecap="round" />
                </svg>
                <span className="text-xs font-medium">Save</span>
              </button>
            </>
          )}

          {/* Revision mode capsule controls */}
          {phase === "done" && revisionMode && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <span className="text-xs text-amber-600 font-medium shrink-0 flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Revising
                {revisionComments.length > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                    {revisionComments.length}
                  </span>
                )}
              </span>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={handleApplyRevision}
                disabled={revisionComments.length === 0 && !revisionPrompt.trim()}
                title="Apply revisions and regenerate"
                className="flex items-center gap-1 text-amber-600 hover:text-amber-700 transition-colors cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium">Apply</span>
              </button>
              <div className="w-px h-4 bg-gray-300 mx-2 shrink-0" />
              <button
                onClick={() => { setRevisionMode(false); setRevisionComments([]); setRevisionPrompt(""); }}
                title="Exit revision mode"
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-medium">Cancel</span>
              </button>
            </>
          )}
          </div>{/* end toolbar row */}
        </div>
      </div>

      {/* Settings Modal — opened from iframe <inf-image> click */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // Rebuild image script with updated keys for future writes
          if (writerRef.current) {
            (writerRef.current as unknown as { imageScript: string }).imageScript = buildImageComponentScript();
          }
        }}
        initialTab={settingsTab}
      />
    </div>
  );
}

export default function GeneratedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-gray-400 text-sm">Loading...</div>
        </main>
      }
    >
      <PageContent />
    </Suspense>
  );
}
