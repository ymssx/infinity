import { NextRequest } from "next/server";
import { streamGeneratePage } from "@/lib/openai";
import { getAncestryHistory, createPage, updatePageMeta } from "@/lib/store";
import { searchWeb, searchImages, searchNews, queryData } from "@/lib/tools";
import { PrefetchedData } from "@/lib/prompt";
import { GenerateRequest } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Simplified architecture:
 *   1. Receive query
 *   2. Pre-fetch all tool data in parallel (images, search, news, data)
 *   3. Pass data into the prompt so AI generates HTML with real data baked in
 *   4. Stream the AI-generated HTML directly to the client
 *
 * No tool bridge, no post-processing, no FINAL_HTML markers.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerateRequest;
  const { query, title, description, parentId, history: clientHistory, selectionContext } = body;

  const userQuery =
    query || (title && description ? `${title}: ${description}` : "");

  if (!userQuery) {
    return new Response("query is required", { status: 400 });
  }

  // Use client-provided history (with content summaries from localStorage) if available,
  // otherwise fall back to server-side ancestry chain (which only has query/title/links)
  const contextHistory = (clientHistory && clientHistory.length > 0)
    ? clientHistory
    : getAncestryHistory(parentId);

  // Create this page in the store
  const pageId = body.pageId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  createPage(pageId, userQuery, parentId);

  console.log(`[generate] query="${userQuery}" | pageId=${pageId} | parentId=${parentId || "none"} | ancestry=${contextHistory.length} items`);

  // ── Phase 1: Pre-fetch all tool data in parallel ──
  console.log(`[generate] Pre-fetching data for: "${userQuery}"`);

  const [images, search, news, data] = await Promise.allSettled([
    searchImages(userQuery),
    searchWeb(userQuery),
    searchNews(userQuery),
    queryData(userQuery),
  ]);

  const prefetchedData: PrefetchedData = {};

  if (images.status === "fulfilled" && images.value.length > 0) {
    prefetchedData.images = images.value;
  }
  if (search.status === "fulfilled" && search.value.length > 0) {
    prefetchedData.search = search.value;
  }
  if (news.status === "fulfilled" && news.value.length > 0) {
    prefetchedData.news = news.value;
  }
  if (data.status === "fulfilled" && data.value != null) {
    prefetchedData.data = data.value;
  }

  const dataTypes = Object.keys(prefetchedData);
  console.log(`[generate] Pre-fetched: ${dataTypes.length > 0 ? dataTypes.join(", ") : "none"}`);

  // ── Phase 2: Stream AI-generated HTML (with data baked in) ──
  const encoder = new TextEncoder();

  // AbortController for cancelling the OpenAI stream when the client disconnects.
  // This is critical: without it, closing the browser tab would leave the LLM
  // running in the background until completion, wasting tokens and resources.
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const fullHtml = await streamGeneratePage(
          userQuery,
          undefined,
          undefined,
          contextHistory,
          (token: string) => {
            // Guard: don't enqueue if already aborted
            if (abortController.signal.aborted) return;
            controller.enqueue(encoder.encode(token));
          },
          prefetchedData,
          selectionContext,
          abortController.signal
        );

        // If aborted, don't try to process metadata or close again
        if (abortController.signal.aborted) return;

        // Extract metadata and save to page store
        const titleMatch = fullHtml.match(/<title>(.*?)<\/title>/i);
        const linkMatches = [...fullHtml.matchAll(/data-q="([^"]*)"/g)];
        const links = linkMatches.map((m) => m[1]).slice(0, 15);

        // Extract AI-generated page summary from <meta name="page-summary">
        const summaryMatch = fullHtml.match(/<meta\s+name=["']page-summary["']\s+content=["']([^"']*)["']/i);
        const summary = summaryMatch?.[1] || "";

        updatePageMeta(
          pageId,
          titleMatch?.[1] || userQuery,
          links
        );

        // Send summary as a trailing marker for the client to pick up
        if (summary) {
          controller.enqueue(encoder.encode(`<!--PAGE_SUMMARY:${summary}-->`));
        }

        controller.close();
      } catch (err) {
        // If aborted, just close silently — client is already gone
        if (abortController.signal.aborted) {
          console.log(`[generate] Client disconnected, stream aborted for pageId=${pageId}`);
          try { controller.close(); } catch { /* already closed */ }
          return;
        }

        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`<!--STREAM_ERROR:${msg}-->`)
        );
        controller.close();
      }
    },
    // Called when the client disconnects (closes tab, navigates away, or calls reader.cancel())
    cancel() {
      console.log(`[generate] Client disconnected — aborting OpenAI stream for pageId=${pageId}`);
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
