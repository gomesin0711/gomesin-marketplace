"use client";

import { useEffect, useRef } from "react";
import { useState } from "react";
import { Bell, Tag } from "lucide-react";
import { useNewListingsNotif } from "@/lib/use-new-listings-notif";
import { useStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatRupiahFull, timeAgo } from "@/lib/types";

/**
 * Notification bell that shows the count of listings created since the user's
 * last visit.
 *
 * Behavior (per user requirement: "apabila sudah dilihat maka isi notif kosong"):
 * - While the popover is OPEN, the user sees the current list of new listings.
 * - When the popover CLOSES, we call `markAllSeen()` so the badge drops to 0.
 *   The next time the user opens the popover, only listings created AFTER this
 *   viewing will appear (i.e., the notification is "empty" until new ads arrive).
 */
export function NotificationBell({ align = "end" }: { align?: "start" | "end" | "center" }) {
  const { count, newListings, markAllSeen } = useNewListingsNotif();
  const goToDetail = useStore((s) => s.goToDetail);
  const goToListings = useStore((s) => s.goToListings);
  const { lang } = useLang();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const hadItemsRef = useRef(false);

  // Track whether the popover currently has items to show, so we know to
  // mark-as-seen on close.
  useEffect(() => {
    if (open && newListings.length > 0) {
      hadItemsRef.current = true;
    }
    if (!open && hadItemsRef.current) {
      // Closing after having seen items → clear the badge.
      markAllSeen();
      hadItemsRef.current = false;
    }
  }, [open, newListings.length]);

  const handleClickListing = (slug: string) => {
    setOpen(false);
    goToDetail(slug);
  };

  const handleViewAll = () => {
    setOpen(false);
    goToListings({ sort: "newest" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative grid size-9 place-items-center rounded-lg text-foreground hover:bg-accent"
          aria-label="Notifikasi iklan baru"
          suppressHydrationWarning
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow"
              suppressHydrationWarning
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align={align}
        sideOffset={6}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-bold">Iklan Baru Masuk</p>
          <span className="text-[10px] font-medium text-muted-foreground">
            {newListings.length > 0 ? `${newListings.length} baru` : "Tidak ada"}
          </span>
        </div>

        {/* Body — empty when everything has been seen */}
        {newListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <Bell className="size-7 text-muted-foreground/40" />
            <p className="mt-2 text-xs text-muted-foreground">
              Belum ada iklan baru saat ini.
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto gomesin-scroll">
            {newListings.map((l: any) => (
              <button
                key={l.id}
                onClick={() => handleClickListing(l.slug)}
                className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left transition last:border-b-0 hover:bg-accent"
              >
                <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {l.images?.[0] ? (
                    <img src={l.images[0]} alt="" className="size-full object-cover" />
                  ) : (
                    <Tag className="m-auto size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{l.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.city ? l.city : ""}
                    {l.seller?.name ? ` · ${l.seller.name}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {timeAgo(l.createdAt, mounted ? lang : "id")}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-primary">
                  {formatRupiahFull(l.price)}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border">
          <button
            onClick={handleViewAll}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-primary hover:bg-accent"
          >
            Lihat semua iklan terbaru
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
