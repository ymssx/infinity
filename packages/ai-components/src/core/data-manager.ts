// ============================================================
// ai-components — Data Manager
//
// Provides utilities for AI components to wait for child
// <ai-data> elements to resolve before starting their own
// lifecycle.
//
// Design:
// - <ai-data> emits 'ai-data-ready' CustomEvent when done
// - Parent AI components call waitForChildData() to collect
//   all child data and inject it into their prompt
// - <ai-data> can nest inside <ai-data> — inner resolves first,
//   outer then resolves with inner's data context
// ============================================================

/**
 * Scan an element's direct children for <ai-data> elements.
 * Returns only direct children (not deeply nested ones,
 * because nested ai-data elements are handled by their own parent ai-data).
 */
export function findDirectDataChildren(el: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName.toLowerCase() === "ai-data") {
      result.push(child as HTMLElement);
    }
  }
  return result;
}

/**
 * Wait for all direct <ai-data> children of an element to become ready.
 *
 * Returns a combined data context string that should be prepended to the
 * parent component's prompt.
 *
 * If there are no <ai-data> children, returns null immediately.
 *
 * @param el - The parent AI component element
 * @param signal - Optional AbortSignal to cancel waiting
 * @returns The combined data string, or null if no data children
 */
export async function waitForChildData(
  el: HTMLElement,
  signal?: AbortSignal,
): Promise<string | null> {
  const dataChildren = findDirectDataChildren(el);
  if (dataChildren.length === 0) return null;

  // Wait for each <ai-data> child to emit 'ai-data-ready'
  const results = await Promise.all(
    dataChildren.map((child) => waitForSingleData(child, signal)),
  );

  // Filter out nulls and combine
  const validResults = results.filter(
    (r): r is string => r !== null && r !== "",
  );
  if (validResults.length === 0) return null;

  return validResults.join("\n\n");
}

/**
 * Wait for a single <ai-data> element to become ready.
 * Returns its resolved data string.
 */
function waitForSingleData(
  dataEl: HTMLElement,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    // Check if already resolved (the element stores its data)
    const existingData = (dataEl as AIDataElement).__aiData;
    if (existingData !== undefined) {
      resolve(existingData);
      return;
    }

    // If signal is already aborted, bail out
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    // Listen for the ready event
    const onReady = (e: Event) => {
      cleanup();
      const data = (e as CustomEvent<string>).detail;
      resolve(data);
    };

    const onAbort = () => {
      cleanup();
      resolve(null);
    };

    const onError = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      dataEl.removeEventListener("ai-data-ready", onReady);
      dataEl.removeEventListener("ai-data-error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    dataEl.addEventListener("ai-data-ready", onReady, { once: true });
    dataEl.addEventListener("ai-data-error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Build the enhanced prompt by injecting data context.
 *
 * If dataContext is available, wraps it as a <DATA> block before the prompt.
 */
export function buildPromptWithData(
  prompt: string,
  dataContext: string | null,
): string {
  if (!dataContext) return prompt;

  return (
    `The following data is available for use:\n` +
    `<DATA>\n${dataContext}\n</DATA>\n\n` +
    `Using the above data, ${prompt}`
  );
}

/** Interface for checking if an ai-data element has already resolved */
interface AIDataElement extends HTMLElement {
  __aiData?: string | null;
}
