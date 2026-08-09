import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";
import { parseListing } from "@/lib/types";
import { getPaketMap } from "@/lib/paket";

export const dynamic = "force-dynamic";

// GET all listings (admin, include inactive/violation/unpaid)
export async function GET(req: NextRequest) {
  if (!isDbAvailable()) {
    return NextResponse.json({ listings: [] });
  }
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const where: any = {};
    if (status) where.status = status;

    const [listings, paketMap] = await Promise.all([
      db.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { category: true, seller: true },
      }),
      getPaketMap(),
    ]);

    const withFee = listings.map((l) => {
      const parsed = parseListing(l);
      const fee = paketMap[parsed.packageType || ""]?.price ?? 0;
      return { ...parsed, adFee: fee };
    });

    return NextResponse.json({ listings: withFee });
  } catch (error) {
    console.error("[admin/listings] GET error:", error);
    return NextResponse.json({ listings: [] });
  }
}

// PATCH: update status (approve/reject/sold) OR toggle violation
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, violationFlag, violationReason } = body;
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    const data: any = {};
    if (status) {
      data.status = status;
      // when admin approves (status=active), also set paymentStatus=paid so it shows on beranda
      if (status === "active") data.paymentStatus = "paid";
    }
    if (violationFlag !== undefined) {
      data.violationFlag = violationFlag;
      data.violationReason = violationFlag ? (violationReason || "Melanggar ketentuan") : null;
      // if violation, also set status to rejected
      if (violationFlag) data.status = "rejected";
      else data.status = "active"; // restore when violation cleared
    }

    // Update using low-level Supabase (avoid .select().single() issues with RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nyyvmttbwlwqunigkrms.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8'
    );
    const { error } = await supabase.from('Listing').update(data).eq('id', id);
    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/listings] PATCH error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}

// DELETE listing
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID wajib" }, { status: 400 });

    // Delete using low-level Supabase (avoid .select().single() issues with RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nyyvmttbwlwqunigkrms.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8'
    );
    const { error } = await supabase.from('Listing').delete().eq('id', id);
    if (error) {
      console.error('Supabase delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/listings] DELETE error:", error);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
