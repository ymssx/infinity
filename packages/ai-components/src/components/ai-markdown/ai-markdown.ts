// ============================================================
// <ai-markdown> — AI-powered Markdown rendering component
//
// Usage:
//   <ai-markdown p="写一篇关于 TypeScript 泛型的教程"></ai-markdown>
//   <ai-markdown p="对比 React 和 Vue 的优缺点" theme="github"></ai-markdown>
//   <ai-markdown p="解释这段代码的工作原理">
//     <ai-data p="获取一段 Python 快速排序代码" format="text" />
//   </ai-markdown>
//
// The `p` attribute is a natural language prompt.
// The component instructs the LLM to output Markdown, then renders it
// as styled HTML with syntax highlighting support.
//
// Attributes:
//   p     — natural language prompt
//   theme — style theme: "github" (default), "minimal", "dark"
//   class — CSS classes forwarded to the container
//
// Supports <ai-data> children — waits for data to resolve before generating.
// ============================================================

import { streamLLM } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

/** System prompt specifically for Markdown generation */
const MARKDOWN_SYSTEM_PROMPT = `You are a Markdown content generator. Output well-structured Markdown.

Rules:
- Output ONLY valid Markdown content. NO HTML tags unless absolutely needed for complex layouts.
- Use proper Markdown syntax: headings (#), lists (- or 1.), bold (**), italic (*), code blocks (\`\`\`), tables, blockquotes (>), links, etc.
- Structure content with clear headings and sections.
- Use code blocks with language specifiers for any code snippets.
- Use tables for tabular data.
- Respond in the same language as the user's prompt.
- Do NOT wrap the output in markdown code fences (no \`\`\`markdown).
- Just output the raw Markdown content directly.`;

