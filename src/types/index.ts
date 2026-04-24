export interface PageData {
  id: string;
  query: string;
  html: string;
  createdAt: number;
}

export interface HistoryItem {
  title: string;
  description: string;
}

export interface GenerateRequest {
  query?: string;
  title?: string;
  description?: string;
  history: HistoryItem[];
}
