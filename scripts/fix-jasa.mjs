import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const result = await db.listing.updateMany({
  where: { condition: 'jasa', paymentStatus: 'unpaid' },
  data: { paymentStatus: 'paid', status: 'active' },
});
console.log('Updated', result.count, 'jasa listings to active + paid');

// Verify
const jasa = await db.listing.findMany({
  where: { condition: 'jasa' },
  select: { id: true, title: true, status: true, paymentStatus: true },
});
for (const j of jasa) {
  console.log(' ', j.status, j.paymentStatus, '|', j.title.slice(0, 60));
}

await db.$disconnect();
