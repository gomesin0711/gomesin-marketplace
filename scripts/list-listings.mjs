import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const listings = await db.listing.findMany({
  select: { id: true, title: true, status: true }
});
for (const l of listings) {
  console.log(l.id, '|', l.status, '|', l.title);
}

await db.$disconnect();
