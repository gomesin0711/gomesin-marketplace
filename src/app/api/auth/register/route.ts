import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { fallbackRegisterUser } from "@/lib/auth-fallback";
import { phonesMatch, normalizePhone } from "@/lib/otp-store";
import { setSessionCookie, createSessionToken } from "@/lib/session";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/auth/login/route.ts and /api/admin/users/route.ts.
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

function genId(): string {
  // Supabase User.id has no default — generate a cuid-compatible id.
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, password, phone, city, company, address, bannerImage, logoImage } = body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    city?: string;
    company?: string;
    address?: string;
    bannerImage?: string;
    logoImage?: string;
  };

  const emailNorm = (email ?? "").trim().toLowerCase();
  const nameTrim = (name ?? "").trim();

  if (!nameTrim || !emailNorm || !password) {
    return NextResponse.json(
      { error: "Nama, email, dan kata sandi wajib diisi." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return NextResponse.json(
      { error: "Format email tidak valid." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Kata sandi minimal 6 karakter." },
      { status: 400 }
    );
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      // SQLite is case-sensitive by default. Use COLLATE NOCASE so that a
      // legacy mixed-case email (e.g. seeded admin) cannot be re-registered
      // by typing the lowercased variant.
      const existingEmail = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM User WHERE email = ${emailNorm} COLLATE NOCASE LIMIT 1
      `;
      if (existingEmail && existingEmail.length > 0) {
        return NextResponse.json(
          { error: "Email sudah terdaftar. Silakan masuk atau gunakan email lain.", field: "email" },
          { status: 409 }
        );
      }

      // Name uniqueness — case-insensitive, trimmed comparison.
      if (nameTrim) {
        const existingName = await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM User WHERE name = ${nameTrim} COLLATE NOCASE LIMIT 1
        `;
        if (existingName && existingName.length > 0) {
          return NextResponse.json(
            { error: "Nama sudah terdaftar. Silakan masuk atau gunakan nama lain.", field: "name" },
            { status: 409 }
          );
        }
      }

      // WhatsApp number uniqueness — format-agnostic comparison via phonesMatch
      // so that "0812-3456-7890" and "6281234567890" are treated as the same.
      const phoneTrim = phone?.trim() || "";
      if (phoneTrim) {
        const usersWithPhone = await db.user.findMany({
          where: { phone: { not: null } },
          select: { id: true, phone: true },
        });
        const phoneClash = usersWithPhone.some((u) => phonesMatch(u.phone, phoneTrim));
        if (phoneClash) {
          return NextResponse.json(
            { error: "Nomor WhatsApp sudah terdaftar. Silakan masuk atau gunakan nomor lain.", field: "phone" },
            { status: 409 }
          );
        }
      }

      const user = await db.user.create({
        data: {
          name: nameTrim,
          email: emailNorm,
          password: hashPassword(password),
          phone: phone?.trim() || null,
          city: city?.trim() || null,
          company: company?.trim() || null,
          address: address?.trim() || null,
          bannerImage: bannerImage?.trim() || null,
          logoImage: logoImage?.trim() || null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          city: true,
          company: true,
          address: true,
          bannerImage: true,
          logoImage: true,
          role: true,
          createdAt: true,
        },
      });

      // Issue session cookie alongside the new user response so subsequent
      // requests are authenticated (multi-user data isolation).
      // Also return sessionToken in the body so the client can store it in
      // sessionStorage (per-tab) for multi-account support.
      const token = createSessionToken(user.id, user.role || "user");
      const res = NextResponse.json({ user, sessionToken: token }, { status: 201 });
      setSessionCookie(res, user.id, user.role || "user", req);
      return res;
    } catch (prismaErr) {
      console.error("[auth/register] Prisma error, falling back to Supabase:", prismaErr);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    const supabase = await getSupabase();

    // Check if email already exists in Supabase (case-insensitive)
    const escaped = emailNorm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: existing, error: findErr } = await supabase
      .from("User")
      .select("id")
      .ilike("email", escaped)
      .limit(1)
      .maybeSingle();

    if (findErr) {
      console.error("[auth/register] Supabase check-existing error:", findErr);
    }
    if (existing) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan masuk atau gunakan email lain.", field: "email" },
        { status: 409 }
      );
    }

    // Name uniqueness (case-insensitive)
    if (nameTrim) {
      const escapedName = nameTrim.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const { data: existingName } = await supabase
        .from("User")
        .select("id")
        .ilike("name", escapedName)
        .limit(1)
        .maybeSingle();
      if (existingName) {
        return NextResponse.json(
          { error: "Nama sudah terdaftar. Silakan masuk atau gunakan nama lain.", field: "name" },
          { status: 409 }
        );
      }
    }

    // WhatsApp number uniqueness (format-agnostic, client-side phonesMatch)
    const phoneTrim = phone?.trim() || "";
    if (phoneTrim) {
      const inputNorm = normalizePhone(phoneTrim);
      const last10 = inputNorm.slice(-10);
      const { data: rows } = await supabase
        .from("User")
        .select("phone")
        .not("phone", "is", null);
      if (rows && rows.length > 0) {
        const clash = rows.some((r: { phone: string | null }) => {
          if (!r.phone) return false;
          const dbNorm = normalizePhone(r.phone);
          return dbNorm === inputNorm || dbNorm.slice(-10) === last10;
        });
        if (clash) {
          return NextResponse.json(
            { error: "Nomor WhatsApp sudah terdaftar. Silakan masuk atau gunakan nomor lain.", field: "phone" },
            { status: 409 }
          );
        }
      }
    }

    // Insert new user with role="user" (default, but explicit for clarity).
    // The password is stored as a scrypt hash (salt:hash) — same format as
    // Prisma path, so /api/auth/login can verify it identically.
    const newId = genId();
    const hashedPassword = hashPassword(password);
    const nowIso = new Date().toISOString();

    const { data: newRow, error: insertErr } = await supabase
      .from("User")
      .insert({
        id: newId,
        name: nameTrim,
        email: emailNorm,
        password: hashedPassword,
        phone: phone?.trim() || null,
        city: city?.trim() || null,
        company: company?.trim() || null,
        address: address?.trim() || null,
        bannerImage: bannerImage?.trim() || null,
        logoImage: logoImage?.trim() || null,
        role: "user",
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .select("id,name,email,phone,city,company,address,bannerImage,logoImage,role,createdAt")
      .single();

    if (insertErr || !newRow) {
      console.error("[auth/register] Supabase insert error:", insertErr);
      // fall through to in-memory fallback as last resort
    } else {
      const token = createSessionToken(newRow.id, newRow.role || "user");
      const res = NextResponse.json({ user: newRow, sessionToken: token }, { status: 201 });
      setSessionCookie(res, newRow.id, newRow.role || "user", req);
      return res;
    }
  } catch (supaErr) {
    console.error("[auth/register] Supabase fallback error:", supaErr);
    // fall through to in-memory fallback
  }

  // --- Path C: in-memory + /tmp file store (last resort) ---
  const result = await fallbackRegisterUser({
    name: nameTrim,
    email: emailNorm,
    password,
    phone,
    city,
    company,
    address,
    bannerImage,
    logoImage,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const token = createSessionToken(result.user.id, result.user.role || "user");
  const res = NextResponse.json({ user: result.user, sessionToken: token }, { status: 201 });
  setSessionCookie(res, result.user.id, result.user.role || "user", req);
  return res;
}
