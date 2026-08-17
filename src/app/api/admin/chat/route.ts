import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/admin/chat
// Returns ALL conversations across ALL users — admin oversight view.
export async function GET(req: NextRequest) {
  const adminCheck = requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;
  try {
    // Fetch ALL messages (no include — Supabase doesn't support nested includes)
    const messages = await db.message.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Collect all user IDs and fetch user data separately
    const userIds = new Set<string>();
    for (const m of messages) {
      if (m.senderId) userIds.add(m.senderId);
      if (m.receiverId) userIds.add(m.receiverId);
    }
    const userRows = userIds.size > 0
      ? await db.user.findMany({ where: { id: { in: Array.from(userIds) } } })
      : [];
    const userMap: Record<string, any> = {};
    for (const u of userRows) userMap[u.id] = u;

    // Group by conversation key: sortedPairId::listingTitle
    const convMap = new Map<string, any>();
    const listingIds = new Set<string>();

    for (const m of messages) {
      const sender = userMap[m.senderId] || { id: m.senderId, name: "Unknown" };
      const receiver = userMap[m.receiverId] || { id: m.receiverId, name: "Unknown" };

      const [a, b] = [m.senderId, m.receiverId].sort();
      const pairKey = `${a}__${b}`;
      const key = `${pairKey}::${m.listingTitle || ""}`;

      if (m.listingId) listingIds.add(m.listingId);

      if (!convMap.has(key)) {
        convMap.set(key, {
          id: key,
          userA: { id: sender.id, name: sender.name, email: sender.email, role: sender.role },
          userB: { id: receiver.id, name: receiver.name, email: receiver.email, role: receiver.role },
          lastMessage: m.content,
          lastMessageAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : new Date(m.createdAt).toISOString(),
          lastSenderId: m.senderId,
          totalMessages: 0,
          unreadCount: 0,
          listingId: m.listingId || null,
          listingTitle: m.listingTitle || null,
          messages: [],
        });
      }

      const conv = convMap.get(key)!;
      conv.totalMessages += 1;
      if (!m.read) conv.unreadCount += 1;

      conv.messages.push({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        receiverId: m.receiverId,
        senderName: sender.name,
        receiverName: receiver.name,
        read: m.read,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : new Date(m.createdAt).toISOString(),
      });
    }

    // Fetch listing info for previews.
    const listings = listingIds.size > 0
      ? await db.listing.findMany({
          where: { id: { in: Array.from(listingIds) } },
          select: { id: true, price: true, images: true, status: true },
        })
      : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    // Attach listing image + price to conversations.
    const conversations = Array.from(convMap.values()).map((c: any) => {
      let listingImage: string | null = null;
      let listingPrice: number | null = null;
      let listingStatus: string | null = null;
      if (c.listingId && listingMap.has(c.listingId)) {
        const l = listingMap.get(c.listingId);
        if (l) {
          const lp = l.price;
          listingPrice = typeof lp === "bigint" ? Number(lp) : lp ?? null;
          listingStatus = l.status ?? null;
          try {
            const imgs = typeof l.images === 'string' ? JSON.parse(l.images) : (l.images || []);
            if (Array.isArray(imgs) && imgs.length > 0) listingImage = imgs[0];
          } catch {}
        }
      }
      delete c.listingId;
      return { ...c, listingImage, listingPrice, listingStatus };
    });

    conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    const summary = {
      totalConversations: conversations.length,
      totalMessages: messages.length,
      totalUnread: conversations.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0),
      activeUsers: new Set(messages.flatMap((m) => [m.senderId, m.receiverId])).size,
    };

    return NextResponse.json({ conversations, summary });
  } catch (e: any) {
    console.error("GET /api/admin/chat error", e);
    // Return empty data (HTTP 200) so the admin panel doesn't get stuck
    // in an infinite loading skeleton on Vercel's ephemeral DB.
    return NextResponse.json({
      conversations: [],
      summary: {
        totalConversations: 0,
        totalMessages: 0,
        totalUnread: 0,
        activeUsers: 0,
      },
    });
  }
}
