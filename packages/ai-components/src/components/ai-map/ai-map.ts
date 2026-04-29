// ============================================================
// <ai-map> — AI-powered map component
//
// Usage:
//   <ai-map p="北京天安门附近的地图" width="600" height="400"></ai-map>
//   <ai-map p="从上海到杭州的路线" zoom="10"></ai-map>
//   <ai-map p="东京塔" maptype="satellite"></ai-map>
//
// The `p` attribute is a natural language description.
// The component uses LLM to extract location info, then renders
// an interactive map using OpenStreetMap + Leaflet (free, no API key required).
// Falls back to static map image for simple cases.
//
// Supports <ai-data> children — waits for data to resolve before rendering.
// ============================================================

import { streamLLM } from "../../core/stream";
import { waitForChildData, buildPromptWithData } from "../../core/data-manager";

const MAP_ATTRS = [
  "width", "height", "class", "style", "zoom", "maptype",
] as const;

/** Extract location data from LLM response */
interface LocationData {
  lat: number;
  lng: number;
  name: string;
  zoom: number;
  markers?: Array<{ lat: number; lng: number; label: string }>;
}

/** Default map dimensions */
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;
const DEFAULT_ZOOM = 14;

export class AIMap extends HTMLElement {
  private _abort: AbortController | null = null;

  static get observedAttributes(): string[] {
    return ["p", ...MAP_ATTRS];
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

      // Use LLM to extract location info
      const location = await this._extractLocation(enrichedPrompt, signal);
      if (signal.aborted) return;

      this._showMap(location);
    } catch (err) {
      if (signal.aborted) return;
      // Fallback: try geocoding directly with Nominatim
      try {
        const location = await this._geocode(prompt, signal);
        if (signal.aborted) return;
        this._showMap(location);
      } catch {
        if (signal.aborted) return;
        this._showError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  /** Use LLM to parse the prompt into structured location data */
  private async _extractLocation(prompt: string, signal: AbortSignal): Promise<LocationData> {
    const systemPrompt =
      "You are a geocoding assistant. Given a location description, respond ONLY with a JSON object (no markdown fences, no extra text). " +
      'Format: {"lat":number,"lng":number,"name":"string","zoom":number,"markers":[{"lat":number,"lng":number,"label":"string"}]}. ' +
      "zoom should be 3-18 (3=world, 10=city, 14=neighborhood, 18=building). " +
      "For routes, include start and end as markers. For areas, use a reasonable center point. " +
      "Always use real-world coordinates. If unsure, give your best estimate.";

    let response = "";

    // Temporarily override system prompt for this request
    const requestFn = (window.__ai_components?.request);
    if (!requestFn) {
      // If no LLM is configured, fall back to geocoding
      return this._geocode(prompt, signal);
    }

    const iterable = requestFn(prompt, { signal, systemPrompt });
    for await (const chunk of iterable) {
      if (signal.aborted) throw new Error("Aborted");
      response += chunk;
    }

    // Clean response — strip markdown fences if present
    response = response.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();

    try {
      const data = JSON.parse(response) as LocationData;
      if (typeof data.lat !== "number" || typeof data.lng !== "number") {
        throw new Error("Invalid coordinates");
      }
      return {
        lat: data.lat,
        lng: data.lng,
        name: data.name || prompt,
        zoom: data.zoom || DEFAULT_ZOOM,
        markers: data.markers || [{ lat: data.lat, lng: data.lng, label: data.name || prompt }],
      };
    } catch {
      // LLM response not parseable, try geocoding
      return this._geocode(prompt, signal);
    }
  }

  /** Fallback geocoding using Nominatim (free OpenStreetMap geocoder) */
  private async _geocode(query: string, signal: AbortSignal): Promise<LocationData> {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        headers: { "User-Agent": "ai-components/0.1.0" },
        signal,
      },
    );

    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);

    const results = await res.json();
    if (!results.length) {
      throw new Error(`找不到位置: "${query}"`);
    }

