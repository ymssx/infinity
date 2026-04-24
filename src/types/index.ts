export interface PageData {
  id: string;
  query: string;
  html: string;
  createdAt: number;
}

export interface HistoryItem {
  query: string;       // The user's original input/question
  title: string;       // Page <title> from generated HTML
  description: string; // Page <meta description> from generated HTML
  links: string[];     // Hyperlink queries (data-q values) from generated page
}

export interface GenerateRequest {
  query?: string;
  title?: string;
  description?: string;
  history: HistoryItem[];
}
