import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
// Fix Gold: set originalPrice > price for strikethrough
await db.paket.updateMany({ where: { key: 'gratis' }, data: { originalPrice: 120000 } });
// Fix Colek: set originalPrice > price for strikethrough
await db.paket.updateMany({ where: { key: 'sundul' }, data: { originalPrice: 50000 } });
const pakets = await db.paket.findMany({ orderBy: { sortOrder: 'asc' } });
for (const p of pakets) {
  console.log(p.key, p.name, 'price:', p.price, 'originalPrice:', p.originalPrice);
}
await db.$disconnect();
