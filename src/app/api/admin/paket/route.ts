import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

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
  { id: "default-gratis",  key: "gratis",    name: "Gratis",    price: 0,      originalPrice: 0,      duration: 30, maxPhotos: 3,  features: JSON.stringify(["Maksimal 3 foto", "Badge Free", "Tampil 30 hari", "Support email"]),                                                        active: true, sortOrder: 0 },
  { id: "default-colek",   key: "colek",     name: "Gold",      price: 60000,  originalPrice: 120000, duration: 30, maxPhotos: 5,  features: JSON.stringify(["Tampil di bagian Premium", "Badge Gold", "Maksimal 5 foto", "Prioritas pencarian"]),                 active: true, sortOrder: 1 },
  { id: "default-sundul",  key: "sundul",    name: "Boost",     price: 30000,  originalPrice: 50000,  duration: 10, maxPhotos: 5,  features: JSON.stringify(["Iklan didorong ke posisi teratas", "Badge Boost", "Boost 1x posisi", "Prioritas pencarian"]),     active: true, sortOrder: 2 },
  { id: "default-high",   key: "highlight", name: "Platinum",  price: 50000,  originalPrice: 100000, duration: 7,  maxPhotos: 10, features: JSON.stringify(["Tampil di bagian Premium", "Badge Platinum", "Maksimal 10 foto", "Prioritas pencarian", "Highlight border"]), active: true, sortOrder: 3 },
  { id: "default-spot",   key: "spotlight", name: "Titanium",  price: 100000, originalPrice: 200000, duration: 7,  maxPhotos: 15, features: JSON.stringify(["Tampil di bagian Premium", "Badge Titanium", "Maksimal 15 foto", "Prioritas tertinggi", "Spotlight border", "Dilihat lebih banyak"]), active: true, sortOrder: 4 },
];

// ---------------------------------------------------------------------------
// maxPhotos helpers
// ---------------------------------------------------------------------------
// The local Prisma (SQLite) Paket table HAS a `maxPhotos Int` column.
// Supabase production does NOT have the column (anon key can't ALTER TABLE),
// so for Supabase rows we DERIVE maxPhotos from the features array by parsing
// any "Maksimal N foto" string. If none found, default to 3.
const MAX_FOTO_RE = /maksimal\s+(\d+)\s*foto/i;

function deriveMaxPhotos(p: any): number {
  // Prefer the real column if present (Prisma path).
  if (typeof p.maxPhotos === "number" && p.maxPhotos > 0) return p.maxPhotos;
  // Fallback: parse from features array.
  let feats: any = p.features;
  if (typeof feats === "string") {
    try { feats = JSON.parse(feats); } catch { feats = []; }
  }
  if (Array.isArray(feats)) {
    for (const f of feats) {
      const s = String(f ?? "");
      const m = s.match(MAX_FOTO_RE);
      if (m) return Math.max(1, parseInt(m[1], 10) || 3);
    }
  }
  return 3;
}