/** Minimal Markdown to HTML converter (no external deps) */
function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (except in code blocks)
  // We'll handle code blocks separately
  const codeBlocks: string[] = [];

  // Extract fenced code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const langClass = lang ? ` class="language-${lang}"` : "";
      const placeholder = `%%CODEBLOCK_${codeBlocks.length}%%`;
      codeBlocks.push(
        `<pre class="ai-md-pre"><code${langClass}>${escaped}</code></pre>`,
      );
      return placeholder;
    },
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    (_m, code: string) =>
      `<code class="ai-md-inline-code">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`,
  );

  // Headings (must be before other line-based rules)
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="ai-md-h6">$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="ai-md-h5">$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="ai-md-h4">$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="ai-md-h3">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="ai-md-h2">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="ai-md-h1">$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="ai-md-hr">');

  // Bold and italic
  html = html.replace(
    /\*\*\*(.+?)\*\*\*/g,
    "<strong><em>$1</em></strong>",
  );
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Links and images
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" class="ai-md-img">',
  );
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="ai-md-link" target="_blank" rel="noopener">$1</a>',
  );

  // Blockquotes (multi-line)
  html = html.replace(
    /^(?:>\s?(.*)(?:\n|$))+/gm,
    (match) => {
      const content = match
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("<br>");
      return `<blockquote class="ai-md-blockquote">${content}</blockquote>`;
    },
  );

  // Tables
  html = html.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _sep: string, bodyRows: string) => {
      const headers = headerRow
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th class="ai-md-th">${c.trim()}</th>`)
        .join("");

      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td class="ai-md-td">${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");

      return `<table class="ai-md-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    },
  );

  // Unordered lists
  html = html.replace(
    /^(?:[-*+]\s+.+(?:\n|$))+/gm,
    (match) => {
      const items = match
        .trim()
        .split("\n")
        .map((line) => `<li>${line.replace(/^[-*+]\s+/, "")}</li>`)
        .join("");
      return `<ul class="ai-md-ul">${items}</ul>`;
    },
  );

  // Ordered lists
  html = html.replace(
    /^(?:\d+\.\s+.+(?:\n|$))+/gm,
    (match) => {
      const items = match
        .trim()
        .split("\n")
        .map((line) => `<li>${line.replace(/^\d+\.\s+/, "")}</li>`)
        .join("");
      return `<ol class="ai-md-ol">${items}</ol>`;
    },
  );

  // Paragraphs: wrap remaining loose text lines
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Don't wrap blocks that are already HTML elements
      if (/^<(?:h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|pre|blockquote|hr|div|p|img)/i.test(trimmed)) {
        return trimmed;
      }
      // Don't wrap code block placeholders
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) {
        return trimmed;
      }
      return `<p class="ai-md-p">${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
  });

  return html;
}

/** GitHub-style theme CSS */
const GITHUB_THEME = `
.ai-md { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.7; color: #1f2937; }
.ai-md-h1 { font-size: 1.75em; font-weight: 700; margin: 1.2em 0 0.6em; padding-bottom: 0.3em; border-bottom: 1px solid #e5e7eb; color: #111827; }
.ai-md-h2 { font-size: 1.4em; font-weight: 600; margin: 1em 0 0.5em; padding-bottom: 0.25em; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
.ai-md-h3 { font-size: 1.15em; font-weight: 600; margin: 0.8em 0 0.4em; color: #374151; }
.ai-md-h4, .ai-md-h5, .ai-md-h6 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; color: #4b5563; }
.ai-md-p { margin: 0.6em 0; }
.ai-md-ul, .ai-md-ol { margin: 0.5em 0; padding-left: 1.8em; }
.ai-md-ul { list-style-type: disc; }
.ai-md-ol { list-style-type: decimal; }
.ai-md-ul li, .ai-md-ol li { margin: 0.25em 0; }
.ai-md-blockquote { margin: 0.8em 0; padding: 0.5em 1em; border-left: 4px solid #6366f1; background: #f5f3ff; border-radius: 0 0.5rem 0.5rem 0; color: #4b5563; }
.ai-md-pre { margin: 0.8em 0; padding: 1em; background: #1e293b; color: #e2e8f0; border-radius: 0.5rem; overflow-x: auto; font-size: 0.875em; line-height: 1.6; }
.ai-md-pre code { background: none; padding: 0; font-size: inherit; color: inherit; }
.ai-md-inline-code { background: #f1f5f9; color: #e11d48; padding: 0.15em 0.4em; border-radius: 0.25rem; font-size: 0.875em; font-family: 'JetBrains Mono', 'Fira Code', monospace; }
.ai-md-table { width: 100%; border-collapse: collapse; margin: 0.8em 0; font-size: 0.9em; }
.ai-md-th { background: #f9fafb; border: 1px solid #e5e7eb; padding: 0.5em 0.75em; text-align: left; font-weight: 600; }
.ai-md-td { border: 1px solid #e5e7eb; padding: 0.5em 0.75em; }
.ai-md-hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
.ai-md-link { color: #4f46e5; text-decoration: none; }
.ai-md-link:hover { text-decoration: underline; }
.ai-md-img { max-width: 100%; border-radius: 0.5rem; margin: 0.8em 0; }
`;

/** Minimal theme CSS */
const MINIMAL_THEME = `
.ai-md { font-family: 'Georgia', serif; line-height: 1.8; color: #374151; }
.ai-md-h1 { font-size: 1.6em; font-weight: 700; margin: 1em 0 0.5em; color: #111827; }
.ai-md-h2 { font-size: 1.3em; font-weight: 600; margin: 0.8em 0 0.4em; color: #1f2937; }
.ai-md-h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; color: #374151; }
.ai-md-h4, .ai-md-h5, .ai-md-h6 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.25em; }
.ai-md-p { margin: 0.5em 0; }
.ai-md-ul, .ai-md-ol { margin: 0.5em 0; padding-left: 1.5em; }
.ai-md-ul { list-style-type: disc; } .ai-md-ol { list-style-type: decimal; }
.ai-md-blockquote { margin: 0.5em 0; padding: 0.5em 1em; border-left: 3px solid #9ca3af; color: #6b7280; font-style: italic; }
.ai-md-pre { margin: 0.5em 0; padding: 0.8em; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.375rem; overflow-x: auto; font-size: 0.85em; }
.ai-md-pre code { background: none; padding: 0; color: #1f2937; }
.ai-md-inline-code { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 0.2rem; font-size: 0.85em; }
.ai-md-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
.ai-md-th { border-bottom: 2px solid #d1d5db; padding: 0.4em 0.6em; text-align: left; font-weight: 600; }
.ai-md-td { border-bottom: 1px solid #e5e7eb; padding: 0.4em 0.6em; }
.ai-md-hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
.ai-md-link { color: #2563eb; } .ai-md-link:hover { text-decoration: underline; }
.ai-md-img { max-width: 100%; border-radius: 0.25rem; margin: 0.5em 0; }
`;

/** Dark theme CSS */
const DARK_THEME = `
.ai-md { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; line-height: 1.7; color: #e2e8f0; }
.ai-md-h1 { font-size: 1.75em; font-weight: 700; margin: 1.2em 0 0.6em; padding-bottom: 0.3em; border-bottom: 1px solid #334155; color: #f8fafc; }
.ai-md-h2 { font-size: 1.4em; font-weight: 600; margin: 1em 0 0.5em; padding-bottom: 0.25em; border-bottom: 1px solid #1e293b; color: #f1f5f9; }
.ai-md-h3 { font-size: 1.15em; font-weight: 600; margin: 0.8em 0 0.4em; color: #e2e8f0; }
.ai-md-h4, .ai-md-h5, .ai-md-h6 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.3em; color: #cbd5e1; }
.ai-md-p { margin: 0.6em 0; }
.ai-md-ul, .ai-md-ol { margin: 0.5em 0; padding-left: 1.8em; }
.ai-md-ul { list-style-type: disc; } .ai-md-ol { list-style-type: decimal; }
.ai-md-blockquote { margin: 0.8em 0; padding: 0.5em 1em; border-left: 4px solid #818cf8; background: rgba(99,102,241,0.1); border-radius: 0 0.5rem 0.5rem 0; color: #94a3b8; }
.ai-md-pre { margin: 0.8em 0; padding: 1em; background: #0f172a; color: #e2e8f0; border: 1px solid #1e293b; border-radius: 0.5rem; overflow-x: auto; font-size: 0.875em; }
.ai-md-pre code { background: none; padding: 0; color: inherit; }
.ai-md-inline-code { background: #1e293b; color: #f472b6; padding: 0.15em 0.4em; border-radius: 0.25rem; font-size: 0.875em; }
.ai-md-table { width: 100%; border-collapse: collapse; margin: 0.8em 0; }
.ai-md-th { background: #1e293b; border: 1px solid #334155; padding: 0.5em 0.75em; text-align: left; font-weight: 600; }
.ai-md-td { border: 1px solid #334155; padding: 0.5em 0.75em; }
.ai-md-hr { border: none; border-top: 1px solid #334155; margin: 1.5em 0; }
.ai-md-link { color: #818cf8; } .ai-md-link:hover { text-decoration: underline; }
.ai-md-img { max-width: 100%; border-radius: 0.5rem; margin: 0.8em 0; }
`;

const THEMES: Record<string, string> = {
  github: GITHUB_THEME,
  minimal: MINIMAL_THEME,
  dark: DARK_THEME,
};

export class AIMarkdown extends HTMLElement {
  /** Abort controller for the current generation */
  private _abort: AbortController | null = null;

  /** Whether we are currently generating */
  private _generating = false;

  /** Content container */
  private _contentEl: HTMLElement | null = null;

  /** Raw markdown buffer for final rendering */
  private _mdBuffer = "";

  static get observedAttributes(): string[] {
    return ["p"];
  }

  connectedCallback(): void {
    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    // Base styles
    this.style.display = "block";
    if (!this.style.width) this.style.width = "100%";

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
    this._mdBuffer = "";
  }

  /** Run the full generate cycle */
  private async _generate(prompt: string): Promise<void> {
    if (this._generating) {
      this._cancel();
    }

    this._generating = true;
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._mdBuffer = "";

    // Show loading state
    this._showLoading(prompt);

    try {
      // Step 1: Wait for any child <ai-data> elements to resolve
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Step 2: Build the final prompt with data context
      const finalPrompt = buildPromptWithData(prompt, childData);

      // Step 3: Stream markdown content
      let hasContent = false;

      for await (const chunk of streamLLM(
        finalPrompt,
        signal,
        undefined,
        MARKDOWN_SYSTEM_PROMPT,
      )) {
        if (signal.aborted) return;

        this._mdBuffer += chunk;
        hasContent = true;

        // Re-render the entire markdown on each chunk
        // (markdown needs full context for correct parsing)
        this._renderMarkdown();
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

  /** Render the current markdown buffer as HTML */
  private _renderMarkdown(): void {
    if (!this._contentEl) {
      this._switchToContent();
    }

    // Clean the buffer — strip wrapping code fences
    let md = this._mdBuffer.trim();
    md = md.replace(/^```(?:markdown|md|MARKDOWN)?\s*\n?/, "");
    md = md.replace(/\n?```\s*$/, "");

    const html = markdownToHtml(md);

    if (this._contentEl) {
      this._contentEl.innerHTML = html;
    }
  }

  /** Switch from loading to content mode */
  private _switchToContent(): void {
    this.innerHTML = "";

    // Inject theme styles
    const theme = this.getAttribute("theme") || "github";
    this._injectThemeStyles(theme);

    // Create content container
    this._contentEl = document.createElement("div");
    this._contentEl.className = "ai-md";

    // Forward class attribute
    const cls = this.getAttribute("class");
    if (cls) {
      this._contentEl.className = `ai-md ${cls}`;
    }

    this.appendChild(this._contentEl);
  }

  /** Inject theme CSS into document head */
  private _injectThemeStyles(theme: string): void {
    const styleId = `ai-md-theme-${theme}`;
    if (document.getElementById(styleId)) return;

    const css = THEMES[theme] || THEMES.github;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /** Show loading state */
  private _showLoading(prompt: string): void {
    this.style.position = "relative";
    this.style.overflow = "hidden";
    this.style.minHeight = this.style.minHeight || "60px";

    const shortPrompt =
      prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;

    this.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;gap:8px;background:linear-gradient(135deg,rgba(99,102,241,0.03)," +
      "rgba(168,85,247,0.03));border-radius:0.5rem;border:1px dashed rgba(99,102,241,0.15);padding:16px;";

    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:20px;height:20px;border:2px solid rgba(99,102,241,0.15);" +
      "border-top-color:rgba(99,102,241,0.5);border-radius:50%;animation:ai-spin 0.8s linear infinite;";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:rgba(99,102,241,0.4);max-width:90%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `Generating markdown: ${shortPrompt}`;

    wrapper.appendChild(spinner);
    wrapper.appendChild(label);

    // Ensure spinner animation exists
    if (!document.getElementById("ai-comp-spin-style")) {
      const style = document.createElement("style");
      style.id = "ai-comp-spin-style";
      style.textContent = "@keyframes ai-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }

    this.appendChild(wrapper);
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

/** Register the <ai-markdown> custom element */
export function defineAIMarkdown(): void {
  if (
    typeof customElements !== "undefined" &&
    !customElements.get("ai-markdown")
  ) {
    customElements.define("ai-markdown", AIMarkdown);
  }
}
