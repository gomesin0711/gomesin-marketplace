import { NextRequest, NextResponse } from "next/server";

// In-memory cache to avoid re-fetching the same image repeatedly
const cache = new Map<string, { data: Buffer; contentType: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // Only allow specific domains to prevent SSRF
  try {
    const parsed = new URL(url);
    const allowed = [
      "sfile.chatglm.cn",
      "chatglm.cn",
      "img.chatglm.cn",
    ];
    const isAllowed = allowed.some((d) => parsed.hostname === d || parsed.hostname.endsWith("." + d));
    if (!isAllowed) {
      return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
    }
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only https allowed" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new NextResponse(cached.data, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Cache": "HIT",
      },
    });
  }

  // Fetch from origin
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "GomesinBot/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    // Store in cache (evict oldest if over limit)
    if (cache.size >= MAX_CACHE_SIZE) {
      const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      const toDelete = Math.ceil(MAX_CACHE_SIZE * 0.25);
      for (let i = 0; i < toDelete; i++) {
        cache.delete(entries[i][0]);
      }
    }
    cache.set(url, { data, contentType, ts: Date.now() });

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Fetch failed: " + (e?.message || "unknown") }, { status: 502 });
  }
}
