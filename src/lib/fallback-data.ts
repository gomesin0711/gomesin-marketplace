import seedData from "@/lib/seed-data.json";

// ─── Normalization helpers ───────────────────────────────────────────────────
// The seed data is exported from the DB, so some fields (specs) may still be
// JSON strings. These helpers ensure the output matches parseListing() shape
// without actually calling parseListing.

function normalizeListing(raw: any): any {
  return {
    ...raw,
    images: Array.isArray(raw.images) ? raw.images : [],
    specs:
      typeof raw.specs === "string"
        ? (() => {
            try {
              return JSON.parse(raw.specs);
            } catch {
              return {};
            }
          })()
        : raw.specs || {},
    price: typeof raw.price === "number" ? raw.price : Number(raw.price),
    createdAt:
      raw.createdAt instanceof Date
        ? raw.createdAt.toISOString()
        : raw.createdAt,
    seller: raw.seller
      ? {
          ...raw.seller,
          joinedAt:
            raw.seller.joinedAt instanceof Date
              ? raw.seller.joinedAt.toISOString()
              : raw.seller.joinedAt,
        }
      : raw.seller,
  };
}

// ─── Filter types ───────────────────────────────────────────────────────────

export interface ListingFilters {
  q?: string;
  category?: string;
  condition?: string;
  province?: string;
  packageType?: string;
  sort?: string;
  page?: number;
  limit?: number;
  ids?: string[] | null;
  featured?: boolean;
}

// ─── getFallbackCategories ───────────────────────────────────────────────────

export function getFallbackCategories() {
  // Count active listings per category from seed data
  const countMap: Record<string, number> = {};
  for (const l of seedData.listings) {
    if (l.status === "active" && l.categoryId) {
      countMap[l.categoryId] = (countMap[l.categoryId] || 0) + 1;
    }
  }

  const result = seedData.categories
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sortOrder,
      listingCount: countMap[c.id] ?? 0,
    }));

  return { categories: result };
}

// ─── getFallbackListings ─────────────────────────────────────────────────────

