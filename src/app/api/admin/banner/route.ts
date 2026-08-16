import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Banner config storage:
// We store the site-wide promo banner config inside a SPECIAL row of the
// existing `Paket` table (key = "__site_banner__"). This avoids needing a
// new Supabase table (which would require dashboard / service-role SQL access
// that we don't have). The row is filtered out of all paket listings so it
// never appears to users as a real package.
//
// The `features` JSON column holds the full banner config:
//   { title, desc, cta, imageUrl, link, active, gradient }
// ---------------------------------------------------------------------------

const BANNER_KEY = "__site_banner__";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

type BannerConfig = {
  title: string;
  desc: string;
  cta: string;
  imageUrl: string;
  link: string; // "post" | "listings" | ""
  gradient: string;
  active: boolean;
};

const DEFAULT_BANNER: BannerConfig = {
  title: "",
  desc: "",
  cta: "Pasang Iklan",
  imageUrl: "",
  link: "post",
  gradient: "from-amber-500 via-orange-500 to-rose-500",
  active: false,
};

function parseBanner(featuresRaw: any): BannerConfig | null {
  if (!featuresRaw) return null;
  try {
    const parsed = typeof featuresRaw === "string" ? JSON.parse(featuresRaw) : featuresRaw;
    if (!parsed || typeof parsed !== "object") return null;
    // Only treat it as a banner config if it has the expected shape
    if (typeof parsed.title === "undefined" && typeof parsed.active === "undefined") return null;
    return { ...DEFAULT_BANNER, ...parsed };
  } catch {
    return null;
  }
}

// GET — public: returns the current banner config (or default empty if none)
export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const row = await db.paket.findFirst({ where: { key: BANNER_KEY } });
      if (row) {
        const banner = parseBanner(row.features);
        if (banner) return NextResponse.json({ banner }, {
          headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
        });
      }
      // No banner row yet — fall through to Supabase / default
    } catch (error) {
      console.error("[admin/banner] Prisma GET error, falling back to Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("Paket")
      .select("features")
      .eq("key", BANNER_KEY)
      .maybeSingle();
    if (!error && data) {
      const banner = parseBanner(data.features);
      if (banner) return NextResponse.json({ banner }, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }
    if (error) {
      console.error("[admin/banner] Supabase GET error:", error);
    }
  } catch (error) {
    console.error("[admin/banner] Supabase GET exception:", error);
  }

  // --- Path C: no banner configured yet ---
  return NextResponse.json({ banner: DEFAULT_BANNER }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}

// PUT — admin: upsert the banner config
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, desc, cta, imageUrl, link, gradient, active } = body as Partial<BannerConfig>;

    const config: BannerConfig = {
      title: (title ?? "").toString(),
      desc: (desc ?? "").toString(),
      cta: (cta ?? "Pasang Iklan").toString(),
      imageUrl: (imageUrl ?? "").toString(),
      link: (link ?? "post").toString(),
      gradient: (gradient ?? DEFAULT_BANNER.gradient).toString(),
      active: active !== undefined ? Boolean(active) : true,
    };

    const featuresJson = JSON.stringify(config);

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        const existing = await db.paket.findFirst({ where: { key: BANNER_KEY } });
        if (existing) {
          await db.paket.update({
            where: { id: existing.id },
            data: {
              name: "Site Banner",
              features: featuresJson,
              active: true,
            },
          });
        } else {
          // Get max sortOrder
          const allPakets = await db.paket.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
          const nextSort = (allPakets[0]?.sortOrder ?? 0) + 1;
          await db.paket.create({
            data: {
              key: BANNER_KEY,
              name: "Site Banner",
              price: 0,
              originalPrice: 0,
              duration: 0,
              features: featuresJson,
              active: true,
              sortOrder: nextSort,
            },
          });
        }
        return NextResponse.json({ success: true, banner: config });
      } catch (error) {
        console.error("[admin/banner] Prisma PUT error, falling back to Supabase:", error);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();
    // Check if row exists
    const { data: existing } = await supabase
      .from("Paket")
      .select("id")
      .eq("key", BANNER_KEY)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("Paket")
        .update({
          name: "Site Banner",
          features: featuresJson,
          active: true,
        })
        .eq("id", existing.id);
      if (error) {
        console.error("[admin/banner] Supabase PUT (update) error:", error);
        return NextResponse.json({ error: "Gagal menyimpan banner: " + error.message }, { status: 500 });
      }
    } else {
      // Get max sortOrder
      const { data: maxRow } = await supabase
        .from("Paket")
        .select("sortOrder")
        .order("sortOrder", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSort = ((maxRow as any)?.sortOrder ?? 0) + 1;
      const { error } = await supabase.from("Paket").insert({
        key: BANNER_KEY,
        name: "Site Banner",
        price: 0,
        originalPrice: 0,
        duration: 0,
        features: featuresJson,
        active: true,
        sortOrder: nextSort,
      });
      if (error) {
        console.error("[admin/banner] Supabase PUT (insert) error:", error);
        return NextResponse.json({ error: "Gagal membuat banner: " + error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, banner: config });
  } catch (e: any) {
    console.error("[admin/banner] PUT error:", e);
    return NextResponse.json(
      { error: "Gagal menyimpan banner: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
