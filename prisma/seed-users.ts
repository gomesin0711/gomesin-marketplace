import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

// Admin user — MUST match the hardcoded seed in src/lib/auth-fallback.ts
// so the logged-in admin session (id cms1trinv0000pzao4vy44or8) actually
// exists in the DB and shows up in the admin panel's Users list.
const ADMIN = {
  id: "cms1trinv0000pzao4vy44or8",
  name: "Admin mesinKU",
  email: "mesinku711@gmail.com",
  // Pre-hashed password for "admin123" — same as auth-fallback SEED_USERS.
  // Using the exact same hash so login works whether the request hits the
  // DB path or the auth-fallback path.
  password:
    "0b1dd31e55556886306717e8dbb2ba9c:b52c0fb71b1f3d98dbf8668c24597d6ea63a21f81757d623c13a08fbb79e69482ee7586e34ab004b3e97840dc9e855fba2ef63be7b36e799112a1dedf1dcc9b1",
  phone: "085888082208",
  city: "Jakarta",
  company: "mesinKU",
  address: "tangerang",
  role: "admin",
  createdAt: new Date("2026-07-26T13:19:34.460Z"),
};

// Sample regular users — varied registration dates so the admin panel's
// "today / week / month" counters all show non-zero values.
type SampleUser = {
  name: string;
  email: string;
  phone: string;
  city: string;
  company?: string;
  role?: string;
  createdAt: Date;
};

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const SAMPLE_USERS: SampleUser[] = [
  { name: "Budi Santoso", email: "budi.santoso@example.com", phone: "0812-3456-7890", city: "Jakarta", company: "CV Budi Jaya", createdAt: hoursAgo(2) },
  { name: "Siti Rahayu", email: "siti.rahayu@example.com", phone: "0813-2222-3333", city: "Bandung", company: "Siti Print", createdAt: hoursAgo(8) },
  { name: "Ahmad Hidayat", email: "ahmad.hidayat@example.com", phone: "0857-9999-1111", city: "Surabaya", company: "PT Hidayat Teknik", createdAt: daysAgo(2) },
  { name: "Dewi Lestari", email: "dewi.lestari@example.com", phone: "0818-1234-5678", city: "Semarang", createdAt: daysAgo(4) },
  { name: "Rudi Hartono", email: "rudi.hartono@example.com", phone: "0822-5555-6666", city: "Medan", company: "UD Hartono", createdAt: daysAgo(6) },
  { name: "Maya Sari", email: "maya.sari@example.com", phone: "0853-7777-8888", city: "Yogyakarta", createdAt: daysAgo(10) },
  { name: "Andi Wijaya", email: "andi.wijaya@example.com", phone: "0856-1111-2222", city: "Bekasi", company: "PT Wijaya Makmur", createdAt: daysAgo(15) },
  { name: "Rina Marlina", email: "rina.marlina@example.com", phone: "0878-3333-4444", city: "Tangerang", createdAt: daysAgo(25) },
  { name: "Eko Prasetyo", email: "eko.prasetyo@example.com", phone: "0821-8888-9999", city: "Depok", createdAt: daysAgo(40) },
  { name: "Fitri Handayani", email: "fitri.handayani@example.com", phone: "0838-5555-7777", city: "Bogor", createdAt: daysAgo(60) },
  // 'aming' user referenced in previous worklog (WA login tested with this account)
  { name: "aming", email: "aming@mesinku.id", phone: "0818666711", city: "Jakarta", createdAt: daysAgo(5) },
];

