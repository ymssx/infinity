export interface PageData {
  id: string;
  query: string;
  html: string;
  createdAt: number;
  parentId?: string;   // ID of the parent page (for tree-based ancestry)
  title?: string;      // Page <title> extracted after generation
  links?: string[];    // Hyperlink queries (data-q values) from generated page
  summary?: string;    // AI-generated content summary for context continuity
}

export interface HistoryItem {
  query: string;       // The user's original input/question
  title: string;       // Page <title> from generated HTML
  description: string; // Page <meta description> from generated HTML
  links: string[];     // Hyperlink queries (data-q values) from generated page
  summary?: string;    // AI-generated content summary (for context continuity)
}

/** Context from user's text selection (highlight-to-ask feature) */
export interface SelectionContext {
  selected: string;    // The exact text the user selected
  before: string;      // ~100 chars before the selection for context
  after: string;       // ~100 chars after the selection for context
}

export interface GenerateRequest {
  query?: string;
  title?: string;
  description?: string;
  history?: HistoryItem[];
  parentId?: string;   // Parent page ID for tree-based context
  pageId?: string;     // Current page ID (used to register in store)
  selectionContext?: SelectionContext; // Text the user highlighted before asking
}
