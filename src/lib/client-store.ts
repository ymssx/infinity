"use client";

import { PageData } from "@/types";

const STORAGE_KEY = "infinity_pages";
const MAX_PAGES = 200; // Max pages to store locally

// ============================================================
// Core CRUD on localStorage
// ============================================================

/** Read all pages from localStorage */
export function getAllPages(): Record<string, PageData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write all pages to localStorage */
function saveAllPages(pages: Record<string, PageData>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage full — evict oldest 20%
    const entries = Object.entries(pages).sort(
      ([, a], [, b]) => a.createdAt - b.createdAt
    );
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
    toRemove.forEach(([key]) => delete pages[key]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
    } catch {
      // Still too big — clear all
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

// ============================================================
// Public API
// ============================================================

/** Save / update a page in localStorage */
export function savePage(page: PageData): void {
  const pages = getAllPages();

  // Evict old pages if needed
  const ids = Object.keys(pages);
  if (ids.length >= MAX_PAGES) {
    const entries = Object.entries(pages).sort(
      ([, a], [, b]) => a.createdAt - b.createdAt
    );
    const toRemove = entries.slice(0, Math.floor(MAX_PAGES * 0.2));
    toRemove.forEach(([key]) => delete pages[key]);
  }

  pages[page.id] = page;
  saveAllPages(pages);
}

/** Get a single page from localStorage */
export function getPage(id: string): PageData | undefined {
  const pages = getAllPages();
  return pages[id];
}

/** Delete a single page from localStorage */
export function deletePage(id: string): void {
  const pages = getAllPages();
  delete pages[id];
  saveAllPages(pages);
}

/** Clear cached HTML for a page (used when refreshing) */
export function clearPageHtml(id: string): void {
  const pages = getAllPages();
  const page = pages[id];
  if (page) {
    page.html = "";
    saveAllPages(pages);
  }
}

// ============================================================
// Ancestry context (for API requests)
// ============================================================

import { HistoryItem } from "@/types";

const MAX_ANCESTRY = 10;

/**
 * Build ancestry context by walking up the parentId chain from localStorage.
 * Returns HistoryItem[] in chronological order (oldest ancestor first).
 *
 * Uses the AI-generated `summary` stored in each PageData — no HTML parsing needed.
 */
export function buildAncestryContext(parentId?: string): HistoryItem[] {
  if (!parentId) return [];

  const pages = getAllPages();
  const ancestors: HistoryItem[] = [];
  let currentId: string | undefined = parentId;

  while (currentId && ancestors.length < MAX_ANCESTRY) {
    const page: PageData | undefined = pages[currentId];
    if (!page) break;

    ancestors.push({
      query: page.query,
      title: page.title || page.query,
      description: page.query,
      links: page.links || [],
      summary: page.summary,
    });

    currentId = page.parentId;
  }

  // Reverse to chronological order (oldest ancestor first)
  ancestors.reverse();
  return ancestors;
}

// ============================================================
// Tree utilities
// ============================================================

export interface TreeNode {
  id: string;
  query: string;
  title?: string;
  createdAt: number;
  parentId?: string;
  children: TreeNode[];
}

/** Build tree structures from all stored pages. Returns root nodes (pages without parents). */
export function buildSessionTrees(): TreeNode[] {
  const pages = getAllPages();
  const nodeMap = new Map<string, TreeNode>();

  // Create TreeNode for each page
  for (const [id, page] of Object.entries(pages)) {
    nodeMap.set(id, {
      id,
      query: page.query,
      title: page.title,
      createdAt: page.createdAt,
      parentId: page.parentId,
      children: [],
    });
  }

  // Link children to parents
  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort: newest root first, children by creation time
  roots.sort((a, b) => b.createdAt - a.createdAt);
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => a.createdAt - b.createdAt);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  return roots;
}

/** Clear all stored pages */
export function clearAllPages(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
