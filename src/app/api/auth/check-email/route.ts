import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 });
  }
  try {
    const user = await db.user.findFirst({ where: { email } });
    return NextResponse.json({ exists: !!user });
  } catch {
    return NextResponse.json({ error: "Gagal mengecek email" }, { status: 500 });
  }
}
