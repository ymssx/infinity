// ============================================================
// ai-components — LLM Stream Interface
//
// Calls the globally-provided LLM request function.
// The host app sets `window.__ai_components.request` to provide
// the actual LLM implementation.
// ============================================================

import type { AIComponentsConfig, LLMRequestFn } from "./types";
import { SYSTEM_PROMPT, getDepthAwareSystemPrompt } from "./prompt";

let _config: AIComponentsConfig | null = null;

/**
 * Configure the global LLM request function.
 * Must be called before any <ai-component> is connected.
 */
export function configure(config: AIComponentsConfig): void {
  _config = config;
  // Also store on window for cross-module access
  if (typeof window !== "undefined") {
    window.__ai_components = config;
  }
}

/** Get the current configuration */
export function getConfig(): AIComponentsConfig | null {
  if (_config) return _config;
  if (typeof window !== "undefined" && window.__ai_components) {
    _config = window.__ai_components;
    return _config;
  }
  return null;
}

/** Get the LLM request function */
export function getRequestFn(): LLMRequestFn {
  const config = getConfig();
  if (!config?.request) {
    throw new Error(
      "[ai-components] LLM request function not configured. " +
      "Call configure({ request: fn }) or set window.__ai_components before using <ai-component>."
    );
  }
  return config.request;
}

/** Get the system prompt (custom or built-in, depth-aware) */
export function getSystemPrompt(depth?: number): string {
  const config = getConfig();
  // If the user supplied a custom systemPrompt, use it as-is (they own the strategy)
  if (config?.systemPrompt) return config.systemPrompt;
  // Otherwise use the depth-aware built-in prompt
  return depth != null ? getDepthAwareSystemPrompt(depth) : SYSTEM_PROMPT;
}

/**
 * Stream LLM content for a given prompt.
 * @param prompt  - user-facing prompt text
 * @param signal  - optional AbortSignal
 * @param depth   - nesting depth of the calling <ai-component> (1-based)
 * @param systemPromptOverride - optional custom system prompt (bypasses depth-aware logic)
 */
export async function* streamLLM(
  prompt: string,
  signal?: AbortSignal,
  depth?: number,
  systemPromptOverride?: string,
): AsyncGenerator<string> {
  const requestFn = getRequestFn();
  const systemPrompt = systemPromptOverride ?? getSystemPrompt(depth);

  const iterable = requestFn(prompt, { signal, systemPrompt });

  for await (const chunk of iterable) {
    if (signal?.aborted) return;
    yield chunk;
  }
}
