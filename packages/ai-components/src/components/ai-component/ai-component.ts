// ============================================================
// <ai-component> — Natural-language-driven Web Component
//
// Usage:
//   <ai-component p="生成一个用户注册表单"></ai-component>
//
// The `p` attribute is a natural language prompt.
// The component calls the globally-configured LLM request function,
// streams back HTML chunks, and incrementally builds DOM nodes
// using recursive createElement / appendChild (no innerHTML flicker).
//
// Depth awareness:
//   The component auto-detects its nesting depth by counting ancestor
//   <ai-component> elements. The depth controls the system prompt:
//     depth 1 → skeleton / orchestrator
//     depth 2 → section builder
//     depth 3 → leaf content (no further nesting allowed)
//   Nesting beyond MAX_DEPTH is blocked with a visible error.
// ============================================================

import { IncrementalDOMBuilder } from "../../core/dom-builder";
import { streamLLM } from "../../core/stream";
import { buildPrompt, MAX_DEPTH } from "../../core/prompt";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

export class AIComponent extends HTMLElement {
  /** Abort controller for the current generation */
  private _abort: AbortController | null = null;

  /** Whether we are currently generating */
  private _generating = false;

  /** The DOM builder instance */
  private _builder: IncrementalDOMBuilder | null = null;

  /** Content container */
  private _contentEl: HTMLElement | null = null;

  /** Nesting depth (1-based). Computed once on connect. */
  private _depth = 1;

  static get observedAttributes(): string[] {
    return ["p"];
  }

  connectedCallback(): void {
    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    // Compute nesting depth
    this._depth = this._computeDepth();

    // Block if exceeding max depth
    if (this._depth > MAX_DEPTH) {
      this._showDepthError();
      return;
    }

    // Base styles
    this.style.display = "block";
    if (!this.style.width) this.style.width = "100%";

    // Store depth as a data attribute for CSS/debug introspection
    this.dataset.depth = String(this._depth);

    this._generate(prompt);
  }

  disconnectedCallback(): void {
    this._cancel();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (name === "p" && oldVal !== null && newVal && newVal !== oldVal) {
      // Re-generate when `p` changes after initial connection
      this._cancel();
      this._generate(newVal);
    }
  }

  // ------------------------------------------------------------------
  // Depth computation
  // ------------------------------------------------------------------

  /**
   * Walk up the DOM tree and count how many <ai-component> ancestors
   * exist above this element. Returns 1 for a top-level component.
   */
  private _computeDepth(): number {
    let depth = 1;
    let node: Node | null = this.parentNode;
    while (node) {
      if (
        node instanceof HTMLElement &&
        node.tagName.toLowerCase() === "ai-component"
      ) {
        depth++;
      }
      node = node.parentNode;
    }
    return depth;
  }

  /** Cancel any in-progress generation */
  private _cancel(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    this._generating = false;
    this._builder = null;
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

      // Step 2: Build the final prompt, injecting child data context if available
      const basePrompt = buildPrompt(prompt);
      const finalPrompt = buildPromptWithData(basePrompt, childData);

      // Strip code fences state
      let prefixBuffer = "";
      let started = false;

      // Stream and build DOM — pass depth for depth-aware system prompt
      for await (const chunk of streamLLM(finalPrompt, signal, this._depth)) {
        if (signal.aborted) return;

        if (!started) {
          prefixBuffer += chunk;

          // Strip markdown code fences if LLM wraps output
          let cleaned = prefixBuffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
          const idx = cleaned.search(/<[a-zA-Z!]/);
          if (idx >= 0) {
            started = true;
            cleaned = cleaned.slice(idx);

            // Switch from loading to content mode
            this._switchToContent();
            this._builder!.write(cleaned);
          }
        } else {
          // Strip trailing code fence if it appears
          let data = chunk;
          if (data.includes("```")) {
            data = data.replace(/\n?```\s*$/, "");
          }
          if (data) {
            this._builder!.write(data);
          }
        }
      }

      // Finish building — auto-close unclosed tags
      if (this._builder) {
        this._builder.finish();
      }

      // If we never got any content
      if (!started) {
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

  /** Switch from loading shimmer to content mode */
  private _switchToContent(): void {
    // Clear loading state
    this.innerHTML = "";
    this.style.position = "";
    this.style.minHeight = "";
    this.style.overflow = "";

    // Create content container
    this._contentEl = document.createElement("div");
    this._contentEl.style.width = "100%";
    this.appendChild(this._contentEl);

    // Create the incremental builder targeting the content element
    this._builder = new IncrementalDOMBuilder(this._contentEl);
  }

  /** Show loading shimmer */
  private _showLoading(prompt: string): void {
    this.style.position = "relative";
    this.style.overflow = "hidden";
    this.style.minHeight = this.style.minHeight || "80px";

    const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;

    // Build loading UI using DOM APIs (not innerHTML)
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;gap:8px;background:linear-gradient(135deg,rgba(99,102,241,0.05)," +
      "rgba(168,85,247,0.05));border-radius:0.75rem;border:1px dashed rgba(99,102,241,0.2);padding:16px;";

    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:24px;height:24px;border:2px solid rgba(99,102,241,0.2);" +
      "border-top-color:rgba(99,102,241,0.6);border-radius:50%;animation:ai-spin 0.8s linear infinite;";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:rgba(99,102,241,0.5);max-width:90%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `Generating (depth ${this._depth}): ${shortPrompt}`;

    wrapper.appendChild(spinner);
    wrapper.appendChild(label);

    // Add keyframes style if not already present
    if (!document.getElementById("ai-comp-spin-style")) {
      const style = document.createElement("style");
      style.id = "ai-comp-spin-style";
      style.textContent = "@keyframes ai-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }

    this.innerHTML = "";
    this.appendChild(wrapper);
  }

  /** Show depth-exceeded error */
  private _showDepthError(): void {
    this.style.display = "block";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:12px;color:rgba(245,158,11,0.8);font-size:12px;text-align:center;" +
      "border:1px dashed rgba(245,158,11,0.4);border-radius:0.5rem;" +
      "background:rgba(245,158,11,0.05);";
    msg.textContent =
      `⚠️ Max nesting depth (${MAX_DEPTH}) exceeded — this <ai-component> was not rendered. ` +
      `Prompt: "${(this.getAttribute("p") || "").slice(0, 80)}"`;
    this.appendChild(msg);
  }

  /** Show empty state */
  private _showEmpty(): void {
    this.innerHTML = "";
    this.style.position = "";
    this.style.minHeight = "";
    this.style.overflow = "";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:12px;color:rgba(99,102,241,0.5);font-size:12px;text-align:center;";
    msg.textContent = "No content generated";
    this.appendChild(msg);
  }

  /** Show error state */
  private _showError(message: string): void {
    this.innerHTML = "";
    this.style.position = "";
    this.style.minHeight = "";
    this.style.overflow = "";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:12px;color:rgba(239,68,68,0.7);font-size:12px;text-align:center;" +
      "border:1px dashed rgba(239,68,68,0.3);border-radius:0.5rem;";
    msg.textContent = message;
    this.appendChild(msg);
  }
}

/** Register the <ai-component> custom element */
export function defineAIComponent(): void {
  if (typeof customElements !== "undefined" && !customElements.get("ai-component")) {
    customElements.define("ai-component", AIComponent);
  }
}
