// ============================================================
// <ai-music> — AI-powered music player component
//
// Usage:
//   <ai-music p="播放一首轻松的爵士乐"></ai-music>
//   <ai-music p="play some lo-fi hip hop beats" theme="dark"></ai-music>
//
// The `p` attribute is a natural language prompt.
// The component uses LLM to generate a customized music player UI
// and searches for matching music via free APIs.
// Supports: theme, width, height, autoplay, loop attributes.
//
// Supports <ai-data> children — waits for data to resolve before rendering.
// ============================================================

import { IncrementalDOMBuilder } from "../../core/dom-builder";
import { streamLLM } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

const MUSIC_ATTRS = [
  "width", "height", "class", "style", "theme", "autoplay", "loop",
] as const;

/** Free music search using Jamendo API (no API key for basic usage) or DuckDuckGo */
interface MusicTrack {
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  duration: number;
}

/** Search for music using the Free Music Archive / Jamendo-like services */
async function searchMusic(query: string, signal?: AbortSignal): Promise<MusicTrack[]> {
  // Use a free music API — Jamendo (no client_id needed for basic)
  // Fallback: generate placeholder tracks
  try {
    const res = await fetch(
      `https://api.jamendo.com/v3.0/tracks/?client_id=b0ace3b6&format=json&limit=5&search=${encodeURIComponent(query)}&include=musicinfo`,
      { signal },
    );

    if (res.ok) {
      const data = await res.json();
      if (data.results?.length) {
        return data.results.map((t: Record<string, unknown>) => ({
          title: t.name || "Unknown",
          artist: t.artist_name || "Unknown Artist",
          audioUrl: t.audio || "",
          coverUrl: t.album_image || t.image || "",
          duration: parseInt(String(t.duration) || "0", 10),
        }));
      }
    }
  } catch {
    // Fallback below
  }

  // Return empty — LLM will generate UI with placeholder
  return [];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export class AIMusic extends HTMLElement {
  private _abort: AbortController | null = null;
  private _audio: HTMLAudioElement | null = null;
  private _builder: IncrementalDOMBuilder | null = null;

  static get observedAttributes(): string[] {
    return ["p", ...MUSIC_ATTRS];
  }

  connectedCallback(): void {
    const prompt = this.getAttribute("p") || "";
    if (!prompt) return;

    this.style.display = "block";
    if (!this.style.width) this.style.width = "100%";

    this._render(prompt);
  }

  disconnectedCallback(): void {
    this._cancel();
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (name === "p" && oldVal !== null && newVal && newVal !== oldVal) {
      this._cancel();
      this._render(newVal);
    }
  }

  private _cancel(): void {
    if (this._abort) {
      this._abort.abort();
      this._abort = null;
    }
    this._builder = null;
  }

  private async _render(prompt: string): Promise<void> {
    this._abort = new AbortController();
    const signal = this._abort.signal;

    this._showLoading(prompt);

    try {
      // Wait for any <ai-data> children to resolve
      const childData = await waitForChildData(this, signal);
      if (signal.aborted) return;

      // Inject data context into prompt if available
      const enrichedPrompt = buildPromptWithData(prompt, childData);

      // Search for music tracks
      const tracks = await searchMusic(enrichedPrompt, signal);
      if (signal.aborted) return;

      // Try to use LLM to generate custom player UI
      const hasLLM = !!window.__ai_components?.request;

      if (hasLLM) {
        await this._generateCustomUI(enrichedPrompt, tracks, signal);
      } else {
        this._showBuiltinPlayer(enrichedPrompt, tracks);
      }
    } catch (err) {
      if (signal.aborted) return;
      this._showError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Use LLM to generate a custom music player UI based on the prompt */
  private async _generateCustomUI(
    prompt: string,
    tracks: MusicTrack[],
    signal: AbortSignal,
  ): Promise<void> {
    const trackInfo = tracks.length
      ? tracks
          .map(
            (t, i) =>
              `Track ${i + 1}: "${t.title}" by ${t.artist} (${formatDuration(t.duration)})` +
              (t.coverUrl ? ` [cover: ${t.coverUrl}]` : ""),
          )
          .join("\n")
      : "No tracks found — use placeholder data";

    const audioUrls = tracks.map((t) => t.audioUrl).filter(Boolean);

    const llmPrompt =
      `Generate a beautiful music player UI based on this request: "${prompt}"\n\n` +
      `Available tracks:\n${trackInfo}\n\n` +
      `Requirements:\n` +
      `- Design the player UI to match the mood/theme described in the prompt\n` +
      `- Include: album art/cover area, song title, artist name, progress bar, play/pause button\n` +
      `- If tracks have cover images, use them as <img> src\n` +
      `- Add a small playlist section if multiple tracks are available\n` +
      `- Use inline <script> to implement play/pause functionality\n` +
      (audioUrls.length
        ? `- Create an Audio object with src="${audioUrls[0]}" and implement controls\n`
        : `- Show a static player UI since no audio is available\n`) +
      `- Make it responsive and visually polished\n` +
      `- Use Tailwind CSS classes`;

    // Switch to content mode
    this.innerHTML = "";
    const contentEl = document.createElement("div");
    contentEl.style.width = "100%";
    this.appendChild(contentEl);

    this._builder = new IncrementalDOMBuilder(contentEl);

    let prefixBuffer = "";
    let started = false;

    for await (const chunk of streamLLM(llmPrompt, signal, 3)) {
      if (signal.aborted) return;

      if (!started) {
        prefixBuffer += chunk;
        let cleaned = prefixBuffer.replace(/^```(?:html|HTML)?\s*\n?/, "");
        const idx = cleaned.search(/<[a-zA-Z!]/);
        if (idx >= 0) {
          started = true;
          cleaned = cleaned.slice(idx);
          this._builder!.write(cleaned);
        }
      } else {
        let data = chunk;
        if (data.includes("```")) {
          data = data.replace(/\n?```\s*$/, "");
        }
        if (data) {
          this._builder!.write(data);
        }
      }
    }

    if (this._builder) {
      this._builder.finish();
    }

    if (!started) {
      // LLM didn't produce content, fall back to built-in player
      this._showBuiltinPlayer(prompt, tracks);
    }
  }

  /** Built-in player UI (no LLM needed) */
  private _showBuiltinPlayer(prompt: string, tracks: MusicTrack[]): void {
    this.innerHTML = "";

    const theme = this.getAttribute("theme") || "light";
    const isDark = theme === "dark";
    const bg = isDark ? "#1e1b4b" : "#ffffff";
    const textColor = isDark ? "#e0e7ff" : "#1e293b";
    const subColor = isDark ? "#a5b4fc" : "#64748b";
    const accentColor = "#6366f1";

    const container = document.createElement("div");
    container.style.cssText =
      `background:${bg};border-radius:16px;padding:24px;max-width:400px;` +
      `border:1px solid ${isDark ? "#312e81" : "#e2e8f0"};` +
      "font-family:'Inter',system-ui,sans-serif;";

    // Cover art
    const coverWrapper = document.createElement("div");
    coverWrapper.style.cssText =
      "width:100%;aspect-ratio:1;border-radius:12px;overflow:hidden;margin-bottom:16px;" +
      "background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;" +
      "justify-content:center;position:relative;";

    if (tracks[0]?.coverUrl) {
      const coverImg = document.createElement("img");
      coverImg.src = tracks[0].coverUrl;
      coverImg.style.cssText = "width:100%;height:100%;object-fit:cover;";
      coverImg.alt = "Album Cover";
      coverWrapper.appendChild(coverImg);
    } else {
      const musicIcon = document.createElement("div");
      musicIcon.style.cssText = "font-size:64px;";
      musicIcon.textContent = "🎵";
      coverWrapper.appendChild(musicIcon);
    }

    // Track info
    const info = document.createElement("div");
    info.style.cssText = "margin-bottom:16px;";

    const title = document.createElement("div");
    title.style.cssText = `font-size:16px;font-weight:700;color:${textColor};margin-bottom:4px;`;
    title.textContent = tracks[0]?.title || prompt;

    const artist = document.createElement("div");
    artist.style.cssText = `font-size:13px;color:${subColor};`;
    artist.textContent = tracks[0]?.artist || "AI Music";

    info.appendChild(title);
    info.appendChild(artist);

    // Progress bar
    const progressWrapper = document.createElement("div");
    progressWrapper.style.cssText = "margin-bottom:16px;";

    const progressBar = document.createElement("div");
    progressBar.style.cssText =
      `width:100%;height:4px;background:${isDark ? "#312e81" : "#e2e8f0"};border-radius:2px;` +
      "cursor:pointer;position:relative;";

    const progressFill = document.createElement("div");
    progressFill.style.cssText =
      `width:0%;height:100%;background:${accentColor};border-radius:2px;transition:width 0.1s;`;
    progressFill.id = "ai-music-progress";

    progressBar.appendChild(progressFill);

    const timeRow = document.createElement("div");
    timeRow.style.cssText =
      `display:flex;justify-content:space-between;font-size:11px;color:${subColor};margin-top:4px;`;

    const timeNow = document.createElement("span");
    timeNow.id = "ai-music-time";
    timeNow.textContent = "0:00";

    const timeDuration = document.createElement("span");
    timeDuration.textContent = tracks[0] ? formatDuration(tracks[0].duration) : "0:00";

    timeRow.appendChild(timeNow);
    timeRow.appendChild(timeDuration);

    progressWrapper.appendChild(progressBar);
    progressWrapper.appendChild(timeRow);

    // Controls
    const controls = document.createElement("div");
    controls.style.cssText = "display:flex;align-items:center;justify-content:center;gap:20px;";

    const prevBtn = this._createControlBtn("⏮", 32, isDark);
    const playBtn = this._createControlBtn("▶", 48, isDark, true);
    const nextBtn = this._createControlBtn("⏭", 32, isDark);

    controls.appendChild(prevBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextBtn);

    container.appendChild(coverWrapper);
    container.appendChild(info);
    container.appendChild(progressWrapper);
    container.appendChild(controls);

    this.appendChild(container);

    // Setup audio if we have a track
    if (tracks[0]?.audioUrl) {
      this._setupAudio(tracks[0].audioUrl, playBtn, progressFill, timeNow, timeDuration, tracks[0].duration);
    }

    // Playlist (if multiple tracks)
    if (tracks.length > 1) {
      const playlist = document.createElement("div");
      playlist.style.cssText =
        `margin-top:12px;border-radius:12px;overflow:hidden;` +
        `border:1px solid ${isDark ? "#312e81" : "#e2e8f0"};`;

      const plTitle = document.createElement("div");
      plTitle.style.cssText =
        `padding:8px 12px;font-size:11px;font-weight:600;color:${subColor};` +
        `background:${isDark ? "#1e1b4b" : "#f8fafc"};text-transform:uppercase;letter-spacing:0.05em;`;
      plTitle.textContent = "播放列表";
      playlist.appendChild(plTitle);

      tracks.forEach((t, i) => {
        const item = document.createElement("div");
        item.style.cssText =
          `padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;` +
          `transition:background 0.15s;font-size:13px;color:${textColor};` +
          `background:${bg};border-top:1px solid ${isDark ? "#312e81" : "#f1f5f9"};`;

        const num = document.createElement("span");
        num.style.cssText = `font-size:11px;color:${subColor};min-width:20px;`;
        num.textContent = String(i + 1);

        const trackTitle = document.createElement("span");
        trackTitle.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        trackTitle.textContent = t.title;

        const dur = document.createElement("span");
        dur.style.cssText = `font-size:11px;color:${subColor};`;
        dur.textContent = formatDuration(t.duration);

        item.appendChild(num);
        item.appendChild(trackTitle);
        item.appendChild(dur);

        item.addEventListener("mouseover", () => {
          item.style.background = isDark ? "#312e81" : "#f1f5f9";
        });
        item.addEventListener("mouseout", () => {
          item.style.background = bg;
        });
        item.addEventListener("click", () => {
          if (t.audioUrl) {
            this._setupAudio(t.audioUrl, playBtn, progressFill, timeNow, timeDuration, t.duration);
            title.textContent = t.title;
            artist.textContent = t.artist;
            timeDuration.textContent = formatDuration(t.duration);
            if (t.coverUrl) {
              const img = coverWrapper.querySelector("img");
              if (img) img.src = t.coverUrl;
            }
          }
        });

        playlist.appendChild(item);
      });

      container.appendChild(playlist);
    }
  }

  private _createControlBtn(icon: string, size: number, isDark: boolean, primary = false): HTMLElement {
    const btn = document.createElement("button");
    btn.style.cssText =
      `width:${size}px;height:${size}px;border-radius:50%;border:none;cursor:pointer;` +
      `display:flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;` +
      `transition:all 0.2s;` +
      (primary
        ? `background:#6366f1;color:white;box-shadow:0 4px 12px rgba(99,102,241,0.3);`
        : `background:${isDark ? "#312e81" : "#f1f5f9"};color:${isDark ? "#c7d2fe" : "#475569"};`);
    btn.textContent = icon;
    btn.addEventListener("mouseover", () => {
      btn.style.transform = "scale(1.1)";
    });
    btn.addEventListener("mouseout", () => {
      btn.style.transform = "scale(1)";
    });
    return btn;
  }

  private _setupAudio(
    url: string,
    playBtn: HTMLElement,
    progressFill: HTMLElement,
    timeEl: HTMLElement,
    durationEl: HTMLElement,
    duration: number,
  ): void {
    // Clean up previous audio
    if (this._audio) {
      this._audio.pause();
      this._audio = null;
    }

    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    this._audio = audio;

    if (this.getAttribute("loop") !== null) {
      audio.loop = true;
    }

    let isPlaying = false;

    playBtn.onclick = () => {
      if (isPlaying) {
        audio.pause();
        playBtn.textContent = "▶";
        isPlaying = false;
      } else {
        audio.play().catch(() => { /* user gesture required */ });
        playBtn.textContent = "⏸";
        isPlaying = true;
      }
    };

    audio.addEventListener("timeupdate", () => {
      const current = audio.currentTime;
      const total = audio.duration || duration;
      const pct = total > 0 ? (current / total) * 100 : 0;
      progressFill.style.width = `${pct}%`;
      timeEl.textContent = formatDuration(Math.floor(current));
      durationEl.textContent = formatDuration(Math.floor(total));
    });

    audio.addEventListener("ended", () => {
      playBtn.textContent = "▶";
      isPlaying = false;
      progressFill.style.width = "0%";
      timeEl.textContent = "0:00";
    });

    // Autoplay if requested
    if (this.getAttribute("autoplay") !== null) {
      audio.play().catch(() => { /* user gesture required */ });
      playBtn.textContent = "⏸";
      isPlaying = true;
    }
  }

  private _showLoading(prompt: string): void {
    const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;

    this.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "max-width:400px;padding:24px;display:flex;align-items:center;justify-content:center;" +
      "flex-direction:column;gap:10px;background:linear-gradient(135deg,#faf5ff,#ede9fe);" +
      "border-radius:16px;border:1px solid #ddd6fe;";

    // Music wave animation
    const wave = document.createElement("div");
    wave.style.cssText = "display:flex;align-items:end;gap:3px;height:30px;";

    for (let i = 0; i < 5; i++) {
      const bar = document.createElement("div");
      bar.style.cssText =
        `width:4px;background:#8b5cf6;border-radius:2px;` +
        `animation:ai-music-wave 0.6s ${i * 0.1}s infinite alternate;`;
      wave.appendChild(bar);
    }

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:#7c3aed;max-width:80%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `🎵 搜索音乐: ${shortPrompt}`;

    wrapper.appendChild(wave);
    wrapper.appendChild(label);

    // Add keyframes if not present
    if (!document.getElementById("ai-music-style")) {
      const style = document.createElement("style");
      style.id = "ai-music-style";
      style.textContent =
        "@keyframes ai-music-wave{0%{height:5px}100%{height:25px}}";
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

/** Register the <ai-music> custom element */
export function defineAIMusic(): void {
  if (typeof customElements !== "undefined" && !customElements.get("ai-music")) {
    customElements.define("ai-music", AIMusic);
  }
}
