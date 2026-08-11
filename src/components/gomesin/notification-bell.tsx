"use client";

import { Bell, Tag } from "lucide-react";
import { useNewListingsNotif } from "@/lib/use-new-listings-notif";
import { useStore } from "@/lib/store";
import { formatRupiahFull, timeAgo } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { useMounted } from "@/lib/use-mounted";

/**
 * Notification bell button.
 *
 * Behavior (per user requirement: "apabila diklik icon notifikasi maka muncul
 * halaman notifikasi bukan popup"):
 * - Clicking the bell navigates to the profile's "notifikasi" panel (a full
 *   page, NOT a popover/popup).
 * - The badge shows the count of listings created since the user's last visit.
 * - The actual notification list is rendered inside profile.tsx's notifikasi
 *   panel, which displays the REAL new listings (not mock data).
 */
export function NotificationBell({ align = "end" }: { align?: "start" | "end" | "center" }) {
  const { count } = useNewListingsNotif();
  const goToProfilePanel = useStore((s) => s.goToProfilePanel);

  const handleClick = () => {
    goToProfilePanel("notifikasi");
  };

  return (
    <button
      onClick={handleClick}
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
  );
}

/**
 * Shared helper to render the new-listings notification list.
 * Used by the profile "notifikasi" panel to show the REAL new listings
 * (instead of the old mock data).
 */
export function NewListingsNotificationList() {
  const { count, newListings, markAllSeen } = useNewListingsNotif();
  const goToDetail = useStore((s) => s.goToDetail);
  const goToListings = useStore((s) => s.goToListings);
  const { lang } = useLang();
  const mounted = useMounted();

  const handleClickListing = (slug: string) => {
    markAllSeen();
    goToDetail(slug);
  };

  const handleViewAll = () => {
    markAllSeen();
    goToListings({ sort: "newest" });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-bold md:text-lg">Notifikasi</p>
          <p className="text-sm text-muted-foreground">
            {count > 0 ? `${count} iklan baru sejak kunjungan terakhir` : "Tidak ada iklan baru saat ini"}
          </p>
        </div>
        {count > 0 && (
          <button
            onClick={markAllSeen}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            Tandai semua dibaca
          </button>
        )}
      </div>

      {/* Notification list — REAL new listings */}
      {count > 0 ? (
        <div className="space-y-2">
          {newListings.map((l: any) => (
            <button
              key={l.id}
              onClick={() => handleClickListing(l.slug)}
              className="flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition hover:shadow-sm md:p-5"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {l.images?.[0] ? (
                  <img src={l.images[0]} alt="" className="size-full object-cover" />
                ) : (
                  <Tag className="m-auto size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground md:text-base">{l.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground md:text-sm">
                    {timeAgo(l.createdAt, mounted ? lang : "id")} lalu
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground md:text-sm">
                  {l.city ? l.city : ""}
                  {l.seller?.name ? ` · ${l.seller.name}` : ""}
                </p>
                <p className="mt-1 text-sm font-bold text-primary md:text-base">{formatRupiahFull(l.price)}</p>
              </div>
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
            <Bell className="size-7 text-muted-foreground/50" />
          </div>
          <p className="mt-3 text-base font-semibold">Belum ada notifikasi</p>
          <p className="mt-1 text-sm text-muted-foreground">Notifikasi iklan baru akan muncul di sini.</p>
        </div>
      )}

      {/* View all link */}
      {count > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleViewAll}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-primary transition hover:bg-accent"
          >
            Lihat semua iklan terbaru
          </button>
        </div>
      )}
    </div>
  );
}
