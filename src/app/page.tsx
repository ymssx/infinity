"use client";

import { useState, useRef, useEffect } from "react";

const examples = [
  { text: "太阳系是什么样的？", icon: "🪐" },
  { text: "东京旅游攻略", icon: "🗼" },
  { text: "CPU 是如何工作的？", icon: "⚡" },
  { text: "帮我写一个科幻短篇故事", icon: "✨" },
  { text: "今天适合去哪里旅行？", icon: "🌍" },
  { text: "Python 入门指南", icon: "🐍" },
];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false); // Track IME composition (Chinese input)

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (q?: string) => {
    const text = (q || query).trim();
    if (!text || isNavigating) return;
    setIsNavigating(true);
    const pageId = generateId();
    window.location.href = `/page/${pageId}?q=${encodeURIComponent(text)}`;
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Subtle gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-indigo-50/50 via-white to-white" />

      {/* Soft glow behind the logo */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-100/30 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-2xl">
        {/* Logo */}
        <div className="mb-3 flex items-center gap-3 select-none">
          <span className="text-4xl font-light text-indigo-500 leading-none" style={{ fontFamily: "serif" }}>∞</span>
          <span className="text-2xl font-semibold tracking-[0.2em] text-gray-800">
            INFINITY
          </span>
        </div>

        {/* Tagline */}
        <p className="mb-10 text-center text-sm text-gray-400 tracking-wide">
          问任何问题，探索无限可能
        </p>

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
            {/* Search icon */}
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
              placeholder="输入你想了解的任何事物..."
              disabled={isNavigating}
              className="flex-1 bg-transparent px-3 py-4 text-[15px] text-gray-800 placeholder-gray-300 outline-none disabled:opacity-50"
            />

            {/* Submit button */}
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
              onClick={() => handleSubmit(text)}
              disabled={isNavigating}
              className="group cursor-pointer rounded-full border border-gray-100 bg-white/80 px-4 py-2 text-[13px] text-gray-400 shadow-sm transition-all duration-200 hover:border-indigo-100 hover:bg-indigo-50/50 hover:text-indigo-500 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mr-1.5 inline-block transition-transform duration-200 group-hover:scale-110">{icon}</span>
              {text}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-16 text-[11px] text-gray-300 tracking-wide select-none">
          内容由 AI 驱动，仅供参考
        </p>
      </div>
    </main>
  );
}
