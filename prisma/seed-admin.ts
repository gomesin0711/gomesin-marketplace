import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  const email = "mesinKU0711@gmail.com";

  // Password dibaca dari env var ADMIN_PASSWORD.
  // Jangan hardcode password default di repo — jika env var tidak diset, seed akan error.
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD env var wajib diset (min 8 karakter) sebelum menjalankan seed-admin."
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Update password admin yang sudah ada ke password baru dari env var,
    // dan pastikan role-nya admin.
    await db.user.update({
      where: { id: existing.id },
      data: { role: "admin", password: hashPassword(password) },
    });
    console.log("Admin password rotated & role ensured:", existing.email);
    return;
  }
  const admin = await db.user.create({
    data: {
      name: "Admin mesinKU",
      email,
      password: hashPassword(password),
      phone: "085888082208",
      city: "Jakarta",
      role: "admin",
    },
    select: { id: true, name: true, email: true, role: true },
  });
  console.log("Admin created:", admin);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
