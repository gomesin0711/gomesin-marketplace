import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/companies?q=<query>
// Cari user berdasarkan nama perusahaan (CRUD: Read/Search).
// Return list of { id, name, company, city, email, phone } dengan company tidak null.
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    const where: any = { company: { not: null } };
    if (q) {
      where.OR = [
        { company: { contains: q } },
        { name: { contains: q } },
      ];
    }
    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        company: true,
        role: true,
        createdAt: true,
      },
      orderBy: { company: "asc" },
      take: 50,
    });
    return NextResponse.json({ companies: users, total: users.length });
  } catch (e: any) {
    console.error("GET /api/companies error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
