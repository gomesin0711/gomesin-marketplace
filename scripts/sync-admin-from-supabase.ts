/**
 * sync-admin-from-supabase.ts
 *
 * Task: "akun admin mesinKu harusnya isinya sama dengan admin gomesin check and fix"
 *
 * The gomesin admin account (still in Supabase production) has real content:
 *   - phone: 085888082208 (real)
 *   - bannerImage: 510KB base64 JPEG
 *   - logoImage: base64
 *   - 2 listings ("Tes" active+paid+featured, "Test Draft Invalid Cat" draft)
 *   - seller profile "Admin mesinKU" (Surabaya, verified, rating 4.7, 234 reviews)
 *
 * The local mesinKU admin account (after re-seed) is empty:
 *   - phone: 0812-0000-0000 (placeholder)
 *   - bannerImage: null
 *   - logoImage: null
 *   - 0 listings, 0 sellers
 *
 * This script replicates the gomesin admin's content into the local mesinKU admin:
 *   1. Fetch gomesin admin user (full profile incl. bannerImage + logoImage) from Supabase
 *   2. Fetch the seller profile linked to the admin's listings
 *   3. Fetch the 2 listings owned by the admin
 *   4. Fetch the categories referenced by those listings
 *   5. Update local mesinKU admin: phone, bannerImage, logoImage, city, address
 *      (KEEP mesinKU name / email / company — those are the correct rebrand)
 *   6. Upsert categories locally (so listing FK is valid)
 *   7. Upsert seller locally (rebrand any "gomesin" text → "mesinKU" just in case)
 *   8. Upsert listings locally (link to admin userId + sellerId)
 *
 * Usage: bun run scripts/sync-admin-from-supabase.ts
 */

import { db } from "../src/lib/db";

const SUPABASE_URL = "https://nyyvmttbwlwqunigkrms.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXZtdHRid2x3cXVuaWdrcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTY1NjIsImV4cCI6MjEwMDU5MjU2Mn0.yME5cuLw6bAnZ3-Pdq4IoFwEkyDATjJ3XcaJXBNcWe8";

const ADMIN_ID = "cms1trinv0000pzao4vy44or8";

async function sbFetch<T = any>(table: string, query: string): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function rebrandGomesin(text: string | null | undefined): string | null {
  if (!text) return text as null;
  // case-insensitive replace gomesin -> mesinKU, preserving null/empty
  return text.replace(/gomesin/gi, (m) =>
    m === "GOMESIN" ? "mesinKU".toUpperCase() : m === "Gomesin" ? "mesinKU" : "mesinKU"
  );
}

