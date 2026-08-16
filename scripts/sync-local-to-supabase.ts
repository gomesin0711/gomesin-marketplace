/**
 * sync-local-to-supabase.ts
 *
 * Pushes ALL local SQLite data (Prisma) to production Supabase so the
 * online deployment is identical to offline.
 *
 * Strategy:
 *   1. Read every row from local Prisma SQLite.
 *   2. Delete every row on Supabase (child tables first to respect FKs).
 *   3. Insert local rows into Supabase (parent tables first).
 *   4. Verify counts match.
 *
 * Run with: bun run scripts/sync-local-to-supabase.ts
 */

import { PrismaClient } from "@prisma/client";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://yzxeinqoryvprhuibtzn.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eGVpbnFvcnl2cHJodWlidHpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjA5NTcsImV4cCI6MjEwMjQzNjk1N30.gmDvyEmNGP2PbL_3a8k18pTggRE9zQ3yBrBPQNJjWTI";

const prisma = new PrismaClient();
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation,resolution=ignore-duplicates",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize a single row so Supabase (Postgres) accepts it. */
function serialize(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (typeof v === "bigint") out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (v === null) out[k] = null;
    else out[k] = v;
  }
  return out;
}

/** Delete all rows from a Supabase table. */
async function deleteAll(table: string): Promise<number> {
  // Use REST API filter that matches everything (id.not.is.null => all rows).
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=not.is.null`;
  const r = await fetch(url, { method: "DELETE", headers: HEADERS });
  if (!r.ok && r.status !== 200 && r.status !== 204) {
    const body = await r.text();
    console.warn(`  ! DELETE ${table}: HTTP ${r.status} ${body.slice(0, 200)}`);
  }
  // Count remaining
  const countR = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
    headers: HEADERS,
  });
  if (countR.ok) {
    const arr = await countR.json();
    return Array.isArray(arr) ? arr.length : 0;
  }
  return -1;
}

/** Insert rows into a Supabase table in chunks of 500. */
async function insertAll(table: string, rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const serialized = rows.map(serialize);
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < serialized.length; i += CHUNK) {
    const chunk = serialized.slice(i, i + CHUNK);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(chunk),
    });
    if (!r.ok) {
      const body = await r.text();
      console.error(`  ! INSERT ${table} chunk ${i}: HTTP ${r.status} ${body.slice(0, 400)}`);
      continue;
    }
    const arr = await r.json();
    inserted += Array.isArray(arr) ? arr.length : 0;
  }
  return inserted;
}

async function countRemote(table: string): Promise<number> {
  // Use HEAD with Prefer: count=exact
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    method: "GET",
    headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0" },
  });
  const range = r.headers.get("content-range");
  if (range && range.includes("/")) {
    const total = range.split("/")[1];
    return total === "*" ? 0 : parseInt(total, 10);
  }
  const arr = await r.json();
  return Array.isArray(arr) ? arr.length : 0;
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== STEP 1: Read local SQLite (Prisma) ===");
  const [
    categories, users, sellers, pakets, settings,
    uniqueCodes, listings, messages,
  ] = await Promise.all([
    prisma.category.findMany(),
    prisma.user.findMany(),
    prisma.seller.findMany(),
    prisma.paket.findMany(),
    prisma.siteSetting.findMany(),
    prisma.uniqueCode.findMany(),
    prisma.listing.findMany(),
    prisma.message.findMany(),
  ]);

  console.log(`  Categories:   ${categories.length}`);
  console.log(`  Users:        ${users.length} (${users.map(u => u.email).join(", ")})`);
  console.log(`  Sellers:      ${sellers.length}`);
  console.log(`  Pakets:       ${pakets.length} (${pakets.map(p => p.key).join(", ")})`);
  console.log(`  SiteSettings: ${settings.length}`);
  console.log(`  UniqueCodes:  ${uniqueCodes.length}`);
  console.log(`  Listings:     ${listings.length}`);
  console.log(`  Messages:     ${messages.length}`);

  console.log("\n=== STEP 2: Delete all rows on Supabase (FK reverse order) ===");
  // Delete child tables first to avoid FK constraint violations.
  const deleteOrder = [
    "Message", "Listing", "UniqueCode", "SiteSetting",
    "Paket", "Seller", "User", "Category",
  ];
  for (const t of deleteOrder) {
    const remaining = await deleteAll(t);
    console.log(`  ${t}: deleted (remaining=${remaining})`);
  }

  console.log("\n=== STEP 3: Insert local rows into Supabase (FK order) ===");
  // Parent tables first, then children.
  const inserts: Array<[string, any[]]> = [
    ["Category",    categories],
    ["User",        users],
    ["Seller",      sellers],
    ["Paket",       pakets],
    ["SiteSetting", settings],
    ["UniqueCode",  uniqueCodes],
    ["Listing",     listings],
    ["Message",     messages],
  ];
  for (const [table, rows] of inserts) {
    const n = await insertAll(table, rows);
    console.log(`  ${table}: inserted ${n}/${rows.length}`);
  }

  console.log("\n=== STEP 4: Verify counts match ===");
  const verify: Array<[string, number]> = [
    ["Category",    categories.length],
    ["User",        users.length],
    ["Seller",      sellers.length],
    ["Paket",       pakets.length],
    ["SiteSetting", settings.length],
    ["UniqueCode",  uniqueCodes.length],
    ["Listing",     listings.length],
    ["Message",     messages.length],
  ];
  let allOk = true;
  for (const [t, expected] of verify) {
    const actual = await countRemote(t);
    const ok = actual === expected;
    if (!ok) allOk = false;
    console.log(`  ${t}: local=${expected} remote=${actual} ${ok ? "OK" : "MISMATCH"}`);
  }

  console.log(`\n=== ${allOk ? "SYNC SUCCESS" : "SYNC COMPLETED WITH MISMATCHES"} ===`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
