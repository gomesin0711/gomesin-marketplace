import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { fallbackRegisterUser, isPhoneTaken, isEmailTaken } from "@/lib/auth-fallback";
import { domainHasMx, isDisposableDomain } from "@/lib/email-validate";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/auth/login/route.ts and /api/admin/users/route.ts.
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

  // --- Email reality check (server-side guard) ---
  // Reject emails whose domain doesn't really exist (no MX records) or is a
  // known disposable/temporary provider. This is the final safety net in case
  // the client-side /check-email feedback was bypassed (e.g. a direct API
  // call). Verifies that the email can actually receive mail — fake domains
  // like "test@fakedomain123.xyz" are rejected here.
  const domain = emailNorm.split("@")[1] ?? "";
  if (isDisposableDomain(domain)) {
    return NextResponse.json(
      { error: "Email sementara (disposable) tidak diperbolehkan. Gunakan email asli." },
      { status: 400 }
    );
  }
  const mxValid = await domainHasMx(domain);
  if (!mxValid) {
    return NextResponse.json(
      { error: "Domain email tidak ditemukan atau tidak dapat menerima email. Periksa kembali email Anda." },
      { status: 400 }
    );
  }

  // --- Cross-store duplicate checks (DB + fallback in-memory store) ---
  // We check BOTH email and phone across BOTH stores before any insert, so
  // that a user registered via the fallback path (or the seed admin in the
  // fallback store) cannot be re-registered with a different email but the
  // same phone (or vice-versa).
  if (await isEmailTaken(emailNorm)) {
    return NextResponse.json(
      { error: "Email sudah terdaftar. Silakan masuk." },
      { status: 409 }
    );
  }
  if (phone && (await isPhoneTaken(phone))) {
    return NextResponse.json(
      { error: "Nomor WhatsApp sudah terdaftar. Silakan masuk." },
      { status: 409 }
    );
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      // SQLite is case-sensitive by default. Use COLLATE NOCASE so that a
      // legacy mixed-case email (e.g. seeded admin) cannot be re-registered
      // by typing the lowercased variant.
      const existing = await db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM User WHERE email = ${emailNorm} COLLATE NOCASE LIMIT 1
      `;
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Email sudah terdaftar. Silakan masuk." },
          { status: 409 }
        );
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

      return NextResponse.json({ user }, { status: 201 });
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
        { error: "Email sudah terdaftar. Silakan masuk." },
        { status: 409 }
      );
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
      return NextResponse.json({ user: newRow }, { status: 201 });
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

  return NextResponse.json({ user: result.user }, { status: 201 });
}
