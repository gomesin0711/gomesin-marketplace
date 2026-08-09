"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Heart,
  Tag,
  Plus,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  MessageSquare,
  MessageCircle,
  Wallet,
  ShieldCheck,
  Shield,
  X,
  CheckCircle2,
  Clock,
  CreditCard,
  BellRing,
  Lock,
  KeyRound,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
  SlidersHorizontal,
  LifeBuoy,
  Send,
  Loader2,
  ChevronLeft,
  BadgeCheck,
  AlertTriangle,
  Monitor,
  MapPin,
  Phone,
  BookOpen,
  PlayCircle,
  Search,
  ExternalLink,
  Ban,
  Trash2,
  Eraser,
  Save,
  Smile,
  Paperclip,
  Image as ImageIcon,
  Upload,
  X as XIcon,
  Sticker,
  Camera,
  Menu,
  LayoutGrid,
  LayoutDashboard,
  List,
  Home,
  Volume2,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLang } from "@/lib/i18n";
import { timeAgo, formatRupiah, formatRupiahFull } from "@/lib/types";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useChatSocket, type ChatMessage } from "@/lib/use-chat-socket";
import { playNotificationSound, isChatSoundEnabled, setChatSoundEnabled } from "@/lib/notification-sound";
import { DashboardView } from "./dashboard";
import { FavoritesView } from "./favorites";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

type PanelType =
  | "pesan"
  | "pesanan"
  | "saldo"
  | "notifikasi"
  | "keamanan"
  | "pengaturan"
  | "bantuan"
  | "iklan-saya"
  | "favorit-saya"
  | null;

// Estimate byte size of a base64 data URL (approx — 4 chars = 3 bytes, minus header).
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1);
  // base64: 4 chars ≈ 3 bytes
  return Math.floor((b64.length * 3) / 4);
}

