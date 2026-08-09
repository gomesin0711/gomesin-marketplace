"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type View =
  | "home"
  | "listings"
  | "detail"
  | "post"
  | "edit"
  | "favorites"
  | "profile"
  | "seller"
  | "login"
  | "dashboard"
  | "upgrade"
  | "admin"
  | "admin-sellers"
  | "admin-categories"
  | "admin-listings"
  | "admin-new-listings"
  | "admin-expired-listings"
  | "admin-rejected-listings"
  | "admin-transactions"
  | "admin-reports"
  | "admin-users"
  | "admin-paket"
  | "admin-merek"
  | "admin-lokasi"
  | "admin-banner"
  | "admin-audit"
  | "admin-monthly-report"
  | "admin-chat";

export type ListingFilters = {
  q?: string;
  category?: string;
  condition?: string;
  minPrice?: string;
  maxPrice?: string;
  province?: string;
  sort?: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  company?: string | null;
  address?: string | null;
  bannerImage?: string | null;
  logoImage?: string | null;
  role?: string;
  createdAt?: string;
};

type NavState = {
  view: View;
  slug?: string; // for detail view
  sellerId?: string;
  filters: ListingFilters;
  profilePanel?: "pesan" | "pesanan" | "saldo" | "notifikasi" | "keamanan" | "pengaturan" | "bantuan" | "iklan-saya" | "favorit-saya" | null;
  // navigation history for back button
  history: { view: View; slug?: string; filters: ListingFilters }[];

  // favorites & recents
  favorites: string[]; // listing ids
  favoritesSeenCount: number; // how many favorites the user has acknowledged (for badge)
  recents: string[]; // listing slugs (most recent first)

  // saved scroll position of Produk Populer carousel (so back returns to same card)
  featuredScrollLeft: number;
  // saved clicked listing id so back returns to that exact card
  featuredClickedId: string | null;
  // flag: restore carousel to clicked card on next home mount
  featuredRestorePending: boolean;

  // auth
  user: AppUser | null;

  // actions
  goHome: () => void;
  goToListings: (filters?: ListingFilters) => void;
  goToDetail: (slug: string) => void;
  goToPost: () => void;
  goToEdit: (slug: string) => void;
  goToFavorites: () => void;
  goToProfile: () => void;
  goToProfilePanel: (panel: "pesan" | "pesanan" | "saldo" | "notifikasi" | "keamanan" | "pengaturan" | "bantuan" | "iklan-saya" | "favorit-saya") => void;
  clearProfilePanel: () => void;
  goToLogin: () => void;
  goToDashboard: () => void;
  goToUpgrade: (slug: string) => void;
  goToSeller: (userId: string) => void;
  goToAdmin: () => void;
  goToAdminSub: (sub: "admin-sellers" | "admin-categories" | "admin-listings" | "admin-new-listings" | "admin-expired-listings" | "admin-rejected-listings" | "admin-transactions" | "admin-reports" | "admin-users" | "admin-paket" | "admin-merek" | "admin-lokasi" | "admin-banner" | "admin-audit" | "admin-monthly-report" | "admin-chat") => void;
  goBack: () => void;
  _popBack: () => void;
  setFilters: (f: ListingFilters) => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  addRecent: (slug: string) => void;
  setFeaturedScrollLeft: (v: number) => void;
  setFeaturedClickedId: (id: string | null) => void;
  setFeaturedRestorePending: (v: boolean) => void;
  setUser: (u: AppUser | null) => void;
  logout: () => void;
};

