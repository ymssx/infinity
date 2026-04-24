import OpenAI from "openai";
import { HistoryItem, SelectionContext } from "@/types";
import { SYSTEM_PROMPT, buildUserPrompt, PrefetchedData } from "./prompt";

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

function getModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o";
}

/**
 * Stream page generation from OpenAI.
 * Calls onToken for each chunk of text, and onDone when finished.
 * Returns the full accumulated text.
 *
 * Accepts an optional AbortSignal so the caller (API route) can cancel the
 * OpenAI stream when the client disconnects — this stops token consumption
 * immediately instead of letting the LLM run to completion in the background.
 */
export async function streamGeneratePage(
  query: string | undefined,
  title: string | undefined,
  description: string | undefined,
  history: HistoryItem[],
  onToken: (token: string) => void,
  prefetchedData?: PrefetchedData,
  selectionContext?: SelectionContext,
  signal?: AbortSignal
): Promise<string> {
  const client = getClient();
  const model = getModel();
  const userPrompt = buildUserPrompt(query, title, description, history, prefetchedData, selectionContext);

  // Pass the abort signal to the OpenAI SDK so the HTTP request to OpenAI
  // is cancelled as soon as the client disconnects.
  const stream = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 12000,
      stream: true,
    },
    { signal }
  );

  let fullText = "";
  let started = false; // whether we've found the real HTML start
  let buffer = "";     // buffer for detecting leading markdown fences

  for await (const chunk of stream) {
    // Check abort between chunks — belt-and-suspenders safety
    if (signal?.aborted) {
      console.log("[generate] Stream aborted by client, stopping LLM consumption");
      break;
    }

    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;

    fullText += delta;

    if (!started) {
      // Buffer until we see <!DOCTYPE or <html or <! to detect the real HTML start
      buffer += delta;
      // Strip leading markdown fence like ```html\n or ```\n
      const stripped = buffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
      // Check if real HTML content has started
      const htmlStart = stripped.search(/<[!a-zA-Z]/);
      if (htmlStart >= 0) {
        started = true;
        // Send everything from the HTML start onward
        const htmlContent = stripped.slice(htmlStart);
        if (htmlContent) onToken(htmlContent);
      }
      // If not started yet, keep buffering
    } else {
      onToken(delta);
    }
  }

  // Strip trailing markdown fence ``` from the final output
  fullText = fullText.replace(/^```(?:html|HTML)?\s*\n?/, "");
  fullText = fullText.replace(/\n?```\s*$/, "");
  // Also trim to the real HTML start
  const htmlIdx = fullText.search(/<[!a-zA-Z]/);
  if (htmlIdx > 0) fullText = fullText.slice(htmlIdx);

  return fullText;
}
