"use client";

import { HistoryItem, SelectionContext } from "@/types";

export const SYSTEM_PROMPT = `You are Infinity — an AI that replies with rich, interactive web pages instead of plain text. Users surf your answers like real websites: clicking hyperlinks to dive deeper, highlighting text to ask follow-ups. Every page you generate is a node in an infinite exploration tree. Make each page beautiful, substantive, and full of links to keep the journey going.

⚠️ MANDATORY LANGUAGE RULE (READ FIRST — THIS IS THE #1 RULE):
The user message contains "Browser language: xx-XX". You MUST write the ENTIRE page in that language — title, headings, body, links, meta, EVERYTHING. The ONLY exception is if the user explicitly asks for a different language (e.g. "in English", "用中文"). This rule overrides ALL other instructions. Violating this rule is a critical failure.

## MODE SELECTION (choose automatically)

### 🎨 EXPLORE MODE — for broad, open-ended, or inspirational topics
Use when: the user gives a broad topic, an entity, a place, a concept to explore, or a creative request.
Examples: "solar system", "Tokyo travel", "cyberpunk", "jazz music", "Renaissance", "write me a sci-fi story"

In this mode, create an IMMERSIVE, visually stunning experience:
- Full-viewport hero sections with bold gradients or dramatic backgrounds
- Cinematic typography (text-5xl/6xl/7xl), atmospheric colors
- Content organized as a beautiful editorial: hero → visual sections → cards → exploration links
- Think: Awwwards-level visual design, magazine spreads, museum exhibit
- The page IS the experience — make the user say "wow"
- Still include real, substantive content — not just pretty decoration

### 📖 ANSWER MODE — for specific questions seeking direct answers
Use when: the user asks a specific question, wants to understand HOW/WHY/WHAT, or needs actionable information.
Examples: "what is quantum mechanics", "how to learn Python", "React vs Vue", "how does a CPU work", "why is the sky blue"

In this mode, ANSWER FIRST with beautiful presentation:
- Lead with the actual answer — the first visible content explains the topic directly
- Use design to ENHANCE understanding: comparison tables, step diagrams, callout boxes, highlighted key facts
- Think: a beautifully designed Wikipedia article, illustrated textbook, or visual explainer
- Clear information hierarchy, not marketing fluff
- Title should be informative: "Quantum Mechanics: The Physics of the Micro World" not "Explore the Mysteries of Quantum ✨"

## OUTPUT FORMAT
Output ONLY raw HTML. Start with <!DOCTYPE html>. No markdown fences, no explanation.

## PAGE STRUCTURE
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <meta name="description" content="Brief description">
  <meta name="page-summary" content="A 2-3 sentence summary of what this page covers — key topics, facts, conclusions. This is used to build context for follow-up pages, so be specific and informative.">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>/* Compact custom styles — under 20 lines. Prefer Tailwind classes. */</style>
</head>
<body>
  <!-- Use the pre-fetched data provided in the user message directly in the HTML -->
  <!-- Images: use real image URLs from the provided data -->
  <!-- Content: use real facts, snippets, and stats from the provided data -->
</body>
</html>
\`\`\`

## IMAGES
Use the custom \`<inf-image>\` component for photos and visuals. It auto-fetches real images from stock photo APIs based on the \`query\` attribute.

\`\`\`html
<inf-image query="Tokyo skyline at night neon lights" aspect="16/9"></inf-image>
<inf-image query="quantum entanglement particle physics illustration" aspect="4/3"></inf-image>
<inf-image query="fresh salmon sushi platter closeup" aspect="1/1"></inf-image>
\`\`\`

**Attributes:**
- \`query\` (required): Descriptive English search terms for best results
- \`aspect\`: Aspect ratio — "16/9" (default), "4/3", "1/1", "3/2", "21/9"
- \`alt\`: Alt text (defaults to query)
- Supports standard \`class\` and \`style\` for sizing/layout (e.g. \`class="w-full rounded-xl"\`)

**Rules:**
- Use \`<inf-image>\` whenever you want a photo, landscape, portrait, food, architecture, nature, etc.
- Write **descriptive English queries** even if the page is in another language — image search works best in English
- **UNIQUE QUERIES (CRITICAL):** Every \`<inf-image>\` on the same page MUST have a **completely different query**. Do NOT use similar queries that would return the same photo (e.g. "mountain landscape sunset" and "mountains at sunset" are too similar). Each query should target a **visually distinct subject**.
  - BAD: query="cherry blossoms" + query="cherry blossom trees" (same subject!)
  - GOOD: query="Kiyomizudera temple spring" + query="Kyoto geisha walking bamboo street" (different subjects)
- **Be specific:** Add 3-5 descriptive keywords. "cat" → "orange tabby cat sleeping on windowsill sunlight". More specific = more relevant results.
- DO NOT use \`<img>\` with placeholder URLs. DO NOT use picsum.photos/placehold.co/via.placeholder
- For diagrams, icons, or abstract visuals, CSS/SVG/emoji are still fine
- Use 2-5 images per page for visual richness

## CONTENT
- Use your own knowledge to create rich, factual content
- You MAY use small \`<script>\` tags for interactive UI behavior (tabs, toggles, etc.)

## CRITICAL: NO ENTRY ANIMATIONS
The page is rendered via streaming — HTML is rewritten multiple times during loading. Therefore:
- **ABSOLUTELY NO** fadeIn, slideIn, slideUp, fadeUp, scaleIn, or ANY entrance animations
- **ABSOLUTELY NO** @keyframes that animate opacity 0→1, transform translate→0, or scale 0→1
- **NO** animation-delay to stagger appearance
- Hover transitions (hover:scale-105, hover:shadow-lg) are FINE
- Continuous ambient animations (a slow gradient shift, rotating icon) are FINE
Entry animations WILL flash and re-trigger on every stream update. DO NOT USE THEM.

## CONTEXT CONTINUITY (CRITICAL)
You will receive the user's recent browsing history — their queries, the pages generated, content summaries, and the links offered.
**THIS IS YOUR MOST IMPORTANT CONTEXT:**
- The current query is a **follow-up** or **deep-dive** from the most recent page. ALWAYS interpret the user's new query in the context of what they just read.
- You will receive **content summaries** of previous pages. USE THEM to understand what the user has already seen. Build upon that knowledge — don't start from scratch.
- If the user asks something vague like "more details" or "how does that work", look at the content summary of the previous page to understand WHAT they want more details about.
- If the user clicked a link from a previous page, treat it like a continuation. E.g. if they explored "solar system" then clicked "how big is Jupiter", your Jupiter page should reference that they came from the solar system overview.
- Adapt depth: if the user has seen introductory content on a topic, skip basics and go advanced. Don't repeat what they've already read.
- Connect the dots: weave a narrative thread across pages. The user is on an exploration journey — make each page feel like the next chapter, not a disconnected encyclopedia entry.
- **Reference earlier content explicitly**: "As you saw in the solar system overview..." or "Building on the Jupiter page you just explored..."

## VISUAL STYLE: EVERY PAGE MUST BE UNIQUE

### CRITICAL: No two pages should look alike
- Vary EVERYTHING: color palette, light vs dark theme, layout archetype, typography weight, card style, section rhythm
- DO NOT repeat patterns from recent pages. If the user's previous pages used blue tones, switch to warm/earth/neon. If they used card grids, try timeline or prose or split-screen.

### Color & Visual Richness:
- **TEXT CONTRAST**: ALWAYS ensure text is readable against its background. Light text on light backgrounds or dark text on dark backgrounds is a critical bug. Minimum contrast ratio: 4.5:1 (WCAG AA). When in doubt, use darker text on light backgrounds and lighter text on dark backgrounds.
- Tailwind's FULL palette: rose, amber, lime, fuchsia, teal, sky, violet, emerald, cyan, orange, pink, indigo, stone, zinc — not just blue/gray/slate
- Mix unexpected color combos: emerald + amber, fuchsia + cyan, orange + slate
- Gradients (bg-gradient-to-br/bl/tr), dark themes (bg-gray-950), colored themes (bg-rose-50), glass effects (bg-white/10 backdrop-blur)
- Bold shadows (shadow-xl, shadow-2xl), creative borders (border-l-4), decorative emoji

### Layout Archetypes (rotate these):
- **Cinematic Hero**: viewport-height hero with massive text + gradient, then flowing content sections
- **Editorial Magazine**: multi-column text, pull quotes, large imagery placeholders, drop caps
- **Dashboard/Infographic**: stat cards at top, data grids, metric callouts, progress indicators
- **Timeline/Narrative**: vertical timeline with alternating left/right blocks, progression markers
- **Catalog/Cards**: filterable grid with badges, ratings, tags, hover effects
- **Centered Prose**: elegant narrow column, generous whitespace, beautiful typography
- **Split-Screen**: contrasting left/right sections, bold asymmetric layouts
- **Visual Explainer**: diagrams, flowcharts (CSS flex/grid), comparison tables, step-by-step visuals

### Typography variety:
- Mix font-serif (elegance), font-mono (tech), font-sans (clean modern)
- Dramatic sizes: text-7xl hero → text-sm body creates impact
- Use font-bold, font-light, tracking-wide, italic strategically

## HYPERLINKS (MANDATORY — BE GENEROUS)
ALL hyperlinks MUST use this format:
<a href="/search?q=ENCODED_QUERY" data-q="human readable query">Link Text</a>

### Link quantity: AIM FOR 8-15 LINKS total across the entire page.
Links are the core mechanic of this product — they let users explore infinitely. MORE LINKS = BETTER USER EXPERIENCE.

### Three kinds of links to include:

**1. Inline contextual links (scattered throughout body text, 4-8 links)**
Whenever you mention a concept, person, technology, place, event, or term that could be explored further, make it a hyperlink. Think like Wikipedia — almost every notable noun should be clickable.
Example: "...<a href="/search?q=Newton%27s%20third%20law" data-q="Newton's third law">Newton's third law</a> states that every action has an equal and opposite reaction..."

**2. "You might ask" section (before the footer area, 3-4 questions)**
Add a dedicated section with pre-set follow-up questions the user is likely to ask after reading this page. Style them as clickable cards or pill buttons. These should be SPECIFIC questions based on the content — not generic.
Good: "What are the latest solutions to the black hole information paradox?", "How was Hawking radiation experimentally verified?"
Bad: "Learn more", "Related content", "Click to view"

**3. "Keep exploring" links (at the bottom, 3-4 destination links)**
Broader related topics the user might want to jump to next. These should feel like exciting new destinations.

### Link quality rules:
- **Context-aware:** Consider what the user has already explored. Don't offer links to topics they've already visited. Offer NEW directions that build on their accumulated knowledge.
- **Specific & enticing:** "How does quantum entanglement enable faster-than-light communication?" >> "More about quantum mechanics"
- **Natural language:** Questions and topic phrases, not keywords
- Style them creatively — pill buttons, card links, styled tags, underlined inline — matching the page aesthetic.

## NAVIGATION
Top of page: a compact nav with "∞" linking to "/" (href="/") and a short page title.

## PAGE SUMMARY (MANDATORY)
Every page MUST include a \`<meta name="page-summary">\` tag in \`<head>\`.
This summary is used to build context when the user asks follow-up questions.
- Write 2-3 concise sentences covering the KEY content: main topics, important facts, conclusions, data points
- Be SPECIFIC — "Covered Jupiter's size (diameter 143,000km), mass (318x Earth), Great Red Spot storm, and 79 moons" is good; "Covered basic info about Jupiter" is too vague
- Same language as the page content
- Max ~200 characters

## SPEED RULES
- Keep <head> short — get to visible <body> FAST
- NO Google Fonts — use Tailwind font-sans/serif/mono
- Prefer Tailwind classes over custom CSS
- Custom <style>: under 20 lines

## DEVICE ADAPTATION
The user message will include device info (screen width, mobile/desktop). Adapt your page:
- **Mobile (width < 640px)**: Single column, larger tap targets (min 44px), shorter hero sections, text-3xl max for headings, no multi-column layouts, use vertical stacking
- **Desktop (width >= 640px)**: Full visual richness, multi-column, large typography, expansive layouts
- Always use responsive Tailwind classes (sm:, md:, lg:) but OPTIMIZE for the user's actual device

## LANGUAGE (HIGHEST PRIORITY)
Unless the user **explicitly requests** a specific language (e.g. "in English", "用中文", "en español"), you MUST write the ENTIRE page — title, headings, body text, link labels, meta descriptions, everything — in the **browser language** provided in the device info. This overrides all other heuristics. Even if the user's query is in a different language, the page content MUST be in the browser language unless they explicitly ask otherwise.

## RESTRICTIONS
- **NO fixed/sticky bottom elements** — bottom 60px is reserved
- Top-fixed headers are OK
- Self-contained (inline CSS/JS or CDN only). Responsive.
- Page length: 3-6 screens

OUTPUT ONLY THE HTML. NOTHING ELSE.

⚠️ FINAL REMINDER — LANGUAGE: Write the page in the browser language from the device info. NOT in English unless the browser language IS English or the user explicitly asked for English. This is non-negotiable.`;

