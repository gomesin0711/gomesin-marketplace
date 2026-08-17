import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
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

// ---------------------------------------------------------------------------
// Site-wide settings (key-value store) — managed from the admin "Pengaturan"
// tab. Keys currently used:
//   - bcaAccount      : BCA bank account number (displayed on payment pages)
//   - bcaName         : BCA account holder name
//   - whatsappNumber  : Support WhatsApp number (international format, no "+")
//   - supportEmail    : Support email address
//   - chatSoundEnabled: "on" | "off" — global toggle for chat notification sound
//   - qrisImageUrl    : path/URL of the QRIS image shown on payment pages
//   - qrisImageVersion: cache-bust version (epoch millis) for QRIS image
//   - chatSoundUrl    : path/URL of the chat ringtone audio file
//   - chatSoundVersion: cache-bust version (epoch millis) for chat ringtone
//   - listingSoundUrl : path/URL of the listing-notification ringtone audio file
//   - listingSoundVersion: cache-bust version (epoch millis) for listing ringtone
//
// GET is public (settings are needed to render payment pages for all users).
// PUT is admin-only.
// ---------------------------------------------------------------------------

// Default values used when a key is not yet set in the DB (first run).
const DEFAULTS: Record<string, string> = {
  bcaAccount: "8770338221",
  bcaName: "Lina Listiawati",
  whatsappNumber: "6285888082208",
  supportEmail: "mesinku711@gmail.com",
  chatSoundEnabled: "on",
  qrisImageUrl: "/qris-mesinKU.jpeg",
  qrisImageVersion: "2",
  chatSoundUrl: "/sounds/mesinku-chat.wav",
  chatSoundVersion: "8",
  listingSoundUrl: "/sounds/iklan-masuk.wav",
  listingSoundVersion: "3",
};

// Keys that are allowed to be read/written (whitelist for safety).
const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

/** GET /api/admin/settings — returns all settings (public). */
export async function GET() {
  const result: Record<string, string> = { ...DEFAULTS };

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      const rows = await db.siteSetting.findMany();
      for (const row of rows) {
        if (ALLOWED_KEYS.has(row.key)) {
          result[row.key] = row.value;
        }
      }
      return NextResponse.json(result);
    } catch (error) {
      console.error("[admin/settings] Prisma GET error, trying Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();
    const { data: rows, error } = await supabase.from("SiteSetting").select("key,value");
    if (!error && rows) {
      for (const row of rows) {
        if (ALLOWED_KEYS.has(row.key)) {
          result[row.key] = row.value;
        }
      }
    }
  } catch (error) {
    console.error("[admin/settings] Supabase GET error:", error);
    // return defaults
  }

  return NextResponse.json(result);
}

/** PUT /api/admin/settings — update settings (admin-only). */
export async function PUT(req: NextRequest) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isDbAvailable()) {
    return NextResponse.json(
      { error: "Database not available in this environment" },
      { status: 503 }
    );
  }

  // Auth: the app uses a custom localStorage-based session (NOT next-auth).
  // The frontend sends the logged-in user's id in the body; we verify that
  // user has the "admin" role before allowing the write. This matches the
  // codebase's auth model (admin access is client-gated in AdminView, and
  // we re-validate server-side here).
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const requester = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!requester || (requester.role !== "admin" && requester.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }
  } catch (error) {
    console.error("[admin/settings] auth check error:", error);
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  // Collect valid key/value pairs from the request body (excluding userId).
  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (key === "userId") continue;
    if (!ALLOWED_KEYS.has(key)) continue;
    const strValue = typeof value === "string" ? value : String(value ?? "");
    updates.push({ key, value: strValue });
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  try {
    // upsert each setting (create if missing, update if exists).
    await db.$transaction(
      updates.map((u) =>
        db.siteSetting.upsert({
          where: { key: u.key },
          create: { key: u.key, value: u.value },
          update: { value: u.value },
        })
      )
    );
    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (error) {
    console.error("[admin/settings] PUT error:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
