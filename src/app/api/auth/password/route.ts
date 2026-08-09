import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { fallbackChangePassword } from "@/lib/auth-fallback";

// PATCH /api/auth/password — change user password
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { userId, currentPassword, newPassword } = body as {
    userId?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  if (!userId) {
    return NextResponse.json({ error: "User ID wajib diisi." }, { status: 400 });
  }
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Kata sandi lama dan baru wajib diisi." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Kata sandi baru minimal 6 karakter." }, { status: 400 });
  }

  // Try SQLite/Prisma first
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }
    if (!verifyPassword(currentPassword, user.password)) {
      return NextResponse.json({ error: "Kata sandi lama salah." }, { status: 401 });
    }
    const hashed = hashPassword(newPassword);
    await db.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return NextResponse.json({ success: true });
  } catch {
    // SQLite unavailable — use fallback
  }

  const result = await fallbackChangePassword(userId, currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
