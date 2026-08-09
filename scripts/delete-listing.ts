import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const listings = await db.listing.findMany({
  where: { title: { contains: 'mesin berjalan' } },
  select: { id: true, title: true }
});
console.log('Found listings:', JSON.stringify(listings, null, 2));

if (listings.length > 0) {
  for (const l of listings) {
    await db.listing.delete({ where: { id: l.id } });
    console.log('Deleted:', l.id, l.title);
  }
} else {
  console.log('No listing found with that title');
}

await db.$disconnect();