// When saving to Supabase (no maxPhotos column), inject/replace a
// "Maksimal N foto" line in the features array so the value persists.
function syncMaxFotoInFeatures(features: string[], maxPhotos: number): string[] {
  const idx = features.findIndex((f) => MAX_FOTO_RE.test(String(f ?? "")));
  const newLine = `Maksimal ${maxPhotos} foto`;
  if (idx >= 0) {
    const copy = [...features];
    copy[idx] = newLine;
    return copy;
  }
  return [newLine, ...features];
}

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
  return { ...p, features: feats, maxPhotos: deriveMaxPhotos(p) };
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
    const { key, name, price, originalPrice, duration, maxPhotos, features, active, sortOrder } = body;
    if (!key || !name) return NextResponse.json({ error: "Key dan nama wajib" }, { status: 400 });

    const maxPhotosNum = Math.max(1, Number(maxPhotos) || 3);

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
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
            maxPhotos: maxPhotosNum,
            features: JSON.stringify(syncMaxFotoInFeatures((Array.isArray(features) ? features : []).filter(Boolean), maxPhotosNum)),
            active: active !== undefined ? active : true,
            sortOrder: nextSort,
          },
        });
        return NextResponse.json({ paket: parseFeatures(created) }, { status: 201 });
      } catch (prismaErr) {
        console.error("[admin/paket] POST Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();

    // Check duplicate key in Supabase
    const { data: existing } = await supabase.from("Paket").select("id").eq("key", key).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Key paket sudah ada" }, { status: 409 });
    }

    // Get max sortOrder from Supabase
    const { data: maxRow } = await supabase
      .from("Paket")
      .select("sortOrder")
      .order("sortOrder", { ascending: false })
      .limit(1);
    const maxSort = maxRow && maxRow[0]?.sortOrder != null ? maxRow[0].sortOrder : 0;
    const nextSort = sortOrder ?? (maxSort + 1);

    // Supabase has no maxPhotos column — inject "Maksimal N foto" into features
    // so the value survives round-trips via the features array.
    const rawFeatures = Array.isArray(features) ? features.filter(Boolean) : [];
    const syncedFeatures = syncMaxFotoInFeatures(rawFeatures, maxPhotosNum);

    const newId = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const { data: newRow, error: insertErr } = await supabase
      .from("Paket")
      .insert({
        id: newId,
        key,
        name,
        price: Number(price) || 0,
        originalPrice: Number(originalPrice) || 0,
        duration: Number(duration) || 30,
        features: JSON.stringify(syncedFeatures),
        active: active !== undefined ? active : true,
        sortOrder: nextSort,
      })
      .select("*")
      .single();

    if (insertErr || !newRow) {
      console.error("[admin/paket] Supabase POST insert error:", insertErr);
      return NextResponse.json({ ok: false, error: "Gagal membuat paket: " + (insertErr?.message || "unknown") }, { status: 500 });
    }
    return NextResponse.json({ paket: parseFeatures(newRow) }, { status: 201 });
  } catch (error) {
    console.error("[admin/paket] POST error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// UPDATE existing paket
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, price, originalPrice, duration, maxPhotos, features, active, sortOrder } = body;
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    const maxPhotosNum = maxPhotos !== undefined ? Math.max(1, Number(maxPhotos) || 3) : undefined;

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        // If maxPhotos is being updated, sync the "Maksimal N foto" line in
        // features too so the column and feature string stay consistent.
        let finalFeatures = features;
        if (maxPhotosNum !== undefined) {
          let feats: string[];
          if (features !== undefined) {
            feats = (Array.isArray(features) ? features : []).filter(Boolean).map((f: any) => String(f ?? ""));
          } else {
            const existing = await db.paket.findUnique({ where: { id }, select: { features: true } });
            let raw = existing?.features ?? "[]";
            try { raw = JSON.parse(raw); } catch { raw = []; }
            feats = Array.isArray(raw) ? raw.map((f: any) => String(f ?? "")) : [];
          }
          finalFeatures = syncMaxFotoInFeatures(feats, maxPhotosNum);
        }
        const updated = await db.paket.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(price !== undefined && { price: Number(price) }),
            ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
            ...(duration !== undefined && { duration: Number(duration) }),
            ...(maxPhotosNum !== undefined && { maxPhotos: maxPhotosNum }),
            ...(finalFeatures !== undefined && { features: JSON.stringify(finalFeatures) }),
            ...(active !== undefined && { active }),
            ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
          },
        });
        return NextResponse.json({ paket: parseFeatures(updated) });
      } catch (prismaErr) {
        console.error("[admin/paket] PUT Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();

    const updatePayload: Record<string, any> = {};
    if (name !== undefined) updatePayload.name = name;
    if (price !== undefined) updatePayload.price = Number(price);
    if (originalPrice !== undefined) updatePayload.originalPrice = Number(originalPrice);
    if (duration !== undefined) updatePayload.duration = Number(duration);
    if (active !== undefined) updatePayload.active = active;
    if (sortOrder !== undefined) updatePayload.sortOrder = Number(sortOrder);

    // Supabase: maxPhotos stored inside features. If maxPhotos is being updated,
    // sync it into the features array (inject/replace the "Maksimal N foto" line).
    if (maxPhotosNum !== undefined) {
      let rawFeatures: string[] | undefined;
      if (features !== undefined) {
        rawFeatures = Array.isArray(features) ? features.filter(Boolean) : [];
      } else {
        // Fetch existing features to merge maxFoto into.
        const { data: existing } = await supabase.from("Paket").select("features").eq("id", id).limit(1);
        let feats: any = existing?.[0]?.features ?? "[]";
        if (typeof feats === "string") { try { feats = JSON.parse(feats); } catch { feats = []; } }
        if (!Array.isArray(feats)) feats = [];
        rawFeatures = feats.map((f: any) => String(f ?? ""));
      }
      updatePayload.features = JSON.stringify(syncMaxFotoInFeatures(rawFeatures, maxPhotosNum));
    } else if (features !== undefined) {
      updatePayload.features = JSON.stringify(features);
    }

    const { data: updatedRow, error: updateErr } = await supabase
      .from("Paket")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr || !updatedRow) {
      console.error("[admin/paket] Supabase PUT update error:", updateErr);
      return NextResponse.json({ ok: false, error: "Gagal update paket: " + (updateErr?.message || "unknown") }, { status: 500 });
    }
    return NextResponse.json({ paket: parseFeatures(updatedRow) });
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

    // --- Path A: local dev (Prisma + SQLite) ---
    if (isDbAvailable()) {
      try {
        await db.paket.delete({ where: { id } });
        return NextResponse.json({ success: true });
      } catch (prismaErr) {
        console.error("[admin/paket] DELETE Prisma error, falling back to Supabase:", prismaErr);
        // fall through to Supabase
      }
    }

    // --- Path B: Vercel (raw Supabase) ---
    const supabase = await getSupabase();
    const { error: deleteErr } = await supabase.from("Paket").delete().eq("id", id);

    if (deleteErr) {
      console.error("[admin/paket] Supabase DELETE error:", deleteErr);
      return NextResponse.json({ ok: false, error: "Gagal hapus paket: " + (deleteErr.message || "unknown") }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/paket] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
