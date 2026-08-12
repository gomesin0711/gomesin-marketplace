// One-off: replace "gomesin" (case-insensitive) → "mesinKU" in all text fields
// of the local SQLite DB (User, Seller, Listing). Run with: bun scripts/rebrand-db.mjs
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function rebrand(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/GOMESIN/g, 'mesinKU')
    .replace(/GoMesin/g, 'mesinKU')
    .replace(/Gomesin/g, 'mesinKU')
    .replace(/gomesin/g, 'mesinKU');
}

let changed = 0;

// --- Users ---
const users = await db.user.findMany();
for (const u of users) {
  const data = {};
  for (const f of ['name', 'email', 'company', 'city', 'address']) {
    if (u[f] && /gomesin/i.test(u[f])) data[f] = rebrand(u[f]);
  }
  if (Object.keys(data).length) {
    await db.user.update({ where: { id: u.id }, data });
    changed++;
    console.log('User', u.id, '→', JSON.stringify(data));
  }
}

// --- Sellers ---
const sellers = await db.seller.findMany();
for (const s of sellers) {
  const data = {};
  for (const f of ['name', 'city', 'province']) {
    if (s[f] && /gomesin/i.test(s[f])) data[f] = rebrand(s[f]);
  }
  if (Object.keys(data).length) {
    await db.seller.update({ where: { id: s.id }, data });
    changed++;
    console.log('Seller', s.id, '→', JSON.stringify(data));
  }
}

// --- Listings ---
const listings = await db.listing.findMany();
for (const l of listings) {
  const data = {};
  for (const f of ['title','titleEn','titleZh','description','descEn','descZh','brand','city','province','specs','specsEn','specsZh']) {
    if (l[f] && /gomesin/i.test(l[f])) data[f] = rebrand(l[f]);
  }
  if (Object.keys(data).length) {
    await db.listing.update({ where: { id: l.id }, data });
    changed++;
    console.log('Listing', l.id, '→', Object.keys(data).join(','));
  }
}

console.log(`\nDone. ${changed} rows updated.`);
await db.$disconnect();
