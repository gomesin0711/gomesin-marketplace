"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, BadgeCheck, MessageCircle, Loader2, MapPin, Tag, Trash2, Ban, Eraser, Check, ImagePlus, Camera, FileImage } from "lucide-react";
import type { Listing, Seller } from "@/lib/types";
import { formatRupiahFull } from "@/lib/types";
import { toast } from "sonner";
import { useLang, translations as i18nTranslations, formatT } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { useChatSocket, type ChatMessage } from "@/lib/use-chat-socket";
import { compressImage } from "@/lib/image";

type Msg = { id?: string; role: "user" | "assistant"; content: string; image?: string | null; time?: string };

// ===== Context menu position =====
type MenuState = {
  visible: boolean;
  x: number;
  y: number;
  msgIndex: number;
};

export function ChatWidget({
  listing,
  open,
  onOpenChange,
}: {
  listing: Listing;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0, msgIndex: -1 });
  const [selectedMsg, setSelectedMsg] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [imgSending, setImgSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const imgCamRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const quick = [tr("quick1"), tr("quick2"), tr("quick3"), tr("quick4")];

  const seller: Seller = listing.seller;
  const ownerId = (listing as any).user?.id || null;
  const ownerName = (listing as any).user?.name || seller.name;
  const currentUser = useStore((s) => s.user);
  const goToLogin = useStore((s) => s.goToLogin);

  const queryClient = useQueryClient();
  const { sendMessage, markRead, subscribe } = useChatSocket();

  // Fetch conversation history ONCE on open.
  const { data: historyData } = useQuery({
    queryKey: ["chat-history", currentUser?.id, ownerId, listing.id],
    queryFn: async () => {
      if (!currentUser || !ownerId) return { conversations: [] };
      const res = await fetch(`/api/messages?userId=${currentUser.id}`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    enabled: !!currentUser && !!ownerId && open,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (open && historyData?.conversations && !loadedHistory) {
      const conv = historyData.conversations.find(
        (c: any) => c.partnerId === ownerId && c.listingTitle === listing.title
      );
      if (conv?.messages?.length) {
        const dbMsgs: Msg[] = [...conv.messages].reverse().map((m: any) => ({
          id: m.id,
          role: m.sent ? "user" : "assistant",
          content: m.content,
          image: m.image || null,
          time: new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        }));
        setMessages(dbMsgs);
        if (currentUser) markRead(currentUser.id, ownerId!);
      } else {
        setMessages([]);
      }
      setLoadedHistory(true);
    }
  }, [open, historyData, ownerId, listing.title, loadedHistory]);

  useEffect(() => {
    if (!open || !currentUser || !ownerId) return;
    const off = subscribe<ChatMessage>("message:new", (msg) => {
      const isRelevant =
        (msg.sent === false && msg.senderId === ownerId && msg.receiverId === currentUser.id) ||
        (msg.sent === true && msg.senderId === currentUser.id && msg.receiverId === ownerId);
      if (!isRelevant) return;
      const time = new Date(msg.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === (msg.sent ? "user" : "assistant") && last.content === msg.content && last.time === time) {
          return prev;
        }
        return [...prev, { id: msg.id, role: msg.sent ? "user" : "assistant", content: msg.content, image: (msg as any).image || null, time }];
      });
      if (!msg.sent) {
        markRead(currentUser.id, ownerId);
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      }
    });
    return off;
  }, [open, currentUser, ownerId, subscribe, markRead, queryClient]);

  useEffect(() => {
    if (!open) {
      setLoadedHistory(false);
      setMessages([]);
      setMenu({ visible: false, x: 0, y: 0, msgIndex: -1 });
      setSelectedMsg(null);
    }
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Close menu on click outside.
  useEffect(() => {
    if (!menu.visible) return;
    const close = () => setMenu({ visible: false, x: 0, y: 0, msgIndex: -1 });
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu.visible]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending || blocked) return;
    if (!currentUser) {
      toast.info(tr("chatLoginRequired"), { action: { label: tr("chatLoginAction"), onClick: goToLogin } });
      return;
    }
    if (!ownerId) { toast.info(tr("chatSellerNotRegistered")); return; }
    if (currentUser.id === ownerId) { toast.info(tr("chatOwnListing")); return; }

    setInput("");
    const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    setMessages(prev => [...prev, { role: "user", content, time: now }]);
    setSending(true);

    try {
      const ack = await sendMessage({
        senderId: currentUser.id, receiverId: ownerId, content,
        listingId: listing.id, listingTitle: listing.title,
      });
      if (!ack?.ok) {
        await fetch("/api/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderId: currentUser.id, receiverId: ownerId, content, listingId: listing.id, listingTitle: listing.title }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    } catch { toast.error(tr("chatSendFailed")); }
    finally { setSending(false); }
  };

  // ===== Context menu actions =====
  const handleDeleteMessage = useCallback(async (index: number) => {
    const msg = messages[index];
    if (!msg) return;
    setMessages(prev => prev.filter((_, i) => i !== index));
    setMenu({ visible: false, x: 0, y: 0, msgIndex: -1 });
    setSelectedMsg(null);
    if (msg.id) {
      try {
        await fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.id }) });
        toast.success("Pesan dihapus");
      } catch { toast.error("Gagal menghapus pesan"); }
    }
  }, [messages]);

  const handleClearChat = useCallback(async () => {
    if (!currentUser || !ownerId) return;
    setMessages([]);
    setMenu({ visible: false, x: 0, y: 0, msgIndex: -1 });
    setSelectedMsg(null);
    try {
      await fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: currentUser.id, partnerId: ownerId, listingTitle: listing.title }) });
      toast.success("Chat dibersihkan");
    } catch { toast.error("Gagal membersihkan chat"); }
  }, [currentUser, ownerId, listing.title]);

  const handleBlock = useCallback(() => {
    setBlocked(true);
    setMenu({ visible: false, x: 0, y: 0, msgIndex: -1 });
    setSelectedMsg(null);
    toast.success(`${ownerName} diblokir`, { description: "Anda tidak akan menerima pesan dari pengguna ini." });
  }, [ownerName]);

  // ===== Desktop: right-click context menu =====
  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ visible: true, x: e.clientX, y: e.clientY, msgIndex: index });
    setSelectedMsg(index);
  };

  // ===== Mobile: long-press =====
  const handleTouchStart = (index: number) => {
    longPressTimer.current = setTimeout(() => {
      setSelectedMsg(index);
      // Show menu at center of the message bubble.
      const el = document.querySelector(`[data-msg-index="${index}"]`) as HTMLElement;
      if (el) {
        const rect = el.getBoundingClientRect();
        setMenu({ visible: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, msgIndex: index });
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleChatImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!currentUser) {
      toast.info(tr("chatLoginRequired"), { action: { label: tr("chatLoginAction"), onClick: goToLogin } });
      e.target.value = "";
      return;
    }
    if (!ownerId) { toast.info(tr("chatSellerNotRegistered")); e.target.value = ""; return; }
    if (currentUser.id === ownerId) { toast.info(tr("chatOwnListing")); e.target.value = ""; return; }
    setImgSending(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        const localMsg: Msg = { role: "user", content: "📷 Foto", image: compressed, time: now };
        setMessages((prev) => [...prev, localMsg]);
        try {
          const ack = await sendMessage({
            senderId: currentUser.id, receiverId: ownerId, content: "📷 Foto",
            image: compressed, listingId: listing.id, listingTitle: listing.title,
          });
          if (!ack?.ok) {
            await fetch("/api/messages", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ senderId: currentUser.id, receiverId: ownerId, content: "📷 Foto", image: compressed, listingId: listing.id, listingTitle: listing.title }),
            });
          }
          queryClient.invalidateQueries({ queryKey: ["messages"] });
        } catch { toast.error("Gagal mengirim foto"); }
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal memproses gambar");
    } finally {
      setImgSending(false);
      e.target.value = "";
    }
  };

  const initials = ownerName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const img = listing.images?.[0];

  const menuItems = menu.msgIndex >= 0 ? [
    { label: "Hapus Pesan", icon: Trash2, action: () => handleDeleteMessage(menu.msgIndex), color: "text-red-600" },
    { label: "Blokir Pengguna", icon: Ban, action: handleBlock, color: "text-red-600" },
    { label: "Bersihkan Chat", icon: Eraser, action: handleClearChat, color: "text-foreground" },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
        {/* ===== HEADER ===== */}
        <DialogHeader className="border-b border-border bg-primary p-3 text-primary-foreground">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border-2 border-white/30">
              <AvatarFallback className="bg-white/20 text-sm font-bold text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-1.5 text-sm text-primary-foreground">
                <span className="truncate">{ownerName}</span>
                {seller.verified && <BadgeCheck className="size-3.5 shrink-0" />}
                {blocked && <span className="rounded bg-red-500 px-1 text-[9px] font-bold">DIBLOKIR</span>}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1 text-[11px] text-primary-foreground/80">
                <span className={cn("size-1.5 rounded-full", blocked ? "bg-red-400" : "bg-orange-400")} /> {blocked ? "Diblokir" : tr("chatOnline")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ===== LISTING CARD ===== */}
        <div className="border-b border-border bg-card p-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative size-[120px] shrink-0 overflow-hidden rounded-lg bg-muted">
              {img ? <img src={img} alt="" className="size-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><Tag className="size-6" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold text-foreground">{listing.title}</p>
              <p className="mt-0.5 text-sm font-bold text-primary">{formatRupiahFull(listing.price)}</p>
              <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><MapPin className="size-2.5" /> {listing.city}</p>
            </div>
          </div>
        </div>

        {/* ===== MESSAGES ===== */}
        <div
          ref={scrollRef}
          className="gomesin-scroll max-h-[40vh] min-h-[180px] space-y-1 overflow-y-auto p-3"
          style={{ backgroundColor: "#e5ddd5", backgroundImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        >
          {messages.length === 0 && loadedHistory && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageCircle className="size-8 text-muted-foreground/40" />
              <p className="mt-2 text-xs text-muted-foreground">Belum ada pesan. Mulai chat dengan penjual.</p>
            </div>
          )}
          {messages.length > 0 && (
            <div className="flex justify-center py-1">
              <span className="rounded-full bg-white/80 px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">Hari ini</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={cn("flex flex-col gap-0.5", m.role === "user" ? "items-end" : "items-start")}>
                <div
                  data-msg-index={i}
                  onContextMenu={(e) => handleContextMenu(e, i)}
                  onTouchStart={() => handleTouchStart(i)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  className={cn(
                    "max-w-[85%] cursor-pointer rounded-2xl px-3 py-2 text-sm shadow-sm transition select-none",
                    m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-white text-foreground",
                    selectedMsg === i && "ring-2 ring-blue-400 ring-offset-1"
                  )}
                >
                  {m.image && (
                    <img src={m.image} alt="" className="mb-1.5 max-h-48 w-auto rounded-lg object-contain" />
                  )}
                  {m.content && !m.image && m.content}
                  {m.content && m.image && (
                    <span className="text-xs opacity-70">{m.content}</span>
                  )}
                  {!m.content && !m.image && ""}
                  {m.time && (
                    <span className="ml-2 inline-block text-[9px] opacity-60">{m.time}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm">
                <span className="size-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.3s] inline-block" />
                <span className="size-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.15s] inline-block ml-0.5" />
                <span className="size-2 animate-bounce rounded-full bg-white/70 inline-block ml-0.5" />
              </div>
            </div>
          )}
        </div>

        {/* ===== QUICK REPLIES ===== */}
        {messages.length === 0 && loadedHistory && !blocked && (
          <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
            {quick.map((q) => (
              <button key={q} onClick={() => send(q)} className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/10">{q}</button>
            ))}
          </div>
        )}

        {/* ===== INPUT ===== */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-center gap-1.5 border-t border-border bg-card p-2.5"
        >
          {/* Hidden image inputs */}
          <input ref={imgFileRef} type="file" accept="image/*" className="hidden" onChange={handleChatImage} />
          <input ref={imgCamRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChatImage} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 text-muted-foreground hover:text-primary"
            disabled={imgSending || blocked}
            onClick={() => imgFileRef.current?.click()}
          >
            {imgSending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={blocked ? "Pengguna diblokir" : tr("chatPlaceholder")}
            className="h-9 flex-1 rounded-full"
            disabled={sending || blocked}
          />
          <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full bg-primary" disabled={sending || !input.trim() || blocked}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>

        {/* ===== CONTEXT MENU (desktop right-click + mobile long-press) ===== */}
        {menu.visible && (
          <div
            className="fixed z-[100] min-w-[160px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-up"
            style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.min(menu.y, window.innerHeight - 200) }}
            onClick={(e) => e.stopPropagation()}
          >
            {menuItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => { item.action(); }}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition", item.color)}
              >
                <item.icon className="size-4" />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ChatButton({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex-1 gap-2 rounded-full bg-primary font-semibold" size="lg">
        <MessageCircle className="size-5" /> {tr("chatSeller")}
      </Button>
      <ChatWidget listing={listing} open={open} onOpenChange={setOpen} />
    </>
  );
}