export const useStore = create<NavState>()(
  persist(
    (set, get) => ({
      view: "home",
      slug: undefined,
      sellerId: undefined,
      filters: {},
      history: [],
      favorites: [],
      favoritesSeenCount: 0,
      recents: [],
      featuredScrollLeft: 0,
      featuredClickedId: null,
      featuredRestorePending: false,
      user: null,

      goHome: () =>
        set((s) => {
          const state = {
            view: "home" as View,
            slug: undefined,
            filters: {},
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToListings: (filters = {}) =>
        set((s) => {
          const state = {
            view: "listings" as View,
            slug: undefined,
            filters,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToDetail: (slug) =>
        set((s) => {
          const state = {
            view: "detail" as View,
            slug,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
            recents: [slug, ...s.recents.filter((r) => r !== slug)].slice(0, 12),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToPost: () =>
        set((s) => {
          const state = {
            view: "post" as View,
            slug: undefined,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToEdit: (slug) =>
        set((s) => {
          const state = {
            view: "edit" as View,
            slug,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToFavorites: () =>
        set((s) => {
          const state = {
            view: "profile" as View,
            slug: undefined,
            profilePanel: "favorit-saya" as const,
            favoritesSeenCount: s.favorites.length,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToProfile: () =>
        set((s) => {
          const state = {
            view: "profile" as View,
            slug: undefined,
            profilePanel: null,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToProfilePanel: (panel: "pesan" | "pesanan" | "saldo" | "notifikasi" | "keamanan" | "pengaturan" | "bantuan" | "iklan-saya" | "favorit-saya") =>
        set((s) => {
          const state = {
            view: "profile" as View,
            slug: undefined,
            profilePanel: panel,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      clearProfilePanel: () => set({ profilePanel: null }),

      goToLogin: () =>
        set((s) => {
          const state = {
            view: "login" as View,
            slug: undefined,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToDashboard: () =>
        set((s) => {
          const state = {
            view: "dashboard" as View,
            slug: undefined,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToUpgrade: (slug) =>
        set((s) => {
          const state = {
            view: "upgrade" as View,
            slug,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToSeller: (userId) =>
        set((s) => {
          const state = {
            view: "seller" as View,
            slug: undefined,
            sellerId: userId,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToAdmin: () =>
        set((s) => {
          const state = {
            view: "admin" as View,
            slug: undefined,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goToAdminSub: (sub: "admin-sellers" | "admin-categories" | "admin-listings" | "admin-new-listings" | "admin-expired-listings" | "admin-rejected-listings" | "admin-transactions" | "admin-reports" | "admin-monthly-report" | "admin-users" | "admin-paket" | "admin-merek" | "admin-lokasi" | "admin-banner" | "admin-audit" | "admin-chat") =>
        set((s) => {
          const state = {
            view: sub,
            slug: undefined,
            history: [...s.history, { view: s.view, slug: s.slug, filters: s.filters }].slice(-20),
          };
          if (typeof window !== "undefined") window.history.pushState({ gomesin: true }, "");
          return state;
        }),

      goBack: () => {
        const s = get();
        if (s.history.length === 0) {
          set({ view: "home", slug: undefined, filters: {} });
          return;
        }
        const last = s.history[s.history.length - 1];
        set({
          view: last.view,
          slug: last.slug,
          filters: last.filters,
          history: s.history.slice(0, -1),
        });
        // Sync browser history
        if (typeof window !== "undefined") window.history.back();
      },

      // Called by popstate listener only — updates store state without triggering history.back()
      _popBack: () => {
        const s = get();
        if (s.history.length === 0) {
          set({ view: "home", slug: undefined, filters: {} });
          return;
        }
        const last = s.history[s.history.length - 1];
        set({
          view: last.view,
          slug: last.slug,
          filters: last.filters,
          history: s.history.slice(0, -1),
        });
      },

      setFilters: (f) => set({ filters: f }),

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id)
            ? s.favorites.filter((f) => f !== id)
            : [...s.favorites, id],
        })),

      isFavorite: (id) => get().favorites.includes(id),

      addRecent: (slug) =>
        set((s) => ({
          recents: [slug, ...s.recents.filter((r) => r !== slug)].slice(0, 12),
        })),

      setFeaturedScrollLeft: (v) => set({ featuredScrollLeft: v }),
      setFeaturedClickedId: (id) => set({ featuredClickedId: id }),
      setFeaturedRestorePending: (v) => set({ featuredRestorePending: v }),

      setUser: (u) => {
        const current = get().user;
        // If user changes (different id), clear their personal data
        if (current && u && current.id !== u.id) {
          set({ user: u, favorites: [], favoritesSeenCount: 0, recents: [], profilePanel: null });
        } else if (!u) {
          // Logout: clear personal data
          set({ user: null, favorites: [], favoritesSeenCount: 0, recents: [], profilePanel: null });
        } else {
          // Merge with current user to preserve bannerImage/logoImage if not provided
          set({ user: { ...(current || {}), ...u } });
        }
      },

      logout: () => set({ user: null, favorites: [], favoritesSeenCount: 0, recents: [], profilePanel: null, view: "home", slug: undefined, filters: {} }),
    }),
    {
      name: "gomesin-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        favorites: s.favorites,
        favoritesSeenCount: s.favoritesSeenCount,
        recents: s.recents,
        user: s.user,
      }),
    }
  )
);
