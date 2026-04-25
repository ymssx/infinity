"use client";

/**
 * Shared streaming utilities used by both the main page's IncrementalIframeWriter
 * and the <inf-component> Web Component.
 *
 * These are plain JS strings meant to be inlined into iframe-injected scripts.
 */

/**
 * Returns a JS function string for finding safe write boundaries.
 * Ensures we don't write in the middle of an unclosed <script> tag.
 */
export const SAFE_BOUNDARY_FN = `
function __safeBoundary(buf, committed) {
  var candidate = buf.lastIndexOf('>');
  if (candidate === -1) return -1;
  var end = candidate + 1;
  var region = buf.slice(0, end);
  var opens = 0, closes = 0;
  var re1 = /<script[\\s>]/gi, re2 = /<\\/script>/gi;
  while (re1.exec(region)) opens++;
  while (re2.exec(region)) closes++;
  if (opens > closes) {
    var lo = region.lastIndexOf('<script');
    var lo2 = region.lastIndexOf('<SCRIPT');
    var lastOpen = Math.max(lo, lo2);
    if (lastOpen <= committed) return -1;
    var safe = region.lastIndexOf('>', lastOpen - 1);
    if (safe === -1 || safe + 1 <= committed) return -1;
    return safe + 1;
  }
  return end;
}
`;

/**
 * Returns a JS function string for sanitizing script blocks.
 * Replaces const/let with var to prevent redeclaration errors during streaming.
 */
export const SANITIZE_SCRIPTS_FN = `
function __sanitizeScripts(html) {
  return html.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, function(block) {
    return block.replace(/\\bconst\\s+/g, 'var ').replace(/\\blet\\s+/g, 'var ');
  });
}
`;

/**
 * Returns a JS function string for masking WC tags during streaming.
 * Prevents premature connectedCallback on incomplete content.
 */
export const MASK_WC_FN = `
function __maskWC(html) {
  return html
    .replace(/<inf-image/gi, '<inf-image-pending')
    .replace(/<\\/inf-image>/gi, '</inf-image-pending>')
    .replace(/<inf-map/gi, '<inf-map-pending')
    .replace(/<\\/inf-map>/gi, '</inf-map-pending>')
    .replace(/<inf-component/gi, '<inf-component-pending')
    .replace(/<\\/inf-component>/gi, '</inf-component-pending>');
}
`;

/**
 * TypeScript versions of the same functions for use in IncrementalIframeWriter.
 */

export function safeBoundary(buf: string, committed: number): number {
  const candidate = buf.lastIndexOf(">");
  if (candidate === -1) return -1;
  const end = candidate + 1;
  const region = buf.slice(0, end);
  const opens = (region.match(/<script[\s>]/gi) || []).length;
  const closes = (region.match(/<\/script>/gi) || []).length;
  if (opens > closes) {
    const lo = region.lastIndexOf("<script");
    const lo2 = region.lastIndexOf("<SCRIPT");
    const lastOpen = Math.max(lo, lo2);
    if (lastOpen <= committed) return -1;
    const safe = region.lastIndexOf(">", lastOpen - 1);
    if (safe === -1 || safe + 1 <= committed) return -1;
    return safe + 1;
  }
  return end;
}

export function sanitizeScripts(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    return block.replace(/\bconst\s+/g, "var ").replace(/\blet\s+/g, "var ");
  });
}
