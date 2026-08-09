import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/lib/auth.ts';

const prisma = new PrismaClient();

async function main() {
  const hash = hashPassword('admin123');
  console.log('Generated hash:', hash);
  console.log('Has colon (scrypt format):', hash.includes(':'));
  console.log('Self-verify:', verifyPassword('admin123', hash));
  
  const result = await prisma.user.update({
    where: { email: 'gomesin0711@gmail.com' },
    data: { password: hash }
  });
  console.log('Updated:', result.email);
  
  const user = await prisma.user.findUnique({ where: { email: 'gomesin0711@gmail.com' } });
  console.log('DB pw prefix:', user.password.substring(0, 30));
  console.log('Final verify:', verifyPassword('admin123', user.password));
  
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