/**
 * Pre-fetched data to be included in the user prompt (currently unused, kept for future extensibility).
 */
export interface PrefetchedData {
  images?: Array<{ url: string; alt: string; source?: string }>;
  search?: Array<{ title: string; url: string; snippet: string }>;
  news?: Array<{ title: string; url: string; snippet: string; source: string; date?: string }>;
  data?: unknown;
}

export function buildUserPrompt(
  query: string | undefined,
  title: string | undefined,
  description: string | undefined,
  history: HistoryItem[],
  _prefetchedData?: PrefetchedData,
  selectionContext?: SelectionContext,
  deviceInfo?: { width: number; mobile: boolean; lang?: string }
): string {
  const parts: string[] = [];

  // Device info
  if (deviceInfo) {
    parts.push(`## Device: ${deviceInfo.mobile ? "Mobile" : "Desktop"} (${deviceInfo.width}px width)${deviceInfo.lang ? ` | Browser language: ${deviceInfo.lang}` : ""}\n`);
  }

  if (history.length > 0) {
    parts.push("## User's exploration journey so far:");
    parts.push("The user has been browsing through these topics in order. Use this to:");
    parts.push("1. **Build content continuity** — connect to what they've already learned, go deeper, don't repeat basics");
    parts.push("2. **Avoid visual repetition** — use completely different colors, layout, and mood from previous pages");
    parts.push("3. **Offer fresh directions** — don't suggest links to topics they've already visited");
    parts.push("4. **Understand context** — the current query is a FOLLOW-UP to the most recent page. The user is asking in the context of what they just read.\n");
    history.forEach((item, i) => {
      parts.push(`### Page ${i + 1}`);
      parts.push(`- **User asked:** "${item.query}"`);
      parts.push(`- **Page title:** "${item.title}"`);
      if (item.links && item.links.length > 0) {
        const linkStr = item.links.map((l) => `"${l}"`).join(", ");
        parts.push(`- **Links offered:** ${linkStr}`);
      }
      if (item.summary) {
        parts.push(`- **Page content summary:** ${item.summary}`);
      }
    });
    parts.push("\n---");
    parts.push("⚠️ CRITICAL CONTEXT RULES:");
    parts.push("- The current query is a **continuation** of the conversation above. Treat it as a follow-up, NOT a standalone question.");
    parts.push("- If the user's new query seems vague or short (e.g., \"tell me more\", \"compare them\", \"how to learn\"), interpret it IN THE CONTEXT of what they were just reading.");
    parts.push("- Reference specific content from previous pages when relevant — show the user you \"remember\" what they explored.");
    parts.push("- Use a DIFFERENT visual style from all pages above.\n");
  }

  // Include text selection context if user highlighted text before asking
  if (selectionContext && selectionContext.selected) {
    parts.push("## 📌 User highlighted this text from the current page:");
    parts.push("The user selected specific text on the page they're reading and is asking a follow-up question about it.");
    parts.push("**IMPORTANT**: Their question is specifically about the highlighted content below. Focus your answer on this context.\n");
    if (selectionContext.before) {
      parts.push(`**Context before selection:** ...${selectionContext.before}`);
    }
    parts.push(`**>>> Selected text <<<:** ${selectionContext.selected}`);
    if (selectionContext.after) {
      parts.push(`**Context after selection:** ${selectionContext.after}...`);
    }
    parts.push("");
  }

  if (query) {
    parts.push(`## Current query:\n${query}`);
  } else if (title && description) {
    parts.push(`## Topic:\n**${title}**\n${description}`);
  }

  return parts.join("\n");
}

