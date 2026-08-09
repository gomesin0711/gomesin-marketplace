import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { fallbackRegisterUser } from "@/lib/auth-fallback";

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

  // Try SQLite/Prisma first
  try {
    const existing = await db.user.findUnique({ where: { email: emailNorm } });
    if (existing) {
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
  } catch {
    // SQLite unavailable (e.g. Vercel serverless) — use fallback
  }

  // Fallback: in-memory + /tmp file store
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
