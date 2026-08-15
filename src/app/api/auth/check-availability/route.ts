import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { normalizePhone, phonesMatch } from "@/lib/otp-store";

// ---------------------------------------------------------------------------
// Unified availability check for the registration (daftar) form.
//
// Accepts optional query params: name, email, phone.
// Returns which of them already exist in the User table.
//
//   GET /api/auth/check-availability?name=Budi&email=budi@x.com&phone=0812
//   → { nameTaken: bool, emailTaken: bool, phoneTaken: bool }
//
// Mirrors the patterns in /api/auth/check-email (case-insensitive email via
// COLLATE NOCASE) and /api/auth/login (phonesMatch for format-agnostic phone
// comparison). Locally we use Prisma + SQLite; on Vercel we fall through to
// raw Supabase.
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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = (sp.get("name") || "").trim();
  const email = (sp.get("email") || "").trim().toLowerCase();
  const phone = (sp.get("phone") || "").trim();

  const result = { nameTaken: false, emailTaken: false, phoneTaken: false };

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      if (email) {
        const emailMatch = await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM User WHERE email = ${email} COLLATE NOCASE LIMIT 1
        `;
        result.emailTaken = !!(emailMatch && emailMatch.length > 0);
      }

      if (name) {
        // Case-insensitive exact name match. Trimmed comparison so that
        // " Budi Santoso " and "Budi Santoso" are treated the same.
        const nameMatch = await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM User WHERE name = ${name} COLLATE NOCASE LIMIT 1
        `;
        result.nameTaken = !!(nameMatch && nameMatch.length > 0);
      }

      if (phone) {
        // Phone numbers may be stored in many formats ("0812-3456-7890",
        // "0818666711", "6281200000000"). Fetch every user with a phone and
        // compare via phonesMatch (normalizes both sides to canonical 62 form).
        // User table is small in local dev so this is fine.
        const usersWithPhone = await db.user.findMany({
          where: { phone: { not: null } },
          select: { phone: true },
        });
        result.phoneTaken = usersWithPhone.some((u) =>
          phonesMatch(u.phone, phone)
        );
      }

      return NextResponse.json(result);
    } catch (prismaErr) {
      console.error("[check-availability] Prisma error:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    if (email) {
      const escaped = email
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      const { data } = await supabase
        .from("User")
        .select("id")
        .ilike("email", escaped)
        .limit(1)
        .maybeSingle();
      result.emailTaken = !!data;
    }

    if (name) {
      const escapedName = name
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      const { data } = await supabase
        .from("User")
        .select("id")
        .ilike("name", escapedName)
        .limit(1)
        .maybeSingle();
      result.nameTaken = !!data;
    }

    if (phone) {
      // Supabase doesn't support format-agnostic phone matching in SQL.
      // Fetch candidate rows whose phone contains the trailing digits of the
      // input, then verify with phonesMatch client-side.
      const inputNorm = normalizePhone(phone);
      const last10 = inputNorm.slice(-10);
      const { data: rows } = await supabase
        .from("User")
        .select("phone")
        .not("phone", "is", null);
      if (rows && rows.length > 0) {
        result.phoneTaken = rows.some((r: { phone: string | null }) => {
          if (!r.phone) return false;
          const dbNorm = normalizePhone(r.phone);
          return dbNorm === inputNorm || dbNorm.slice(-10) === last10;
        });
      }
    }
  } catch (e) {
    console.error("[check-availability] Supabase error:", e);
  }

  return NextResponse.json(result);
}