    const r = results[0];
    return {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      name: r.display_name || query,
      zoom: parseInt(this.getAttribute("zoom") || "") || DEFAULT_ZOOM,
      markers: [{ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: query }],
    };
  }

  /** Render the map using an iframe with OpenStreetMap */
  private _showMap(location: LocationData): void {
    this.innerHTML = "";

    const w = parseInt(this.getAttribute("width") || "") || DEFAULT_WIDTH;
    const h = parseInt(this.getAttribute("height") || "") || DEFAULT_HEIGHT;
    const zoom = parseInt(this.getAttribute("zoom") || "") || location.zoom;

    const container = document.createElement("div");
    container.style.cssText =
      `width:${w}px;max-width:100%;height:${h}px;border-radius:12px;overflow:hidden;` +
      "border:1px solid #e2e8f0;position:relative;background:#f1f5f9;";

    // Title bar
    const titleBar = document.createElement("div");
    titleBar.style.cssText =
      "position:absolute;top:0;left:0;right:0;z-index:10;padding:8px 12px;" +
      "background:linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.8));" +
      "backdrop-filter:blur(4px);border-bottom:1px solid rgba(226,232,240,0.6);" +
      "display:flex;align-items:center;gap:6px;";

    const pin = document.createElement("span");
    pin.textContent = "📍";
    pin.style.fontSize = "14px";

    const title = document.createElement("span");
    title.style.cssText = "font-size:12px;color:#334155;font-weight:500;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";
    title.textContent = location.name.length > 60 ? location.name.slice(0, 60) + "…" : location.name;

    const coords = document.createElement("span");
    coords.style.cssText = "font-size:10px;color:#94a3b8;font-family:monospace;flex-shrink:0;";
    coords.textContent = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

    titleBar.appendChild(pin);
    titleBar.appendChild(title);
    titleBar.appendChild(coords);

    // Use OpenStreetMap embed
    const iframe = document.createElement("iframe");
    const markerParam = location.markers?.length
      ? location.markers.map(m => `mlat=${m.lat}&mlon=${m.lng}`).join("&")
      : `mlat=${location.lat}&mlon=${location.lng}`;

    iframe.src =
      `https://www.openstreetmap.org/export/embed.html?bbox=` +
      `${location.lng - 0.02},${location.lat - 0.015},${location.lng + 0.02},${location.lat + 0.015}` +
      `&layer=mapnik&marker=${location.lat},${location.lng}`;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "no-referrer");

    container.appendChild(iframe);
    container.appendChild(titleBar);
    this.appendChild(container);

    // Open in OSM link
    const link = document.createElement("a");
    link.href = `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=${zoom}/${location.lat}/${location.lng}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;" +
      "color:#6366f1;text-decoration:none;";
    link.textContent = "🔗 在 OpenStreetMap 中查看";
    this.appendChild(link);
  }

  private _showLoading(prompt: string): void {
    const shortPrompt = prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt;
    const w = parseInt(this.getAttribute("width") || "") || DEFAULT_WIDTH;
    const h = parseInt(this.getAttribute("height") || "") || DEFAULT_HEIGHT;

    this.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      `width:${w}px;max-width:100%;height:${h}px;display:flex;align-items:center;justify-content:center;` +
      "flex-direction:column;gap:10px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);" +
      "border-radius:12px;overflow:hidden;position:relative;border:1px solid #a7f3d0;";

    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:28px;height:28px;border:3px solid rgba(16,185,129,0.2);" +
      "border-top-color:#10b981;border-radius:50%;animation:ai-spin 0.8s linear infinite;";

    const icon = document.createElement("div");
    icon.style.cssText = "font-size:24px;";
    icon.textContent = "🗺️";

    const label = document.createElement("div");
    label.style.cssText =
      "font-size:11px;color:#059669;max-width:80%;text-align:center;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = `定位中: ${shortPrompt}`;

    wrapper.appendChild(icon);
    wrapper.appendChild(spinner);
    wrapper.appendChild(label);

    // Ensure spin animation
    if (!document.getElementById("ai-comp-spin-style")) {
      const style = document.createElement("style");
      style.id = "ai-comp-spin-style";
      style.textContent = "@keyframes ai-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }

    this.appendChild(wrapper);
  }

  private _showError(message: string): void {
    this.innerHTML = "";

    const msg = document.createElement("div");
    msg.style.cssText =
      "padding:16px;color:rgba(239,68,68,0.8);font-size:12px;text-align:center;" +
      "border:1px dashed rgba(239,68,68,0.3);border-radius:8px;background:#fef2f2;";
    msg.textContent = message;
    this.appendChild(msg);
  }
}

/** Register the <ai-map> custom element */
export function defineAIMap(): void {
  if (typeof customElements !== "undefined" && !customElements.get("ai-map")) {
    customElements.define("ai-map", AIMap);
  }
}
