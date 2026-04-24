import { PageData, HistoryItem } from "@/types";

const MAX_PAGES = 1000;
const MAX_HISTORY = 5;

const pageStore = new Map<string, PageData>();
const historyStore: HistoryItem[] = [];

export function createPage(id: string, query: string): PageData {
  const page: PageData = {
    id,
    query,
    html: "",
    createdAt: Date.now(),
  };

  // Evict old pages if needed
  if (pageStore.size >= MAX_PAGES) {
    const oldest = [...pageStore.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );
    const toRemove = oldest.slice(0, Math.floor(MAX_PAGES * 0.2));
    toRemove.forEach(([key]) => pageStore.delete(key));
  }

  pageStore.set(id, page);
  return page;
}

export function appendPageHtml(id: string, delta: string): void {
  const page = pageStore.get(id);
  if (page) {
    page.html += delta;
  }
}

export function getPage(id: string): PageData | undefined {
  return pageStore.get(id);
}

export function addHistory(title: string, description: string): void {
  historyStore.push({ title, description });
  if (historyStore.length > MAX_HISTORY) {
    historyStore.splice(0, historyStore.length - MAX_HISTORY);
  }
}

export function getRecentHistory(): HistoryItem[] {
  return [...historyStore];
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
