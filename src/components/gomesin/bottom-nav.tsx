"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { translations as i18nTranslations } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import { Home, MessageSquare, Plus, Newspaper, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChatSocket } from "@/lib/use-chat-socket";

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  badgeMounted = false,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  badgeMounted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-1 flex-col items-center gap-1 py-2"
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      <div className="relative">
        <Icon
          className={cn("size-6", active ? "text-primary" : "text-muted-foreground")}
        />
        {badgeMounted && badge !== undefined && badge > 0 && (
          <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span
        className={cn(
          "max-w-full truncate text-[11px] font-medium",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function BottomNav() {
  const view = useStore((s) => s.view);
  const goHome = useStore((s) => s.goHome);
  const goToPost = useStore((s) => s.goToPost);
  const goToProfile = useStore((s) => s.goToProfile);
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);
  const storeProfilePanel = useStore((s) => s.profilePanel);
  const goToLogin = useStore((s) => s.goToLogin);
  const user = useStore((s) => s.user);
  const { t } = useLang();
  const mounted = useMounted();
  const tr = mounted ? t : (key: any) => (i18nTranslations.id as any)[key] ?? key;

  // Fetch unread message count for badge — NO polling, socket invalidates on change.
  const queryClient = useQueryClient();
  const { subscribe } = useChatSocket();
  const { data: messagesData } = useQuery({
    queryKey: ["messages", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/messages?userId=${user!.id}`);
      if (!res.ok) throw new Error("fail");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: Infinity,
  });
  const unreadCount = messagesData?.conversations?.reduce((a: number, c: any) => a + (c.unread || 0), 0) ?? 0;

  // Realtime: refresh unread count instantly when a new message arrives or a read receipt comes in.
  useEffect(() => {
    if (!user) return;
    const offNew = subscribe("message:new", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    const offRead = subscribe("message:read-update", () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    });
    return () => {
      offNew();
      offRead();
    };
  }, [user, subscribe, queryClient]);

  const guard = (action: () => void) => () => {
    if (!user) {
      toast.info(tr("loginRequired"), {
        action: { label: tr("tabLogin"), onClick: goToLogin },
      });
      return;
    }
    action();
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
      <div className="mx-auto flex h-[4.25rem] max-w-md items-center justify-around px-1">
        <NavItem
          icon={Home}
          label={tr("home")}
          active={view === "home"}
          onClick={goHome}
        />
        <NavItem
          icon={MessageSquare}
          label={tr("chat")}
          active={false}
          onClick={guard(() => goToProfilePanel("pesan"))}
          badge={unreadCount}
          badgeMounted={mounted}
        />

        {/* Center elevated Jual button */}
        <button
          onClick={goToPost}
          className="flex flex-1 flex-col items-center gap-1 py-2"
          aria-label={tr("sell2")}
        >
          <span className="-mt-8 grid size-[3.25rem] place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition hover:bg-primary/90">
            <Plus className="size-7" />
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold",
              view === "post" ? "text-primary" : "text-muted-foreground"
            )}
          >
            {tr("sell2")}
          </span>
        </button>

        <NavItem
          icon={Newspaper}
          label={tr("myAds")}
          active={view === "profile" && storeProfilePanel === "iklan-saya"}
          onClick={guard(() => goToProfilePanel("iklan-saya"))}
        />
        <NavItem
          icon={User}
          label={user ? tr("myAccount") : tr("login")}
          active={view === "profile" || view === "login"}
          onClick={user ? goToProfile : goToLogin}
        />
      </div>
    </nav>
  );
}
