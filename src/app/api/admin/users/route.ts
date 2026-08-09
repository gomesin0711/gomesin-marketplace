import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
// Mirrors /api/admin/listings/route.ts.
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

// GET: list all registered users
export async function GET() {
  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
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
      console.error("[admin/users] Prisma GET error, falling back to Supabase:", error);
      // fall through to Supabase
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  // Supabase already returns timestamps as ISO strings, so no transformation
  // is needed beyond picking the explicit column list.
  try {
    const supabase = await getSupabase();
    const { data: rows, error } = await supabase
      .from("User")
      .select("id,name,email,phone,city,role,createdAt")
      .order("createdAt", { ascending: false });
    if (error) {
      console.error("[admin/users] Supabase GET error:", error);
      return NextResponse.json({ users: [] });
    }
    return NextResponse.json({ users: rows || [] });
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