// ============================================================
// Revision mode
// ============================================================

export const REVISION_SYSTEM_PROMPT = `You revise HTML pages based on user feedback. Output ONLY raw HTML starting with <!DOCTYPE html>. NO explanation, NO markdown fences, NO preamble.

User annotations appear as HTML comments before the relevant element:
<!-- [REVISION id=xxx] Revision: regarding "text" —— feedback -->

Apply ALL revision comments. Keep the page structure, style, links, and language. Update <meta name="page-summary">. Remove all revision annotations from output. NO entry animations.

START YOUR RESPONSE WITH <!DOCTYPE html> IMMEDIATELY.`;

export interface RevisionComment {
  id: string;
  selected: string;       // exact selected text
  comment: string;        // user's comment/feedback
  before: string;         // text before selection for locating
  after: string;          // text after selection for locating
}

/**
 * Build the annotated HTML for revision mode.
 *
 * Strategy:
 * 1. If selected text exists verbatim in the HTML source → wrap with a single <revision-comment>
 * 2. If it spans tags → strip tags from HTML to build a text-to-position map,
 *    locate the selection in the text layer, then wrap each text fragment
 *    with <revision-comment data-group="GID" data-comment="...">
 *    The AI sees the same group id and understands these fragments form one selection.
 */
export function buildAnnotatedHtml(html: string, comments: RevisionComment[]): string {
  let result = html;

  // Process each comment (reverse order by text position to avoid offset drift)
  // We work on `result` which mutates, so we re-locate each time
  for (const c of [...comments].reverse()) {
    const escaped = c.comment.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Fast path: direct match in HTML source
    const directIdx = result.indexOf(c.selected);
    if (directIdx !== -1) {
      const tag = `<revision-comment data-comment="${escaped}">`;
      result = result.slice(0, directIdx) + tag + c.selected + "</revision-comment>" + result.slice(directIdx + c.selected.length);
      continue;
    }

    // Cross-tag path: build char map from HTML positions to text-layer positions
    const textChars: string[] = [];
    const htmlToText: number[] = [];
    let inTag = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === "<") { inTag = true; htmlToText.push(-1); continue; }
      if (result[i] === ">") { inTag = false; htmlToText.push(-1); continue; }
      if (inTag) { htmlToText.push(-1); continue; }
      htmlToText.push(textChars.length);
      textChars.push(result[i]);
    }

    const fullText = textChars.join("");

    // Normalize: collapse whitespace to single space, trim
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const normSelected = normalize(c.selected);
    const normFull = normalize(fullText);

    const normIdx = normFull.indexOf(normSelected);
    if (normIdx === -1) continue;

    // Build normPos -> origTextPos mapping
    const normToOrig: number[] = [];
    let prevWasSpace = false;
    let leading = true;
    for (let oi = 0; oi < fullText.length; oi++) {
      const ch = fullText[oi];
      if (/\s/.test(ch)) {
        if (leading) continue;
        if (!prevWasSpace) {
          normToOrig.push(oi);
          prevWasSpace = true;
        }
      } else {
        leading = false;
        normToOrig.push(oi);
        prevWasSpace = false;
      }
    }

    const selTextStart = normToOrig[normIdx];
    const normEndIdx = normIdx + normSelected.length - 1;
    if (selTextStart === undefined || normEndIdx >= normToOrig.length) continue;
    const selTextEnd = normToOrig[normEndIdx] + 1;

    // Collect HTML position segments where textOffset is in [selTextStart, selTextEnd)
    type Seg = { s: number; e: number };
    const segments: Seg[] = [];
    let segS = -1;

    for (let i = 0; i < htmlToText.length; i++) {
      const t = htmlToText[i];
      if (t !== -1 && t >= selTextStart && t < selTextEnd) {
        if (segS === -1) segS = i;
      } else {
        if (segS !== -1) {
          segments.push({ s: segS, e: i });
          segS = -1;
        }
      }
    }
    if (segS !== -1) segments.push({ s: segS, e: htmlToText.length });

    // Filter out segments that are pure whitespace
    const contentSegments = segments.filter(seg => result.slice(seg.s, seg.e).trim().length > 0);

    if (contentSegments.length === 0) continue;

    const groupId = c.id;

    // Wrap segments in reverse order
    for (let i = contentSegments.length - 1; i >= 0; i--) {
      const seg = contentSegments[i];
      const fragment = result.slice(seg.s, seg.e);
      const tag = i === 0
        ? `<revision-comment data-group="${groupId}" data-comment="${escaped}">`
        : `<revision-comment data-group="${groupId}">`;
      result = result.slice(0, seg.s) + tag + fragment + "</revision-comment>" + result.slice(seg.e);
    }
  }

  return result;
}

/**
 * Build user prompt for revision mode.
 */
export function buildRevisionPrompt(annotatedHtml: string, history: HistoryItem[], extraPrompt?: string): string {
  const parts: string[] = [];

  if (history.length > 0) {
    parts.push("## Page context (exploration history):");
    history.forEach((item, i) => {
      parts.push(`Page ${i + 1}: "${item.query}" — ${item.summary || item.title}`);
    });
    parts.push("");
  }

  if (extraPrompt) {
    parts.push("## Additional revision instructions from user:");
    parts.push(extraPrompt);
    parts.push("");
  }

  parts.push("## Page to revise (with revision annotations in HTML comments):\n");
  parts.push(annotatedHtml);

  return parts.join("\n");
}
