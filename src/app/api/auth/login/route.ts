import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { fallbackFindUser, fallbackFindUserByPhone } from "@/lib/auth-fallback";
import { isPhoneVerified } from "@/app/api/auth/otp/route";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
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

function normalizePhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password, phone } = body as {
    email?: string;
    password?: string;
    phone?: string;
  };

  // ===== Phone-based login (WhatsApp OTP) =====
  if (phone) {
    const normalizedPhone = normalizePhone(phone);

    // Verify OTP was completed
    if (!isPhoneVerified(normalizedPhone)) {
      return NextResponse.json(
        { error: "Silakan verifikasi OTP terlebih dahulu." },
        { status: 401 }
      );
    }

    // Try SQLite/Prisma first
    try {
      const users = await db.user.findMany({
        where: { phone: { not: null } },
      });
      const user = users.find(
        (u) => {
          const uPhone = (u.phone || "").replace(/[^0-9]/g, "");
          return uPhone.slice(-10) === normalizedPhone.slice(-10) || uPhone === normalizedPhone;
        }
      );

      if (!user) {
        return NextResponse.json(
          { error: "Nomor WhatsApp tidak terdaftar." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          company: user.company,
          address: user.address,
          bannerImage: user.bannerImage,
          logoImage: user.logoImage,
          role: user.role,
          createdAt:
            user.createdAt instanceof Date
              ? user.createdAt.toISOString()
              : user.createdAt,
        },
      });
    } catch {
      // SQLite unavailable — use fallback
    }

    // Fallback: in-memory + /tmp file store
    const result = await fallbackFindUserByPhone(normalizedPhone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ user: result.user });
  }

  // ===== Email + Password login =====
  const emailNorm = (email ?? "").trim().toLowerCase();

  if (!emailNorm || !password) {
    return NextResponse.json(
      { error: "Email dan kata sandi wajib diisi." },
      { status: 400 }
    );
  }

  // Try SQLite/Prisma first
  try {
    const user = await db.user.findUnique({ where: { email: emailNorm } });
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json(
        { error: "Email atau kata sandi salah." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        company: user.company,
        address: user.address,
        bannerImage: user.bannerImage,
        logoImage: user.logoImage,
        role: user.role,
        createdAt:
          user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : user.createdAt,
      },
    });
  } catch {
    // SQLite unavailable (e.g. Vercel serverless) — try Supabase next
  }

  // --- Supabase fallback (Vercel) ---
  try {
    const supabase = await getSupabase();
    const { data: supaUser, error } = await supabase
      .from("User")
      .select("*")
      .eq("email", emailNorm)
      .single();

    if (!error && supaUser) {
      // Verify password against the stored scrypt hash
      if (!verifyPassword(password, supaUser.password || "")) {
        return NextResponse.json(
          { error: "Email atau kata sandi salah." },
          { status: 401 }
        );
      }
      return NextResponse.json({
        user: {
          id: supaUser.id,
          name: supaUser.name,
          email: supaUser.email,
          phone: supaUser.phone,
          city: supaUser.city,
          company: supaUser.company,
          address: supaUser.address,
          bannerImage: supaUser.bannerImage,
          logoImage: supaUser.logoImage,
          role: supaUser.role,
          createdAt: supaUser.createdAt,
        },
      });
    }
  } catch (supaErr) {
    console.error("[auth/login] Supabase fallback error:", supaErr);
  }

  // Fallback: in-memory + /tmp file store
  const result = await fallbackFindUser(emailNorm, password);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ user: result.user });
}
