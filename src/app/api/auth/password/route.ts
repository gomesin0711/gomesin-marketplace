import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { fallbackChangePassword } from "@/lib/auth-fallback";
import { getSessionUser } from "@/lib/session";

// PATCH /api/auth/password — change the CURRENT user's password.
//
// SECURITY: userId is resolved EXCLUSIVELY from the verified session cookie.
// The body's `userId` field is IGNORED. This prevents account A from changing
// account B's password by simply passing B's userId.
export async function PATCH(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return NextResponse.json(
      { error: "Sesi berakhir. Silakan masuk kembali." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { currentPassword, newPassword } = body as {
    userId?: string; // ignored — resolved from session
    currentPassword?: string;
    newPassword?: string;
  };

  const userId = session.id;

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
