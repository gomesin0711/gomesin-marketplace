import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const pakets = await db.paket.findMany({ orderBy: { sortOrder: 'asc' } });
for (const p of pakets) {
  console.log(p.key, p.name, 'price:', p.price, 'originalPrice:', p.originalPrice, 'active:', p.active);
}
await db.$disconnect();
