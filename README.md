<h1 align="center">∞<br>Infinity</h1>

<p align="center">
  <strong>Infinite Web Exploration Engine</strong><br>
  AI conversation, reimagined as web surfing.
</p>

<p align="center">
  <a href="https://ymssx.github.io/infinity/">✦ Try it now → ymssx.github.io/infinity</a>
</p>

---

## What if AI didn't reply in text — but in web pages?

Infinity turns every AI answer into a **fully designed, interactive webpage** — with real hyperlinks, rich visuals, and bold typography. It feels less like chatting with a bot and more like surfing a living internet that writes itself for you, in real-time.

**Ask anything.** Get a stunning page.  
**Click any link.** A new page is born, going deeper.  
**Highlight text.** Ask follow-ups about exactly what caught your eye.  
**Leave annotations.** Revise the page with inline comments.  
**Repeat forever.** Every page is a node in an infinite exploration tree.

There is no dead end. Just rabbit holes all the way down.

## Declarative AI Web Components

The real magic of Infinity is its **AI Web Component system** — a set of custom HTML elements that generate content on the fly. The LLM doesn't need to know how to fetch images, render maps, or build interactive widgets. It just drops a tag, and the browser does the rest.

```html
<inf-image query="Shenzhen skyline at sunset" aspect="16/9"></inf-image>
<inf-map lat="22.5965" lng="113.9713" zoom="15" marker="Binhai Building"></inf-map>
<inf-component query="Shenzhen travel guide homepage intro"></inf-component>
```

That's it. Three tags. Three parallel AI pipelines. One cohesive page.

### The components

| Component | What it does | How it works |
|-----------|-------------|--------------|
| `<inf-image query="...">` | Real photos from stock APIs | Searches Pixabay → Pexels → Unsplash, caches results, page-level dedup, hover refresh button |
| `<inf-map lat="..." lng="...">` | Interactive maps | Leaflet + OpenStreetMap, multi-marker support, auto-fit bounds, no API key needed |
| `<inf-component query="...">` | AI-generated sub-content | Triggers a **separate parallel LLM call**, streams HTML fragments back in real-time |

### Why this matters

Traditional AI chat generates everything in one linear stream. Infinity's component system enables **parallel, composable AI generation**:

```html
<!-- The LLM writes this page structure -->
<h1>Exploring Shenzhen</h1>
<inf-image query="Shenzhen Bougainvillea flowers" aspect="16/9"></inf-image>
<p>Shenzhen is a vibrant metropolis...</p>
<inf-component query="Top 5 must-visit places in Shenzhen with ratings"></inf-component>
<inf-map lat="22.5431" lng="114.0579" zoom="12"
  markers='[{"lat":22.5431,"lng":114.0579,"label":"Window of the World"},
            {"lat":22.5965,"lng":113.9713,"label":"Binhai Building"}]'>
</inf-map>
<inf-component query="Shenzhen food guide: local specialties"></inf-component>
```

The main page streams in. Images fetch from stock APIs. Maps render with Leaflet. Sub-components each spin up their own LLM call. **Everything loads in parallel.** The result feels like a real website, not a chatbot response.

## The experience

1. **You ask a question** — anything at all
2. **A webpage streams in** — rendered live, character by character
3. **Components activate** — images load, maps render, sub-sections generate in parallel
4. **You explore** — click links to go deeper, highlight text to ask about details
5. **The AI remembers** — each new page builds on everything you've seen before
6. **You refine** — enter revision mode, annotate directly on the page, regenerate with your feedback
7. **The tree grows** — your exploration history forms a branching tree you can revisit

## Why pages, not messages?

A chat message is flat. A webpage is alive.

When AI responds with a webpage, it can use **layout** to organize ideas, **color** to set the mood, **typography** to create hierarchy, and **hyperlinks** to connect concepts. Information becomes spatial, navigable, explorable — not just scrollable.

And when every link generates a new page that knows your full journey — what you've read, what you've clicked, what you've highlighted — the result is something that feels like the web was always meant to be: **a conversation that you can walk through**.

## Design principles

- **Pages over messages.** Richer medium, richer answers.
- **Links over buttons.** Navigation should feel like the web, not an app.
- **Components over monoliths.** Parallel AI generation through declarative HTML tags.
- **Context over repetition.** The AI knows your journey and never starts from scratch.
- **Your keys, your browser.** Pure frontend. Nothing touches a server. Your API keys stay on your device.

## Getting started

Visit **[ymssx.github.io/infinity](https://ymssx.github.io/infinity/)**, click ⚙️ Settings, add your API key, and start exploring.

Supports OpenAI, DeepSeek, Claude (via OpenRouter), Gemini, Qwen, Doubao, Zhipu GLM, or any OpenAI-compatible endpoint.

Optionally configure image search keys (Pixabay, Pexels, Unsplash) in the Image tab for real photos in generated pages.

---

<p align="center"><em>The web is infinite. Now your conversations are too.</em></p>
