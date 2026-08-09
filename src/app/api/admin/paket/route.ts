import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function parseFeatures(p: any) {
  return {
    ...p,
    features: typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []),
  };
}

export async function GET() {
  const pakets = await db.paket.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ pakets: pakets.map(parseFeatures) });
}

// CREATE new paket
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { key, name, price, originalPrice, duration, features, active, sortOrder } = body;
  if (!key || !name) return NextResponse.json({ error: "Key dan nama wajib" }, { status: 400 });

  // Check duplicate key
  const existing = await db.paket.findFirst({ where: { key } });
  if (existing) return NextResponse.json({ error: "Key paket sudah ada" }, { status: 409 });

  // Get max sortOrder
  const allPakets = await db.paket.findMany({ orderBy: { sortOrder: "desc" }, take: 1 });
  const nextSort = sortOrder ?? ((allPakets[0]?.sortOrder ?? 0) + 1);

  const created = await db.paket.create({
    data: {
      key,
      name,
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || 0,
      duration: Number(duration) || 30,
      features: JSON.stringify(features || []),
      active: active !== undefined ? active : true,
      sortOrder: nextSort,
    },
  });
  return NextResponse.json({ paket: parseFeatures(created) }, { status: 201 });
}

// UPDATE existing paket
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, price, originalPrice, duration, features, active, sortOrder } = body;
  if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

  const updated = await db.paket.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price: Number(price) }),
      ...(originalPrice !== undefined && { originalPrice: Number(originalPrice) }),
      ...(duration !== undefined && { duration: Number(duration) }),
      ...(features !== undefined && { features: JSON.stringify(features) }),
      ...(active !== undefined && { active }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
    },
  });
  return NextResponse.json({ paket: parseFeatures(updated) });
}

// DELETE paket
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });
  await db.paket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
