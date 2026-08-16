/**
 * change-admin-email.mjs
 *
 * One-off migration: change the admin login email from
 *   mesinKU0711@gmail.com  →  mesinku711@gmail.com
 *
 * Updates the User row in the local SQLite DB (Prisma).
 * Idempotent: safe to run multiple times.
 *
 * Usage:  bun run scripts/change-admin-email.mjs
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const OLD_EMAIL = "mesinKU0711@gmail.com";
const NEW_EMAIL = "mesinku711@gmail.com";

async function main() {
  console.log("=== CHANGE ADMIN EMAIL ===");
  console.log(`  ${OLD_EMAIL}  →  ${NEW_EMAIL}\n`);

  // 1. Make sure no OTHER user already occupies the new email (unique constraint).
  //    SQLite is case-sensitive by default; use COLLATE NOCASE.
  const conflicts = await db.$queryRaw<Array<{ id: string; name: string; role: string }>>`
    SELECT id, name, role FROM User
    WHERE email = ${NEW_EMAIL} COLLATE NOCASE
  `;
  if (conflicts.length > 0) {
    const c = conflicts[0];
    // It could be the admin itself (already migrated) — check role.
    if (c.role === "admin") {
      console.log(`   ✓ Admin already uses ${NEW_EMAIL} (id=${c.id}). Nothing to do.`);
      return;
    }
    console.error(`   ✗ A different user already owns ${NEW_EMAIL}:`);
    console.error(`     id=${c.id} name="${c.name}" role="${c.role}"`);
    process.exit(1);
  }

  // 2. Find the admin by the OLD email (case-insensitive — covers
  //    mesinKU0711 / mesinku0711 / MESINKU0711 variants).
  const admins = await db.$queryRaw<Array<{
    id: string; email: string; name: string; role: string;
  }>>`
    SELECT id, email, name, role FROM User
    WHERE email = ${OLD_EMAIL} COLLATE NOCASE AND role = 'admin'
  `;
  if (admins.length === 0) {
    console.error(`   ✗ No admin found with email ${OLD_EMAIL}. Aborting.`);
    process.exit(1);
  }

  const admin = admins[0];
  console.log(`   Found admin: id=${admin.id} name="${admin.name}" email="${admin.email}" role="${admin.role}"`);

  // 3. Update the email (use raw SQL to bypass Prisma's case-sensitive unique lookup)
  await db.$executeRaw`
    UPDATE User SET email = ${NEW_EMAIL} WHERE id = ${admin.id}
  `;
  console.log(`   ✓ Email updated to ${NEW_EMAIL}`);

  // 4. Verify
  const verify = await db.$queryRaw<Array<{
    id: string; email: string; name: string; role: string;
  }>>`
    SELECT id, email, name, role FROM User WHERE id = ${admin.id}
  `;
  const v = verify[0];
  console.log(`   Verified: id=${v.id} email="${v.email}" name="${v.name}" role="${v.role}"`);

  console.log("\n=== DONE ===");
}

main()
  .catch((e) => {
    console.error("MIGRATION FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(0);
  });
