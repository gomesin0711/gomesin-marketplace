"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MapPin, Plus, User, ChevronDown, Home, MessageSquare, Tag, Store, X, Sun, Moon } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { PROVINCES } from "@/lib/types";
import { playNotificationSound, playDingSound, setupNotificationSoundUnlock, isChatOpen } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";
import { CategoryNav } from "./category-nav";
import { NotificationBell } from "./notification-bell";
import { useChatSocket } from "@/lib/use-chat-socket";
import { useTheme } from "next-themes";

function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        onClick={() => useStore.getState().goHome()}
        className="flex items-center gap-2"
        aria-label="Gomesin Beranda"
      >
        <img
          src="/logo-sm.jpeg"
          alt="Gomesin"
          width={36}
          height={36}
          className="size-9 rounded-lg object-cover shadow-sm"
        />
        <span className="tracking-tight text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif' }}>
          <span className="text-primary">go</span>mesin
        </span>
      </button>
      <button
        onClick={() => useStore.getState().goHome()}
        className="hidden md:flex h-9 items-center gap-1 rounded-lg px-1.5 text-foreground hover:bg-accent"
        aria-label="Home"
      >
        <Home className="size-4" />
        <span className="text-xs font-medium">Home</span>
      </button>
    </div>
  );
}

export function Header() {
  const goToListings = useStore((s) => s.goToListings);
  const goHome = useStore((s) => s.goHome);
  const goToPost = useStore((s) => s.goToPost);
  const goToFavorites = useStore((s) => s.goToFavorites);
  const goToProfile = useStore((s) => s.goToProfile);
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);
  const goToLogin = useStore((s) => s.goToLogin);
  // Badge = unseen favorites (added since last visit to favorites page)
  const favCount = Math.max(0, useStore((s) => s.favorites.length - s.favoritesSeenCount));
  const user = useStore((s) => s.user);
  const filters = useStore((s) => s.filters);
  const currentView = useStore((s) => s.view);
  const { lang, setLang, t } = useLang();
  const mounted = useMounted();
  const { theme, setTheme } = useTheme();
  const [langOpenMobile, setLangOpenMobile] = useState(false);

  // Fetch unread messages for badge — NO polling, socket invalidates on change.
  const queryClient = useQueryClient();
  const { subscribe } = useChatSocket();

  // Unlock notification sound on first user interaction (autoplay policy).
  useEffect(() => {
    setupNotificationSoundUnlock();
  }, []);
  const { data: messagesData } = useQuery({
    queryKey: ["messages", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/messages?userId=${user!.id}`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    enabled: !!user?.id,
    // Poll every 3 seconds so new messages are detected even WITHOUT
    // socket.io (e.g. on Vercel production where there is no WebSocket
    // server). The socket invalidation (when available) provides instant
    // updates; polling is the universal fallback.
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
  const unreadCount = messagesData?.conversations?.reduce((a: number, c: any) => a + (c.unread || 0), 0) ?? 0;

  // ===== Polling-based notification sound =====
  // The socket "message:new" handler (below) only fires when socket.io is
  // connected. In production (Vercel, no socket server) OR when the socket
  // is temporarily down, messages arrive only via the 3s polling above.
  // This effect watches the polled messagesData and plays the notification
  // sound when a NEW incoming message (sent=false) appears that wasn't in
  // the previous fetch. This guarantees the ringtone plays in ALL
  // environments.
  const seenMsgIdsRef = useRef<Set<string>>(new Set());
  // Track whether we've done the initial load (so we don't sound off for
  // pre-existing messages on first render).
  const initialLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!user || !messagesData?.conversations) return;
    const convs = messagesData.conversations as any[];
    // Collect ALL incoming (received) message ids currently visible.
    const currentIncomingIds: string[] = [];
    for (const c of convs) {
      for (const m of c.messages || []) {
        if (m.sent === false) currentIncomingIds.push(m.id);
      }
    }
    if (!initialLoadDoneRef.current) {
      // First load: seed the seen set with all existing incoming ids so we
      // don't play sound for messages that were already there.
      currentIncomingIds.forEach((id) => seenMsgIdsRef.current.add(id));
      initialLoadDoneRef.current = true;
      return;
    }
    // Subsequent loads: find incoming ids that are NOT in the seen set.
    const newIncoming = currentIncomingIds.filter((id) => !seenMsgIdsRef.current.has(id));
    if (newIncoming.length === 0) return;
    // Add them to the seen set.
    newIncoming.forEach((id) => seenMsgIdsRef.current.add(id));
    // Play the notification sound. If the user is currently viewing an open
    // chat, play a soft ding; otherwise play the full "Go mesin!" ringtone.
    if (isChatOpen()) {
      playDingSound();
    } else {
      playNotificationSound();
    }
  }, [messagesData, user]);

  // Realtime: refresh unread count instantly when a new message arrives or a read receipt comes in.
  useEffect(() => {
    if (!user) return;
    const offNew = subscribe("message:new", (msg: any) => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      // Play notification sound for incoming messages (not from self).
      // When a chat conversation is currently open & visible, play only a soft
      // "ding" (less intrusive). When chat is closed, play the full "Go mesin!"
      // ringtone so the user is alerted.
      if (msg && msg.senderId !== user.id) {
        // Mark this message id as seen immediately so the polling-based sound
        // effect (above) doesn't double-play the same message after the
        // refetch lands.
        if (msg.id) seenMsgIdsRef.current.add(msg.id);
        if (isChatOpen()) {
          playDingSound();
        } else {
          playNotificationSound();
        }
      }
    });
    const offRead = subscribe("message:read-update", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    return () => {
      offNew();
      offRead();
    };
  }, [user, subscribe, queryClient]);

  const [langOpenDesktop, setLangOpenDesktop] = useState(false);

  const changeLang = (l: "id" | "en" | "zh") => {
    setLang(l);
    setLangOpenMobile(false);
    setLangOpenDesktop(false);
  };
  const langFlag = (l: Lang) => (l === "id" ? "🇮🇩" : l === "zh" ? "🇨🇳" : "🇬🇧");
  // Before mounted: always use Indonesian to match SSR. After: use actual lang.
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;
  const hideCategoryNav = ["admin", "admin-sellers", "admin-categories", "admin-listings", "admin-new-listings", "admin-expired-listings", "admin-rejected-listings", "admin-transactions", "admin-reports", "admin-users", "admin-paket", "post", "edit", "login", "profile", "dashboard", "favorites", "detail", "seller", "home"].includes(currentView);

  const [q, setQ] = useState(filters.q ?? "");
  const [prevQ, setPrevQ] = useState(filters.q);
  const [province, setProvince] = useState(filters.province ?? "Indonesia");

  // Universal search dropdown
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ listings: any[]; categories: any[]; sellers: any[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const goToDetail = useStore((s) => s.goToDetail);
  const goToSeller = useStore((s) => s.goToSeller);

  // Debounced universal search
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(keyword.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setSearchOpen(true);
      }
    } catch {}
    setSearchLoading(false);
  }, []);

  const handleSearchChange = (val: string) => {
    setQ(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleSearchFocus = () => {
    if (q.trim() && searchResults) setSearchOpen(true);
  };

  // Close search dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [searchOpen]);

  // Sync local search input when the store query changes externally (render-time adjustment)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setQ(filters.q ?? "");
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchOpen(false);
    goToListings({
      q,
      province: province === "Indonesia" ? undefined : province,
    });
  };

  const hasSearchResults = searchResults && (searchResults.listings.length > 0 || searchResults.categories.length > 0 || searchResults.sellers.length > 0);

  const renderSearchDropdown = () => {
    if (!searchOpen) return null;
    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-fade-up">
        {searchLoading && (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Mencari...
          </div>
        )}
        {!searchLoading && hasSearchResults && searchResults && (
          <div className="max-h-80 overflow-y-auto gomesin-scroll">
            {/* Listings */}
            {searchResults.listings.length > 0 && (
              <div>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Iklan</p>
                {searchResults.listings.map((l: any) => (
                  <button
                    key={l.id}
                    onClick={() => { setSearchOpen(false); goToDetail(l.slug); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-accent"
                  >
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {l.image ? <img src={l.image} alt="" className="size-full object-cover" /> : <Tag className="m-auto size-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                      <p className="text-xs text-muted-foreground">{l.sellerCompany ? l.sellerCompany + " · " : ""}{l.categoryName} · {l.city}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-primary">Rp {l.price.toLocaleString("id-ID")}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Categories */}
            {searchResults.categories.length > 0 && (
              <div>
                <p className="border-t border-border px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kategori</p>
                {searchResults.categories.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => { setSearchOpen(false); goToListings({ category: c.slug }); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-accent"
                  >
                    <span className="text-lg">{c.icon}</span>
                    <span className="text-sm font-medium text-foreground">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Sellers */}
            {searchResults.sellers.length > 0 && (
              <div>
                <p className="border-t border-border px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Penjual</p>
                {searchResults.sellers.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => { setSearchOpen(false); goToSeller(s.id); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-accent"
                  >
                    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10">
                      {s.logoImage ? <img src={s.logoImage} alt="" className="size-full object-cover" /> : <Store className="size-4 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.company || s.city || ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {/* View all results link */}
            <div className="border-t border-border">
              <button
                onClick={() => { setSearchOpen(false); goToListings({ q }); }}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium text-primary hover:bg-accent"
              >
                <Search className="size-3.5" /> Lihat semua hasil untuk &quot;{q}&quot;
              </button>
            </div>
          </div>
        )}
        {!searchLoading && !hasSearchResults && q.trim() && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Tidak ditemukan hasil untuk &quot;{q}&quot;
          </div>
        )}
      </div>
    );
  };

  const renderLocations = () => (
    <div className="max-h-80 overflow-y-auto gomesin-scroll py-1">
      <button
        onClick={() => setProvince("Indonesia")}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
          province === "Indonesia" && "font-semibold text-primary"
        )}
      >
        <MapPin className="size-4" /> {tr("allIndonesia")}
      </button>
      <div className="my-1 border-t border-border" />
      {PROVINCES.map((p) => (
        <button
          key={p}
          onClick={() => setProvince(p)}
          className={cn(
            "flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent",
            province === p && "font-semibold text-primary"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* ===== MOBILE (below md) ===== */}
      <div className="md:hidden">
        {/* Row 1: Logo (left) + Favorit & Location (top-right, aligned with logo) */}
        <div className="flex h-14 items-center gap-1 overflow-hidden px-3">
          <Logo />
          <div className="ml-auto flex items-center gap-0.5">
            <Popover open={langOpenMobile} onOpenChange={setLangOpenMobile}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-xs font-bold text-foreground hover:bg-accent"
                  aria-label="Bahasa"
                  suppressHydrationWarning
                >
                  <span className="text-base leading-none">{langFlag(lang)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="end">
                <button
                  onClick={() => changeLang("id")}
                  className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "id" && "font-bold text-primary")}
                >
                  🇮🇩 Indonesia
                </button>
                <button
                  onClick={() => changeLang("en")}
                  className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "en" && "font-bold text-primary")}
                >
                  🇬🇧 English
                </button>
                <button
                  onClick={() => changeLang("zh")}
                  className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "zh" && "font-bold text-primary")}
                >
                  🇨🇳 中文
                </button>
              </PopoverContent>
            </Popover>
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-accent"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
            )}
            <NotificationBell align="end" />
            {/* Seller logo / avatar — top-right corner on mobile (matches desktop behavior) */}
            {mounted && user ? (
              <button
                onClick={goToProfile}
                className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 ring-1 ring-border hover:ring-primary/40"
                aria-label="Akun Saya"
              >
                {user.logoImage ? (
                  <img
                    src={user.logoImage}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </span>
                )}
              </button>
            ) : (
              <button
                onClick={goToLogin}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-border hover:ring-primary/40"
                aria-label="Masuk atau Daftar"
              >
                <User className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search (below logo, full width) — hidden on Akun Saya (profile) */}
        {currentView !== "profile" && (
        <div className="px-3 pb-2">
          <form onSubmit={submitSearch} className="relative">
            <Input
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={handleSearchFocus}
              placeholder={tr("searchPlaceholder")}
              className="h-10 rounded-full border-border bg-card pr-10 pl-4 text-sm"
            />
            <button
              type="submit"
              aria-label="Cari"
              className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Search className="size-4" />
            </button>
            {renderSearchDropdown()}
          </form>
        </div>
        )}
      </div>

      {/* ===== DESKTOP (md and up) ===== */}
      <div className="hidden md:flex mx-auto h-16 max-w-7xl items-center gap-3 px-4">
        <Logo />

        {/* search */}
        <form onSubmit={submitSearch} className="relative flex-1">
          <Input
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={handleSearchFocus}
            placeholder={tr("searchPlaceholder")}
            className="h-10 rounded-full border-border bg-card pr-10 pl-4 text-sm"
          />
          <button
            type="submit"
            aria-label="Cari"
            className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Search className="size-4" />
          </button>
          {renderSearchDropdown()}
        </form>

        {/* actions */}
        <div className="flex items-center gap-1">
          {mounted && user && (
            <button
              onClick={() => goToProfilePanel("pesan")}
              className="relative flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-foreground hover:bg-accent"
              aria-label={tr("chat")}
            >
              <div className="relative">
                <MessageSquare className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{tr("chat")}</span>
            </button>
          )}
          <Popover open={langOpenDesktop} onOpenChange={setLangOpenDesktop}>
            <PopoverTrigger asChild>
              <button
                className="flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-foreground hover:bg-accent"
                aria-label="Language"
                suppressHydrationWarning
              >
                <span className="text-base leading-none">{langFlag(lang)}</span>
                
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="end">
              <button
                onClick={() => changeLang("id")}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "id" && "font-bold text-primary")}
              >
                🇮🇩 Indonesia
              </button>
              <button
                onClick={() => changeLang("en")}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "en" && "font-bold text-primary")}
              >
                🇬🇧 English
              </button>
              <button
                onClick={() => changeLang("zh")}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", lang === "zh" && "font-bold text-primary")}
              >
                🇨🇳 中文
              </button>
            </PopoverContent>
          </Popover>
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex h-10 items-center justify-center rounded-lg px-2 text-foreground hover:bg-accent"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
          )}
          {/* Notification bell: shows count of new listings since last viewed */}
          <NotificationBell align="end" />

          {mounted && user ? (
            <button
              onClick={goToProfile}
              className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-accent"
              aria-label="Akun"
            >
              <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10">
                {user.logoImage ? (
                  <img src={user.logoImage} alt="" className="size-full object-cover" onError={(e)=>{(e.target as HTMLImageElement).style.display='none';}} />
                ) : (
                  <span className="text-xs font-bold text-primary">{user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                )}
              </span>
              <span className="hidden max-w-[100px] truncate lg:inline">{user.name.split(" ")[0]}</span>
            </button>
          ) : (
            <button
              onClick={goToLogin}
              className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-accent"
              aria-label="Masuk atau Daftar"
            >
              <User className="size-5" />
              <span className="hidden lg:inline">{tr("login")}</span>
            </button>
          )}

          <Button
            onClick={goToPost}
            className="h-10 gap-1.5 rounded-full bg-primary px-4 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="size-4" />
            <span>{tr("sell")}</span>
          </Button>
        </div>
      </div>

      {/* Category nav (hidden on admin/post/login views) */}
      {!hideCategoryNav && (
        <div className="border-t border-border">
          <CategoryNav />
        </div>
      )}
    </header>
  );
}
