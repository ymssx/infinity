import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /search?q=xxx
 * Handles hyperlink clicks within generated pages.
 * Generates a new page ID and redirects to /page/[id]?q=xxx
 * where the skeleton screen is shown immediately and generation starts.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const pageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Redirect to the page route with query param — skeleton shows immediately
  return NextResponse.redirect(
    new URL(`/page/${pageId}?q=${encodeURIComponent(query)}`, request.url)
  );
}
