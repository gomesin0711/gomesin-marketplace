import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Promo Banner 2 config storage:
// A SECOND editable promo banner (below the first promo banner) shown on the
// home page. Same shape as the first banner. Stored in a SPECIAL row of the
// existing `Paket` table (key = "__site_banner_2__").
//
// The `features` JSON column holds the full banner config:
//   { title, desc, cta, imageUrl, link, gradient, active }
//
// GET is public (needed to render the home page for all users).
// PUT is admin-only.
// ---------------------------------------------------------------------------

const BANNER2_KEY = "__site_banner_2__";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

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

const DEFAULT_BANNER2: BannerConfig = {
  title: "",
  desc: "",
  cta: "Pasang Iklan",
  imageUrl: "",
  link: "post",
  gradient: "from-emerald-500 via-green-600 to-teal-600",
  active: false,
};

function parseBanner(featuresRaw: any): BannerConfig | null {
  if (!featuresRaw) return null;
  try {
    const parsed = typeof featuresRaw === "string" ? JSON.parse(featuresRaw) : featuresRaw;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.title === "undefined" && typeof parsed.active === "undefined") return null;
    return { ...DEFAULT_BANNER2, ...parsed };
  } catch {
    return null;
  }
}

// GET — public: returns the current banner-2 config (or default empty)
export async function GET() {
  if (isDbAvailable()) {
    try {
      const row = await db.paket.findFirst({ where: { key: BANNER2_KEY } });
      if (row) {
        const banner = parseBanner(row.features);
        if (banner) return NextResponse.json({ banner });
      }
    } catch (error) {
      console.error("[admin/banner-2] Prisma GET error, falling back to Supabase:", error);
    }
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("Paket")
      .select("features")
      .eq("key", BANNER2_KEY)
      .maybeSingle();
    if (!error && data) {
      const banner = parseBanner(data.features);
      if (banner) return NextResponse.json({ banner });
    }
    if (error) {
      console.error("[admin/banner-2] Supabase GET error:", error);
    }
  } catch (error) {
    console.error("[admin/banner-2] Supabase GET exception:", error);
  }

  return NextResponse.json({ banner: DEFAULT_BANNER2 });
}

// PUT — admin: upsert the banner-2 config
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
      gradient: (gradient ?? DEFAULT_BANNER2.gradient).toString(),
      active: active !== undefined ? Boolean(active) : true,
    };

    const featuresJson = JSON.stringify(config);

    if (isDbAvailable()) {
      try {
        const existing = await db.paket.findFirst({ where: { key: BANNER2_KEY } });
        if (existing) {
          await db.paket.update({
            where: { id: existing.id },
            data: {
              name: "Site Banner 2",
              features: featuresJson,
              active: true,
            },
          });
        } else {
          const allPakets = await db.paket.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
          const nextSort = (allPakets[0]?.sortOrder ?? 0) + 1;
          await db.paket.create({
            data: {
              key: BANNER2_KEY,
              name: "Site Banner 2",
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
        console.error("[admin/banner-2] Prisma PUT error, falling back to Supabase:", error);
      }
    }

    const supabase = await getSupabase();
    const { data: existing } = await supabase
      .from("Paket")
      .select("id")
      .eq("key", BANNER2_KEY)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("Paket")
        .update({
          name: "Site Banner 2",
          features: featuresJson,
          active: true,
        })
        .eq("id", existing.id);
      if (error) {
        return NextResponse.json({ error: "Gagal menyimpan banner 2: " + error.message }, { status: 500 });
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
        key: BANNER2_KEY,
        name: "Site Banner 2",
        price: 0,
        originalPrice: 0,
        duration: 0,
        features: featuresJson,
        active: true,
        sortOrder: nextSort,
      });
      if (error) {
        return NextResponse.json({ error: "Gagal membuat banner 2: " + error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, banner: config });
  } catch (e: any) {
    console.error("[admin/banner-2] PUT error:", e);
    return NextResponse.json(
      { error: "Gagal menyimpan banner 2: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
