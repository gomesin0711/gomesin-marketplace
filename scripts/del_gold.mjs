import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const pakets = await db.paket.findMany({ where: { key: 'colek' }, orderBy: { id: 'asc' } });
console.log('Gold (colek) pakets:', JSON.stringify(pakets, null, 2));
if (pakets.length > 0) {
  await db.paket.delete({ where: { id: pakets[0].id } });
  console.log('Deleted first Gold paket id:', pakets[0].id);
}
const remaining = await db.paket.findMany();
console.log('Remaining pakets:', remaining.map(p => p.name + '(' + p.key + ')').join(', '));
await db.$disconnect();
