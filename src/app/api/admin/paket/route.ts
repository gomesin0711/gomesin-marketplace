import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Hardcoded default pakets — MUST stay in sync with lib/paket.ts fallback.
// Used when neither Prisma nor Supabase returns any rows (e.g. Supabase Paket
// table is empty on a fresh Vercel deploy). Without this, the "Pasang Iklan"
// page would render every package price as "Rp. 0".
// NOTE: "gratis" is the FREE tier — lets users post a basic ad without payment.
const DEFAULT_PAKETS = [
  { id: "default-gratis",  key: "gratis",    name: "Gratis",    price: 0,      originalPrice: 0,      duration: 30, features: JSON.stringify(["Maksimal 3 foto", "Badge Free", "Tampil 30 hari", "Support email"]),                                                        active: true, sortOrder: 0 },
  { id: "default-colek",   key: "colek",     name: "Gold",      price: 60000,  originalPrice: 120000, duration: 30, features: JSON.stringify(["Tampil di bagian Premium", "Badge Gold", "Maksimal 5 foto", "Prioritas pencarian"]),                 active: true, sortOrder: 1 },
  { id: "default-sundul",  key: "sundul",    name: "Boost",     price: 30000,  originalPrice: 50000,  duration: 10, features: JSON.stringify(["Iklan didorong ke posisi teratas", "Badge Boost", "Boost 1x posisi", "Prioritas pencarian"]),     active: true, sortOrder: 2 },
  { id: "default-high",   key: "highlight", name: "Platinum",  price: 50000,  originalPrice: 100000, duration: 7,  features: JSON.stringify(["Tampil di bagian Premium", "Badge Platinum", "Maksimal 10 foto", "Prioritas pencarian", "Highlight border"]), active: true, sortOrder: 3 },
  { id: "default-spot",   key: "spotlight", name: "Titanium",  price: 100000, originalPrice: 200000, duration: 7,  features: JSON.stringify(["Tampil di bagian Premium", "Badge Titanium", "Maksimal 15 foto", "Prioritas tertinggi", "Spotlight border", "Dilihat lebih banyak"]), active: true, sortOrder: 4 },
];

function parseFeatures(p: any) {
  let feats = p.features;
  if (typeof feats === 'string') {
    try {
      feats = JSON.parse(feats);
    } catch {
      feats = [];
    }
  }
  // Defensive: ensure features is ALWAYS an array of strings.
  // The DB may have stored an object (e.g. {maxPhotos:3}) instead of an
  // array (e.g. ["Maksimal 3 foto"]). Convert any non-array to [] or
  // extract values if it's a plain object.
  if (!Array.isArray(feats)) {
    if (feats && typeof feats === 'object') {
      // Convert object values to array of "key: value" strings (best effort).
      feats = Object.entries(feats).map(([k, v]) => `${k}: ${v}`);
    } else {
      feats = [];
    }
  }
  // Ensure every item is a string.
  feats = feats.map((f: any) => (typeof f === 'string' ? f : String(f ?? '')));
  return { ...p, features: feats };
}

export async function GET() {
  // Hide the special "__site_*" rows (promo banner configs, not real packages)
  // from all paket listings. These rows store banner config in the Paket table
  // as a fallback when the SiteSetting table is unavailable.
  const isRealPaket = (p: any) => p && p.key && !p.key.startsWith("__site_");

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const pakets = await db.paket.findMany({ orderBy: { sortOrder: "asc" } });
      const real = pakets.filter(isRealPaket);
      if (real.length > 0) {
        return NextResponse.json({ pakets: real.map(parseFeatures) });
      }
      // No rows in DB — fall through to Supabase / defaults below.
    } catch (error) {
      console.error("[admin/paket] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data: rows, error } = await supabase
      .from("Paket")
      .select("*")
      .order("sortOrder", { ascending: true });
    if (!error && rows && rows.length > 0) {
      const real = rows.filter(isRealPaket);
      if (real.length > 0) {
        return NextResponse.json({ pakets: real.map(parseFeatures) });
      }
    }
    if (error) {
      console.error("[admin/paket] Supabase GET error:", error);
    }
  } catch (error) {
    console.error("[admin/paket] Supabase GET exception:", error);
  }

  // --- Path C: hardcoded defaults (matches Supabase data + lib/paket.ts) ---
  // Last resort — guarantees the "Pasang Iklan" page always shows real prices
  // even if both Prisma and Supabase are unavailable/empty.
  return NextResponse.json({ pakets: DEFAULT_PAKETS.map(parseFeatures) });
}

// CREATE new paket
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { key, name, price, originalPrice, duration, features, active, sortOrder } = body;
    if (!key || !name) return NextResponse.json({ error: "Key dan nama wajib" }, { status: 400 });

    // Check duplicate key
    const existing = await db.paket.findFirst({ where: { key } });
    if (existing) return NextResponse.json({ error: "Key paket sudah ada" }, { status: 409 });

    // Get max sortOrder
    const allPakets = await db.paket.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
    const nextSort = sortOrder ?? ((allPakets[0]?.sortOrder ?? 0) + 1);

    const created = await db.paket.create({
      data: {
        key,
        name,
        price: Number(price) || 0,
        originalPrice: Number(originalPrice) || 0,
        duration: Number(duration) || 30,
        features: JSON.stringify(features || []),
        active: active !== undefined ? active : true,
        sortOrder: nextSort,
      },
    });
    return NextResponse.json({ paket: parseFeatures(created) }, { status: 201 });
  } catch (error) {
    console.error("[admin/paket] POST error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// UPDATE existing paket
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, price, originalPrice, duration, features, active, sortOrder } = body;
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    const updated = await db.paket.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price: Number(price) }),
        ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
        ...(duration !== undefined && { duration: Number(duration) }),
        ...(features !== undefined && { features: JSON.stringify(features) }),
        ...(active !== undefined && { active }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
    });
    return NextResponse.json({ paket: parseFeatures(updated) });
  } catch (error) {
    console.error("[admin/paket] PUT error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// DELETE paket
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });
    await db.paket.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/paket] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
