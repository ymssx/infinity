import { NextRequest } from "next/server";
import { getPage } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/page/[id]
 * Returns a previously generated page by ID (if cached).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existingPage = getPage(id);
  if (existingPage && existingPage.html) {
    return new Response(existingPage.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  const html404 = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>页面不存在</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#0a0a0f;color:#64748b;margin:0"><div style="text-align:center"><p style="font-size:2.5rem;margin-bottom:1rem;opacity:0.3">∞</p><p style="margin-bottom:1.5rem">页面不存在或已过期</p><a href="/" style="color:#818cf8;text-decoration:none">← 返回首页</a></div></body></html>`;
  return new Response(html404, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
