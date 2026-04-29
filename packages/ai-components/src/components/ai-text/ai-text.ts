// ============================================================
// <ai-text> — AI-powered pure text component
//
// Usage:
//   <ai-text p="写一首关于春天的诗"></ai-text>
//   <ai-text p="用一句话描述量子计算" tag="span"></ai-text>
//   <ai-text p="给这个商品写一段广告文案">
//     <ai-data p="mock一个电子产品的信息" />
//   </ai-text>
//
// The `p` attribute is a natural language prompt.
// Unlike <ai-component>, this component outputs PURE TEXT only —
// no HTML parsing, no DOM building, just streaming text content.
//
// Attributes:
//   p     — natural language prompt
//   tag   — wrapper element tag (default: "p"). Use "span" for inline.
//   class — CSS classes forwarded to the wrapper element
//   style — inline styles forwarded to the wrapper element
//
// Supports <ai-data> children — waits for data to resolve before generating.
// ============================================================

import { streamLLM } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

/** System prompt specifically for pure text generation */
const TEXT_SYSTEM_PROMPT = `You are a pure text generator. Output ONLY plain text content.

Rules:
- Output ONLY plain text. NO HTML tags. NO markdown syntax. NO code blocks.
- No backticks, no asterisks for bold, no hash symbols for headings.
- Just pure, clean, human-readable text.
- Respond in the same language as the user's prompt.
- Be concise but complete.`;

export class AIText extends HTMLElement {
  /** Abort controller for the current generation */
  private _abort: AbortController | null = null;

  /** Whether we are currently generating */
  private _generating = false;

  /** The wrapper element that holds the text */
  private _wrapperEl: HTMLElement | null = null;

  static get observedAttributes(): string[] {
    return ["p"];
  }

  connectedCallback(): void {
    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    // Base styles — inline by default
    this.style.display = this.style.display || "contents";

    this._generate(prompt);
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
      this._generate(newVal);
    }
  }

  private _cancel(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    this._generating = false;
  }

  /** Run the full generate cycle */
  private async _generate(prompt: string): Promise<void> {
    if (this._generating) {
      this._cancel();
    }

    this._generating = true;
    this._abort = new AbortController();
    const signal = this._abort.signal;

    // Show loading state
    this._showLoading(prompt);

    try {
      // Step 1: Wait for any child <ai-data> elements to resolve
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Step 2: Build the final prompt with data context
      const finalPrompt = buildPromptWithData(prompt, childData);

      // Step 3: Create the wrapper element for content
      const tag = this.getAttribute("tag") || "p";
      this._switchToContent(tag);

      // Step 4: Stream text and append directly (no HTML parsing)
      let hasContent = false;

      for await (const chunk of streamLLM(
        finalPrompt,
        signal,
        undefined,
        TEXT_SYSTEM_PROMPT,
      )) {
        if (signal.aborted) return;

        // Strip any markdown code fences the LLM might accidentally emit
        let text = chunk;
        if (!hasContent) {
          text = text.replace(/^```(?:\w+)?\s*\n?/, "");
        }
        if (text.includes("```")) {
          text = text.replace(/\n?```\s*$/, "");
        }

        if (text && this._wrapperEl) {
          hasContent = true;
          // Append as pure text — no HTML interpretation
          this._wrapperEl.textContent =
            (this._wrapperEl.textContent || "") + text;
        }
      }

      if (!hasContent) {
        this._showEmpty();
      }
    } catch (err) {
      if (signal.aborted) return;
      this._showError(err instanceof Error ? err.message : String(err));
    } finally {
      this._generating = false;
      this._abort = null;
    }
  }

  /** Switch from loading to content mode */
  private _switchToContent(tag: string): void {
    this.innerHTML = "";

    this._wrapperEl = document.createElement(tag);

    // Forward class and style attributes
    const cls = this.getAttribute("class");
    if (cls) {
      // We can't use this.className because custom elements might not sync
      this._wrapperEl.className = cls;
    }

    const inlineStyle = this.getAttribute("style");
    if (inlineStyle) {
      this._wrapperEl.setAttribute("style", inlineStyle);
    }

    this.appendChild(this._wrapperEl);
  }

  /** Show loading indicator */
  private _showLoading(prompt: string): void {
    const shortPrompt =
      prompt.length > 50 ? prompt.slice(0, 50) + "…" : prompt;

    this.innerHTML = "";
    const loader = document.createElement("span");
    loader.style.cssText =
      "color:rgba(99,102,241,0.4);font-size:12px;font-style:italic;";
    loader.textContent = `Generating text: ${shortPrompt}`;

    // Add blinking cursor animation
    const cursor = document.createElement("span");
    cursor.style.cssText =
      "display:inline-block;width:2px;height:1em;background:rgba(99,102,241,0.5);" +
      "margin-left:2px;vertical-align:text-bottom;animation:ai-text-blink 1s step-end infinite;";
    loader.appendChild(cursor);

    // Inject keyframes if needed
    if (!document.getElementById("ai-text-blink-style")) {
      const style = document.createElement("style");
      style.id = "ai-text-blink-style";
      style.textContent =
        "@keyframes ai-text-blink{0%,100%{opacity:1}50%{opacity:0}}";
      document.head.appendChild(style);
    }

    this.appendChild(loader);
  }

  /** Show empty state */
  private _showEmpty(): void {
    this.innerHTML = "";
    const msg = document.createElement("span");
    msg.style.cssText =
      "color:rgba(99,102,241,0.4);font-size:12px;font-style:italic;";
    msg.textContent = "No text generated";
    this.appendChild(msg);
  }

  /** Show error state */
  private _showError(message: string): void {
    this.innerHTML = "";
    const msg = document.createElement("span");
    msg.style.cssText =
      "color:rgba(239,68,68,0.6);font-size:12px;font-style:italic;";
    msg.textContent = message;
    this.appendChild(msg);
  }
}

/** Register the <ai-text> custom element */
export function defineAIText(): void {
  if (
    typeof customElements !== "undefined" &&
    !customElements.get("ai-text")
  ) {
    customElements.define("ai-text", AIText);
  }
}
