import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const admins = await db.user.findMany({ where: { role: { in: ['admin', 'superadmin'] } }, select: { id: true, name: true, email: true, role: true, password: true } });
for (const a of admins) { console.log(a.role, '|', a.email, '|', a.name, '| pw hash:', a.password?.substring(0,30)); }
console.log('Total admins:', admins.length);
await db.$disconnect();
