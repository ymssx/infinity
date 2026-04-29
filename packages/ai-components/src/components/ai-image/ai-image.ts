// ============================================================
// <ai-image> — AI-powered image search component
//
// Usage:
//   <ai-image p="一只在雪地里奔跑的柯基" width="400"></ai-image>
//
// The `p` attribute is a natural language description.
// The component calls Unsplash API to find the best matching image.
// Supports standard <img> attributes: width, height, alt, class, style, loading, etc.
//
// Supports <ai-data> children — waits for data to resolve before searching.
// ============================================================

import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

const IMG_ATTRS = [
  "width", "height", "alt", "class", "style", "loading", "decoding",
  "crossorigin", "referrerpolicy", "sizes", "srcset",
] as const;

/** Unsplash source URL — free, no API key required for basic usage */
function buildUnsplashUrl(query: string, width = 800, height = 600): string {
  const encoded = encodeURIComponent(query);
  return `https://source.unsplash.com/${width}x${height}/?${encoded}`;
}

/** Use Unsplash search API if configured, otherwise fallback to source URL */
async function searchImage(query: string, signal?: AbortSignal): Promise<string> {
  // Try Unsplash API first (if global config has unsplashAccessKey)
  const config = (window as unknown as Record<string, unknown>).__ai_image_config as
    | { unsplashAccessKey?: string }
    | undefined;

  if (config?.unsplashAccessKey) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
        {
          headers: { Authorization: `Client-ID ${config.unsplashAccessKey}` },
          signal,
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.results?.[0]?.urls?.regular) {
          return data.results[0].urls.regular;
        }
      }
    } catch {
      // Fallback to source URL
    }
  }

  // Fallback: use source.unsplash.com (redirects to a random matching image)
  return buildUnsplashUrl(query);
}

export class AIImage extends HTMLElement {
  private _abort: AbortController | null = null;
  private _loaded = false;

  static get observedAttributes(): string[] {
    return ["p", ...IMG_ATTRS];
  }

  connectedCallback(): void {
    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    this.style.display = "inline-block";
    if (!this.style.overflow) this.style.overflow = "hidden";

    this._render(prompt);
  }

  disconnectedCallback(): void {
    this._cancel();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (name === "p" && oldVal !== null && newVal && newVal !== oldVal) {
      this._cancel();
      this._render(newVal);
    } else if (name !== "p" && this._loaded) {
      // Forward attribute changes to internal <img>
      const img = this.querySelector("img");
      if (img && newVal !== null) {
        img.setAttribute(name, newVal);
      }
    }
  }

  private _cancel(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
  }

  private async _render(prompt: string): Promise<void> {
    this._loaded = false;
    this._abort = new AbortController();
    const signal = this._abort.signal;

    // Show loading shimmer
    this._showLoading(prompt);

    try {
      // Wait for any <ai-data> children to resolve
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Inject data context into search query if available
      const searchQuery = childData ? `${prompt} ${childData}` : prompt;

      const imageUrl = await searchImage(searchQuery, signal);
      if (signal.aborted) return;

      // Create and display the image
      this._showImage(imageUrl, prompt);
    } catch (err) {
      if (signal.aborted) return;
      this._showError(err instanceof Error ? err.message : String(err));
    }
  }

  private _showImage(url: string, prompt: string): void {
    this.innerHTML = "";

    const img = document.createElement("img");
    img.src = url;
    img.alt = this.getAttribute("alt") || prompt;

    // Forward all img-compatible attributes
    for (const attr of IMG_ATTRS) {
      const val = this.getAttribute(attr);
      if (val !== null) {
        img.setAttribute(attr, val);
      }
    }

    // Default styles
    if (!this.getAttribute("style")?.includes("border-radius")) {
      img.style.borderRadius = "8px";
    }
    img.style.maxWidth = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.style.transition = "opacity 0.3s ease";
    img.style.opacity = "0";

    img.onload = () => {
      img.style.opacity = "1";
      this._loaded = true;
    };

    img.onerror = () => {
      this._showError("图片加载失败");
    };

    this.appendChild(img);
  }

  private _showLoading(prompt: string): void {
    const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    const w = this.getAttribute("width") || "400";
    const h = this.getAttribute("height") || "300";

    this.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      `width:${w}px;height:${h}px;max-width:100%;display:flex;align-items:center;justify-content:center;` +
      "flex-direction:column;gap:8px;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);" +
      "border-radius:8px;overflow:hidden;position:relative;";

    // Shimmer animation
    const shimmer = document.createElement("div");
    shimmer.style.cssText =
      "position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);" +
      "animation:ai-img-shimmer 1.5s infinite;";

    const icon = document.createElement("div");
    icon.style.cssText = "font-size:24px;opacity:0.4;z-index:1;";
    icon.textContent = "🖼️";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:#64748b;z-index:1;max-width:80%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `搜索: ${shortPrompt}`;

    wrapper.appendChild(shimmer);
    wrapper.appendChild(icon);
    wrapper.appendChild(label);

    // Add keyframes if not present
    if (!document.getElementById("ai-img-shimmer-style")) {
      const style = document.createElement("style");
      style.id = "ai-img-shimmer-style";
      style.textContent =
        "@keyframes ai-img-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}";
      document.head.appendChild(style);
    }

    this.appendChild(wrapper);
  }

  private _showError(message: string): void {
    this.innerHTML = "";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:12px;color:rgba(239,68,68,0.7);font-size:12px;text-align:center;" +
      "border:1px dashed rgba(239,68,68,0.3);border-radius:8px;background:#fef2f2;";
    msg.textContent = message;
    this.appendChild(msg);
  }
}

/** Register the <ai-image> custom element */
export function defineAIImage(): void {
  if (typeof customElements !== "undefined" && !customElements.get("ai-image")) {
    customElements.define("ai-image", AIImage);
  }
}
