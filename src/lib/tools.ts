/**
 * Tool data providers — search, images, news, structured data.
 *
 * These functions are used server-side by the generate route to fetch
 * real data and inline it directly into the AI-generated HTML.
 */

import OpenAI from "openai";

// ============================================================
// Types
// ============================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ImageResult {
  url: string;
  alt: string;
  source?: string;
  width?: number;
  height?: number;
}

export interface NewsResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string;
}

// ============================================================
// OpenAI client helpers
// ============================================================

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o";
}

// ============================================================
// Search Providers
// ============================================================

/**
 * Web search using SearXNG or Serper, fallback to AI-generated data.
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  // Try SearXNG if available
  const searxUrl = process.env.SEARXNG_URL;
  if (searxUrl) {
    try {
      const url = new URL(`${searxUrl}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "general");
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.results || []).slice(0, 8).map((r: Record<string, string>) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: r.content || "",
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Try Serper API (Google Search API)
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 8 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.organic || []).slice(0, 8).map((r: Record<string, string>) => ({
          title: r.title || "",
          url: r.link || "",
          snippet: r.snippet || "",
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: use LLM to generate factual data
  return searchViaLLM(query, "search");
}

/**
 * Image search — tries SearXNG, Serper Images API, then Unsplash, then empty fallback
 */
export async function searchImages(query: string): Promise<ImageResult[]> {
  // Try SearXNG images (self-hosted, free)
  const searxUrl = process.env.SEARXNG_URL;
  if (searxUrl) {
    try {
      const url = new URL(`${searxUrl}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "images");
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.results || []).slice(0, 6).map((r: Record<string, string | number>) => ({
          url: (r.img_src as string) || (r.url as string) || "",
          alt: (r.title as string) || query,
          source: (r.source as string) || "",
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Try Serper Images
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 6 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.images || []).slice(0, 6).map((r: Record<string, string | number>) => ({
          url: r.imageUrl as string || "",
          alt: r.title as string || query,
          source: r.link as string || "",
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Try Unsplash API
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (unsplashKey) {
    try {
      const url = new URL("https://api.unsplash.com/search/photos");
      url.searchParams.set("query", query);
      url.searchParams.set("per_page", "6");
      url.searchParams.set("orientation", "landscape");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Client-ID ${unsplashKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.results || []).slice(0, 6).map((r: Record<string, unknown>) => ({
          url: (r.urls as Record<string, string>)?.regular || (r.urls as Record<string, string>)?.small || "",
          alt: (r.alt_description as string) || query,
          source: (r.links as Record<string, string>)?.html || "",
          width: r.width as number,
          height: r.height as number,
        }));
      }
    } catch {
      // Fall through
    }
  }

  // No image search API configured — return empty.
  // The AI will use CSS gradients, emojis, and pure design instead.
  console.log("[tools/images] No image search API configured, returning empty");
  return [];
}

/**
 * News search — tries Serper News API, then LLM
 */
export async function searchNews(query: string): Promise<NewsResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 6 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.news || []).slice(0, 6).map((r: Record<string, string>) => ({
          title: r.title || "",
          url: r.link || "",
          snippet: r.snippet || "",
          source: r.source || "",
          date: r.date || "",
        }));
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: LLM-based
  return searchViaLLM(query, "news") as Promise<NewsResult[]>;
}

/**
 * General data query — uses LLM to generate structured data
 */
export async function queryData(query: string): Promise<unknown> {
  const client = getClient();
  const model = getModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are a data API that returns factual, accurate JSON data.
The user will ask a question — return a JSON object with the relevant data.

RULES:
- Return ONLY valid JSON, no markdown, no explanation
- Use factual, real-world data — do NOT make up fictional data
- Include numbers, dates, names, statistics as appropriate
- If you're not confident about exact numbers, use reasonable estimates and mark them as estimates
- Structure the data logically based on the question
- Always include a "source" field indicating the data is AI-generated and may not be 100% accurate
- Use the same language as the query for string values`,
        },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    return JSON.parse(content);
  } catch (err) {
    console.error("[tools/data] LLM error:", err);
    return { error: "Failed to generate data", query };
  }
}

// ============================================================
// Unified tool executor
// ============================================================

export interface ToolCall {
  type: string;
  query: string;
}

export interface ToolResult {
  type: string;
  query: string;
  status: "ok" | "error";
  data: unknown;
}

/**
 * Execute a single tool call and return its result.
 */
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  try {
    let data: unknown;
    switch (call.type) {
      case "search":
        data = await searchWeb(call.query);
        break;
      case "images":
        data = await searchImages(call.query);
        break;
      case "news":
        data = await searchNews(call.query);
        break;
      case "data":
        data = await queryData(call.query);
        break;
      default:
        data = null;
    }
    return { type: call.type, query: call.query, status: "ok", data };
  } catch (err) {
    console.error(`[tools] Error executing ${call.type}("${call.query}"):`, err);
    return { type: call.type, query: call.query, status: "error", data: null };
  }
}

/**
 * Execute multiple tool calls in parallel.
 */
export async function executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(executeToolCall));
}

// ============================================================
// Fallback helpers
// ============================================================

/** Use LLM to generate search-like results as fallback */
async function searchViaLLM(query: string, type: "search" | "news"): Promise<SearchResult[] | NewsResult[]> {
  const client = getClient();
  const model = getModel();

  const systemPrompt = type === "search"
    ? `You are a web search API. Given a query, return a JSON array of 5-8 search results.
Each result: {"title": "...", "url": "https://...", "snippet": "..."}.
Use REAL websites and URLs you know exist. Return factual information.
Return ONLY the JSON array. No markdown.`
    : `You are a news search API. Given a query, return a JSON array of 4-6 news results.
Each result: {"title": "...", "url": "https://...", "snippet": "...", "source": "...", "date": "YYYY-MM-DD"}.
Use real news sources. Provide factual recent-style news.
Return ONLY the JSON array. No markdown.`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "[]";
    // Try to parse, handle potential markdown wrapping
    const cleaned = content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`[tools/${type}] LLM fallback error:`, err);
    return [];
  }
}


