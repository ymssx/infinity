// ============================================================
// <ai-canvas> — AI-powered image generation component
//
// Usage:
//   <ai-canvas p="一只穿着宇航服的猫在月球上" width="512"></ai-canvas>
//
// The `p` attribute is a natural language prompt.
// The component calls a text-to-image API (OpenAI DALL-E compatible)
// to generate an image from the description.
// Supports standard <img> attributes: width, height, alt, class, style, loading, etc.
//
// Supports <ai-data> children — waits for data to resolve before generating.
// ============================================================

import type { AIComponentsConfig } from "../../core/types";
import { getConfig } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

const IMG_ATTRS = [
  "width", "height", "alt", "class", "style", "loading", "decoding",
  "crossorigin", "referrerpolicy",
] as const;

/** Image generation config (set via window.__ai_canvas_config or auto-detect from ai-components config) */
interface ImageGenConfig {
  /** API endpoint for image generation (e.g. https://api.openai.com/v1/images/generations) */
  apiUrl?: string;
  /** API key */
  apiKey?: string;
  /** Model name (e.g. dall-e-3, dall-e-2) */
  model?: string;
  /** Image size (e.g. 1024x1024, 512x512) */
  size?: string;
  /** Image quality (e.g. standard, hd) */
  quality?: string;
}

function getImageGenConfig(): ImageGenConfig {
  // Check for dedicated canvas config
  const canvasConfig = (window as unknown as Record<string, unknown>).__ai_canvas_config as
    | ImageGenConfig
    | undefined;
  if (canvasConfig) return canvasConfig;

  // Try to derive from ai-components main config (extract baseUrl and apiKey from playground)
  const mainConfig = getConfig();
  if (mainConfig) {
    // Try to read playground config from localStorage
    try {
      const stored = localStorage.getItem("aic_doc_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.apiKey && parsed.baseUrl) {
          return {
            apiUrl: `${parsed.baseUrl}/images/generations`,
            apiKey: parsed.apiKey,
            model: "dall-e-3",
            size: "1024x1024",
          };
        }
      }
    } catch { /* ignore */ }
  }

  return {};
}

async function generateImage(
  prompt: string,
  config: ImageGenConfig,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.apiUrl || !config.apiKey) {
    throw new Error("文生图 API 未配置。请设置 window.__ai_canvas_config = { apiUrl, apiKey, model }");
  }

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "dall-e-3",
      prompt,
      n: 1,
      size: config.size || "1024x1024",
      quality: config.quality || "standard",
      response_format: "url",
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const url = data.data?.[0]?.url;
  if (!url) throw new Error("API 未返回图片 URL");
  return url;
}

export class AICanvas extends HTMLElement {
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

    this._showLoading(prompt);

    try {
      // Wait for any <ai-data> children to resolve
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Inject data context into prompt if available
      const finalPrompt = buildPromptWithData(prompt, childData);

      const config = getImageGenConfig();
      const imageUrl = await generateImage(finalPrompt, config, signal);
      if (signal.aborted) return;

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

    img.style.borderRadius = "8px";
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
      this._showError("生成的图片加载失败");
    };

    this.appendChild(img);
  }

  private _showLoading(prompt: string): void {
    const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    const w = this.getAttribute("width") || "512";
    const h = this.getAttribute("height") || "512";

    this.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      `width:${w}px;height:${h}px;max-width:100%;display:flex;align-items:center;justify-content:center;` +
      "flex-direction:column;gap:10px;background:linear-gradient(135deg,#faf5ff,#ede9fe);" +
      "border-radius:8px;overflow:hidden;position:relative;";

    // Painting animation dots
    const dotsContainer = document.createElement("div");
    dotsContainer.style.cssText = "display:flex;gap:6px;z-index:1;";

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.style.cssText =
        `width:10px;height:10px;border-radius:50%;background:#8b5cf6;opacity:0.6;` +
        `animation:ai-canvas-bounce 0.6s ${i * 0.15}s infinite alternate;`;
      dotsContainer.appendChild(dot);
    }

    const icon = document.createElement("div");
    icon.style.cssText = "font-size:28px;z-index:1;";
    icon.textContent = "🎨";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:#7c3aed;z-index:1;max-width:80%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `绘制中: ${shortPrompt}`;

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:10px;color:#a78bfa;z-index:1;";
    hint.textContent = "文生图通常需要 10-30 秒";

    wrapper.appendChild(icon);
    wrapper.appendChild(dotsContainer);
    wrapper.appendChild(label);
    wrapper.appendChild(hint);

    // Add keyframes if not present
    if (!document.getElementById("ai-canvas-style")) {
      const style = document.createElement("style");
      style.id = "ai-canvas-style";
      style.textContent =
        "@keyframes ai-canvas-bounce{0%{transform:translateY(0)}100%{transform:translateY(-8px)}}";
      document.head.appendChild(style);
    }

    this.appendChild(wrapper);
  }

  private _showError(message: string): void {
    this.innerHTML = "";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:16px;color:rgba(239,68,68,0.8);font-size:12px;text-align:center;" +
      "border:1px dashed rgba(239,68,68,0.3);border-radius:8px;background:#fef2f2;" +
      "max-width:400px;";
    msg.textContent = message;
    this.appendChild(msg);
  }
}

/** Register the <ai-canvas> custom element */
export function defineAICanvas(): void {
  if (typeof customElements !== "undefined" && !customElements.get("ai-canvas")) {
    customElements.define("ai-canvas", AICanvas);
  }
}
