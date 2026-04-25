"use client";

import OpenAI from "openai";
import { HistoryItem, SelectionContext } from "@/types";
import { SYSTEM_PROMPT, buildUserPrompt, PrefetchedData, REVISION_SYSTEM_PROMPT, buildRevisionPrompt } from "./prompt";
import { getConfig } from "./config";

function getClient(): OpenAI {
  const config = getConfig();
  return new OpenAI({
    apiKey: config.openaiApiKey || "",
    baseURL: config.openaiBaseUrl || "https://api.openai.com/v1",
    dangerouslyAllowBrowser: true,
  });
}

function getModel(): string {
  const config = getConfig();
  return config.openaiModel || "gpt-4o";
}

/**
 * Stream page generation from OpenAI (runs in browser).
 * Single LLM call — no tool prefetch.
 * Calls onToken for each chunk of text.
 * Returns the full accumulated text.
 */
export async function streamGeneratePage(
  query: string | undefined,
  title: string | undefined,
  description: string | undefined,
  history: HistoryItem[],
  onToken: (token: string) => void,
  prefetchedData?: PrefetchedData,
  selectionContext?: SelectionContext,
  signal?: AbortSignal,
  deviceInfo?: { width: number; mobile: boolean; lang?: string }
): Promise<string> {
  const client = getClient();
  const model = getModel();
  const userPrompt = buildUserPrompt(query, title, description, history, prefetchedData, selectionContext, deviceInfo);

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
  let started = false;
  let buffer = "";

  for await (const chunk of stream) {
    if (signal?.aborted) break;

    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;

    fullText += delta;

    if (!started) {
      buffer += delta;
      const stripped = buffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
      const htmlStart = stripped.search(/<[!a-zA-Z]/);
      if (htmlStart >= 0) {
        started = true;
        const htmlContent = stripped.slice(htmlStart);
        if (htmlContent) onToken(htmlContent);
      }
    } else {
      onToken(delta);
    }
  }

  fullText = fullText.replace(/^```(?:html|HTML)?\s*\n?/, "");
  fullText = fullText.replace(/\n?```\s*$/, "");
  const htmlIdx = fullText.search(/<[!a-zA-Z]/);
  if (htmlIdx > 0) fullText = fullText.slice(htmlIdx);

  return fullText;
}

/**
 * Stream revision generation — takes annotated HTML (with revision comments), produces revised HTML.
 */
export async function streamRevisionPage(
  annotatedHtml: string,
  history: HistoryItem[],
  extraPrompt: string,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const client = getClient();
  const model = getModel();

  const userPrompt = buildRevisionPrompt(annotatedHtml, history, extraPrompt);

  const stream = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: REVISION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 12000,
      stream: true,
    },
    { signal }
  );

  let fullText = "";
  let started = false;
  let buffer = "";

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    fullText += delta;

    if (!started) {
      buffer += delta;
      const stripped = buffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
      const htmlStart = stripped.search(/<[!a-zA-Z]/);
      if (htmlStart >= 0) {
        started = true;
        const htmlContent = stripped.slice(htmlStart);
        if (htmlContent) onToken(htmlContent);
      }
    } else {
      onToken(delta);
    }
  }

  fullText = fullText.replace(/^```(?:html|HTML)?\s*\n?/, "");
  fullText = fullText.replace(/\n?```\s*$/, "");
  const htmlIdx = fullText.search(/<[!a-zA-Z]/);
  if (htmlIdx > 0) fullText = fullText.slice(htmlIdx);

  return fullText;
}
