"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { buildSessionTrees, clearAllPages, TreeNode } from "@/lib/client-store";
import { isConfigured, getBasePath } from "@/lib/config";
import SettingsModal from "@/components/SettingsModal";

const examples = [
  { text: "What can you do?", icon: "✨" },
  { text: "How does the solar system work?", icon: "🪐" },
  { text: "Tokyo travel guide", icon: "🗼" },
  { text: "How does a CPU work?", icon: "⚡" },
  { text: "Write me a sci-fi short story", icon: "📖" },
  { text: "Python beginner's guide", icon: "🐍" },
];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Tree Node Component (recursive)
// ============================================================

function TreeNodeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const displayTitle = node.title || node.query;

  const handleClick = () => {
    const url = `${getBasePath()}/page?id=${encodeURIComponent(node.id)}&q=${encodeURIComponent(node.query)}${node.parentId ? `&parentId=${encodeURIComponent(node.parentId)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={depth > 0 ? "ml-4 border-l border-gray-100 pl-3" : ""}>
      <div className="group flex items-start gap-2 py-1.5">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6.293 4.293a1 1 0 011.414 0L14 10.586l-6.293 6.293a1 1 0 01-1.414-1.414L11.172 10.5 6.293 5.414a1 1 0 010-1.414z" />
            </svg>
          </button>
        ) : (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-200" />
          </span>
        )}

        <button
          onClick={handleClick}
          className="flex-1 min-w-0 text-left cursor-pointer group/link"
        >
          <span className="text-sm text-gray-600 group-hover/link:text-indigo-500 transition-colors line-clamp-1">
            {displayTitle}
          </span>
          {displayTitle !== node.query && (
            <span className="text-[11px] text-gray-300 group-hover/link:text-gray-400 transition-colors line-clamp-1 mt-0.5">
              {node.query}
            </span>
          )}
        </button>

        {hasChildren && (
          <span className="mt-0.5 shrink-0 text-[10px] text-gray-300 bg-gray-50 rounded-full px-1.5 py-0.5">
            {node.children.length}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Home Page
// ============================================================

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const [trees, setTrees] = useState<TreeNode[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configured, setConfigured] = useState(true);

  // Load session trees from localStorage
  useEffect(() => {
    const loaded = buildSessionTrees();
    setTrees(loaded);
    if (loaded.length > 0) setShowHistory(true);
    setConfigured(isConfigured());
  }, []);

  // Re-check config when settings modal closes
  useEffect(() => {
    if (!settingsOpen) {
      setConfigured(isConfigured());
    }
  }, [settingsOpen]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (q?: string) => {
    const text = (q || query).trim();
    if (!text || isNavigating) return;

    if (!isConfigured()) {
      setSettingsOpen(true);
      return;
    }

    setIsNavigating(true);
    const pageId = generateId();
    window.location.href = `${getBasePath()}/page?id=${pageId}&q=${encodeURIComponent(text)}`;
  };

  const handleClearHistory = useCallback(() => {
    if (window.confirm("Clear all browsing history? This cannot be undone.")) {
      clearAllPages();
      setTrees([]);
      setShowHistory(false);
    }
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-4">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50/50 via-white to-white" />

      {/* Soft glow behind the logo */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-100/30 rounded-full blur-3xl" />

      {/* Settings button (top-right) */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 transition-all cursor-pointer"
        title="Settings"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="text-xs font-medium">Settings</span>
      </button>

      <div className={`relative z-10 flex flex-col items-center w-full max-w-2xl transition-all duration-500 ${showHistory ? "pt-16" : "justify-center min-h-screen"}`}>
        {/* Logo */}
        <div className="mb-3 flex items-center gap-3 select-none">
          <span className="text-4xl font-light text-indigo-500 leading-none" style={{ fontFamily: "serif" }}>∞</span>
          <span className="text-2xl font-semibold tracking-[0.2em] text-gray-800">
            INFINITY
          </span>
        </div>

        {/* Tagline */}
        <p className="mb-10 text-center text-sm text-gray-400 tracking-wide">
          Ask anything. Explore endlessly.
        </p>

        {/* API Key warning */}
        {!configured && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-600 text-sm hover:bg-amber-100/80 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Please configure your API Key first → Settings
          </button>
        )}

        {/* Search Input */}
        <div className="w-full relative">
          <div
            className={`
              flex items-center w-full rounded-2xl border bg-white transition-all duration-300
              ${isFocused
                ? "border-indigo-200 shadow-lg shadow-indigo-100/50"
                : "border-gray-200/80 shadow-sm hover:border-gray-300 hover:shadow-md"
              }
            `}
          >
            <div className="pl-5 pr-1">
              <svg className="h-[18px] w-[18px] text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
            </div>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              onKeyDown={(e) => e.key === "Enter" && !isComposingRef.current && handleSubmit()}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask anything you want to explore..."
              disabled={isNavigating}
              className="flex-1 bg-transparent px-3 py-4 text-[15px] text-gray-800 placeholder-gray-300 outline-none disabled:opacity-50"
            />

            <div className="pr-3">
              <button
                onClick={() => handleSubmit()}
                disabled={!query.trim() || isNavigating}
                className={`
                  flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-white transition-all duration-200
                  ${isNavigating
                    ? "bg-indigo-400"
                    : "bg-indigo-500 hover:bg-indigo-600 active:scale-95"
                  }
                  disabled:cursor-not-allowed disabled:opacity-20
                `}
              >
                {isNavigating ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Example queries */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {examples.map(({ text, icon }) => (
            <button
              key={text}
              onClick={() => { setQuery(text); inputRef.current?.focus(); }}
              disabled={isNavigating}
              className="group cursor-pointer rounded-full border border-gray-100 bg-white/80 px-4 py-2 text-[13px] text-gray-400 shadow-sm transition-all duration-200 hover:border-indigo-100 hover:bg-indigo-50/50 hover:text-indigo-500 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mr-1.5 inline-block transition-transform duration-200 group-hover:scale-110">{icon}</span>
              {text}
            </button>
          ))}
        </div>

        {/* Session History Trees */}
        {showHistory && trees.length > 0 && (
          <div className="mt-12 w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-gray-400 tracking-wide flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                History
              </h2>
              <button
                onClick={handleClearHistory}
                className="text-[11px] text-gray-300 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear all
              </button>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white/80 backdrop-blur-sm shadow-sm p-4 max-h-[400px] overflow-y-auto">
              {trees.map((tree) => (
                <TreeNodeItem key={tree.id} node={tree} />
              ))}
            </div>
          </div>
        )}

        {/* Footer hint */}
        <p className="mt-16 mb-8 text-[11px] text-gray-300 tracking-wide select-none">
          Powered by AI · Runs entirely in your browser
        </p>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
