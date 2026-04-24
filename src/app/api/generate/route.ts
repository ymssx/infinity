import { NextRequest } from "next/server";
import { streamGeneratePage } from "@/lib/openai";
import { getRecentHistory, addHistory } from "@/lib/store";
import { GenerateRequest } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/generate
 * Streams AI-generated HTML tokens to the client in real-time.
 * The client handles tag auto-closing for safe incremental rendering.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerateRequest;
  const { query, title, description, history } = body;

  const userQuery =
    query || (title && description ? `${title}: ${description}` : "");

  if (!userQuery) {
    return new Response("query is required", { status: 400 });
  }

  const contextHistory =
    history && history.length > 0 ? history : getRecentHistory();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullHtml = "";
      try {
        await streamGeneratePage(
          userQuery,
          undefined,
          undefined,
          contextHistory,
          (token: string) => {
            fullHtml += token;
            controller.enqueue(encoder.encode(token));
          }
        );

        // Record in history after generation is complete
        const titleMatch = fullHtml.match(/<title>(.*?)<\/title>/i);
        const descMatch = fullHtml.match(
          /<meta\s+name="description"\s+content="([^"]*)"/i
        );
        addHistory(titleMatch?.[1] || userQuery, descMatch?.[1] || userQuery);

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        // Send an error marker the client can detect
        controller.enqueue(
          encoder.encode(`<!--STREAM_ERROR:${msg}-->`)
        );
        controller.close();
      }
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
