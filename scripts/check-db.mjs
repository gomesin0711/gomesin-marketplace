import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

console.log('=== CATEGORIES ===');
const cats = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
for (const c of cats) {
  console.log(c.id, '|', c.slug.padEnd(25), '|', c.icon.padEnd(15), '|', c.color, '|', c.sortOrder);
}

console.log('\n=== JASA LISTINGS ===');
const jasa = await db.listing.findMany({ where: { condition: 'jasa' }, select: { id: true, title: true, condition: true } });
console.log('Jasa listings count:', jasa.length);
for (const j of jasa) console.log(' -', j.title);

console.log('\n=== SELLERS ===');
const sellers = await db.seller.findMany({ select: { id: true, name: true, city: true } });
for (const s of sellers) console.log(s.id, '|', s.name, '|', s.city);

await db.$disconnect();