export function getFallbackListings(filters?: ListingFilters) {
  const q = filters?.q?.trim().toLowerCase() || "";
  const categorySlug = filters?.category || "";
  const conditionFilter = filters?.condition || "";
  const provinceFilter = filters?.province || "";
  const packageTypeFilter = filters?.packageType || "";
  const sort = filters?.sort || "newest";
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(48, Math.max(1, filters?.limit ?? 24));
  const ids = filters?.ids ?? null;
  const featuredOnly = filters?.featured ?? false;

  // Start with all listings, filter to active + paid + no violation
  let filtered = seedData.listings.filter(
    (l) =>
      l.status === "active" &&
      l.paymentStatus === "paid" &&
      l.violationFlag === false
  );

  // Filter by IDs
  if (ids && ids.length > 0) {
    filtered = filtered.filter((l) => ids.includes(l.id));
  }

  // Text search across title, description, brand, seller.name, city
  if (q) {
    filtered = filtered.filter((l) => {
      const haystack = [
        l.title,
        l.description,
        l.brand,
        l.seller?.name,
        l.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  // Category filter
  if (categorySlug) {
    if (categorySlug === "jasa-teknisi") {
      // Special case: show all "jasa" condition listings
      filtered = filtered.filter((l) => l.condition === "jasa");
    } else {
      filtered = filtered.filter((l) => l.category?.slug === categorySlug);
    }
  }

  // Condition filter
  if (conditionFilter) {
    filtered = filtered.filter((l) => l.condition === conditionFilter);
  }

  // Province filter
  if (provinceFilter) {
    filtered = filtered.filter((l) => l.province === provinceFilter);
  }

  // Package type filter
  if (packageTypeFilter) {
    const pkgList = packageTypeFilter
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (pkgList.length === 1) {
      filtered = filtered.filter((l) => l.packageType === pkgList[0]);
    } else if (pkgList.length > 1) {
      filtered = filtered.filter((l) =>
        pkgList.includes(l.packageType || "")
      );
    }
  }

  // Featured only
  if (featuredOnly) {
    filtered = filtered.filter((l) => l.featured === true);
  }

  // Sort
  filtered.sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "popular") return (b.views || 0) - (a.views || 0);
    // default: newest
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);
  const listings = paged.map(normalizeListing);

  return {
    listings,
    total,
    page,
    limit,
    totalPages,
  };
}

// ─── getFallbackListingBySlug ────────────────────────────────────────────────

export function getFallbackListingBySlug(slug: string) {
  const listing = seedData.listings.find((l) => l.slug === slug);
  if (!listing) return null;

  const normalized = normalizeListing(listing);

  // Related listings: same category, exclude self, newest first, max 6
  const related = seedData.listings
    .filter(
      (l) =>
        l.status === "active" &&
        l.paymentStatus === "paid" &&
        l.violationFlag === false &&
        l.categoryId === listing.categoryId &&
        l.id !== listing.id
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 6)
    .map(normalizeListing);

  return {
    listing: normalized,
    related,
  };
}

// ─── getFallbackPakets ───────────────────────────────────────────────────────

export function getFallbackPakets() {
  return seedData.pakets || [];
}

// ─── searchFallbackListings ─────────────────────────────────────────────────

export function searchFallbackListings(q: string) {
  const query = q.trim().toLowerCase();
  if (!query) {
    return { listings: [], categories: [], sellers: [] };
  }

  // Search listings: match title, description, brand, city, seller name/company
  const activeListings = seedData.listings.filter(
    (l) =>
      l.status === "active" &&
      l.paymentStatus === "paid" &&
      l.violationFlag === false
  );

  const matchedListings = activeListings
    .filter((l) => {
      const haystack = [
        l.title,
        l.description,
        l.brand,
        l.city,
        l.seller?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8)
    .map((l) => {
      const images: string[] = Array.isArray(l.images)
        ? l.images
        : (() => {
            try {
              return JSON.parse(l.images || "[]");
            } catch {
              return [];
            }
          })();
      return {
        id: l.id,
        title: l.title,
        slug: l.slug,
        price:
          typeof l.price === "number" ? l.price : Number(l.price),
        city: l.city,
        province: l.province,
        image: images.length > 0 ? images[0] : null,
        categoryName: l.category?.name || null,
        categorySlug: l.category?.slug || null,
        sellerCompany: null,
      };
    });

  // Search categories
  const matchedCategories = seedData.categories
    .filter((c) => {
      const name = (c.name || "").toLowerCase();
      const slug = (c.slug || "").toLowerCase();
      return name.includes(query) || slug.includes(query);
    })
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
    }));

  // Search sellers (from listing seller data, deduplicated by seller id)
  const sellerMap = new Map<string, any>();
  for (const l of activeListings) {
    const s = l.seller;
    if (!s || sellerMap.has(s.id)) continue;
    const haystack = [s.name, s.city].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(query)) {
      sellerMap.set(s.id, {
        id: s.id,
        name: s.name,
        company: null,
        city: s.city,
        logoImage: s.avatar || null,
      });
    }
  }
  const matchedSellers = Array.from(sellerMap.values()).slice(0, 5);

  return {
    listings: matchedListings,
    categories: matchedCategories,
    sellers: matchedSellers,
  };
}

// ─── getFallbackPopularListings ──────────────────────────────────────────────
// For /api/listings/popular — returns listings sorted by views desc (proxy for popular)

export function getFallbackPopularListings(limit: number = 8) {
  const active = seedData.listings
    .filter(
      (l) =>
        l.status === "active" &&
        l.paymentStatus === "paid" &&
        l.violationFlag === false
    )
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
    .map(normalizeListing);

  return {
    listings: active,
    total: active.length,
    page: 1,
    limit,
    totalPages: 1,
  };
}

// ─── getFallbackMostSearchedListings ─────────────────────────────────────────
// For /api/listings/most-searched — returns listings sorted by views desc
// (chat count data not available in seed, so views is used as proxy)

export function getFallbackMostSearchedListings(limit: number = 12) {
  const active = seedData.listings
    .filter(
      (l) =>
        l.status === "active" &&
        l.paymentStatus === "paid" &&
        l.violationFlag === false
    )
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit)
    .map((l) => ({
      ...normalizeListing(l),
      chatCount: 0,
      views: l.views || 0,
    }));

  return {
    listings: active,
    total: active.length,
    page: 1,
    limit,
    totalPages: 1,
  };
}
