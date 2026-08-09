import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET: list all registered users
export async function GET() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      role: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
    })),
  });
}

// DELETE: delete user by id (cascades listings + messages)
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });
  // prevent deleting admin accounts
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  if (user.role === "admin" || user.role === "superadmin") {
    return NextResponse.json({ error: "Tidak dapat menghapus akun admin" }, { status: 403 });
  }
  try {
    // Delete user's messages first (sent + received) to avoid FK constraint
    await db.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
    // Delete user's listings (seller records are left orphaned but harmless)
    await db.listing.deleteMany({ where: { userId: id } });
    // Now delete the user
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Gagal menghapus user: " + (e?.message || "unknown") }, { status: 500 });
  }
}
