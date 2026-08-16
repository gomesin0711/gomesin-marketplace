import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Hero Banner config storage:
// Stores the site-wide HERO banner config (the big banner at the TOP of the
// home page, with a background photo + overlay + title/subtitle/desc/cta).
// Uses a SPECIAL row of the existing `Paket` table (key = "__site_hero_banner__").
//
// The `features` JSON column holds the full hero banner config:
//   { title, subtitle, desc, cta, imageUrl, active }
//
// GET is public (needed to render the home page for all users).
// PUT is admin-only.
// ---------------------------------------------------------------------------

const HERO_KEY = "__site_hero_banner__";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

type HeroBannerConfig = {
  title: string; // h1 — main headline (white, bold)
  subtitle: string; // p — orange bold line below title
  desc: string; // p — small white description
  cta: string; // button text
  imageUrl: string; // background photo URL
  active: boolean; // if false, hero banner is hidden
};

const DEFAULT_HERO: HeroBannerConfig = {
  title: "Bingung Jual mesin baru/bekas dimana?",
  subtitle: "Pasang iklan di mesinKU saja!!!",
  desc: "Ada ribuan Mesin CETAK, Mesin CNC dan Mesin industri lainnya...",
  cta: "Pasang Iklan Sekarang",
  imageUrl: "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/2a59f3618c60.jpg",
  active: true,
};

function parseHero(featuresRaw: any): HeroBannerConfig | null {
  if (!featuresRaw) return null;
  try {
    const parsed = typeof featuresRaw === "string" ? JSON.parse(featuresRaw) : featuresRaw;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.title === "undefined" && typeof parsed.active === "undefined") return null;
    return { ...DEFAULT_HERO, ...parsed };
  } catch {
    return null;
  }
}

// GET — public: returns the current hero banner config (or default)
export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const row = await db.paket.findFirst({ where: { key: HERO_KEY } });
      if (row) {
        const hero = parseHero(row.features);
        if (hero) return NextResponse.json({ hero });
      }
    } catch (error) {
      console.error("[admin/hero-banner] Prisma GET error, falling back to Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("Paket")
      .select("features")
      .eq("key", HERO_KEY)
      .maybeSingle();
    if (!error && data) {
      const hero = parseHero(data.features);
      if (hero) return NextResponse.json({ hero });
    }
    if (error) {
      console.error("[admin/hero-banner] Supabase GET error:", error);
    }
  } catch (error) {
    console.error("[admin/hero-banner] Supabase GET exception:", error);
  }

  // --- Path C: no hero banner configured yet — return default ---
  return NextResponse.json({ hero: DEFAULT_HERO });
}

// PUT — admin: upsert the hero banner config
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, subtitle, desc, cta, imageUrl, active } = body as Partial<HeroBannerConfig>;

    const config: HeroBannerConfig = {
      title: (title ?? "").toString(),
      subtitle: (subtitle ?? "").toString(),
      desc: (desc ?? "").toString(),
      cta: (cta ?? "Pasang Iklan Sekarang").toString(),
      imageUrl: (imageUrl ?? "").toString(),
      active: active !== undefined ? Boolean(active) : true,
    };

    const featuresJson = JSON.stringify(config);

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        const existing = await db.paket.findFirst({ where: { key: HERO_KEY } });
        if (existing) {
          await db.paket.update({
            where: { id: existing.id },
            data: {
              name: "Site Hero Banner",
              features: featuresJson,
              active: true,
            },
          });
        } else {
          const allPakets = await db.paket.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
          const nextSort = (allPakets[0]?.sortOrder ?? 0) + 1;
          await db.paket.create({
            data: {
              key: HERO_KEY,
              name: "Site Hero Banner",
              price: 0,
              originalPrice: 0,
              duration: 0,
              features: featuresJson,
              active: true,
              sortOrder: nextSort,
            },
          });
        }
        return NextResponse.json({ success: true, hero: config });
      } catch (error) {
        console.error("[admin/hero-banner] Prisma PUT error, falling back to Supabase:", error);
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();
    const { data: existing } = await supabase
      .from("Paket")
      .select("id")
      .eq("key", HERO_KEY)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("Paket")
        .update({
          name: "Site Hero Banner",
          features: featuresJson,
          active: true,
        })
        .eq("id", existing.id);
      if (error) {
        return NextResponse.json({ error: "Gagal menyimpan hero banner: " + error.message }, { status: 500 });
      }
    } else {
      const { data: maxRow } = await supabase
        .from("Paket")
        .select("sortOrder")
        .order("sortOrder", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSort = ((maxRow as any)?.sortOrder ?? 0) + 1;
      const { error } = await supabase.from("Paket").insert({
        key: HERO_KEY,
        name: "Site Hero Banner",
        price: 0,
        originalPrice: 0,
        duration: 0,
        features: featuresJson,
        active: true,
        sortOrder: nextSort,
      });
      if (error) {
        return NextResponse.json({ error: "Gagal membuat hero banner: " + error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, hero: config });
  } catch (e: any) {
    console.error("[admin/hero-banner] PUT error:", e);
    return NextResponse.json(
      { error: "Gagal menyimpan hero banner: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
