import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // Update Paket key from 'gratis' to 'colek'
  const updated = await db.paket.updateMany({
    where: { key: 'gratis' },
    data: { key: 'colek' },
  });
  console.log(`Updated ${updated.count} paket(s) from 'gratis' to 'colek'`);

  // Update existing listings with packageType 'gratis' to 'colek'
  const updatedListings = await db.listing.updateMany({
    where: { packageType: 'gratis' },
    data: { packageType: 'colek' },
  });
  console.log(`Updated ${updatedListings.count} listing(s) from 'gratis' to 'colek'`);

  // Verify
  const pakets = await db.paket.findMany({ orderBy: { sortOrder: 'asc' } });
  console.log('Pakets:', JSON.stringify(pakets, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
