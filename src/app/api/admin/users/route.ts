import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: list all registered users
export async function GET() {
  if (!isDbAvailable()) {
    return NextResponse.json({ users: [] });
  }
  try {
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
  } catch (error) {
    console.error("[admin/users] GET error:", error);
    return NextResponse.json({ users: [] });
  }
}

// DELETE: delete user by id (cascades listings + messages)
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });
    // prevent deleting admin accounts
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
    if (user.role === "admin" || user.role === "superadmin") {
      return NextResponse.json({ error: "Tidak dapat menghapus akun admin" }, { status: 403 });
    }
    // Delete user's messages first (sent + received) to avoid FK constraint
    await db.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
    // Delete user's listings (seller records are left orphaned but harmless)
    await db.listing.deleteMany({ where: { userId: id } });
    // Now delete the user
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[admin/users] DELETE error:", e);
    return NextResponse.json(
      { ok: false, error: "Database error: " + (e?.message || "unknown") },
      { status: 500 }
    );
  }
}