async function main() {
  console.log("=== SYNC ADMIN CONTENT FROM SUPABASE → LOCAL mesinKU ===\n");

  // ------------------------------------------------------------------
  // 1. Fetch gomesin admin user (full profile)
  // ------------------------------------------------------------------
  console.log("1. Fetching gomesin admin user from Supabase…");
  const [sbUser] = await sbFetch<any>(
    "User",
    `id=eq.${ADMIN_ID}&select=id,name,email,phone,city,company,address,bannerImage,logoImage,role`
  );
  if (!sbUser) {
    console.error("   ✗ gomesin admin user not found in Supabase — aborting.");
    process.exit(1);
  }
  console.log(`   ✓ name=${sbUser.name} email=${sbUser.email} phone=${sbUser.phone}`);
  console.log(
    `     bannerImage=${sbUser.bannerImage ? sbUser.bannerImage.length + " chars" : "null"}  logoImage=${sbUser.logoImage ? sbUser.logoImage.length + " chars" : "null"}`
  );

  // ------------------------------------------------------------------
  // 2. Fetch the seller profile linked to the admin's listings
  //    (The admin's listings use sellerId = cms1trfeo000cpza336e61po9 = "Admin mesinKU")
  // ------------------------------------------------------------------
  console.log("\n2. Fetching listings owned by admin (to find sellerId)…");
  const sbListings = await sbFetch<any>(
    "Listing",
    `userId=eq.${ADMIN_ID}&select=id,title,slug,description,descEn,descZh,price,priceType,condition,brand,yearProduced,city,province,images,specs,specsEn,specsZh,featured,views,status,paymentStatus,paymentExpiry,uniqueCode,sellerId,userId,categoryId,titleEn,titleZh,createdAt`
  );
  console.log(`   ✓ admin owns ${sbListings.length} listings in Supabase`);

  const sellerIds = [...new Set(sbListings.map((l) => l.sellerId).filter(Boolean))];
  console.log(`   sellerIds used: ${sellerIds.join(", ")}`);

  let sbSellers: any[] = [];
  if (sellerIds.length) {
    console.log("\n   Fetching seller profiles…");
    sbSellers = await sbFetch<any>(
      "Seller",
      `id=in.(${sellerIds.join(",")})&select=id,name,phone,avatar,city,province,verified,rating,reviewCount,joinedAt`
    );
    console.log(`   ✓ ${sbSellers.length} sellers fetched`);
  }

  // ------------------------------------------------------------------
  // 3. Fetch categories referenced by the listings
  // ------------------------------------------------------------------
  const categoryIds = [...new Set(sbListings.map((l) => l.categoryId).filter(Boolean))];
  let sbCats: any[] = [];
  if (categoryIds.length) {
    console.log(`\n3. Fetching ${categoryIds.length} category(ies)…`);
    sbCats = await sbFetch<any>(
      "Category",
      `id=in.(${categoryIds.join(",")})&select=id,name,slug,icon,color,sortOrder`
    );
    console.log(`   ✓ ${sbCats.length} categories fetched`);
  }

  // ------------------------------------------------------------------
  // 4. Update local mesinKU admin user
  //    KEEP: name="Admin mesinKU", email=mesinKU0711@gmail.com, company=mesinKU, role=admin
  //    COPY: phone, bannerImage, logoImage, city, address (from gomesin admin)
  // ------------------------------------------------------------------
  console.log("\n4. Updating local mesinKU admin user…");
  const localAdmin = await db.user.findUnique({ where: { id: ADMIN_ID } });
  if (!localAdmin) {
    console.error("   ✗ local mesinKU admin not found — aborting.");
    process.exit(1);
  }
  console.log(`   BEFORE: phone=${localAdmin.phone} bannerImage=${localAdmin.bannerImage ? "set" : "null"} logoImage=${localAdmin.logoImage ? "set" : "null"}`);

  await db.user.update({
    where: { id: ADMIN_ID },
    data: {
      phone: sbUser.phone,
      bannerImage: sbUser.bannerImage,
      logoImage: sbUser.logoImage,
      city: sbUser.city,
      address: sbUser.address,
    },
  });
  console.log(`   AFTER:  phone=${sbUser.phone} bannerImage=${sbUser.bannerImage ? "set" : "null"} logoImage=${sbUser.logoImage ? "set" : "null"}`);
  console.log(`   (kept name="${localAdmin.name}" email="${localAdmin.email}" company="${localAdmin.company}" role="${localAdmin.role}")`);

  // ------------------------------------------------------------------
  // 5. Upsert categories locally (handle slug collisions by remapping)
  //     The Supabase categories may share slugs with local seed categories
  //     but have different IDs. If a local category with the same slug
  //     already exists, remap listings to use the local ID instead of
  //     creating a duplicate.
  // ------------------------------------------------------------------
  const categoryIdRemap: Record<string, string> = {}; // sbId -> localId
  if (sbCats.length) {
    console.log(`\n5. Resolving ${sbCats.length} categor(y/ies) locally…`);
    for (const c of sbCats) {
      // First check if a local category with this exact id already exists
      const byId = await db.category.findUnique({ where: { id: c.id } });
      if (byId) {
        categoryIdRemap[c.id] = byId.id;
        console.log(`   ✓ category ${c.id} = "${c.name}" already exists locally by id`);
        continue;
      }
      // Check if a local category with the same slug exists (collision)
      const bySlug = await db.category.findUnique({ where: { slug: c.slug } });
      if (bySlug) {
        categoryIdRemap[c.id] = bySlug.id;
        console.log(`   → category slug "${c.slug}" already exists locally as ${bySlug.id}="${bySlug.name}" — remapping`);
        continue;
      }
      // No collision — create the category with its Supabase id
      await db.category.create({
        data: {
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon || "tag",
          color: c.color || "#6b7280",
          sortOrder: c.sortOrder ?? 0,
        },
      });
      categoryIdRemap[c.id] = c.id;
      console.log(`   + category ${c.id} = "${c.name}" (slug="${c.slug}") created`);
    }
  } else {
    console.log("\n5. No categories to resolve.");
  }

  // ------------------------------------------------------------------
  // 6. Upsert sellers locally (rebrand any "gomesin" → "mesinKU")
  // ------------------------------------------------------------------
  if (sbSellers.length) {
    console.log(`\n6. Upserting ${sbSellers.length} seller(s) locally…`);
    for (const s of sbSellers) {
      const sellerName = rebrandGomesin(s.name) || s.name;
      await db.seller.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          name: sellerName,
          phone: s.phone,
          avatar: s.avatar,
          city: s.city,
          province: s.province,
          verified: s.verified ?? false,
          rating: s.rating ?? 4.5,
          reviewCount: s.reviewCount ?? 0,
          joinedAt: s.joinedAt ? new Date(s.joinedAt) : new Date(),
        },
        update: {
          name: sellerName,
          phone: s.phone,
          avatar: s.avatar,
          city: s.city,
          province: s.province,
          verified: s.verified ?? false,
          rating: s.rating ?? 4.5,
          reviewCount: s.reviewCount ?? 0,
        },
      });
      console.log(`   ✓ seller ${s.id} = "${sellerName}" (city=${s.city}, verified=${s.verified})`);
    }
  } else {
    console.log("\n6. No sellers to upsert.");
  }

  // ------------------------------------------------------------------
  // 7. Upsert listings locally
  // ------------------------------------------------------------------
  if (sbListings.length) {
    console.log(`\n7. Upserting ${sbListings.length} listing(s) locally…`);
    for (const l of sbListings) {
      // Remap categoryId (Supabase id → local id, may differ due to slug collisions)
      const remappedCatId = l.categoryId ? (categoryIdRemap[l.categoryId] ?? null) : null;
      const catExists = remappedCatId ? await db.category.findUnique({ where: { id: remappedCatId } }) : null;
      const sellerExists = l.sellerId ? await db.seller.findUnique({ where: { id: l.sellerId } }) : null;

      const data = {
        id: l.id,
        title: l.title,
        titleEn: l.titleEn,
        titleZh: l.titleZh,
        slug: l.slug,
        description: l.description,
        descEn: l.descEn,
        descZh: l.descZh,
        price: BigInt(l.price || 0),
        priceType: l.priceType || "fixed",
        condition: l.condition || "bekas",
        brand: l.brand,
        yearProduced: l.yearProduced,
        city: l.city || "",
        province: l.province || "",
        images: l.images || "[]",
        specs: l.specs || "[]",
        specsEn: l.specsEn,
        specsZh: l.specsZh,
        featured: l.featured ?? false,
        views: l.views ?? 0,
        status: l.status || "active",
        paymentStatus: l.paymentStatus || "unpaid",
        paymentExpiry: l.paymentExpiry ? new Date(l.paymentExpiry) : null,
        uniqueCode: l.uniqueCode,
        sellerId: sellerExists ? l.sellerId : null,
        userId: ADMIN_ID,
        categoryId: catExists ? remappedCatId : null,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
      };

      await db.listing.upsert({
        where: { id: l.id },
        create: data,
        update: data,
      });
      console.log(
        `   ✓ listing ${l.id} = "${l.title}" (status=${l.status}, payment=${l.paymentStatus}, featured=${l.featured}, cat=${catExists ? "ok" : "MISSING"}, seller=${sellerExists ? "ok" : "MISSING"})`
      );
    }
  } else {
    console.log("\n7. No listings to upsert.");
  }

  // ------------------------------------------------------------------
  // 8. Summary
  // ------------------------------------------------------------------
  console.log("\n=== SYNC COMPLETE — verification ===");
  const finalAdmin = await db.user.findUnique({ where: { id: ADMIN_ID }, select: { id: true, name: true, email: true, phone: true, city: true, company: true, address: true, bannerImage: true, logoImage: true, role: true } });
  console.log("Local mesinKU admin:", JSON.stringify(finalAdmin, (k, v) => (k === "bannerImage" || k === "logoImage") ? (v ? `[${v.length} chars]` : null) : v, 2));

  const adminListings = await db.listing.findMany({ where: { userId: ADMIN_ID }, select: { id: true, title: true, status: true, paymentStatus: true, sellerId: true, categoryId: true, featured: true } });
  console.log(`\nAdmin listings: ${adminListings.length}`);
  console.log(JSON.stringify(adminListings, null, 2));

  const adminSellers = await db.seller.findMany({ where: { id: { in: sellerIds } } });
  console.log(`\nAdmin sellers: ${adminSellers.length}`);
  console.log(JSON.stringify(adminSellers.map(s => ({ id: s.id, name: s.name, city: s.city, verified: s.verified, rating: s.rating })), null, 2));
}

main()
  .catch((e) => {
    console.error("SYNC FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(0);
  });
