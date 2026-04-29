// ============================================================
// <ai-data> — Data Provider Component
//
// Usage:
//   <ai-component p="一个购物车列表">
//     <ai-data p="mock一个购物车列表数据" />
//   </ai-component>
//
// The <ai-data> element:
//   - Is invisible (display: none), renders nothing
//   - Uses the LLM to generate structured data based on the `p` prompt
//   - Can nest inside any AI component — the parent waits for all
//     child <ai-data> elements to resolve before starting its own lifecycle
//   - Can nest inside other <ai-data> elements — inner resolves first,
//     outer receives inner data as context
//   - Dispatches 'ai-data-ready' CustomEvent with the resolved data
//   - Stores resolved data on `this.data` for synchronous access
//
// Attributes:
//   p       — natural language description of the data to generate
//   format  — optional hint: "json" (default), "text", "csv", etc.
// ============================================================

import { streamLLM } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

/** System prompt specifically for data generation */
const DATA_SYSTEM_PROMPT = `You are a pure data generator. Output ONLY the requested data.

Rules:
- Output ONLY the data itself. No markdown fences. No explanations. No commentary.
- Default format is JSON. If the user specifies another format, follow it.
- For JSON: output valid, well-structured JSON. Use realistic data.
- Keep data concise but realistic — prefer arrays of 3-8 items unless specified.
- Use the user's language for string values when appropriate.
- Do NOT wrap in code blocks or backticks. Raw data only.`;

export class AIData extends HTMLElement {
  /** Abort controller for the current data fetch */
  private _abort: AbortController | null = null;

  /** Whether we are currently fetching data */
  private _loading = false;

  /** Resolved data (publicly accessible) */
  public data: string | null = null;

  /**
   * Internal storage for the data manager to check synchronously.
   * @internal
   */
  public __aiData?: string | null;

  static get observedAttributes(): string[] {
    return ["p"];
  }

  connectedCallback(): void {
    // Always invisible — this element never renders
    this.style.display = "none";

    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    this._fetchData(prompt);
  }

  disconnectedCallback(): void {
    this._cancel();
  }

  attributeChangedCallback(
    name: string,
    oldVal: string | null,
    newVal: string | null,
  ): void {
    if (name === "p" && oldVal !== null && newVal && newVal !== oldVal) {
      this._cancel();
      this._fetchData(newVal);
    }
  }

  private _cancel(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    this._loading = false;
  }

  private async _fetchData(prompt: string): Promise<void> {
    if (this._loading) {
      this._cancel();
    }

    this._loading = true;
    this._abort = new AbortController();
    const signal = this._abort.signal;

    try {
      // Step 1: Wait for any nested <ai-data> children to resolve first
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Step 2: Build the final prompt with child data context
      const format = this.getAttribute("format") || "json";
      let finalPrompt = prompt;

      if (format !== "json") {
        finalPrompt += `\nOutput format: ${format}`;
      }

      finalPrompt = buildPromptWithData(finalPrompt, childData);

      // Step 3: Stream LLM response and accumulate (use data-specific system prompt)
      let accumulated = "";

      for await (const chunk of streamLLM(
        finalPrompt,
        signal,
        undefined,
        DATA_SYSTEM_PROMPT,
      )) {
        if (signal.aborted) return;
        accumulated += chunk;
      }

      // Step 4: Clean up the response
      accumulated = this._cleanResponse(accumulated);

      // Step 5: Store the data and notify parent
      this.data = accumulated;
      this.__aiData = accumulated;

      this.dispatchEvent(
        new CustomEvent("ai-data-ready", {
          detail: accumulated,
          bubbles: false, // Don't bubble — parent listens directly
        }),
      );
    } catch (err) {
      if (signal.aborted) return;

      this.data = null;
      this.__aiData = null;

      this.dispatchEvent(
        new CustomEvent("ai-data-error", {
          detail: err instanceof Error ? err.message : String(err),
          bubbles: false,
        }),
      );
    } finally {
      this._loading = false;
      this._abort = null;
    }
  }

  /**
   * Clean up the LLM response:
   * - Strip markdown code fences
   * - Trim whitespace
   */
  private _cleanResponse(raw: string): string {
    let cleaned = raw.trim();

    // Strip leading ```json or ``` and trailing ```
    cleaned = cleaned.replace(/^```(?:json|JSON|csv|CSV|text|TEXT)?\s*\n?/, "");
    cleaned = cleaned.replace(/\n?```\s*$/, "");

    return cleaned.trim();
  }
}

/**
 * Get the system prompt for data generation.
 * Exported so streamLLM can use it when called from ai-data context.
 */
export { DATA_SYSTEM_PROMPT };

/** Register the <ai-data> custom element */
export function defineAIData(): void {
  if (
    typeof customElements !== "undefined" &&
    !customElements.get("ai-data")
  ) {
    customElements.define("ai-data", AIData);
  }
}