export function ProfileView() {
  const goToFavorites = useStore((s) => s.goToFavorites);
  const goToListings = useStore((s) => s.goToListings);
  const goHome = useStore((s) => s.goHome);
  const goToPost = useStore((s) => s.goToPost);
  const goToLogin = useStore((s) => s.goToLogin);
  const goToDashboard = useStore((s) => s.goToDashboard);
  const goToAdmin = useStore((s) => s.goToAdmin);
  const goToEdit = useStore((s) => s.goToEdit);
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const logout = useStore((s) => s.logout);
  const favCount = useStore((s) => s.favorites.length);
  const storeProfilePanel = useStore((s) => s.profilePanel);
  const clearProfilePanel = useStore((s) => s.clearProfilePanel);

  // Fetch user's listing count
  const { data: myListingsData } = useQuery({
    queryKey: ["my-listing-count", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/my-listings?userId=${user!.id}`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
  const myAdsCount = myListingsData?.listings?.length ?? 0;
  const myListings: any[] = myListingsData?.listings ?? [];

  // Fetch favorited listings (fetch all, filter by id client-side)
  const favIds = useStore((s) => s.favorites);
  const { data: favListingsData } = useQuery({
    queryKey: ["fav-listings", favIds.join(",")],
    queryFn: async () => {
      if (favIds.length === 0) return { listings: [] };
      const res = await fetch(`/api/listings?limit=200`);
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      return { listings: (data.listings || []).filter((l: any) => favIds.includes(l.id)) };
    },
    enabled: favIds.length > 0,
    staleTime: 0,
  });
  const favListings: any[] = favListingsData?.listings ?? [];

  // Fetch paket prices (for Riwayat Pembayaran — show ad package price per listing)
  const { data: paketData } = useQuery({
    queryKey: ["paket-prices"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/paket`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    staleTime: 60000,
  });
  const paketMap: Record<string, { name: string; price: number }> = (() => {
    const m: Record<string, { name: string; price: number }> = {};
    for (const p of paketData?.pakets || []) m[p.key] = { name: p.name, price: p.price };
    return m;
  })();
  const formatAdFee = (pkg: string) => {
    const price = paketMap[pkg]?.price ?? 0;
    return price > 0 ? `Rp ${price.toLocaleString("id-ID")}` : "Gratis";
  };
  const pkgDisplayName = (pkg: string) => paketMap[pkg]?.name || (pkg === "spotlight" ? "Titanium" : pkg === "highlight" ? "Platinum" : pkg === "sundul" ? "Colek" : "Gold");

  const { t, lang, setLang } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  const [panel, setPanel] = useState<PanelType>(storeProfilePanel);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { sendMessage, markRead, subscribe } = useChatSocket();

  // Delete ad — mirrors DashboardView logic.
  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/listings/${slug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus iklan");
      return data;
    },
    onSuccess: () => {
      toast.success("Iklan berhasil dihapus");
      setDeleteSlug(null);
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (e: any) => {
      toast.error(e.message || "Gagal menghapus iklan");
    },
  });
  const confirmDelete = () => {
    if (deleteSlug) deleteMutation.mutate(deleteSlug);
  };

  // Fetch user's messages (conversations) — NO polling, socket invalidates on change.
  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ["messages", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/messages?userId=${user!.id}`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: Infinity, // Socket invalidates on new message / read receipt.
  });
  const conversations: any[] = messagesData?.conversations ?? [];
  const unreadCount = conversations.reduce((a: number, c: any) => a + (c.unread || 0), 0);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<{ [key: number]: { role: "user" | "assistant"; content: string; image?: string; animation?: string }[] }>({});
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addPaymentRef = useRef<HTMLDivElement>(null);
  const [msgMenu, setMsgMenu] = useState<{ visible: boolean; x: number; y: number; msgIndex: number | null }>({ visible: false, x: 0, y: 0, msgIndex: null });
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "pending">("all");
  const [payViewMode, setPayViewMode] = useState<"grid" | "line">("grid");
  const [myAdsView, setMyAdsView] = useState<"grid" | "line">("grid");
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; msgIndex: number | null }>({ timer: null, msgIndex: null });
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<{ id: string; emoji: string; label: string; animation: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [convMenu, setConvMenu] = useState<{ visible: boolean; x: number; y: number; convId: string | null }>({ visible: false, x: 0, y: 0, convId: null });
  // edit profile state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingBanner, setPendingBanner] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  // settings state
  const [chatSoundOn, setChatSoundOn] = useState(true);
  useEffect(() => { setChatSoundOn(isChatSoundEnabled()); }, []);
  // security state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [showLoginHistory, setShowLoginHistory] = useState(false);
  // help state
  const [faqSearch, setFaqSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [supportMessages, setSupportMessages] = useState<{ role: "user" | "support"; content: string }[]>([
    { role: "support", content: tr("profSupportGreeting") },
  ]);
  const [supportInput, setSupportInput] = useState("");
  const [activeGuide, setActiveGuide] = useState<number | null>(null);
  // wallet state
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [newPaymentType, setNewPaymentType] = useState("bank");
  const [newPaymentName, setNewPaymentName] = useState("");
  const [newPaymentNumber, setNewPaymentNumber] = useState("");
  const [balance] = useState(0);
  const [transactions] = useState<any[]>([]);

  // sync: when store profilePanel changes (e.g. from bottom nav Chat button), open it
  const [prevStorePanel, setPrevStorePanel] = useState(storeProfilePanel);
  if (storeProfilePanel !== prevStorePanel) {
    setPrevStorePanel(storeProfilePanel);
    setPanel(storeProfilePanel as PanelType);
  }

  const closePanel = () => {
    setPanel(null);
    setActiveChatId(null);
    clearProfilePanel();
  };

  // sample data for panels — per-user (empty for new users)
  const orders: any[] = [];
  const wallets: any[] = [];
  const notifications: any[] = [
    { id: 1, icon: MessageSquare, title: "Pesan baru", desc: "Anda memiliki pesan baru dari pembeli.", time: "Baru saja", color: "text-blue-500", unread: true },
    { id: 2, icon: Tag, title: "Iklan disetujui", desc: "Iklan 'TEST DOWNLOAD BUKTI' telah diverifikasi admin.", time: "2 jam lalu", color: "text-orange-500", unread: true },
    { id: 3, icon: Heart, title: "Iklan difavoritkan", desc: "Iklan Anda ditambahkan ke favorit oleh pengguna.", time: "5 jam lalu", color: "text-rose-500", unread: false },
    { id: 4, icon: Clock, title: "Iklan akan kedaluwarsa", desc: "Iklan 'tes' akan kedaluwarsa dalam 3 hari.", time: "1 hari lalu", color: "text-amber-500", unread: false },
    { id: 5, icon: CheckCircle2, title: "Pembayaran diterima", desc: "Pembayaran Rp 99.000 untuk paket Titanium telah diterima.", time: "2 hari lalu", color: "text-orange-500", unread: false },
  ];

  const faqs = [
    { q: tr("profFaqQ1"), a: tr("profFaqA1") },
    { q: tr("profFaqQ2"), a: "Ya. Pasang iklan di Gomesin memilih paket mulai dari Gold. Paket Premium tersedia untuk menonjolkan iklan Anda." },
    { q: tr("profFaqQ3"), a: "Buka detail iklan, klik 'Chat Penjual' untuk chat AI, atau 'WhatsApp' untuk chat langsung via WA." },
    { q: tr("profFaqQ4"), a: "Selalu survei mesin langsung sebelum membayar. Gunakan rekening pribadi penjual dan hindari transfer ke pihak ketiga." },
    { q: tr("profFaqQ5"), a: "Masuk ke Dashboard Iklan Saya, pilih iklan yang ingin dihapus, lalu klik tombol hapus." },
  ];

  const initials = user
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "GU";

  const requireLogin = (action: () => void) => () => {
    if (!user) {
      toast.info(tr("profLoginRequired2"), {
        action: { label: tr("chatLoginAction"), onClick: goToLogin },
      });
      return;
    }
    action();
  };

  const openChat = (convId: string) => {
    const conv = conversations.find((c: any) => c.id === convId);
    setActiveChatId(convId as any);
    syncChatMessages(convId);
    if (user && conv?.partnerId) {
      fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, partnerId: conv.partnerId }),
      }).then(() => refetchMessages());
    }
  };

  // ===== Conversation context menu actions =====
  const handleConvContextMenu = (e: React.MouseEvent, convId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConvMenu({ visible: true, x: e.clientX, y: e.clientY, convId });
  };

  const handleBlockUser = useCallback(() => {
    const conv = conversations.find((c: any) => c.id === convMenu.convId);
    if (conv) toast.success(`${conv.name} diblokir`);
    setConvMenu({ visible: false, x: 0, y: 0, convId: null });
  }, [convMenu.convId, conversations]);

  const handleClearChat = useCallback(async () => {
    const conv = conversations.find((c: any) => c.id === convMenu.convId);
    if (!conv || !user) { setConvMenu({ visible: false, x: 0, y: 0, convId: null }); return; }
    try {
      await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, partnerId: conv.partnerId, listingTitle: conv.listingTitle }),
      });
      setChatMessages(prev => { const n = { ...prev }; delete n[convMenu.convId as any]; return n; });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success("Chat dibersihkan");
    } catch { toast.error("Gagal membersihkan chat"); }
    setConvMenu({ visible: false, x: 0, y: 0, convId: null });
  }, [convMenu.convId, conversations, user, queryClient]);

  const handleDeleteChat = useCallback(async () => {
    const conv = conversations.find((c: any) => c.id === convMenu.convId);
    if (!conv || !user) { setConvMenu({ visible: false, x: 0, y: 0, convId: null }); return; }
    try {
      await fetch("/api/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, partnerId: conv.partnerId, listingTitle: conv.listingTitle }),
      });
      setChatMessages(prev => { const n = { ...prev }; delete n[convMenu.convId as any]; return n; });
      if (activeChatId === convMenu.convId) setActiveChatId(null);
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success("Chat dihapus");
    } catch { toast.error("Gagal menghapus chat"); }
    setConvMenu({ visible: false, x: 0, y: 0, convId: null });
  }, [convMenu.convId, conversations, user, queryClient, activeChatId]);

  // Close menu on outside click
  useEffect(() => {
    if (!convMenu.visible) return;
    const close = () => setConvMenu({ visible: false, x: 0, y: 0, convId: null });
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, [convMenu.visible]);

  // Sync chat messages from conversations data — populate local state from DB snapshot.
  const syncChatMessages = (convId: string) => {
    const conv = conversations.find((c: any) => c.id === convId);
    if (!conv) return;
    const dbCount = conv.messages?.length || 0;
    const localCount = chatMessages[convId as any]?.length || 0;
    // Only initialize from DB if local is empty (first open).
    if (localCount === 0 && dbCount > 0) {
      const history = [...conv.messages].reverse().map((m: any) => ({
        role: m.sent ? ("user" as const) : ("assistant" as const),
        content: m.content,
        image: m.image || undefined,
      }));
      setChatMessages((prev) => ({ ...prev, [convId as any]: history }));
    } else if (dbCount === 0 && localCount === 0) {
      setChatMessages((prev) => ({ ...prev, [convId as any]: [] }));
    }
  };

  // Realtime: subscribe to incoming / echo messages via socket.
  useEffect(() => {
    if (!user) return;
    const off = subscribe<ChatMessage>("message:new", (msg) => {
      // Find the conversation this message belongs to (by partnerId + listingTitle).
      const isMine = msg.senderId === user.id;
      const partnerId = isMine ? msg.receiverId : msg.senderId;
      const conv = conversations.find(
        (c: any) => c.partnerId === partnerId && (c.listingTitle || null) === (msg.listingTitle || null)
      );
      // Refresh conversation list so last message preview + unread count update.
      queryClient.invalidateQueries({ queryKey: ["messages"] });

      // (Notification sound handled in Header.tsx — global, works in all views)

      // Toast notification for incoming messages (not from self) so user is alerted
      // even when not on the chat panel.
      if (!isMine) {
        // Play "Go mesin!" ringtone (like WhatsApp) for incoming chat — instant.
        playNotificationSound();
        const preview = msg.content?.trim()
          ? msg.content.length > 60 ? msg.content.slice(0, 60) + "..." : msg.content
          : msg.image ? "📷 Mengirim gambar" : "Pesan baru";
        toast.info(`Pesan baru${conv?.name ? ` dari ${conv.name}` : ""}`, {
          description: preview,
          duration: 4000,
          action: conv ? { label: "Buka", onClick: () => { setPanel("pesan"); openChat(conv.id as any); } } : undefined,
        });
      }

      // If this conversation is currently open in the chat view, append the message.
      if (conv && activeChatId !== null && String(activeChatId) === String(conv.id)) {
        setChatMessages((prev) => {
          const existing = prev[conv.id as any] || [];
          // Dedupe by content+role (avoid optimistic + echo double-add).
          const last = existing[existing.length - 1];
          if (
            last &&
            last.role === (isMine ? "user" : "assistant") &&
            last.content === msg.content
          ) {
            return prev;
          }
          return {
            ...prev,
            [conv.id as any]: [...existing, { role: isMine ? "user" : "assistant", content: msg.content, image: msg.image || undefined }],
          };
        });
        // Auto-mark incoming as read since the chat is open.
        if (!isMine) {
          markRead(user.id, partnerId);
        }
      }
    });
    return off;
  }, [user, activeChatId, conversations, subscribe, markRead, queryClient]);

  // Realtime: subscribe to read receipts — refresh unread counts.
  useEffect(() => {
    if (!user) return;
    const off = subscribe<{ partnerId: string }>("message:read-update", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    return off;
  }, [user, subscribe, queryClient]);

  // Auto-scroll to bottom when chat messages change
  useEffect(() => {
    if (activeChatId !== null && panel === "pesan") {
      setTimeout(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  }, [chatMessages, activeChatId, panel]);

  // (body scroll lock removed — Pesan panel now renders inline, not as a fixed overlay)

  const sendChat = async () => {
    const content = chatInput.trim();
    const image = pendingImage;
    if ((!content && !image) || chatSending || activeChatId === null || !user) return;
    const conv = conversations.find((c: any) => c.id === activeChatId);
    if (!conv) return;

    setChatInput("");
    setPendingImage(null);
    setShowEmoji(false);
    // Optimistic: show immediately.
    const history = chatMessages[activeChatId as any] || [];
    const next = [...history, { role: "user" as const, content: content || (image ? "📷 Gambar" : ""), image: image || undefined }];
    setChatMessages((prev) => ({ ...prev, [activeChatId as any]: next }));
    setChatSending(true);

    try {
      // Send via socket — server saves to DB AND broadcasts to receiver instantly.
      const ack = await sendMessage({
        senderId: user.id,
        receiverId: conv.partnerId,
        content: content || (image ? "📷 Gambar" : ""),
        image: image || null,
        listingTitle: conv.listingTitle,
      });
      if (!ack?.ok) {
        // Fallback to REST.
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: user.id,
            receiverId: conv.partnerId,
            content: content || (image ? "📷 Gambar" : ""),
            image: image || null,
            listingTitle: conv.listingTitle,
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    } catch {
      toast.error(tr("chatSendFailed"));
    } finally {
      setChatSending(false);
    }
  };

  // Handle image file selection → convert to base64 data URL
  // Compress image to max 200KB PNG via canvas. Returns base64 data URL.
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const MAX_BYTES = 200 * 1024; // 200KB
          // Start with original dimensions (capped to max 1280px on longest side)
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          // Try decreasing quality (PNG is lossless, so we reduce dimensions to hit <200KB)
          const tryCompress = (w: number, h: number): string | null => {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL("image/png");
            return dataUrl;
          };
          let result = tryCompress(width, height);
          // If still > 200KB, progressively reduce dimensions
          let curW = width;
          let curH = height;
          while (result && dataUrlBytes(result) > MAX_BYTES && curW > 100) {
            curW = Math.round(curW * 0.8);
            curH = Math.round(curH * 0.8);
            result = tryCompress(curW, curH);
          }
          resolve(result || "");
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Compress image for banner/logo — uses JPEG with dynamic quality to hit <200KB.
  // For PNG with transparency (logos), keeps PNG but reduces dimensions.
  const compressBannerImage = (file: File, useJpeg = true): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const MAX_BYTES = 200 * 1024; // 200KB
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas not supported")); return; }
          ctx.drawImage(img, 0, 0, width, height);
          if (useJpeg) {
            // JPEG with dynamic quality reduction
            let quality = 0.9;
            let result = canvas.toDataURL("image/jpeg", quality);
            while (dataUrlBytes(result) > MAX_BYTES && quality > 0.1) {
              quality -= 0.1;
              result = canvas.toDataURL("image/jpeg", quality);
            }
            // If still > 200KB, reduce dimensions
            let curW = width, curH = height;
            while (dataUrlBytes(result) > MAX_BYTES && curW > 100) {
              curW = Math.round(curW * 0.8);
              curH = Math.round(curH * 0.8);
              canvas.width = curW;
              canvas.height = curH;
              ctx.drawImage(img, 0, 0, curW, curH);
              result = canvas.toDataURL("image/jpeg", quality);
            }
            resolve(result);
          } else {
            // PNG (for logos with transparency)
            let result = canvas.toDataURL("image/png");
            let curW = width, curH = height;
            while (dataUrlBytes(result) > MAX_BYTES && curW > 100) {
              curW = Math.round(curW * 0.8);
              curH = Math.round(curH * 0.8);
              canvas.width = curW;
              canvas.height = curH;
              ctx.drawImage(img, 0, 0, curW, curH);
              result = canvas.toDataURL("image/png");
            }
            resolve(result);
          }
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    try {
      const compressed = await compressImage(file);
      if (!compressed) {
        toast.error("Gagal memproses gambar");
        return;
      }
      setPendingImage(compressed);
    } catch {
      toast.error("Gagal memuat gambar");
    }
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  // Fetch stickers from /api/gifs — trending by default, search if query
  const fetchGifs = useCallback(async (q: string) => {
    setGifLoading(true);
    try {
      const url = q ? `/api/gifs?q=${encodeURIComponent(q)}` : "/api/gifs";
      const res = await fetch(url);
      if (!res.ok) throw new Error("fail");
      const data = await res.json();
      setGifResults(data.stickers || []);
    } catch {
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }, []);

  // Load trending GIFs when GIF picker opens (only once per open)
  const gifFetchRef = useRef(false);
  useEffect(() => {
    if (showGifs && !gifFetchRef.current && gifResults.length === 0) {
      fetchGifs("");
      gifFetchRef.current = true;
    }
    if (!showGifs) {
      gifFetchRef.current = false;
    }
  }, [showGifs, fetchGifs, gifResults.length]);

  // Debounced GIF search
  useEffect(() => {
    if (!showGifs) return;
    const t = setTimeout(() => {
      fetchGifs(gifQuery);
    }, 400);
    return () => clearTimeout(t);
  }, [gifQuery, showGifs, fetchGifs]);

  // Send a sticker (animated emoji) as a big animated message
  const sendGif = async (sticker: { emoji: string; animation: string }) => {
    if (chatSending || activeChatId === null || !user) return;
    const conv = conversations.find((c: any) => c.id === activeChatId);
    if (!conv) return;
    setShowGifs(false);
    const history = chatMessages[activeChatId as any] || [];
    const next = [...history, { role: "user" as const, content: sticker.emoji, animation: sticker.animation }];
    setChatMessages((prev) => ({ ...prev, [activeChatId as any]: next }));
    setChatSending(true);
    try {
      const ack = await sendMessage({
        senderId: user.id,
        receiverId: conv.partnerId,
        content: sticker.emoji,
        listingTitle: conv.listingTitle,
      });
      if (!ack?.ok) {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: user.id,
            receiverId: conv.partnerId,
            content: sticker.emoji,
            listingTitle: conv.listingTitle,
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    } catch {
      toast.error(tr("chatSendFailed"));
    } finally {
      setChatSending(false);
    }
  };

  // Long-press handlers for message delete
  const handleMsgLongPressStart = (e: React.MouseEvent | React.TouchEvent, index: number) => {
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    longPressRef.current.timer = setTimeout(() => {
      setMsgMenu({ visible: true, x, y, msgIndex: index });
    }, 500);
    longPressRef.current.msgIndex = index;
  };
  const handleMsgLongPressEnd = () => {
    if (longPressRef.current.timer) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };
  const deleteMessage = () => {
    if (msgMenu.msgIndex === null || activeChatId === null) {
      setMsgMenu({ visible: false, x: 0, y: 0, msgIndex: null });
      return;
    }
    const history = chatMessages[activeChatId as any] || [];
    const next = history.filter((_, i) => i !== msgMenu.msgIndex);
    setChatMessages((prev) => ({ ...prev, [activeChatId as any]: next }));
    setMsgMenu({ visible: false, x: 0, y: 0, msgIndex: null });
    toast.success("Pesan dihapus");
  };

  const panelTitle: { [K in Exclude<PanelType, null>]: string } = {
    pesan: tr("messages"),
    pesanan: tr("orders"),
    saldo: tr("wallet"),
    notifikasi: tr("notifications"),
    keamanan: tr("security"),
    pengaturan: tr("settings"),
    bantuan: tr("help"),
    "iklan-saya": tr("profMyAds"),
    "favorit-saya": tr("myFavorites"),
  };

  return (
    <div className="animate-fade-up flex">
      {/* ===== PERMANENT SIDEBAR MENU (desktop only — mobile uses drawer) ===== */}
      <aside className="sticky top-0 z-30 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-card md:flex">
        {/* sidebar header */}
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Avatar className="size-10 border-2 border-primary/20 overflow-hidden">
            {user?.logoImage ? (
              <img src={user.logoImage} alt={user.name || ""} className="size-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
            ) : (
              <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{user?.name || "Pengguna"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email || "Belum login"}</p>
          </div>
        </div>
        {user?.role === "admin" && (
          <div className="px-4 pt-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              <ShieldCheck className="size-3" /> Admin
            </span>
          </div>
        )}
        {/* Menu items */}
        <nav className="p-2">
          {/* Section: Iklan & Transaksi */}
          <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">Iklan & Transaksi</p>
          {[
            ...(user?.role === "admin" ? [{ icon: ShieldCheck, label: tr("adminPanel"), action: goToAdmin, navigate: true, key: "admin" }] : []),
            { icon: Tag, label: tr("profMyAds"), action: () => setPanel("iklan-saya"), navigate: false, key: "iklan-saya" },
            { icon: Heart, label: tr("myFavorites"), action: () => setPanel("favorit-saya"), navigate: false, key: "favorit-saya" },
            { icon: MessageSquare, label: tr("messages"), action: () => setPanel("pesan"), navigate: false, key: "pesan" },
            { icon: Wallet, label: tr("wallet"), action: () => setPanel("saldo"), navigate: false, key: "saldo" },
          ].map((m, i) => {
            const isActive = panel === m.key;
            return (
              <button
                key={i}
                onClick={m.action}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                  isActive ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
                )}
              >
                <m.icon className="size-4 shrink-0" />
                <span className="truncate">{m.label}</span>
                {m.key === "pesan" && unreadCount > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unreadCount}</span>
                )}
              </button>
            );
          })}

          {/* Section: Akun & Keamanan */}
          <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">Akun & Keamanan</p>
          {[
            { icon: Bell, label: tr("notifications"), action: () => setPanel("notifikasi"), key: "notifikasi" },
            { icon: Lock, label: tr("security"), action: () => setPanel("keamanan"), key: "keamanan" },
            { icon: Settings, label: tr("settings"), action: () => setPanel("pengaturan"), key: "pengaturan" },
          ].map((m, i) => {
            const isActive = panel === m.key;
            return (
              <button
                key={i}
                onClick={m.action}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                  isActive ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
                )}
              >
                <m.icon className="size-4 shrink-0" />
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}

          {/* Section: Bantuan */}
          <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">Bantuan</p>
          <button
            onClick={() => setPanel("bantuan")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
              panel === "bantuan" ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
            )}
          >
            <HelpCircle className="size-4 shrink-0" />
            <span className="truncate">{tr("help")}</span>
          </button>
          <button
            onClick={() => { if (user) { logout(); toast.success(tr("profLogoutSuccess")); goHome(); } else { goToLogin(); } }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-destructive transition hover:bg-destructive/5"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="truncate">{user ? tr("logout") : tr("loginRegister")}</span>
          </button>
        </nav>
      </aside>

      {/* ===== MOBILE DRAWER (only on mobile — desktop uses permanent sidebar) ===== */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[90] flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-10 border-2 border-primary/20 overflow-hidden">
                  {user?.logoImage ? (
                    <img src={user.logoImage} alt={user.name || ""} className="size-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{user?.name || "Pengguna"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || "Belum login"}</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="grid size-8 place-items-center rounded-full hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            {user?.role === "admin" && (
              <div className="px-4 pt-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                  <ShieldCheck className="size-3" /> Admin
                </span>
              </div>
            )}
            <nav className="px-1.5 py-1">
              <p className="px-2.5 pb-0.5 pt-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">Iklan & Transaksi</p>
              {[
                ...(user?.role === "admin" ? [{ icon: ShieldCheck, label: tr("adminPanel"), action: () => { goToAdmin(); setDrawerOpen(false); }, navigate: true, key: "admin" }] : []),
                { icon: LayoutDashboard, label: "Dashboard", action: () => { goToDashboard(); setPanel(null); setDrawerOpen(false); }, navigate: true, key: "dashboard" },
                { icon: Tag, label: tr("profMyAds"), action: () => { setPanel("iklan-saya"); setDrawerOpen(false); }, navigate: false, key: "iklan-saya" },
                { icon: Heart, label: tr("myFavorites"), action: () => { setPanel("favorit-saya"); setDrawerOpen(false); }, navigate: false, key: "favorit-saya" },
                { icon: MessageSquare, label: tr("messages"), action: () => { setPanel("pesan"); setDrawerOpen(false); }, navigate: false, key: "pesan" },
                { icon: Wallet, label: tr("wallet"), action: () => { setPanel("saldo"); setDrawerOpen(false); }, navigate: false, key: "saldo" },
              ].map((m, i) => {
                const isActive = panel === m.key;
                return (
                  <button
                    key={i}
                    onClick={m.action}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition",
                      isActive ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
                    )}
                  >
                    <m.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{m.label}</span>
                    {m.key === "pesan" && unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadCount}</span>
                    )}
                  </button>
                );
              })}
              <p className="px-2.5 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">Akun & Keamanan</p>
              {[
                { icon: Bell, label: tr("notifications"), action: () => { setPanel("notifikasi"); setDrawerOpen(false); }, key: "notifikasi" },
                { icon: Lock, label: tr("security"), action: () => { setPanel("keamanan"); setDrawerOpen(false); }, key: "keamanan" },
                { icon: Settings, label: tr("settings"), action: () => { setPanel("pengaturan"); setDrawerOpen(false); }, key: "pengaturan" },
              ].map((m, i) => {
                const isActive = panel === m.key;
                return (
                  <button
                    key={i}
                    onClick={m.action}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition",
                      isActive ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
                    )}
                  >
                    <m.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
              <p className="px-2.5 pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">Bantuan</p>
              <button
                onClick={() => { setPanel("bantuan"); setDrawerOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition",
                  panel === "bantuan" ? "bg-primary font-semibold text-primary-foreground" : "text-foreground/80 hover:bg-accent"
                )}
              >
                <HelpCircle className="size-3.5 shrink-0" />
                <span className="truncate">{tr("help")}</span>
              </button>
              <button
                onClick={() => { setDrawerOpen(false); if (user) { logout(); toast.success(tr("profLogoutSuccess")); goHome(); } else { goToLogin(); } }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-destructive transition hover:bg-destructive/5"
              >
                <LogOut className="size-3.5 shrink-0" />
                <span className="truncate">{user ? tr("logout") : tr("loginRegister")}</span>
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* ===== MAIN CONTENT (next to permanent sidebar on desktop) ===== */}
      <main className={cn("min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6", panel === "pesan" && "max-md:px-0 max-md:pt-2 max-md:pb-0")}>
        {/* breadcrumb — hidden on mobile when Pesan (cleaner chat view) */}
        <div className={cn("mb-4 flex items-center gap-1 text-xs text-muted-foreground", panel === "pesan" && "max-md:hidden")}>
          <button onClick={goHome} className="hover:text-primary">{tr("home2")}</button>
          <ChevronRight className="size-3" />
          <span className="text-foreground">{tr("account")}</span>
        </div>

        {/* Header — greeting + date + motivation + stat cards (HANYA di overview profil, panel === null) */}
        {panel === null && (
        <div className="mb-5">
          {/* Mobile: full-width orange header with semicircle bottom */}
          <div className="-mx-4 -mt-4 overflow-hidden md:mx-0 md:mt-0">
            {/* Orange gradient header */}
            <div className="relative bg-gradient-to-br from-primary to-orange-600 px-5 pb-6 pt-4 text-primary-foreground md:rounded-xl md:border md:border-border md:shadow-md md:px-6 md:pt-6 md:pb-6">
              {/* Mobile hamburger — positioned inside orange header */}
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Menu"
                className="absolute right-4 top-3.5 grid size-10 place-items-center rounded-lg bg-white/15 backdrop-blur-sm transition hover:bg-white/25 md:hidden"
              >
                <Menu className="size-5" />
              </button>
              {(() => {
                const now = new Date();
                const h = now.getHours();
                const greeting = h < 11 ? "Selamat Pagi" : h < 15 ? "Selamat Siang" : h < 18 ? "Selamat Sore" : "Selamat Malam";
                const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                return (
                  <div>
                    <p className="text-base font-medium text-primary-foreground/80">{greeting},</p>
                    <h1 className="text-3xl font-extrabold sm:text-3xl">Halo, {user?.name?.split(" ")[0] || "Pengguna"}</h1>
                    <p className="mt-1 text-sm text-primary-foreground/70 sm:text-base">{dateStr}</p>
                  </div>
                );
              })()}
            </div>
            {/* Semicircle curve (flipped/concave) — mobile only */}
            <div className="-mt-px md:hidden">
              <svg viewBox="0 0 400 50" preserveAspectRatio="none" className="block h-10 w-full">
                <path d="M0,0 L0,50 Q200,0 400,50 L400,0 Z" fill="#F57C00" />
              </svg>
            </div>
          </div>

          {/* Motivasi — di luar kotak oranye, berubah setiap refresh */}
          {(() => {
            const motivations = [
              "Mesin yang terawat adalah aset yang menghasilkan. Rawat, jual, untung!",
              "Setiap iklan yang jujur membangun kepercayaan pembeli industri.",
              "Harga wajar + foto jelas = iklan cepat laku di Gomesin.",
              "Jangan takut bersaing. Mesin berkualitas selalu dicari pembeli.",
              "Sukses dimulai dari iklan pertama. Pasang iklan Anda hari ini!",
              "Pembeli industri mencari mesin siap pakai. Pastikan mesin Anda ready.",
              "Transaksi aman = bisnis berkelanjutan. Selalu survei sebelum bayar.",
              "Update foto mesin secara berkala agar iklan selalu terlihat segar.",
              "Deskripsi lengkap menarik pembeli serius, bukan cuma penasaran.",
              "Konsistensi penjual adalah kunci repeater order di dunia industri.",
              "Mesin second berkualitas punya pasar. Tampilkan kelebihannya jujur.",
              "Satu chat balasan cepat = satu peluang deal lebih dekat.",
            ];
            const motivation = mounted ? motivations[Math.floor(Math.random() * motivations.length)] : motivations[0];
            return (
              <p className="mt-3 text-sm font-bold leading-relaxed text-muted-foreground sm:text-base" suppressHydrationWarning>
                💡 <span className="font-bold text-foreground">Motivasi hari ini:</span> {motivation}
              </p>
            );
          })()}

          {/* Stat cards — Nilai Aset, Iklan Terjual, Total Iklan, Total Biaya Pasang Iklan */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(() => {
              const totalValue = myListings.reduce((a: number, l: any) => a + (Number(l.price) || 0), 0);
              const soldCount = myListings.filter((l: any) => l.status === "sold").length;
              const totalAdFee = myListings.reduce((sum: number, l: any) => sum + (paketMap[l.packageType]?.price ?? 0), 0);
              const stats = [
                { label: "Nilai Aset", value: formatRupiahFull(totalValue), icon: Wallet, color: "text-orange-600" },
                { label: "Iklan Terjual", value: soldCount.toLocaleString("id-ID"), icon: CheckCircle2, color: "text-blue-500" },
                { label: "Total Iklan", value: myAdsCount.toLocaleString("id-ID"), icon: Tag, color: "text-primary" },
                { label: "Biaya Pasang Iklan", value: formatRupiahFull(totalAdFee), icon: CreditCard, color: "text-amber-600" },
              ];
              return stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-3 sm:p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium leading-tight text-muted-foreground sm:text-[11px]">{s.label}</span>
                    <s.icon className={cn("size-4 shrink-0 sm:size-4", s.color)} />
                  </div>
                  <p className="mt-1 text-sm font-bold leading-tight sm:text-base">{s.value}</p>
                </div>
              ));
            })()}
          </div>

          {/* Contact info card — alamat, email, telepon */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 sm:p-3">
              <Home className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Alamat</p>
                <p className="truncate text-sm font-bold sm:text-base">{user?.city || "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 sm:p-3">
              <Phone className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Nomor Telepon</p>
                <p className="truncate text-sm font-bold sm:text-base">{user?.phone || "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 sm:p-3">
              <Mail className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Email</p>
                <p className="truncate text-sm font-bold sm:text-base">{user?.email || "-"}</p>
              </div>
            </div>
          </div>


        </div>
        )}

        {/* (mobile dropdown menu removed — replaced by hamburger drawer above) */}

        {/* Content Area — only render when a panel is open (no empty white box on overview) */}
        {panel !== null && (
        <div className={cn(
          "min-h-[400px]",
          (panel === "pesan" || panel === "iklan-saya" || panel === "favorit-saya" || panel === "saldo" || panel === "notifikasi" || panel === "keamanan" || panel === "pengaturan" || panel === "bantuan")
            ? "rounded-none border-0 p-0 bg-transparent"
            : "rounded-xl border border-border bg-card"
        )}>
          {panel === "iklan-saya" ? (
            /* Iklan Saya → render DashboardView inline (beside sidebar, with its own breadcrumb/header) */
            <DashboardView />
          ) : panel === "favorit-saya" ? (
            /* Favorit Saya → render FavoritesView inline (beside sidebar) */
            <FavoritesView />
          ) : panel !== null ? (
            <div className="h-full">
              {/* Panel header — hidden on mobile for full-page panels */}
              <div className={cn(
                "flex items-center justify-between border-b border-border p-3",
                (panel === "pesan" || panel === "saldo" || panel === "notifikasi" || panel === "keamanan" || panel === "pengaturan" || panel === "bantuan") && "max-md:hidden"
              )}>
                <h2 className="text-sm font-bold">{panelTitle[panel]}</h2>
                <button onClick={closePanel} className="grid size-7 place-items-center rounded-full hover:bg-accent">
                  <X className="size-4" />
                </button>
              </div>
              {/* Panel content — WhatsApp split view (pesan) / normal flow (other panels) */}
              <div className={cn(
                panel === "pesan"
                  ? "flex overflow-hidden h-[calc(100vh-12rem)] max-md:h-[calc(100dvh-11rem)]"
                  : "block"
              )}>

                {/* ===== LEFT: Conversation list (full pane on mobile, sidebar on desktop) ===== */}
                {panel === "pesan" && (
                  <div className={cn(
                    "flex-col border-r border-border bg-card w-full",
                    activeChatId !== null
                      ? "hidden md:flex md:w-[320px] md:shrink-0"
                      : "flex md:w-[320px] md:shrink-0"
                  )}>
                    {/* Search bar */}
                    <div className="border-b border-border bg-[#f0f2f5] p-2">
                      <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 shadow-sm">
                        <Search className="size-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Cari chat..."
                          className="flex-1 bg-transparent text-sm outline-none"
                        />
                      </div>
                    </div>
                    {/* Conversation list */}
                    <div className="flex-1 overflow-y-auto">
                      {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <MessageSquare className="size-12 text-muted-foreground/30" />
                          <p className="mt-3 text-sm font-semibold">Belum ada pesan</p>
                          <p className="mt-1 text-xs text-muted-foreground">Pesan dari pembeli akan muncul di sini.</p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setPanel(null); goToListings({}); }}>
                            Jelajahi iklan
                          </Button>
                        </div>
                      ) : (
                        conversations.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => openChat(c.id)}
                            onContextMenu={(e) => handleConvContextMenu(e, c.id)}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left transition border-b border-border/30",
                              activeChatId === c.id ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"
                            )}
                          >
                            <Avatar className="size-12 shrink-0 rounded-full">
                              {c.partnerImage ? (
                                <img src={c.partnerImage} alt={c.name} className="size-full rounded-full object-cover" />
                              ) : (
                                <AvatarFallback className="bg-[#075E54]/10 text-sm font-bold text-[#075E54]">
                                  {c.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                                <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.lastTime, mounted ? lang : "id")}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs text-muted-foreground">{c.lastMessage}</p>
                                {c.unread > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#25D366] text-[9px] font-bold text-white">{c.unread}</span>}
                              </div>
                              {c.listingTitle && <p className="mt-0.5 truncate text-[10px] text-[#075E54]">{c.listingTitle}</p>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* ===== Conversation context menu (right-click) ===== */}
                {convMenu.visible && (
                  <div
                    className="fixed z-[100] min-w-[180px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-up"
                    style={{ left: Math.min(convMenu.x, window.innerWidth - 200), top: Math.min(convMenu.y, window.innerHeight - 200) }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={handleBlockUser}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-accent"
                    >
                      <Ban className="size-4" /> Blokir Pengguna
                    </button>
                    <button
                      onClick={handleClearChat}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition hover:bg-accent"
                    >
                      <Eraser className="size-4" /> Bersihkan Chat
                    </button>
                    <button
                      onClick={handleDeleteChat}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-accent"
                    >
                      <Trash2 className="size-4" /> Hapus Chat
                    </button>
                  </div>
                )}

                {/* ===== RIGHT: Chat view or placeholder (full pane on mobile when chat open) ===== */}
                {panel === "pesan" && (
                  <div className={cn(
                    "flex-col bg-card w-full",
                    // Mobile: full width when a chat is open; hidden when no chat (list is shown)
                    // Desktop: flex-1 pane always visible
                    activeChatId !== null
                      ? "flex md:flex-1"
                      : "hidden md:flex md:flex-1"
                  )}>
                    {activeChatId !== null ? (() => {
                      const conv = conversations.find((c: any) => c.id === activeChatId);
                      if (!conv) return null;
                      const convo = chatMessages[activeChatId as any] || [];
                      return (
                        <>
                          {/* Chat header — light gray, back arrow on mobile only */}
                          <div className="flex items-center gap-2 border-b border-border bg-[#f0f2f5] p-2.5">
                            <button
                              onClick={() => setActiveChatId(null)}
                              aria-label="Kembali"
                              className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5 md:hidden"
                            >
                              <ChevronLeft className="size-5" />
                            </button>
                            <Avatar className="size-9 shrink-0 rounded-full md:size-10">
                              {conv.partnerImage ? (
                                <img src={conv.partnerImage} alt={conv.name} className="size-full rounded-full object-cover" />
                              ) : (
                                <AvatarFallback className="bg-[#075E54]/10 text-xs font-bold text-[#075E54]">
                                  {conv.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <p className="truncate text-sm font-bold text-foreground">{conv.name}</p>
                                <BadgeCheck className="size-3.5 shrink-0 text-[#075E54]" />
                              </div>
                              <p className="text-[10px] text-muted-foreground">online</p>
                            </div>
                          </div>
                          {/* Messages — listing shown as a chat bubble (not a banner) */}
                          <div
                            ref={chatScrollRef}
                            className="flex-1 space-y-1.5 overflow-y-auto p-4"
                            style={{
                              backgroundColor: "#e5ddd5",
                              backgroundImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.03) 1px, transparent 1px)",
                              backgroundSize: "20px 20px",
                            }}
                          >
                            <div className="flex justify-center py-1">
                              <span className="rounded-full bg-white/80 px-3 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">Hari ini</span>
                            </div>
                            {/* Listing as a chat bubble (left-aligned, from partner) */}
                            {conv.listingTitle && (
                              <div className="flex justify-start">
                                <div className="max-w-[75%] overflow-hidden rounded-lg rounded-tl-sm bg-white shadow-sm">
                                  {conv.listingImage ? (
                                    <img src={conv.listingImage} alt={conv.listingTitle} className="max-h-44 w-full object-cover" />
                                  ) : (
                                    <div className="flex h-20 items-center justify-center bg-muted text-muted-foreground">
                                      <Tag className="size-6" />
                                    </div>
                                  )}
                                  <div className="p-2">
                                    <p className="truncate text-xs font-semibold text-foreground">{conv.listingTitle}</p>
                                    {conv.listingPrice != null && (
                                      <p className="text-xs font-bold text-[#075E54]">Rp {conv.listingPrice.toLocaleString("id-ID")}</p>
                                    )}
                                    <span className="mt-0.5 block text-right text-[9px] text-muted-foreground/60">
                                      {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Chat messages */}
                            {convo.map((c, i) => {
                              // Detect emoji-only messages (render big, WhatsApp-style)
                              const isEmojiOnly = !!c.content && c.content.trim().length > 0 && /^[\s\p{Extended_Pictographic}\u200d\ufe0f]+$/u.test(c.content.trim()) && c.content.trim().length <= 12;
                              return (
                              <div key={i} className={c.role === "user" ? "flex justify-end" : "flex justify-start"}>
                                <div
                                  onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ visible: true, x: e.clientX, y: e.clientY, msgIndex: i }); }}
                                  onTouchStart={(e) => handleMsgLongPressStart(e, i)}
                                  onTouchEnd={handleMsgLongPressEnd}
                                  onTouchMove={handleMsgLongPressEnd}
                                  onMouseDown={(e) => handleMsgLongPressStart(e, i)}
                                  onMouseUp={handleMsgLongPressEnd}
                                  onMouseLeave={handleMsgLongPressEnd}
                                  className={cn(
                                    "rounded-lg shadow-sm select-none",
                                    isEmojiOnly
                                      ? cn(
                                          "px-2 py-1 bg-transparent shadow-none",
                                          c.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
                                        )
                                      : cn(
                                          "max-w-[70%] px-3 py-2 text-sm",
                                          c.role === "user"
                                            ? "rounded-tr-sm bg-[#dcf8c6] text-foreground"
                                            : "rounded-tl-sm bg-white text-foreground"
                                        )
                                  )}
                                >
                                  {c.image && (
                                    <img
                                      src={c.image}
                                      alt="Gambar"
                                      onClick={() => setLightbox(c.image!)}
                                      className="mb-1 max-h-48 cursor-pointer rounded-md object-cover transition hover:opacity-90"
                                    />
                                  )}
                                  {c.content && (
                                    <p className={cn(
                                      "whitespace-pre-wrap break-words",
                                      isEmojiOnly ? "text-3xl leading-tight" : ""
                                    )}>
                                      {c.animation ? (
                                        <span className="sticker-anim inline-block" data-anim={c.animation}>{c.content}</span>
                                      ) : c.content}
                                    </p>
                                  )}
                                  <span className={cn(
                                    "block text-right text-[9px] text-muted-foreground/60",
                                    isEmojiOnly ? "mt-1" : "mt-0.5"
                                  )}>
                                    {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                    {c.role === "user" && <span className="ml-1 text-blue-500">✓✓</span>}
                                  </span>
                                </div>
                              </div>
                              );
                            })}
                            {chatSending && (
                              <div className="flex justify-start">
                                <div className="flex items-center gap-1 rounded-lg rounded-tl-sm bg-white px-3 py-2.5 shadow-sm">
                                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground" />
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Image preview (before sending) */}
                          {pendingImage && (
                            <div className="flex items-center gap-2 border-t border-border bg-white p-2">
                              <img src={pendingImage} alt="Preview" className="size-16 rounded-lg object-cover" />
                              <button
                                type="button"
                                onClick={() => setPendingImage(null)}
                                className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                              >
                                <XIcon className="size-4" />
                              </button>
                              <p className="text-xs text-muted-foreground">Gambar siap dikirim</p>
                            </div>
                          )}
                          {/* Emoji picker popover — full emoji library (large native emoji, search, categories) */}
                          {showEmoji && (
                            <div className="border-t border-border bg-white">
                              <EmojiPicker
                                onEmojiClick={(emoji) => { setChatInput((prev) => prev + emoji.emoji); }}
                                emojiStyle={EmojiStyle.NATIVE}
                                theme={Theme.LIGHT}
                                width="100%"
                                height={280}
                                previewConfig={{ showPreview: false }}
                                searchPlaceHolder="Cari emoji..."
                                lazyLoadEmojis
                                skinTonesDisabled
                              />
                            </div>
                          )}
                          {/* GIF / Sticker picker popover — animated emoji stickers */}
                          {showGifs && (
                            <div className="flex h-[280px] flex-col border-t border-border bg-white">
                              <div className="border-b border-border p-2">
                                <input
                                  type="text"
                                  value={gifQuery}
                                  onChange={(e) => setGifQuery(e.target.value)}
                                  placeholder="Cari sticker (senang, sedih, halo, cinta, terima)..."
                                  className="h-8 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm outline-none focus:border-primary"
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto p-2">
                                {gifLoading && gifResults.length === 0 ? (
                                  <div className="grid place-items-center py-8 text-muted-foreground">
                                    <Loader2 className="size-5 animate-spin" />
                                    <p className="mt-2 text-xs">Memuat sticker...</p>
                                  </div>
                                ) : gifResults.length === 0 ? (
                                  <div className="grid place-items-center py-8 text-center text-muted-foreground">
                                    <Sticker className="size-8 text-muted-foreground/30" />
                                    <p className="mt-2 text-xs">Tidak ada sticker ditemukan</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                                    {gifResults.map((g) => (
                                      <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => sendGif({ emoji: g.emoji, animation: g.animation })}
                                        title={g.label}
                                        className="group grid aspect-square place-items-center rounded-lg bg-muted/30 text-3xl transition hover:bg-primary/10 hover:scale-110"
                                      >
                                        <span className="sticker-anim" data-anim={g.animation}>{g.emoji}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Hidden file input for image attachment (gallery) */}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                          {/* Hidden file input for camera capture */}
                          <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                          {/* Input — emoji + text field with paperclip inside + send button */}
                          <form
                            onSubmit={(e) => { e.preventDefault(); sendChat(); }}
                            className="flex items-center gap-1 bg-[#f0f2f5] p-2"
                          >
                            <button
                              type="button"
                              onClick={() => setShowEmoji((v) => !v)}
                              aria-label="Emoji"
                              className={cn(
                                "grid size-10 shrink-0 place-items-center rounded-full hover:bg-black/5",
                                showEmoji ? "text-[#075E54]" : "text-muted-foreground"
                              )}
                            >
                              <Smile className="size-5" />
                            </button>
                            {/* Text field with paperclip + camera icons inside (right side) */}
                            <div className="relative flex-1">
                              <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Tulis pesan..."
                                className="h-10 w-full rounded-lg border border-transparent bg-white pr-20 pl-4 text-sm outline-none shadow-sm"
                                disabled={chatSending}
                              />
                              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  aria-label="Lampirkan gambar"
                                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-black/5"
                                >
                                  <Paperclip className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cameraInputRef.current?.click()}
                                  aria-label="Buka kamera"
                                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-black/5"
                                >
                                  <Camera className="size-4" />
                                </button>
                              </div>
                            </div>
                            <Button
                              type="submit"
                              size="icon"
                              className="size-10 shrink-0 rounded-full bg-[#075E54] hover:bg-[#054c42]"
                              disabled={chatSending || (!chatInput.trim() && !pendingImage)}
                            >
                              {chatSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 text-white" />}
                            </Button>
                          </form>
                          {/* Message context menu (long-press / right-click) — delete */}
                          {msgMenu.visible && (
                            <>
                              <div className="fixed inset-0 z-[70]" onClick={() => setMsgMenu({ visible: false, x: 0, y: 0, msgIndex: null })} />
                              <div
                                className="fixed z-[71] min-w-[160px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl animate-fade-up"
                                style={{ left: Math.min(msgMenu.x, window.innerWidth - 180), top: Math.min(msgMenu.y, window.innerHeight - 100) }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={deleteMessage}
                                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-accent"
                                >
                                  <Trash2 className="size-4" /> Hapus Pesan
                                </button>
                              </div>
                            </>
                          )}
                          {/* Image lightbox — click image to view full size */}
                          {lightbox && (
                            <div
                              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
                              onClick={() => setLightbox(null)}
                            >
                              <button
                                aria-label="Tutup"
                                className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                              >
                                <XIcon className="size-6" />
                              </button>
                              <img
                                src={lightbox}
                                alt="Gambar besar"
                                className="max-h-[90vh] max-w-full rounded-lg object-contain"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      /* Placeholder when no chat selected */
                      <div className="flex flex-1 flex-col items-center justify-center bg-[#f0f2f5]">
                        <div className="text-center">
                          <MessageCircle className="mx-auto size-16 text-muted-foreground/20" />
                          <p className="mt-4 text-lg font-light text-muted-foreground">Gomesin Web</p>
                          <p className="mt-1 text-xs text-muted-foreground/60">Pilih chat di sebelah kiri untuk mulai pesan</p>
                          <p className="mt-1 text-[10px] text-muted-foreground/40">Pesan terenkripsi end-to-end</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {/* PESANAN */}
            {panel === "pesanan" && (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">{o.id}</p>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        o.status === tr("profOrderSelesai") ? "bg-orange-100 text-orange-700" :
                        o.status === tr("profOrderDiproses") ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      )}>{o.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{o.item}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {o.date}</span>
                      <span className="font-bold text-foreground">{o.total}</span>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="mt-2 w-full" onClick={() => goToListings({})}>
                  Lihat iklan lain
                </Button>
              </div>
            )}

            {/* RIWAYAT PEMBAYARAN — user-friendly: summary stats + filter tabs + card list */}
            {panel === "saldo" && (() => {
              const totalAdFee = myListings.reduce((sum: number, l: any) => sum + (paketMap[l.packageType]?.price ?? 0), 0);
              const paidCount = myListings.filter((l: any) => l.paymentStatus === "paid").length;
              const pendingCount = myListings.filter((l: any) => l.paymentStatus !== "paid").length;
              const filtered = payFilter === "paid" ? myListings.filter((l: any) => l.paymentStatus === "paid")
                : payFilter === "pending" ? myListings.filter((l: any) => l.paymentStatus !== "paid")
                : myListings;
              return (
                <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
                  {/* Summary — 3 stat cards */}
                  <div className="grid grid-cols-3 gap-3 md:gap-5">
                    <div className="rounded-xl border border-border bg-card p-4 text-center md:p-6">
                      <p className="text-xs text-muted-foreground md:text-base">Total Bayar</p>
                      <p className="mt-1 text-lg font-extrabold text-primary md:text-3xl">Rp {totalAdFee.toLocaleString("id-ID")}</p>
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center md:p-6">
                      <p className="text-xs text-orange-700 md:text-base">Lunas</p>
                      <p className="mt-1 text-lg font-extrabold text-orange-700 md:text-3xl">{paidCount}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center md:p-6">
                      <p className="text-xs text-amber-700 md:text-base">Pending</p>
                      <p className="mt-1 text-lg font-extrabold text-amber-700 md:text-3xl">{pendingCount}</p>
                    </div>
                  </div>

                  {/* Filter tabs + view toggle */}
                  {myAdsCount > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { v: "all", l: `Semua (${myAdsCount})` },
                          { v: "paid", l: `Lunas (${paidCount})` },
                          { v: "pending", l: `Pending (${pendingCount})` },
                        ].map((t) => (
                          <button
                            key={t.v}
                            onClick={() => setPayFilter(t.v as any)}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-xs font-medium transition md:text-sm",
                              payFilter === t.v
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "border border-border bg-card text-muted-foreground hover:bg-accent"
                            )}
                          >
                            {t.l}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex overflow-hidden rounded-lg border border-border">
                          <button type="button" onClick={() => setPayViewMode("grid")}
                            className={cn("grid size-8 place-items-center transition", payViewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
                            aria-label="Grid"><LayoutGrid className="size-4" /></button>
                          <button type="button" onClick={() => setPayViewMode("line")}
                            className={cn("grid size-8 place-items-center border-l border-border transition", payViewMode === "line" ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-accent")}
                            aria-label="Line"><List className="size-4" /></button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Listing cards — grid 2 col mobile, 3 col tablet, 4-5 col desktop */}
                  <div>
                    {myAdsCount > 0 ? (
                      payViewMode === "grid" ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {filtered.map((l: any) => {
                          let imgs: string[] = [];
                          try { imgs = Array.isArray(l.images) ? l.images : JSON.parse(l.images || "[]"); } catch {}
                          const pkgName = l.packageType === "spotlight" ? "Titanium" : l.packageType === "highlight" ? "Platinum" : l.packageType === "sundul" ? "Colek" : "Gold";
                          const pkgColor = l.packageType === "spotlight" ? "bg-amber-100 text-amber-700" : l.packageType === "highlight" ? "bg-orange-100 text-orange-700" : l.packageType === "sundul" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";
                          const isPaid = l.paymentStatus === "paid";
                          return (
                            <div key={l.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:shadow-md">
                              {/* Image — top, full width */}
                              <div className="relative aspect-video w-full overflow-hidden bg-muted">
                                {imgs[0] ? (
                                  <img src={imgs[0]} alt={l.title} className="size-full object-cover" />
                                ) : (
                                  <div className="grid size-full place-items-center text-muted-foreground"><Tag className="size-10" /></div>
                                )}
                                <span className={cn(
                                  "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow md:text-xs",
                                  pkgColor
                                )}>{pkgName}</span>
                                <span className={cn(
                                  "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow md:text-xs",
                                  isPaid ? "bg-orange-500 text-white" : "bg-amber-500 text-white"
                                )}>
                                  {isPaid ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                                  {isPaid ? "Lunas" : "Pending"}
                                </span>
                              </div>
                              {/* Info — bottom */}
                              <div className="flex flex-col p-3 md:p-4">
                                <p className="line-clamp-2 text-sm font-bold leading-tight md:text-base">{l.title}</p>
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
                                  <Clock className="size-3" />
                                  {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                                <div className="mt-2 flex items-end justify-between border-t border-border/50 pt-2">
                                  <p className="text-[10px] text-muted-foreground md:text-xs">Harga Iklan</p>
                                  <p className="text-base font-extrabold text-primary md:text-lg">{formatAdFee(l.packageType)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {filtered.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border p-8 text-center">
                            <p className="text-sm text-muted-foreground">Tidak ada iklan dengan status ini.</p>
                          </div>
                        )}
                      </div>
                      ) : (
                      <div className="overflow-x-auto rounded-xl border border-border bg-card">
                        <table className="w-full min-w-[480px]">
                          <thead>
                            <tr className="border-b border-border bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
                              <th className="p-2">Iklan</th>
                              <th className="p-2">Paket</th>
                              <th className="hidden p-2 sm:table-cell">Tanggal</th>
                              <th className="p-2 text-right">Harga Iklan</th>
                              <th className="p-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((l: any) => {
                              let imgs: string[] = [];
                              try { imgs = Array.isArray(l.images) ? l.images : JSON.parse(l.images || "[]"); } catch {}
                              const pkgName = l.packageType === "spotlight" ? "Titanium" : l.packageType === "highlight" ? "Platinum" : l.packageType === "sundul" ? "Colek" : "Gold";
                              const pkgColor = l.packageType === "spotlight" ? "bg-amber-100 text-amber-700" : l.packageType === "highlight" ? "bg-orange-100 text-orange-700" : l.packageType === "sundul" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";
                              const isPaid = l.paymentStatus === "paid";
                              return (
                                <tr key={l.id} className="border-b border-border transition hover:bg-accent/30">
                                  <td className="p-2">
                                    <div className="flex items-center gap-2">
                                      {imgs[0] ? <img src={imgs[0]} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Tag className="size-4 text-muted-foreground" /></div>}
                                      <p className="line-clamp-1 text-xs font-semibold">{l.title}</p>
                                    </div>
                                  </td>
                                  <td className="p-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", pkgColor)}>{pkgName}</span></td>
                                  <td className="hidden p-2 text-xs text-muted-foreground sm:table-cell">{new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</td>
                                  <td className="p-2 text-right text-xs font-bold text-primary">{formatAdFee(l.packageType)}</td>
                                  <td className="p-2 text-center"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", isPaid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{isPaid ? "Lunas" : "Pending"}</span></td>
                                </tr>
                              );
                            })}
                            {filtered.length === 0 && (
                              <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">Tidak ada iklan dengan status ini.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      )
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-10 text-center">
                        <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
                          <Tag className="size-7 text-muted-foreground/50" />
                        </div>
                        <p className="mt-3 text-base font-semibold">Belum ada iklan dipasang</p>
                        <p className="mt-1 text-sm text-muted-foreground">Pasang iklan pertama Anda dan riwayat pembayaran akan muncul di sini.</p>
                        <Button className="mt-4 gap-1.5" onClick={goToPost}>
                          <Plus className="size-4" /> Pasang Iklan
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* NOTIFIKASI */}
            {panel === "notifikasi" && (() => {
              const unreadCount = notifications.filter((n) => n.unread).length;
              return (
                <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold md:text-lg">Notifikasi</p>
                      <p className="text-sm text-muted-foreground">{unreadCount} belum dibaca dari {notifications.length} total</p>
                    </div>
                    {unreadCount > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { toast.success("Semua notifikasi ditandai dibaca"); }}>
                        Tandai dibaca
                      </Button>
                    )}
                  </div>

                  {/* Notification list */}
                  {notifications.length > 0 ? (
                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div key={n.id} className={cn(
                          "flex items-start gap-3 rounded-xl border bg-card p-4 transition hover:shadow-sm md:p-5",
                          n.unread ? "border-primary/30 bg-primary/5" : "border-border"
                        )}>
                          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-muted md:size-12", n.color)}>
                            <n.icon className="size-5 md:size-6" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold md:text-base">{n.title}</p>
                              <span className="shrink-0 text-[10px] text-muted-foreground md:text-xs">{n.time}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{n.desc}</p>
                          </div>
                          {n.unread && (
                            <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-10 text-center">
                      <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
                        <Bell className="size-7 text-muted-foreground/50" />
                      </div>
                      <p className="mt-3 text-base font-semibold">Belum ada notifikasi</p>
                      <p className="mt-1 text-sm text-muted-foreground">Notifikasi tentang pesan, iklan, dan pembayaran akan muncul di sini.</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* KEAMANAN */}
            {panel === "keamanan" && (() => {
              // Security score calculation
              const checks = [
                { label: tr("profEmailVerified"), passed: !!user?.email },
                { label: tr("profPhoneVerified"), passed: !!user?.phone },
                { label: tr("prof2FA"), passed: twoFAEnabled },
                { label: tr("profLoginAlertsOn"), passed: loginAlerts },
              ];
              const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
              const scoreColor = score >= 75 ? "text-orange-600" : score >= 50 ? "text-amber-600" : "text-red-600";
              const scoreBg = score >= 75 ? "[&>div]:bg-orange-500" : score >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";
              const loginHistory = [
                { device: "Chrome — Windows", loc: "Jakarta, ID", time: tr("profTimeNow"), current: true, ip: "103.10.x.x" },
                { device: "Safari — iPhone", loc: "Jakarta, ID", time: tr("profTime2h"), current: false, ip: "103.10.x.x" },
                { device: "Chrome — Android", loc: "Bandung, ID", time: tr("profTimeYesterday"), current: false, ip: "36.71.x.x" },
              ];

              return (
                <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
                  {/* Security Score Card */}
                  <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-orange-500/5 p-5 md:p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-12 place-items-center rounded-lg bg-card shadow-sm md:size-14", scoreColor)}>
                          <Shield className="size-6 md:size-7" />
                        </span>
                        <div>
                          <p className="text-base font-bold md:text-lg">Skor Keamanan</p>
                          <p className="text-sm text-muted-foreground md:text-base">{score >= 75 ? "Akun terlindungi" : score >= 50 ? "Cukup aman" : "Perlu diperkuat"}</p>
                        </div>
                      </div>
                      <span className={cn("text-3xl font-extrabold md:text-4xl", scoreColor)}>{score}%</span>
                    </div>
                    <Progress value={score} className={cn("mt-4 h-2.5 md:h-3", scoreBg)} />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {checks.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm md:text-base">
                          {c.passed ? (
                            <CheckCircle2 className="size-4 shrink-0 text-orange-500 md:size-5" />
                          ) : (
                            <AlertTriangle className="size-4 shrink-0 text-amber-500 md:size-5" />
                          )}
                          <span className={c.passed ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Change Password */}
                  <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                    <button
                      onClick={() => setShowPasswordForm(!showPasswordForm)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary md:size-12">
                        <KeyRound className="size-5 md:size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold md:text-lg">Ubah Kata Sandi</p>
                        <p className="truncate text-sm text-muted-foreground md:text-base">Perbarui kata sandi akun Anda</p>
                      </div>
                      <ChevronRight className={cn("size-5 text-muted-foreground transition md:size-6", showPasswordForm && "rotate-90")} />
                    </button>
                    {showPasswordForm && (
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground md:text-base">Kata Sandi Lama</Label>
                          <Input
                            type="password"
                            value={currentPass}
                            onChange={(e) => setCurrentPass(e.target.value)}
                            placeholder="••••••••"
                            className="h-10 text-sm md:h-11 md:text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground md:text-base">Kata Sandi Baru</Label>
                          <Input
                            type="password"
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            placeholder="Min. 6 karakter"
                            className="h-10 text-sm md:h-11 md:text-base"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground md:text-base">Ulangi Kata Sandi Baru</Label>
                          <Input
                            type="password"
                            value={confirmPass}
                            onChange={(e) => setConfirmPass(e.target.value)}
                            placeholder="Ulangi kata sandi baru"
                            className="h-10 text-sm md:h-11 md:text-base"
                          />
                          {confirmPass && newPass !== confirmPass && (
                            <p className="text-sm text-destructive md:text-base">Kata sandi tidak cocok</p>
                          )}
                        </div>
                        <Button
                          className="w-full md:h-11"
                          disabled={savingPass || !currentPass || !newPass || newPass !== confirmPass}
                          onClick={async () => {
                            if (!user?.id) return;
                            setSavingPass(true);
                            try {
                              const res = await fetch("/api/auth/password", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: user.id,
                                  currentPassword: currentPass,
                                  newPassword: newPass,
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok) {
                                toast.error(data.error || tr("profPasswordChangeFailed"));
                                return;
                              }
                              toast.success(tr("profPasswordChanged"));
                              setShowPasswordForm(false);
                              setCurrentPass("");
                              setNewPass("");
                              setConfirmPass("");
                            } catch {
                              toast.error(tr("profConnectionFailed"));
                            } finally {
                              setSavingPass(false);
                            }
                          }}
                        >
                          {savingPass ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                          {savingPass ? tr("profSaving") : tr("profChangePassword")}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* 2FA Toggle */}
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 md:p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary md:size-12">
                      <Smartphone className="size-5 md:size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold md:text-lg">Autentikasi Dua Faktor</p>
                      <p className="truncate text-sm text-muted-foreground md:text-base">
                        {twoFAEnabled ? tr("prof2FAOn") : tr("prof2FAOff")}
                      </p>
                    </div>
                    <Switch
                      checked={twoFAEnabled}
                      onCheckedChange={(v) => {
                        setTwoFAEnabled(v);
                        toast.success(v ? "2FA berhasil diaktifkan" : "2FA dinonaktifkan");
                      }}
                    />
                  </div>

                  {/* Login Alerts Toggle */}
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 md:p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary md:size-12">
                      <BellRing className="size-5 md:size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold md:text-lg">Notifikasi Login</p>
                      <p className="truncate text-sm text-muted-foreground md:text-base">
                        {loginAlerts ? tr("profAlertsOn") : tr("profAlertsOff")}
                      </p>
                    </div>
                    <Switch
                      checked={loginAlerts}
                      onCheckedChange={(v) => {
                        setLoginAlerts(v);
                        toast.success(v ? tr("profLoginAlertsEnabled") : tr("profLoginAlertsDisabled"));
                      }}
                    />
                  </div>

                  {/* Email & Phone Verification Status */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={cn("flex items-center gap-3 rounded-xl border p-4 md:p-5", user?.email ? "border-orange-200 bg-orange-50" : "border-amber-200 bg-amber-50")}>
                      <Mail className={cn("size-5 shrink-0 md:size-6", user?.email ? "text-orange-600" : "text-amber-600")} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold md:text-base">Email</p>
                        <p className={cn("truncate text-xs md:text-sm", user?.email ? "text-orange-700" : "text-amber-700")}>
                          {user?.email ? tr("profVerified") : tr("profNotVerified")}
                        </p>
                      </div>
                      <CheckCircle2 className={cn("ml-auto size-5 shrink-0 md:size-6", user?.email ? "text-orange-600" : "text-amber-600/40")} />
                    </div>
                    <div className={cn("flex items-center gap-3 rounded-xl border p-4 md:p-5", user?.phone ? "border-orange-200 bg-orange-50" : "border-amber-200 bg-amber-50")}>
                      <Smartphone className={cn("size-5 shrink-0 md:size-6", user?.phone ? "text-orange-600" : "text-amber-600")} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold md:text-base">Nomor HP</p>
                        <p className={cn("truncate text-xs md:text-sm", user?.phone ? "text-orange-700" : "text-amber-700")}>
                          {user?.phone ? tr("profVerified") : tr("profNotVerified")}
                        </p>
                      </div>
                      <CheckCircle2 className={cn("ml-auto size-5 shrink-0 md:size-6", user?.phone ? "text-orange-600" : "text-amber-600/40")} />
                    </div>
                  </div>

                  {/* Login History */}
                  <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                    <button
                      onClick={() => setShowLoginHistory(!showLoginHistory)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary md:size-12">
                        <Monitor className="size-5 md:size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold md:text-lg">Riwayat Login</p>
                        <p className="truncate text-sm text-muted-foreground md:text-base">Lihat aktivitas login akun</p>
                      </div>
                      <ChevronRight className={cn("size-5 text-muted-foreground transition md:size-6", showLoginHistory && "rotate-90")} />
                    </button>
                    {showLoginHistory && (
                      <div className="mt-4 space-y-2.5 border-t border-border pt-4">
                        {loginHistory.map((h, i) => (
                          <div key={i} className={cn("flex items-start gap-3 rounded-lg p-3 md:p-4", h.current ? "bg-orange-50" : "bg-secondary/40")}>
                            <Monitor className="mt-0.5 size-5 shrink-0 text-muted-foreground md:size-6" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold md:text-base">{h.device}</p>
                                {h.current && (
                                  <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white md:text-xs">SEKARANG</span>
                                )}
                              </div>
                              <p className="flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
                                <MapPin className="size-3.5" /> {h.loc} · {h.ip}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground md:text-sm">{h.time}</span>
                          </div>
                        ))}
                        <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/5" onClick={() => toast.success("Semua sesi lain telah diakhiri")}>
                          <LogOut className="size-4" /> Akhiri Semua Sesi Lain
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* PENGATURAN */}
            {panel === "pengaturan" && (
              <div className="mx-auto max-w-5xl space-y-3 p-0 md:space-y-5 md:p-8">
                {/* Banner & Logo upload */}
                <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                  <p className="mb-4 text-base font-bold md:text-lg">Banner &amp; Logo Perusahaan</p>
                  <p className="mb-4 text-xs text-muted-foreground">Unggah banner dan logo yang akan tampil di halaman penjual iklan Anda dan dashboard iklan.</p>

                  {/* Banner preview + upload */}
                  <div className="mb-5">
                    <Label className="mb-1.5 block text-sm text-muted-foreground">Banner (16:5 / 16:4)</Label>
                    <div className="relative aspect-[16/5] w-full overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted">
                      {pendingBanner ? (
                        <img src={pendingBanner} alt="Banner" className="size-full object-cover" />
                      ) : user?.bannerImage ? (
                        <img src={user.bannerImage} alt="Banner" className="size-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          <ImageIcon className="mr-1 size-4" /> Belum ada banner
                        </div>
                      )}
                      {pendingBanner && (
                        <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">Belum disimpan</span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="upload-banner"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBannerUploading(true);
                        try {
                          const compressed = await compressBannerImage(file, true);
                          if (!compressed) { toast.error("Gagal kompres banner"); return; }
                          setPendingBanner(compressed);
                          toast.success("Banner siap disimpan");
                        } catch (err: any) { toast.error("Gagal upload banner: " + (err?.message || "")); }
                        finally { setBannerUploading(false); }
                        e.target.value = "";
                      }}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={bannerUploading}
                        onClick={() => document.getElementById("upload-banner")?.click()}
                      >
                        {bannerUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                        {bannerUploading ? "Mengunggah..." : user?.bannerImage || pendingBanner ? "Ganti Banner" : "Unggah Banner"}
                      </Button>
                      {pendingBanner && (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={bannerUploading}
                          onClick={async () => {
                            if (!user?.id || !pendingBanner) return;
                            setBannerUploading(true);
                            try {
                              const res = await fetch("/api/upload-banner", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ image: pendingBanner }),
                              });
                              const data = await res.json();
                              if (!res.ok || !data.url) { toast.error(data.error || "Gagal upload banner"); return; }
                              const pres = await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: user.id, bannerImage: data.url }),
                              });
                              const pdata = await pres.json();
                              if (pres.ok && pdata.user) { setUser(pdata.user); setPendingBanner(null); toast.success("Banner disimpan"); }
                              else { toast.error(pdata.error || "Gagal simpan banner"); }
                            } catch { toast.error("Gagal simpan banner"); }
                            finally { setBannerUploading(false); }
                          }}
                        >
                          {bannerUploading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          Simpan Banner
                        </Button>
                      )}
                      {(user?.bannerImage || pendingBanner) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:bg-destructive/5"
                          disabled={bannerUploading}
                          onClick={async () => {
                            if (!user?.id) return;
                            setBannerUploading(true);
                            try {
                              const pres = await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: user.id, bannerImage: null }),
                              });
                              const pdata = await pres.json();
                              if (pres.ok && pdata.user) { setUser(pdata.user); setPendingBanner(null); toast.success("Banner dihapus"); }
                              else { toast.error("Gagal hapus banner"); }
                            } catch { toast.error("Gagal hapus banner"); }
                            finally { setBannerUploading(false); }
                          }}
                        >
                          <Trash2 className="size-4" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Logo preview + upload */}
                  <div>
                    <Label className="mb-1.5 block text-sm text-muted-foreground">Logo Perusahaan (kotak)</Label>
                    <div className="relative size-24 overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted">
                      {pendingLogo ? (
                        <img src={pendingLogo} alt="Logo" className="size-full object-cover" />
                      ) : user?.logoImage ? (
                        <img src={user.logoImage} alt="Logo" className="size-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                      {pendingLogo && (
                        <span className="absolute right-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">Belum disimpan</span>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="upload-logo"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setLogoUploading(true);
                        try {
                          const compressed = await compressBannerImage(file, false);
                          if (!compressed) { toast.error("Gagal kompres logo"); return; }
                          setPendingLogo(compressed);
                          toast.success("Logo siap disimpan");
                        } catch (err: any) { toast.error("Gagal upload logo: " + (err?.message || "")); }
                        finally { setLogoUploading(false); }
                        e.target.value = "";
                      }}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={logoUploading}
                        onClick={() => document.getElementById("upload-logo")?.click()}
                      >
                        {logoUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                        {logoUploading ? "Mengunggah..." : user?.logoImage || pendingLogo ? "Ganti Logo" : "Unggah Logo"}
                      </Button>
                      {pendingLogo && (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={logoUploading}
                          onClick={async () => {
                            if (!user?.id || !pendingLogo) return;
                            setLogoUploading(true);
                            try {
                              const res = await fetch("/api/upload-banner", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ image: pendingLogo }),
                              });
                              const data = await res.json();
                              if (!res.ok || !data.url) { toast.error(data.error || "Gagal upload logo"); return; }
                              const pres = await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: user.id, logoImage: data.url }),
                              });
                              const pdata = await pres.json();
                              if (pres.ok && pdata.user) { setUser(pdata.user); setPendingLogo(null); toast.success("Logo disimpan"); }
                              else { toast.error(pdata.error || "Gagal simpan logo"); }
                            } catch { toast.error("Gagal simpan logo"); }
                            finally { setLogoUploading(false); }
                          }}
                        >
                          {logoUploading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          Simpan Logo
                        </Button>
                      )}
                      {(user?.logoImage || pendingLogo) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:bg-destructive/5"
                          disabled={logoUploading}
                          onClick={async () => {
                            if (!user?.id) return;
                            setLogoUploading(true);
                            try {
                              const pres = await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: user.id, logoImage: null }),
                              });
                              const pdata = await pres.json();
                              if (pres.ok && pdata.user) { setUser(pdata.user); setPendingLogo(null); toast.success("Logo dihapus"); }
                              else { toast.error("Gagal hapus logo"); }
                            } catch { toast.error("Gagal hapus logo"); }
                            finally { setLogoUploading(false); }
                          }}
                        >
                          <Trash2 className="size-4" />
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-base font-bold md:text-lg">Profil</p>
                    {!editMode ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditName(user?.name || "");
                          setEditPhone(user?.phone || "");
                          setEditCity(user?.city || "");
                          setEditCompany(user?.company || "");
                          setEditAddress(user?.address || "");
                          setEditMode(true);
                        }}
                      >
                        <SlidersHorizontal className="size-4" /> Edit Profil
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setEditMode(false)}
                          disabled={savingProfile}
                        >
                          Batal
                        </Button>
                        <Button
                          disabled={savingProfile}
                          onClick={async () => {
                            if (!user?.id) return;
                            if (!editName.trim()) {
                              toast.error(tr("profNameEmpty"));
                              return;
                            }
                            setSavingProfile(true);
                            try {
                              const res = await fetch("/api/auth/profile", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: user.id,
                                  name: editName,
                                  phone: editPhone,
                                  city: editCity,
                                  company: editCompany,
                                  address: editAddress,
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok) {
                                toast.error(data.error || tr("profUpdateFailed"));
                                return;
                              }
                              setUser(data.user);
                              setEditMode(false);
                              toast.success(tr("profProfileUpdated"));
                            } catch {
                              toast.error(tr("profConnectionFailed"));
                            } finally {
                              setSavingProfile(false);
                            }
                          }}
                        >
                          {savingProfile ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          Simpan
                        </Button>
                      </div>
                    )}
                  </div>

                  {!editMode ? (
                    <div className="space-y-3 text-sm md:text-base">
                      <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Nama</span><span className="font-medium">{user?.name || "-"}</span></div>
                      <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Email</span><span className="max-w-[60%] truncate text-right font-medium">{user?.email || "-"}</span></div>
                      <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">No. HP</span><span className="font-medium">{user?.phone || "-"}</span></div>
                      <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Kota</span><span className="font-medium">{user?.city || "-"}</span></div>
                      <div className="flex justify-between border-b border-border/50 pb-2"><span className="text-muted-foreground">Nama Perusahaan</span><span className="font-medium">{user?.company || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Alamat Perusahaan</span><span className="max-w-[60%] truncate text-right font-medium">{user?.address || "-"}</span></div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">Nama</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nama lengkap"
                          className="h-10 text-sm md:h-11 md:text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">Email</Label>
                        <Input
                          value={user?.email || ""}
                          disabled
                          className="h-10 text-sm text-muted-foreground md:h-11 md:text-base"
                        />
                        <p className="text-xs text-muted-foreground md:text-sm">Email tidak dapat diubah</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">No. HP</Label>
                        <Input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="0812-xxxx-xxxx"
                          className="h-10 text-sm md:h-11 md:text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">Kota</Label>
                        <Input
                          value={editCity}
                          onChange={(e) => setEditCity(e.target.value)}
                          placeholder="Kota"
                          className="h-10 text-sm md:h-11 md:text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">Nama Perusahaan</Label>
                        <Input
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          placeholder="PT/CV/Toko (opsional)"
                          className="h-10 text-sm md:h-11 md:text-base"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm text-muted-foreground md:text-base">Alamat Perusahaan</Label>
                        <Input
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          placeholder="Jl. Contoh No. 123, Kota (opsional)"
                          className="h-10 text-sm md:h-11 md:text-base"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {/* Notifikasi & Suara */}
                <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                  <p className="mb-4 text-base font-bold md:text-lg">Notifikasi &amp; Suara</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 text-sm md:text-base">
                      <div className="flex items-center gap-2.5">
                        <Volume2 className="size-4 text-primary" />
                        <div>
                          <p className="font-medium">Bunyi Notifikasi Chat</p>
                          <p className="text-xs text-muted-foreground">Bunyi "Go mesin!" saat pesan masuk (seperti WhatsApp)</p>
                        </div>
                      </div>
                      <Switch
                        checked={chatSoundOn}
                        onCheckedChange={(v) => {
                          setChatSoundOn(v);
                          setChatSoundEnabled(v);
                          toast.success(v ? "Bunyi notifikasi chat diaktifkan" : "Bunyi notifikasi chat dimatikan");
                          if (v) playNotificationSound();
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm md:text-base">
                      <div className="flex items-center gap-2.5">
                        <Bell className="size-4 text-primary" />
                        <div>
                          <p className="font-medium">Notifikasi Pesanan</p>
                          <p className="text-xs text-muted-foreground">Pemberitahuan saat ada pesanan baru</p>
                        </div>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                {/* Bahasa */}
                <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                  <p className="mb-4 text-base font-bold md:text-lg">Bahasa</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { code: "id", label: "🇮🇩 Indonesia" },
                      { code: "en", label: "🇬🇧 English" },
                      { code: "zh", label: "🇨🇳 中文" },
                    ] as const).map((l) => (
                      <button
                        key={l.code}
                        onClick={() => setLang(l.code)}
                        className={cn(
                          "rounded-lg border-2 px-3 py-2 text-sm font-medium transition",
                          lang === l.code ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-accent"
                        )}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tentang */}
                <div className="rounded-xl border border-border bg-card p-5 md:p-6">
                  <p className="mb-3 text-base font-bold md:text-lg">Tentang Gomesin</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between"><span>Versi Aplikasi</span><span className="font-medium text-foreground">1.0.0</span></div>
                    <div className="flex justify-between"><span>Email Dukungan</span><span className="font-medium text-foreground">gomesin0711@gmail.com</span></div>
                    <div className="flex justify-between"><span>WhatsApp</span><span className="font-medium text-foreground">0858 8808 2208</span></div>
                    <div className="flex justify-between"><span>Lokasi</span><span className="font-medium text-foreground">Tangerang, Indonesia</span></div>
                  </div>
                </div>
                <Button variant="destructive" className="w-full md:h-11" onClick={() => {
                  if (confirm(tr("profDeleteAccountConfirm"))) {
                    toast.info(tr("profDeleteAccountProcessing"));
                  }
                }}>
                  Hapus Akun
                </Button>
              </div>
            )}

            {/* BANTUAN */}
            {panel === "bantuan" && (() => {
              const filteredFaqs = faqs.filter(
                (f) =>
                  f.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
                  f.a.toLowerCase().includes(faqSearch.toLowerCase())
              );
              const guides = [
                {
                  icon: BookOpen,
                  title: tr("profGuide1Title"),
                  desc: tr("profGuide1Desc"),
                  content: [
                    "1. Klik tombol 'Jual' (hijau) di bagian bawah layar atau tombol 'Pasang Iklan' di halaman akun.",
                    "2. Pilih kategori mesin yang sesuai (Mesin Cetak, CNC, Alat Berat, dll).",
                    "3. Isi judul iklan yang jelas, contoh: 'Mesin Cetak Offset Heidelberg SM 52 4 Warna'.",
                    "4. Tulis deskripsi lengkap: kondisi mesin, tahun produksi, kelengkapan, alasan jual.",
                    "5. Masukkan harga yang wajar. Pilih 'Bisa Nego' jika harga masih dapat ditawar.",
                    "6. Unggah minimal 1 foto mesin (maks 120KB, otomatis dikompres).",
                    "7. Pilih paket: Gratis (365 hari), Premium (Rp 50.000/30 hari), atau Bisnis (Rp 150.000/90 hari).",
                    "8. Klik 'Pasang Iklan Sekarang'. Iklan akan masuk antrian verifikasi admin (1-2 jam).",
                    "9. Setelah diverifikasi, iklan tayang di beranda dan bisa dilihat pembeli.",
                  ],
                },
                {
                  icon: Tag,
                  title: tr("profGuide2Title"),
                  desc: tr("profGuide2Desc"),
                  content: [
                    "GRATIS (Rp 0 — 365 hari):",
                    "• Pasang iklan tanpa batas",
                    "• Maksimal 3 foto per iklan",
                    "• Chat penjual via WhatsApp",
                    "• Tayang 365 hari",
                    "",
                    "PREMIUM (Rp 50.000 — 30 hari):",
                    "• Semua fitur Gratis",
                    "• Maksimal 10 foto per iklan",
                    "• Badge 'Featured' di hasil pencarian",
                    "• Prioritas tampil di beranda",
                    "• Tayang 30 hari",
                    "",
                    "BISNIS (Rp 150.000 — 90 hari):",
                    "• Semua fitur Premium",
                    "• Banner promosi di beranda",
                    "• Laporan performa iklan",
                    "• Prioritas tertinggi",
                    "• Tayang 90 hari",
                  ],
                },
                {
                  icon: ShieldCheck,
                  title: tr("profGuide3Title"),
                  desc: tr("profGuide3Desc"),
                  content: [
                    "1. SURVEI LANGSUNG — Selalu lihat mesin secara langsung sebelum membayar. Jangan hanya percaya foto.",
                    "2. CEK DOKUMEN — Pastikan kelengkapan dokumen (faktur, manual book, sertifikat) sesuai iklan.",
                    "3. REKENING PRIBADI — Transfer hanya ke rekening pribadi penjual, bukan ke pihak ketiga atau agen.",
                    "4. HINDARI DP BESAR — Jangan membayar DP besar sebelum melihat mesin. Bayar lunas saat serah terima.",
                    "5. HATI-HATI HARGA MURAH — Jika harga terlalu murah dari pasaran, waspadai penipuan.",
                    "6. GUNAKAN CHAT GOMESIN — Hubungi penjual via chat Gomesin atau WhatsApp yang tercatat di sistem.",
                    "7. LAPOR PELANGGARAN — Jika menemui penjual curiga, laporkan ke admin via menu 'Keamanan'.",
                  ],
                },
                {
                  icon: CreditCard,
                  title: tr("profGuide4Title"),
                  desc: "BCA, GoPay, QRIS",
                  content: [
                    tr("profPaymentMethodsDesc"),
                    "",
                    "1. TRANSFER BCA (Virtual Account):",
                    "• Bayar via ATM/mobile banking BCA",
                    "• Nomor VA otomatis dibuat saat checkout",
                    "• Konfirmasi otomatis (1-5 menit)",
                    "",
                    "2. GOPAY (E-Wallet):",
                    "• Bayar via aplikasi Gojek",
                    "• Saldo GoPay harus mencukupi",
                    "• Konfirmasi instan",
                    "",
                    "3. QRIS (Scan QR Code):",
                    "• Scan QR pakai e-wallet mana saja (GoPay, OVO, DANA, ShopeePay)",
                    "• Bayar sesuai nominal",
                    "• Konfirmasi instan",
                    "",
                    tr("profPaymentNote"),
                  ],
                },
              ];

              return (
                <div className="space-y-4">
                  {/* Support Chat View */}
                  {showSupportChat ? (
                    <div className="flex flex-col" style={{ minHeight: 320 }}>
                      {/* chat header */}
                      <div className="flex items-center gap-2 border-b border-border pb-3">
                        <button
                          onClick={() => setShowSupportChat(false)}
                          className="grid size-8 place-items-center rounded-md hover:bg-accent"
                          aria-label="Kembali"
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                            <LifeBuoy className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-bold">Tim Support Gomesin</p>
                            <span className="size-2 rounded-full bg-orange-500" />
                          </div>
                          <p className="text-[11px] text-muted-foreground">Online · 08.00-20.00 WIB</p>
                        </div>
                      </div>
                      {/* messages */}
                      <div className="gomesin-scroll flex-1 space-y-2.5 overflow-y-auto bg-muted/30 p-3" style={{ maxHeight: 260 }}>
                        {supportMessages.map((m, i) => (
                          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                            <div
                              className={
                                m.role === "user"
                                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                                  : "max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
                              }
                            >
                              {m.content}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* input */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!supportInput.trim()) return;
                          const userMsg = supportInput.trim();
                          setSupportMessages((m) => [...m, { role: "user", content: userMsg }]);
                          setSupportInput("");
                          // Simulated auto-reply
                          setTimeout(() => {
                            setSupportMessages((m) => [
                              ...m,
                              { role: "support", content: tr("profSupportReply") },
                            ]);
                          }, 1200);
                        }}
                        className="flex items-center gap-2 border-t border-border pt-3"
                      >
                        <input
                          value={supportInput}
                          onChange={(e) => setSupportInput(e.target.value)}
                          placeholder="Tulis pesan..."
                          className="h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="size-10 shrink-0 rounded-full bg-primary"
                          disabled={!supportInput.trim()}
                        >
                          <Send className="size-4" />
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <>
                      {/* Hero Support Card */}
                      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-orange-600 p-4 text-primary-foreground">
                        <div className="absolute -right-8 -top-8 size-28 rounded-full bg-white/10" />
                        <div className="absolute -bottom-10 right-12 size-20 rounded-full bg-white/10" />
                        <div className="relative">
                          <div className="flex items-center gap-2">
                            <span className="grid size-10 place-items-center rounded-lg bg-white/20 backdrop-blur">
                              <LifeBuoy className="size-5" />
                            </span>
                            <div>
                              <p className="text-base font-bold">Pusat Bantuan Gomesin</p>
                              <p className="text-xs text-primary-foreground/80">Tim support siap membantu 7 hari · 08.00-20.00 WIB</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              size="sm"
                              className="bg-white/20 backdrop-blur hover:bg-white/30"
                              onClick={() => setShowSupportChat(true)}
                            >
                              <MessageSquare className="size-4" /> Chat Support
                            </Button>
                            <a
                              href="https://wa.me/6285888082208?text=Halo%20Gomesin%2C%20saya%20butuh%20bantuan"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
                            >
                              <Phone className="size-4" /> WhatsApp
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Quick Guides */}
                      <div>
                        <p className="mb-2 text-sm font-bold">Panduan Cepat</p>
                        <div className="grid grid-cols-2 gap-2">
                          {guides.map((g, i) => (
                            <button
                              key={i}
                              onClick={() => setActiveGuide(activeGuide === i ? null : i)}
                              className={cn(
                                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition",
                                activeGuide === i
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card hover:border-primary hover:bg-accent"
                              )}
                            >
                              <span className={cn("grid size-8 place-items-center rounded-lg", activeGuide === i ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                                <g.icon className="size-4" />
                              </span>
                              <p className="text-xs font-bold">{g.title}</p>
                              <p className="text-[10px] text-muted-foreground">{g.desc}</p>
                            </button>
                          ))}
                        </div>
                        {/* Guide Content — expandable */}
                        {activeGuide !== null && guides[activeGuide] && (
                          <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3 animate-fade-up">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                                {(() => { const Icon = guides[activeGuide].icon; return <Icon className="size-3.5" />; })()}
                              </span>
                              <p className="text-sm font-bold">{guides[activeGuide].title}</p>
                              <button
                                onClick={() => setActiveGuide(null)}
                                className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent"
                                aria-label="Tutup"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                            <div className="space-y-1">
                              {guides[activeGuide].content.map((line, li) => (
                                <p key={li} className={cn(
                                  "text-xs leading-relaxed",
                                  line === "" ? "h-2" : "text-foreground/80",
                                  line.endsWith(":") && "font-bold text-foreground"
                                )}>
                                  {line || "\u00A0"}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* FAQ with Search */}
                      <div>
                        <p className="mb-2 text-sm font-bold">Pertanyaan yang Sering Diajukan</p>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            value={faqSearch}
                            onChange={(e) => setFaqSearch(e.target.value)}
                            placeholder={tr("profSearchFaq")}
                            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                          />
                        </div>
                        {filteredFaqs.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                            Tidak ada FAQ yang cocok. Coba kata kunci lain atau hubungi support.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {filteredFaqs.map((f, i) => {
                              const actualIndex = faqs.indexOf(f);
                              const isOpen = openFaq === actualIndex;
                              return (
                                <div
                                  key={actualIndex}
                                  className={cn(
                                    "overflow-hidden rounded-lg border bg-card transition",
                                    isOpen ? "border-primary" : "border-border"
                                  )}
                                >
                                  <button
                                    onClick={() => setOpenFaq(isOpen ? null : actualIndex)}
                                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                                  >
                                    <span className="text-sm font-semibold">{f.q}</span>
                                    <ChevronRight
                                      className={cn("size-4 shrink-0 text-muted-foreground transition", isOpen && "rotate-90")}
                                    />
                                  </button>
                                  {isOpen && (
                                    <div className="border-t border-border bg-secondary/30 px-3 py-2.5">
                                      <p className="text-xs leading-relaxed text-muted-foreground">{f.a}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Contact Info */}
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="mb-3 text-sm font-bold">Hubungi Kami</p>
                        <div className="space-y-2">
                          <a
                            href="mailto:gomesin0711@gmail.com"
                            className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition hover:bg-accent"
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <Mail className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">Email</p>
                              <p className="text-sm font-semibold">gomesin0711@gmail.com</p>
                            </div>
                            <ExternalLink className="size-3.5 text-muted-foreground" />
                          </a>
                          <a
                            href="https://wa.me/6285888082208"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition hover:bg-accent"
                          >
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-600">
                              <Phone className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">WhatsApp</p>
                              <p className="text-sm font-semibold">0858-8808-2208</p>
                            </div>
                            <ExternalLink className="size-3.5 text-muted-foreground" />
                          </a>
                          <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <MapPin className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">Kantor</p>
                              <p className="text-sm font-semibold">Tangerang, Indonesia</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

                </div>
              </div>
          ) : null}
        </div>
        )}
      </main>
    </div>
  );
}
