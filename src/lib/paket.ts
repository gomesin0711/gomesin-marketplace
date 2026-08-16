import { db } from "@/lib/db";

export type PaketData = {
  key: string;
  name: string;
  price: number;
  duration: number; // days
  maxPhotos: number;
  features: string[];
  active: boolean;
};

let cache: PaketData[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// ---------------------------------------------------------------------------
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

// Parse "Maksimal N foto" from features array; default 3 if not found.
const MAX_FOTO_RE = /maksimal\s+(\d+)\s*foto/i;
function deriveMaxPhotos(features: string[], columnValue?: number): number {
  if (typeof columnValue === "number" && columnValue > 0) return columnValue;
  for (const f of features) {
    const m = String(f ?? "").match(MAX_FOTO_RE);
    if (m) return Math.max(1, parseInt(m[1], 10) || 3);
  }
  return 3;
}

function normalizeFeatures(raw: any): string[] {
  let f = raw;
  if (typeof f === "string") {
    try { f = JSON.parse(f); } catch { f = []; }
  }
  if (!Array.isArray(f)) {
    if (f && typeof f === "object") {
      f = Object.entries(f).map(([k, v]) => `${k}: ${v}`);
    } else {
      f = [];
    }
  }
  return f.map((item: any) => (typeof item === "string" ? item : String(item ?? "")));
}

async function fetchFromSupabase(): Promise<PaketData[]> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: rows, error } = await supabase
    .from("Paket")
    .select("*")
    .order("sortOrder", { ascending: true });
  if (error || !rows) return [];
  return rows
    .filter((p: any) => p.key && !p.key.startsWith("__site_"))
    .map((p: any) => {
      const feats = normalizeFeatures(p.features);
      return {
        key: p.key,
        name: p.name,
        price: p.price,
        duration: p.duration,
        maxPhotos: deriveMaxPhotos(feats, p.maxPhotos),
        features: feats,
        active: p.active,
      };
    });
}

export async function getPakets(): Promise<PaketData[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  // --- Path A: local dev (Prisma + SQLite) ---
  try {
    const rows = await db.paket.findMany({ orderBy: { sortOrder: "asc" } });
    cache = rows
      .filter((p) => !p.key.startsWith("__site_")) // hide __site_* banner config rows
      .map((p) => {
        const feats = normalizeFeatures(p.features);
        return {
          key: p.key,
          name: p.name,
          price: p.price,
          duration: p.duration,
          maxPhotos: deriveMaxPhotos(feats, p.maxPhotos),
          features: feats,
          active: p.active,
        };
      });
    cacheTime = now;
    return cache;
  } catch {
    // Prisma unavailable (e.g. Vercel) — fall through to Supabase
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supaRows = await fetchFromSupabase();
    if (supaRows.length > 0) {
      cache = supaRows;
      cacheTime = now;
      return cache;
    }
  } catch {
    // Supabase also failed — fall through to hardcoded defaults
  }

  // --- Path C: hardcoded defaults (last resort, matches synced Supabase data) ---
  cache = [
    { key: "colek", name: "Gold", price: 30000, duration: 10, maxPhotos: 3, features: ["Tampil di bagian Premium", "Badge Gold", "Maksimal 3 foto", "Prioritas pencarian"], active: true },
    { key: "sundul", name: "Boost", price: 10000, duration: 7, maxPhotos: 3, features: ["Iklan didorong ke posisi teratas", "Badge Boost", "Boost 1x posisi", "Prioritas pencarian"], active: true },
    { key: "highlight", name: "Platinum", price: 50000, duration: 20, maxPhotos: 6, features: ["Tampil di bagian Premium", "Badge Platinum", "Maksimal 6 foto", "Prioritas pencarian", "Highlight border"], active: true },
    { key: "spotlight", name: "Titanium", price: 100000, duration: 30, maxPhotos: 10, features: ["Tampil di bagian Premium", "Badge Titanium", "Maksimal 10 foto", "Prioritas tertinggi", "Spotlight border", "Dilihat lebih banyak"], active: true },
  ];
  cacheTime = now;
  return cache;
}

export async function getPaketMap(): Promise<Record<string, { price: number; duration: number; maxPhotos: number }>> {
  const pakets = await getPakets();
  const map: Record<string, { price: number; duration: number; maxPhotos: number }> = {};
  for (const p of pakets) {
    map[p.key] = { price: p.price, duration: p.duration, maxPhotos: p.maxPhotos };
  }
  return map;
}
