"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

interface SearchInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
}

export default function SearchInput({ onSubmit, isLoading }: SearchInputProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center rounded-xl border border-gray-200 bg-white shadow-sm transition-colors focus-within:border-indigo-300 focus-within:shadow-md">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="输入你的问题..."
          disabled={isLoading}
          className="flex-1 bg-transparent px-5 py-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!query.trim() || isLoading}
          className="mr-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-indigo-500 text-white transition-all hover:bg-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
