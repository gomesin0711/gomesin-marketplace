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
  if (d instanceof Date) return d.toISOString();
  // Supabase returns timestamp strings WITHOUT a trailing "Z" and may strip
  // trailing zeros from milliseconds (e.g. "2026-08-16T04:21:37.378" or
  // "2026-08-16T03:23:15.62"). Normalize to 3-digit ms + Z to match Prisma.
  if (typeof d === "string") {
    const m = d.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z?)$/);
    if (m) {
      let ms = m[2] || ".000";
      ms = ms.padEnd(4, "0").slice(0, 4);
      return m[1] + ms + "Z";
    }
    return d.endsWith("Z") ? d : d + "Z";
  }
  return new Date(d).toISOString();
}

// Supabase Message.id has no default — generate a cuid-compatible id.
// (Mirrors the genId() helper in /api/auth/register/route.ts.)
function genId(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Soft-delete via "marker" messages
// ---------------------------------------------------------------------------
// When a user "deletes" or "clears" a chat with a partner, we insert a
// special marker Message row (senderId=deleter, receiverId=partner,
// content=CHAT_DELETED_MARKER) instead of hard-deleting real messages.
//
// When GETting messages:
//   - For each conversation, find the latest marker SENT BY the current user.
//   - Hide all messages with createdAt <= that marker's createdAt (i.e., the
//     user's view is "cleared" of older messages).
//   - Hide ALL marker messages from display (they are internal bookkeeping).
//
// This way:
//   - When A deletes the chat, only A's view is affected. B still sees all
//     real messages (B's perspective has no marker SENT BY B, so no time
//     filtering; A's marker is filtered out from B's display).
//   - If B sends a new message after A's deletion, A sees it (because the
//     new message's createdAt > A's marker's createdAt).
//   - Both A and B can independently delete their own views without
//     affecting each other.
// ---------------------------------------------------------------------------
const CHAT_DELETED_MARKER = "__SYSTEM__:CHAT_DELETED";
const isMarker = (content: string | null | undefined): boolean =>
  !!content && content === CHAT_DELETED_MARKER;

// GET /api/messages?userId=<id>
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "User ID wajib" }, { status: 400 });
  }

  // --- Path A: local dev (Prisma + SQLite) ---
  if (isDbAvailable()) {
    try {
      return NextResponse.json(await getMessagesPrisma(userId), {
        headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=15' },
      });
    } catch (error) {
      console.error("[messages] Prisma GET error, falling back to Supabase:", error);
    }
  }

  // --- Path B: Vercel (raw Supabase) ---
  try {
    return NextResponse.json(await getMessagesSupabase(userId), {
      headers: { 'Cache-Control': 'private, max-age=5, stale-while-revalidate=15' },
    });
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
    const key = partnerId;

    if (m.listingId) listingIds.add(m.listingId);

    if (!convMap.has(key)) {
      convMap.set(key, {
        id: key,
        partnerId,
        name: (getUser(partnerId) as any)?.name || "Unknown",
        partnerImage: (getUser(partnerId) as any)?.logoImage || null,
        messages: [],
      });
    }

    const conv = convMap.get(key)!;
    conv.messages.push({
      id: m.id,
      content: m.content,
      image: m.image || null,
      sent: isSender,
      read: m.read,
      createdAt: toISO(m.createdAt),
      listingId: m.listingId || null,
      listingTitle: m.listingTitle || null,
      _isMarker: isMarker(m.content),
      _senderId: m.senderId,
      _receiverId: m.receiverId,
    });
  }

  const listings = listingIds.size > 0
    ? await db.listing.findMany({ where: { id: { in: Array.from(listingIds) } }, select: { id: true, slug: true, title: true, price: true, images: true } })
    : [];
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const conversations: any[] = [];
  for (const c of Array.from(convMap.values())) {
    // --- Soft-delete filtering ---
    // Find the latest marker SENT BY the current user (sent === true).
    // (Messages are desc by createdAt, so markers[0] is the latest marker.)
    const myMarkers = c.messages.filter((m: any) => m._isMarker && m.sent);
    const latestMarkerAt = myMarkers.length > 0
      ? new Date(myMarkers[0].createdAt).getTime()
      : null;

    // Hide messages older than or equal to the latest marker (the marker
    // itself is also hidden by this filter, since its createdAt equals
    // latestMarkerAt).
    let visible: any[] = latestMarkerAt !== null
      ? c.messages.filter((m: any) =>
          new Date(m.createdAt).getTime() > (latestMarkerAt as number)
        )
      : c.messages.slice();

    // Also hide ALL marker messages from display (covers the partner's
    // markers, which are not used for time-filtering but should not be
    // shown to the user either).
    visible = visible.filter((m: any) => !m._isMarker);

    // Skip the conversation entirely if no visible messages remain.
    if (visible.length === 0) continue;

    // Compute conversation-level fields from the newest visible message.
    const newest = visible[0];
    let listingImage: string | null = null;
    let listingPrice: number | null = null;
    let listingSlug: string | null = null;
    const listingId = newest.listingId || null;
    let listingTitle = newest.listingTitle || null;
    if (listingId && listingMap.has(listingId)) {
      const l = listingMap.get(listingId);
      const lp = l?.price;
      listingPrice = typeof lp === "bigint" ? Number(lp) : lp ?? null;
      listingSlug = l?.slug || null;
      // Prefer the Listing table's title (source of truth) over the stale
      // listingTitle stored on the message (which may be wrong if the listing
      // was renamed after the message was sent).
      listingTitle = l?.title || newest.listingTitle || null;
      try {
        const imgs = JSON.parse(l.images || "[]");
        if (Array.isArray(imgs) && imgs.length > 0) listingImage = imgs[0];
      } catch {}
    }

    // unread: count visible messages received but not read.
    let unread = 0;
    const formattedMessages = visible.map((m: any) => {
      if (!m.sent && !m.read) unread += 1;
      const senderU = getUser(m._senderId) as any;
      const receiverU = getUser(m._receiverId) as any;
      // Resolve per-message listing info so the frontend can render a
      // listing bubble inline whenever the listing context changes.
      // (Supports multiple listings discussed in the same conversation.)
      let msgListingTitle: string | null = m.listingTitle || null;
      let msgListingImage: string | null = null;
      let msgListingPrice: number | null = null;
      let msgListingSlug: string | null = null;
      if (m.listingId && listingMap.has(m.listingId)) {
        const l = listingMap.get(m.listingId);
        const lp = l?.price;
        msgListingPrice = typeof lp === "bigint" ? Number(lp) : lp ?? null;
        msgListingSlug = l?.slug || null;
        msgListingTitle = l?.title || m.listingTitle || null;
        try {
          const imgs = JSON.parse(l.images || "[]");
          if (Array.isArray(imgs) && imgs.length > 0) msgListingImage = imgs[0];
        } catch {}
      }
      return {
        id: m.id,
        content: m.content,
        image: m.image,
        sent: m.sent,
        read: m.read,
        createdAt: m.createdAt,
        senderName: m.sent ? senderU?.name : receiverU?.name,
        senderImage: m.sent ? senderU?.logoImage : receiverU?.logoImage,
        listingId: m.listingId || null,
        listingTitle: msgListingTitle,
        listingImage: msgListingImage,
        listingPrice: msgListingPrice,
        listingSlug: msgListingSlug,
      };
    });

    conversations.push({
      id: c.id,
      partnerId: c.partnerId,
      name: c.name,
      partnerImage: c.partnerImage,
      partnerPhone: (getUser(c.partnerId) as any)?.phone || null,
      lastMessage: newest.content,
      lastTime: newest.createdAt,
      unread,
      listingId,
      listingSlug,
      listingTitle,
      listingImage,
      listingPrice,
      messages: formattedMessages,
    });
  }

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
    const { data: users } = await supabase.from("User").select("id,name,logoImage,phone").in("id", Array.from(userIds));
    for (const u of users || []) userMap[u.id] = u;
  }
  const getUser = (id: string) => userMap[id] || { name: "Unknown" };

  const convMap = new Map<string, any>();
  const listingIds = new Set<string>();

  for (const m of messages || []) {
    const isSender = m.senderId === userId;
    const partnerId = isSender ? m.receiverId : m.senderId;
    const key = partnerId;
    if (m.listingId) listingIds.add(m.listingId);

    if (!convMap.has(key)) {
      convMap.set(key, {
        id: key,
        partnerId,
        name: getUser(partnerId)?.name || "Unknown",
        partnerImage: getUser(partnerId)?.logoImage || null,
        messages: [],
      });
    }
    const conv = convMap.get(key)!;
    conv.messages.push({
      id: m.id,
      content: m.content,
      image: m.image || null,
      sent: isSender,
      read: m.read,
      createdAt: toISO(m.createdAt),
      listingId: m.listingId || null,
      listingTitle: m.listingTitle || null,
      _isMarker: isMarker(m.content),
      _senderId: m.senderId,
      _receiverId: m.receiverId,
    });
  }

  let listingMap: Record<string, any> = {};
  if (listingIds.size > 0) {
    const { data: listings } = await supabase.from("Listing").select("id,slug,title,price,images").in("id", Array.from(listingIds));
    for (const l of listings || []) listingMap[l.id] = l;
  }

  const conversations: any[] = [];
  for (const c of Array.from(convMap.values())) {
    // --- Soft-delete filtering (same as Prisma path) ---
    const myMarkers = c.messages.filter((m: any) => m._isMarker && m.sent);
    const latestMarkerAt = myMarkers.length > 0
      ? new Date(myMarkers[0].createdAt).getTime()
      : null;

    let visible: any[] = latestMarkerAt !== null
      ? c.messages.filter((m: any) =>
          new Date(m.createdAt).getTime() > (latestMarkerAt as number)
        )
      : c.messages.slice();

    visible = visible.filter((m: any) => !m._isMarker);

    if (visible.length === 0) continue;

    const newest = visible[0];
    let listingImage: string | null = null;
    let listingPrice: number | null = null;
    let listingSlug: string | null = null;
    const listingId = newest.listingId || null;
    let listingTitle = newest.listingTitle || null;
    if (listingId && listingMap[listingId]) {
      const l = listingMap[listingId];
      listingPrice = typeof l.price === "string" ? Number(l.price) : l.price ?? null;
      listingSlug = l.slug || null;
      // Prefer the Listing table's title (source of truth) over the stale
      // listingTitle stored on the message.
      listingTitle = l.title || newest.listingTitle || null;
      try {
        const imgs = typeof l.images === "string" ? JSON.parse(l.images || "[]") : (l.images || []);
        if (Array.isArray(imgs) && imgs.length > 0) listingImage = imgs[0];
      } catch {}
    }

    let unread = 0;
    const formattedMessages = visible.map((m: any) => {
      if (!m.sent && !m.read) unread += 1;
      const senderU = getUser(m._senderId);
      const receiverU = getUser(m._receiverId);
      // Resolve per-message listing info (supports multiple listings in one chat).
      let msgListingTitle: string | null = m.listingTitle || null;
      let msgListingImage: string | null = null;
      let msgListingPrice: number | null = null;
      let msgListingSlug: string | null = null;
      if (m.listingId && listingMap[m.listingId]) {
        const l = listingMap[m.listingId];
        msgListingPrice = typeof l.price === "string" ? Number(l.price) : l.price ?? null;
        msgListingSlug = l.slug || null;
        msgListingTitle = l.title || m.listingTitle || null;
        try {
          const imgs = typeof l.images === "string" ? JSON.parse(l.images || "[]") : (l.images || []);
          if (Array.isArray(imgs) && imgs.length > 0) msgListingImage = imgs[0];
        } catch {}
      }
      return {
        id: m.id,
        content: m.content,
        image: m.image,
        sent: m.sent,
        read: m.read,
        createdAt: m.createdAt,
        senderName: m.sent ? senderU?.name : receiverU?.name,
        senderImage: m.sent ? senderU?.logoImage : receiverU?.logoImage,
        listingId: m.listingId || null,
        listingTitle: msgListingTitle,
        listingImage: msgListingImage,
        listingPrice: msgListingPrice,
        listingSlug: msgListingSlug,
      };
    });

    conversations.push({
      id: c.id,
      partnerId: c.partnerId,
      name: c.name,
      partnerImage: c.partnerImage,
      partnerPhone: getUser(c.partnerId)?.phone || null,
      lastMessage: newest.content,
      lastTime: newest.createdAt,
      unread,
      listingId,
      listingSlug,
      listingTitle,
      listingImage,
      listingPrice,
      messages: formattedMessages,
    });
  }

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
      id: genId(),
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
//
// Two modes:
//   1. Single-message delete (body.messageId set): hard-deletes the single
//      message row. (Used by per-message delete — currently the frontend
//      only does this locally, but the endpoint is kept for compatibility.)
//   2. Conversation-level "delete"/"clear" (body.userId + body.partnerId):
//      SOFT-DELETE only — inserts a marker message instead of deleting real
//      messages. This ensures the OTHER party's copy of the conversation is
//      preserved. The GET handler filters out messages up to the user's
//      latest marker. Both "Clear chat" and "Delete chat" use this mode.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    // --- Mode 1: single-message hard delete ---
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

    // --- Mode 2: conversation-level soft delete (marker message) ---
    const { userId, partnerId } = body;
    if (!userId || !partnerId) {
      return NextResponse.json({ error: "userId dan partnerId wajib" }, { status: 400 });
    }
    if (userId === partnerId) {
      return NextResponse.json({ error: "Tidak bisa hapus chat dengan diri sendiri" }, { status: 400 });
    }

    if (isDbAvailable()) {
      try {
        const marker = await db.message.create({
          data: {
            senderId: userId,
            receiverId: partnerId,
            content: CHAT_DELETED_MARKER,
            image: null,
            listingId: null,
            listingTitle: null,
          },
        });
        return NextResponse.json({ ok: true, softDeleted: true, markerId: marker.id });
      } catch (prismaErr) {
        console.error("[messages] Prisma DELETE(soft) error, trying Supabase:", prismaErr);
      }
    }

    const supabase = await getSupabase();
    const { data: marker, error } = await supabase
      .from("Message")
      .insert({
        id: genId(),
        senderId: userId,
        receiverId: partnerId,
        content: CHAT_DELETED_MARKER,
        image: null,
        listingId: null,
        listingTitle: null,
        read: false,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[messages] Supabase DELETE(soft) error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, softDeleted: true, markerId: marker?.id });
  } catch (e: any) {
    console.error("DELETE /api/messages error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
