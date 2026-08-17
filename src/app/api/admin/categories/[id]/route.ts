import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await db.category.update({ where: { id }, data: body });
    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("[admin/categories/[id]] PATCH error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  try {
    const { id } = await params;
    await db.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/categories/[id]] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