async function main() {
  console.log("=== SEEDING USERS ===");

  // 1. Upsert admin (matching auth-fallback id)
  const existingAdmin = await db.user.findUnique({ where: { id: ADMIN.id } });
  if (existingAdmin) {
    await db.user.update({
      where: { id: ADMIN.id },
      data: {
        name: ADMIN.name,
        email: ADMIN.email,
        password: ADMIN.password,
        phone: ADMIN.phone,
        city: ADMIN.city,
        company: ADMIN.company,
        address: ADMIN.address,
        role: ADMIN.role,
      },
    });
    console.log(`Admin updated: ${ADMIN.email} (${ADMIN.id})`);
  } else {
    await db.user.create({
      data: {
        id: ADMIN.id,
        name: ADMIN.name,
        email: ADMIN.email,
        password: ADMIN.password,
        phone: ADMIN.phone,
        city: ADMIN.city,
        company: ADMIN.company,
        address: ADMIN.address,
        role: ADMIN.role,
        createdAt: ADMIN.createdAt,
      },
    });
    console.log(`Admin created: ${ADMIN.email} (${ADMIN.id})`);
  }

  // 2. Upsert sample users
  const createdUserIds: { id: string; name: string; email: string }[] = [];
  for (const u of SAMPLE_USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    const password = hashPassword("user123");
    if (existing) {
      await db.user.update({
        where: { id: existing.id },
        data: {
          name: u.name,
          phone: u.phone,
          city: u.city,
          company: u.company ?? null,
          role: u.role ?? "user",
        },
      });
      createdUserIds.push({ id: existing.id, name: u.name, email: u.email });
      console.log(`User updated: ${u.name} (${u.email})`);
    } else {
      const created = await db.user.create({
        data: {
          name: u.name,
          email: u.email,
          password,
          phone: u.phone,
          city: u.city,
          company: u.company ?? null,
          role: u.role ?? "user",
          createdAt: u.createdAt,
        },
      });
      createdUserIds.push({ id: created.id, name: u.name, email: u.email });
      console.log(`User created: ${u.name} (${u.email}) — registered ${u.createdAt.toISOString().slice(0, 10)}`);
    }
  }

  // 3. Link some listings to users (so admin panel can show user activity)
  const listings = await db.listing.findMany({ select: { id: true }, take: 20 });
  for (let i = 0; i < listings.length; i++) {
    const userId = createdUserIds[i % createdUserIds.length].id;
    await db.listing.update({
      where: { id: listings[i].id },
      data: { userId },
    });
  }
  console.log(`Linked ${listings.length} listings to users`);

  // 4. Create some messages between users (so admin/messages panel has data)
  if (createdUserIds.length >= 2) {
    const msgPairs: [number, number, string][] = [
      [0, 1, "Halo, apakah mesin ini masih tersedia?"],
      [1, 0, "Halo, iya masih tersedia. Bisa di nego harganya?"],
      [0, 1, "Berapa harga terbaiknya? Saya tertarik beli."],
      [2, 0, "Mesin CNC-nya masih ready gan?"],
      [0, 2, "Ready bos, bisa cod ke Jakarta Selatan."],
      [3, 4, "Halo kak, saya mau tanya tentang kompresor Atlas Copco."],
      [4, 3, "Iya kak, kompresornya ready. Bisa kunjungi lokasi kita."],
      [5, 0, "Sudahkah mesin bubut di-overhaul?"],
      [6, 7, "Apakah masih bisa nego harga forklift-nya?"],
      [8, 0, "Excavatornya kondisi mesin masih bagus?"],
      [0, 8, "Bagus banget, baru servis rutin. Siap kerja."],
      [9, 5, "Apakah mesin jahit Juki ini original?"],
      [2, 6, "Halo, untuk CNC Router 1325 masih available?"],
      [7, 3, "Saya tertarik dengan mesin penggiling daging."],
    ];
    let msgCount = 0;
    for (const [senderIdx, receiverIdx, content] of msgPairs) {
      if (senderIdx >= createdUserIds.length || receiverIdx >= createdUserIds.length) continue;
      const sender = createdUserIds[senderIdx];
      const receiver = createdUserIds[receiverIdx];
      const senderListings = await db.listing.findFirst({
        where: { userId: sender.id },
        select: { id: true, title: true },
      });
      await db.message.create({
        data: {
          senderId: sender.id,
          receiverId: receiver.id,
          listingId: senderListings?.id ?? null,
          listingTitle: senderListings?.title ?? null,
          content,
          read: Math.random() > 0.5,
          createdAt: new Date(now.getTime() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
        },
      });
      msgCount++;
    }
    console.log(`Created ${msgCount} messages between users`);
  }

  // 5. Final summary
  const counts = {
    users: await db.user.count(),
    listings: await db.listing.count(),
    categories: await db.category.count(),
    sellers: await db.seller.count(),
    pakets: await db.paket.count(),
    messages: await db.message.count(),
    admins: await db.user.count({ where: { role: "admin" } }),
  };
  console.log("\n=== SEED COMPLETE ===");
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error("SEED FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
