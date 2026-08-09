import { NextRequest, NextResponse } from "next/server";
import { db, isDbAvailable } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Supabase helper — used on Vercel where Prisma (sqlite provider) cannot
// connect to PostgreSQL. Locally we use Prisma + SQLite.
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

function toISO(d: any): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

// GET /api/messages?userId=<id>
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      return NextResponse.json(await getMessagesPrisma(userId));
    } catch (error) {
      console.error("[messages] Prisma GET error, falling back to Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    return NextResponse.json(await getMessagesSupabase(userId));
  } catch (e: any) {
    console.error("GET /api/messages Supabase error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function getMessagesPrisma(userId: string) {
  const messages = await db.message.findMany({
    where: { OR: [{ receiverId: userId }, { senderId: userId }] },
    orderBy: { createdAt: "desc" },
  });

  const userIds = new Set<string>();
  for (const m of messages) {
    if (m.senderId) userIds.add(m.senderId);
    if (m.receiverId) userIds.add(m.receiverId);
  }
  const users = userIds.size > 0
    ? await db.user.findMany({ where: { id: { in: Array.from(userIds) } } })
    : [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const getUser = (id: string) => userMap.get(id) || { name: "Unknown" };

  const convMap = new Map<string, any>();
  const listingIds = new Set<string>();

  for (const m of messages) {
    const isSender = m.senderId === userId;
    const partnerId = isSender ? m.receiverId : m.senderId;
    const partnerUser = getUser(partnerId);
    const senderUser = getUser(m.senderId);
    const receiverUser = getUser(m.receiverId);
    const key = partnerId;

    if (m.listingId) listingIds.add(m.listingId);

    if (!convMap.has(key)) {
      convMap.set(key, {
        id: key, partnerId,
        name: partnerUser?.name || 'Unknown',
        partnerImage: partnerUser?.logoImage || null,
        lastMessage: m.content,
        lastTime: toISO(m.createdAt),
        unread: 0,
        listingId: m.listingId || null,
        listingTitle: m.listingTitle || null,
        messages: [],
      });
    }

    const conv = convMap.get(key)!;
    conv.messages.push({
      id: m.id, content: m.content, image: m.image || null, sent: isSender, read: m.read,
      createdAt: toISO(m.createdAt),
      senderName: isSender ? (senderUser as any)?.name : (receiverUser as any)?.name,
      senderImage: isSender ? (senderUser as any)?.logoImage : (receiverUser as any)?.logoImage,
    });
    if (!isSender && !m.read) conv.unread += 1;
  }

  const listings = listingIds.size > 0
    ? await db.listing.findMany({ where: { id: { in: Array.from(listingIds) } }, select: { id: true, price: true, images: true } })
    : [];
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const conversations = Array.from(convMap.values()).map((c: any) => {
    let listingImage: string | null = null;
    let listingPrice: number | null = null;
    if (c.listingId && listingMap.has(c.listingId)) {
      const l = listingMap.get(c.listingId);
      const lp = l?.price;
      listingPrice = typeof lp === "bigint" ? Number(lp) : lp ?? null;
      try {
        const imgs = JSON.parse(l.images || "[]");
        if (Array.isArray(imgs) && imgs.length > 0) listingImage = imgs[0];
      } catch {}
    }
    delete c.listingId;
    return { ...c, listingImage, listingPrice };
  });

  conversations.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  return { conversations };
}

async function getMessagesSupabase(userId: string) {
  const supabase = await getSupabase();
  const { data: messages, error } = await supabase
    .from("Message")
    .select("*")
    .or(`senderId.eq.${userId},receiverId.eq.${userId}`)
    .order("createdAt", { ascending: false });
  if (error) throw new Error(error.message);

  const userIds = new Set<string>();
  for (const m of messages || []) {
    if (m.senderId) userIds.add(m.senderId);
    if (m.receiverId) userIds.add(m.receiverId);
  }
  let userMap: Record<string, any> = {};
  if (userIds.size > 0) {
    const { data: users } = await supabase.from("User").select("id,name,logoImage").in("id", Array.from(userIds));
    for (const u of users || []) userMap[u.id] = u;
  }
  const getUser = (id: string) => userMap[id] || { name: "Unknown" };

  const convMap = new Map<string, any>();
  const listingIds = new Set<string>();

  for (const m of messages || []) {
    const isSender = m.senderId === userId;
    const partnerId = isSender ? m.receiverId : m.senderId;
    const partnerUser = getUser(partnerId);
    const senderUser = getUser(m.senderId);
    const receiverUser = getUser(m.receiverId);
    const key = partnerId;
    if (m.listingId) listingIds.add(m.listingId);

    if (!convMap.has(key)) {
      convMap.set(key, {
        id: key, partnerId,
        name: partnerUser?.name || 'Unknown',
        partnerImage: partnerUser?.logoImage || null,
        lastMessage: m.content,
        lastTime: toISO(m.createdAt),
        unread: 0,
        listingId: m.listingId || null,
        listingTitle: m.listingTitle || null,
        messages: [],
      });
    }
    const conv = convMap.get(key)!;
    conv.messages.push({
      id: m.id, content: m.content, image: m.image || null, sent: isSender, read: m.read,
      createdAt: toISO(m.createdAt),
      senderName: isSender ? senderUser?.name : receiverUser?.name,
      senderImage: isSender ? senderUser?.logoImage : receiverUser?.logoImage,
    });
    if (!isSender && !m.read) conv.unread += 1;
  }

  let listingMap: Record<string, any> = {};
  if (listingIds.size > 0) {
    const { data: listings } = await supabase.from("Listing").select("id,price,images").in("id", Array.from(listingIds));
    for (const l of listings || []) listingMap[l.id] = l;
  }

  const conversations = Array.from(convMap.values()).map((c: any) => {
    let listingImage: string | null = null;
    let listingPrice: number | null = null;
    if (c.listingId && listingMap[c.listingId]) {
      const l = listingMap[c.listingId];
      listingPrice = typeof l.price === "string" ? Number(l.price) : l.price ?? null;
      try {
        const imgs = typeof l.images === "string" ? JSON.parse(l.images || "[]") : (l.images || []);
        if (Array.isArray(imgs) && imgs.length > 0) listingImage = imgs[0];
      } catch {}
    }
    delete c.listingId;
    return { ...c, listingImage, listingPrice };
  });

  conversations.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
  return { conversations };
}

// POST /api/messages — save a new message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { senderId, receiverId, content, image, listingId, listingTitle } = body;

    if (!senderId || !receiverId || (!content?.trim() && !image)) {
      return NextResponse.json({ error: "senderId, receiverId, content/image wajib diisi" }, { status: 400 });
    }
    if (senderId === receiverId) {
      return NextResponse.json({ error: "Tidak bisa kirim pesan ke diri sendiri" }, { status: 400 });
    }

    // Try Prisma (local) first
    if (isDbAvailable()) {
      try {
        const msg = await db.message.create({
          data: {
            senderId, receiverId,
            content: content?.trim() || "",
            image: image || null,
            listingId: listingId || null,
            listingTitle: listingTitle || null,
          },
        });
        return NextResponse.json({
          ok: true,
          message: {
            id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId,
            content: msg.content, image: msg.image || null,
            listingId: msg.listingId, listingTitle: msg.listingTitle,
            createdAt: toISO(msg.createdAt), read: msg.read,
          },
        }, { status: 201 });
      } catch (prismaErr) {
        console.error("[messages] Prisma POST error, trying Supabase:", prismaErr);
      }
    }

    // Supabase fallback
    const supabase = await getSupabase();
    const { data: msg, error } = await supabase.from("Message").insert({
      senderId, receiverId,
      content: content?.trim() || "",
      image: image || null,
      listingId: listingId || null,
      listingTitle: listingTitle || null,
      read: false,
    }).select().single();
    if (error) {
      console.error("[messages] Supabase POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      message: {
        id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId,
        content: msg.content, image: msg.image || null,
        listingId: msg.listingId, listingTitle: msg.listingTitle,
        createdAt: toISO(msg.createdAt), read: msg.read,
      },
    }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/messages error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/messages — mark messages from partnerId to userId as read
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, partnerId } = body;
    if (!userId || !partnerId) {
      return NextResponse.json({ error: "userId dan partnerId wajib diisi" }, { status: 400 });
    }

    if (isDbAvailable()) {
      try {
        const result = await db.message.updateMany({
          where: { senderId: partnerId, receiverId: userId, read: false },
          data: { read: true },
        });
        return NextResponse.json({ ok: true, updated: result.count });
      } catch (prismaErr) {
        console.error("[messages] Prisma PATCH error, trying Supabase:", prismaErr);
      }
    }

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("Message")
      .update({ read: true })
      .eq("senderId", partnerId)
      .eq("receiverId", userId)
      .eq("read", false)
      .select("id");
    if (error) {
      console.error("[messages] Supabase PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: data?.length || 0 });
  } catch (e: any) {
    console.error("PATCH /api/messages error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/messages
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.messageId) {
      if (isDbAvailable()) {
        try {
          await db.message.delete({ where: { id: body.messageId } });
          return NextResponse.json({ ok: true, deleted: 1 });
        } catch (prismaErr) {
          console.error("[messages] Prisma DELETE(single) error, trying Supabase:", prismaErr);
        }
      }
      const supabase = await getSupabase();
      const { error } = await supabase.from("Message").delete().eq("id", body.messageId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: 1 });
    }

    const { userId, partnerId, listingTitle } = body;
    if (!userId || !partnerId) {
      return NextResponse.json({ error: "userId dan partnerId wajib" }, { status: 400 });
    }

    if (isDbAvailable()) {
      try {
        const result = await db.message.deleteMany({
          where: {
            OR: [
              { senderId: userId, receiverId: partnerId },
              { senderId: partnerId, receiverId: userId },
            ],
            ...(listingTitle ? { listingTitle } : {}),
          },
        });
        return NextResponse.json({ ok: true, deleted: result.count });
      } catch (prismaErr) {
        console.error("[messages] Prisma DELETE(many) error, trying Supabase:", prismaErr);
      }
    }

    const supabase = await getSupabase();
    let query = supabase
      .from("Message")
      .delete()
      .or(`and(senderId.eq.${userId},receiverId.eq.${partnerId}),and(senderId.eq.${partnerId},receiverId.eq.${userId})`);
    if (listingTitle) query = query.eq("listingTitle", listingTitle);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: -1 });
  } catch (e: any) {
    console.error("DELETE /api/messages error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
