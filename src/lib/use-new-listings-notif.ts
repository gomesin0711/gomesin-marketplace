"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { playListingNotificationSound } from "@/lib/notification-sound";
import { useChatSocket } from "@/lib/use-chat-socket";

/**
 * Tracks "new listings" notifications for the user.
 *
 * THREE mechanisms work together so the badge + ringtone fire INSTANTLY
 * when a new listing is published (no more 60-second wait):
 *
 * 1. Socket.io push (instant, primary):
 *    - Subscribes to `listing:new` (emitted by /api/admin/listings PATCH
 *      when admin publishes a listing).
 *    - Also subscribes to `listings:invalidate` (emitted by admin's
 *      broadcastListings() helper after delete/publish/violation toggle).
 *    On either event, the `["new-listings-notif"]` query is invalidated
 *    immediately → refetches → new listing shows up in the bell + the
 *    "Iklan baru" ringtone plays.
 *
 * 2. Polling fallback (10-second interval):
 *    If the socket is disconnected (chat-service down, network blocks
 *    WebSocket), we still poll every 10 seconds so the badge stays
 *    reasonably fresh.
 *
 * 3. localStorage `seenAt` (SHARED across all component instances):
 *    - Stores `lastSeenAt` (epoch ms) in localStorage so the badge persists
 *      across tabs/sessions.
 *    - `markAllSeen()` updates `seenAt` to "now" — clears the badge
 *      INSTANTLY in ALL components (bell + notification list) via a
 *      module-level store with useSyncExternalStore.
 *    - This fixes the bug where the bell badge wouldn't clear in real-time
 *      when notifications were read in the profile panel.
 *
 * The list of new listings itself is returned so the bell dropdown and the
 * profile "notifikasi" panel can display them.
 */

const STORAGE_KEY = "gomesin-new-listings-seen-at";

// ── Shared seenAt store (module-level) ──────────────────────────────────
// This ensures ALL components using useNewListingsNotif share the SAME
// seenAt value. When markAllSeen() is called in one component (e.g. the
// notification list), the bell badge in the header updates INSTANTLY
// without needing a re-fetch or page refresh.
//
// Uses useSyncExternalStore for React 18+ concurrent-safe subscription.

let sharedSeenAt: number = 0;
const listeners = new Set<() => void>();

function initSharedSeenAt() {
  if (typeof window === "undefined") {
    sharedSeenAt = Date.now();
    return;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // First-ever visit: seed with "now" so we don't surface every existing ad.
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    sharedSeenAt = now;
  } else {
    const n = Number(raw);
    sharedSeenAt = Number.isFinite(n) ? n : Date.now();
  }
}

function getSharedSeenAt(): number {
  if (sharedSeenAt === 0) initSharedSeenAt();
  return sharedSeenAt;
}

function setSharedSeenAt(ts: number) {
  sharedSeenAt = ts;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, String(ts));
    } catch {}
  }
  // Notify all subscribed components to re-render with the new seenAt.
  listeners.forEach((fn) => fn());
}

function subscribeSeenAt(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

async function fetchNewest(): Promise<{ listings: any[] }> {
  const res = await fetch("/api/listings?sort=newest&limit=24");
  if (!res.ok) throw new Error("fail");
  return res.json();
}

export function useNewListingsNotif() {
  const qc = useQueryClient();
  // useSyncExternalStore ensures ALL components share the same seenAt value.
  // When markAllSeen() updates sharedSeenAt, every subscribed component
  // re-renders immediately with the new value → badge clears in real-time.
  const seenAt = useSyncExternalStore(
    subscribeSeenAt,
    getSharedSeenAt,
    () => Date.now() // SSR snapshot — won't be used on client after hydration
  );
  const { subscribe } = useChatSocket();

  const { data } = useQuery({
    queryKey: ["new-listings-notif"],
    queryFn: fetchNewest,
    // Poll every 60 seconds as a SAFETY NET when socket.io is unavailable.
    // Was 10s — too aggressive, contributed to Supabase egress quota burn.
    // The socket.io `listing:new` event triggers immediate invalidation
    // when admin publishes, so the bell + ringtone fire INSTANTLY without
    // waiting for the 60s poll.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // ── Socket.io subscriptions — INSTANT invalidation when a new listing
  // is published. Bypasses the 10s poll entirely.
  useEffect(() => {
    const off1 = subscribe("listing:new", () => {
      // A new listing was just published by the admin. Invalidate the
      // query → TanStack refetches immediately → the new listing shows
      // up in the bell + ringtone plays (via the count-increase effect
      // below).
      qc.invalidateQueries({ queryKey: ["new-listings-notif"] });
      // Also invalidate the homepage's listing queries so any open
      // Beranda refreshes instantly.
      qc.invalidateQueries({ queryKey: ["listings"] });
    });
    const off2 = subscribe("listings:invalidate", () => {
      qc.invalidateQueries({ queryKey: ["new-listings-notif"] });
    });
    return () => {
      off1();
      off2();
    };
  }, [qc, subscribe]);

  // Keep seenAt in sync if it changes in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        // Update the shared store so all components re-render.
        const raw = e.newValue;
        if (raw) {
          const n = Number(raw);
          if (Number.isFinite(n)) {
            sharedSeenAt = n;
            listeners.forEach((fn) => fn());
          }
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const allListings = data?.listings ?? [];

  // New listings = createdAt newer than seenAt.
  const newListings = allListings.filter((l: any) => {
    const created = l.createdAt ? new Date(l.createdAt).getTime() : 0;
    return created > seenAt;
  });

  const count = newListings.length;

  // Play the "Iklan baru masuk" ringtone when NEW listings appear.
  // We track the previous count in a ref — only play when the count
  // INCREASES (not on first load, and not when it drops to 0 after markAllSeen).
  const prevCountRef = useRef<number>(0);
  // Skip the very first data load so we don't sound off for pre-existing listings.
  const firstLoadRef = useRef<boolean>(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      // First time we get data — seed prevCount without playing sound.
      prevCountRef.current = count;
      firstLoadRef.current = false;
      return;
    }
    if (count > prevCountRef.current) {
      // New listings detected since last poll — play the ringtone.
      playListingNotificationSound();
    }
    prevCountRef.current = count;
  }, [count]);

  const markAllSeen = () => {
    const now = Date.now();
    // Update the shared store → ALL subscribed components re-render
    // instantly → bell badge clears in real-time.
    setSharedSeenAt(now);
  };

  return { count, newListings, markAllSeen, seenAt };
}
