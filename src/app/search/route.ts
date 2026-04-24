import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /search?q=xxx&parentId=yyy
 * Handles hyperlink clicks within generated pages.
 * Generates a new page ID and redirects to /page/[id]?q=xxx&parentId=yyy
 * where the skeleton screen is shown immediately and generation starts.
 *
 * The parentId parameter enables tree-based context:
 * - If present, the new page's history is built from the parent's ancestry chain.
 * - If absent (e.g. from homepage), the new page starts with empty context.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const parentId = request.nextUrl.searchParams.get("parentId");
  const sc = request.nextUrl.searchParams.get("sc"); // selection context (JSON)

  if (!query) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const pageId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Build redirect URL with optional parentId and selection context
  const redirectUrl = new URL(`/page/${pageId}`, request.url);
  redirectUrl.searchParams.set("q", query);
  if (parentId) {
    redirectUrl.searchParams.set("parentId", parentId);
  }
  if (sc) {
    redirectUrl.searchParams.set("sc", sc);
  }

  return NextResponse.redirect(redirectUrl);
}
