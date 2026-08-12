import { NextRequest, NextResponse } from "next/server";

// In-memory cache to avoid re-fetching the same image repeatedly
const cache = new Map<string, { data: Buffer; contentType: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;

// Allowed external image hosts (SSRF protection).
// - sfile.chatglm.cn: default listing placeholder images
// - tmpfiles.org: legacy payment-proof uploads (60-day expiry, /dl/ URLs now redirect to viewer HTML)
// - files.catbox.moe: current payment-proof uploads (permanent storage)
const ALLOWED_DOMAINS = [
  "sfile.chatglm.cn",
  "chatglm.cn",
  "img.chatglm.cn",
  "tmpfiles.org",
  "files.catbox.moe",
];

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith("." + d)
  );
}

/**
 * tmpfiles.org changed their /dl/ URL behaviour: the OLD /dl/ URLs now 302-
 * redirect to the viewer HTML page (not the image). The viewer page contains
 * a link to the NEW direct /dl/ URL (with a fresh timestamp+hash prefix).
 *
 * Given an old tmpfiles.org /dl/ URL, fetch the corresponding viewer page,
 * extract the new direct /dl/ URL, and return it. Returns null on failure.
 *
 * Old /dl/:  https://tmpfiles.org/dl/1786281476.a94082bac2a7e86a/wMwGOHJywMMF/proof.jpg
 * Viewer:    https://tmpfiles.org/wMwGOHJywMMF/proof.jpg
 * New /dl/:  https://tmpfiles.org/dl/<new-timestamp>.<new-hash>/wMwGOHJywMMF/proof.jpg
 */
async function resolveTmpfilesDirectUrl(dlUrl: string): Promise<string | null> {
  try {
    // Convert /dl/<ts>.<hash>/<path> → /<path> (viewer URL)
    const viewerUrl = dlUrl.replace(
      /tmpfiles\.org\/dl\/[^/]+\//i,
      "tmpfiles.org/"
    );
    const viewerRes = await fetch(viewerUrl, {
      redirect: "follow",
      headers: { "User-Agent": "mesinKUBot/1.0", Accept: "text/html,*/*" },
    });
    if (!viewerRes.ok) return null;
    const html = await viewerRes.text();
    // Extract the new direct /dl/ URL from the viewer HTML
    const match = html.match(
      /https:\/\/tmpfiles\.org\/dl\/[^"'<> ]+\.(?:png|jpg|jpeg|gif|webp)/i
    );
    return match?.[0] || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // Only allow specific domains to prevent SSRF
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!isAllowedHost(parsed.hostname)) {
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
    let fetchUrl = url;
    let res = await fetch(fetchUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "mesinKUBot/1.0",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    // tmpfiles.org /dl/ URLs may 302-redirect to the viewer HTML page.
    // Detect HTML response and re-resolve via the viewer page.
    const contentType = res.headers.get("content-type") || "";
    if (
      parsed.hostname.includes("tmpfiles.org") &&
      (contentType.includes("text/html") || contentType.includes("application/html"))
    ) {
      // Try to extract the new direct /dl/ URL from the viewer page
      const html = await res.text();
      const match = html.match(
        /https:\/\/tmpfiles\.org\/dl\/[^"'<> ]+\.(?:png|jpg|jpeg|gif|webp)/i
      );
      if (match?.[0]) {
        fetchUrl = match[0];
        res = await fetch(fetchUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "mesinKUBot/1.0",
            Accept: "image/*,*/*;q=0.8",
          },
        });
      }
    }

    // If still not OK, try the resolveTmpfilesDirectUrl fallback
    if (!res.ok && parsed.hostname.includes("tmpfiles.org")) {
      const directUrl = await resolveTmpfilesDirectUrl(url);
      if (directUrl) {
        fetchUrl = directUrl;
        res = await fetch(fetchUrl, {
          redirect: "follow",
          headers: {
            "User-Agent": "mesinKUBot/1.0",
            Accept: "image/*,*/*;q=0.8",
          },
        });
      }
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: res.status });
    }

    const finalContentType = res.headers.get("content-type") || "image/jpeg";
    // If the final response is still HTML, the image is genuinely unavailable
    if (finalContentType.includes("text/html")) {
      return NextResponse.json({ error: "Image unavailable" }, { status: 502 });
    }

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
    cache.set(url, { data, contentType: finalContentType, ts: Date.now() });

    return new NextResponse(data, {
      headers: {
        "Content-Type": finalContentType,
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Cache": "MISS",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Fetch failed: " + (e?.message || "unknown") }, { status: 502 });
  }
}
