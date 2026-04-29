// ============================================================
// ai-components
//
// Natural-language-driven Web Components powered by LLM.
// Drop <ai-component p="your prompt"> into any HTML.
// Framework-free. Zero dependencies.
// ============================================================

// --- Components ---
export { AIComponent, defineAIComponent } from "./components/ai-component";
export { AIData, defineAIData } from "./components/ai-data";
export { AIText, defineAIText } from "./components/ai-text";
export { AIMarkdown, defineAIMarkdown } from "./components/ai-markdown";
export { AIImage, defineAIImage } from "./components/ai-image";
export { AICanvas, defineAICanvas } from "./components/ai-canvas";
export { AIMap, defineAIMap } from "./components/ai-map";
export { AIMusic, defineAIMusic } from "./components/ai-music";

// --- Core ---
export { IncrementalDOMBuilder, parseTag, parseAttributes } from "./core/dom-builder";
export { configure, getConfig, getRequestFn, getSystemPrompt, streamLLM } from "./core/stream";
export { SYSTEM_PROMPT, buildPrompt, getDepthAwareSystemPrompt, MAX_DEPTH } from "./core/prompt";
export { waitForChildData, buildPromptWithData, findDirectDataChildren } from "./core/data-manager";

// --- Types ---
export type {
  LLMRequestFn,
  LLMRequestOptions,
  AIComponentsConfig,
} from "./core/types";

// --- Define all components at once ---
import { defineAIComponent as _defineComponent } from "./components/ai-component";
import { defineAIData as _defineData } from "./components/ai-data";
import { defineAIText as _defineText } from "./components/ai-text";
import { defineAIMarkdown as _defineMarkdown } from "./components/ai-markdown";
import { defineAIImage as _defineImage } from "./components/ai-image";
import { defineAICanvas as _defineCanvas } from "./components/ai-canvas";
import { defineAIMap as _defineMap } from "./components/ai-map";
import { defineAIMusic as _defineMusic } from "./components/ai-music";

/** Register all AI custom elements at once */
export function defineAll(): void {
  _defineData(); // Register ai-data first — other components depend on it
  _defineComponent();
  _defineText();
  _defineMarkdown();
  _defineImage();
  _defineCanvas();
  _defineMap();
  _defineMusic();
}

// Auto-register when loaded via IIFE <script> tag
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (typeof (globalThis as Record<string, unknown>).AIC !== "undefined") {
    defineAll();
  }
}
