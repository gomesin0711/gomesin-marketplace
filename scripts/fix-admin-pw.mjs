import { scryptSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const salt = randomBytes(16).toString('hex');
const hash = scryptSync('admin123', salt, 64).toString('hex');
const newPw = `${salt}:${hash}`;

const result = await db.user.update({
  where: { email: 'gomesin711@gmail.com' },
  data: { password: newPw },
  select: { email: true },
});
console.log('Updated:', result.email);
console.log('Hash format OK:', newPw.includes(':'));
await db.$disconnect();
