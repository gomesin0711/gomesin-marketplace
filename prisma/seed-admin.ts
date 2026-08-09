import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  const email = "gomesin711@gmail.com";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // ensure role admin
    if (existing.role !== "admin") {
      await db.user.update({ where: { id: existing.id }, data: { role: "admin" } });
      console.log("User updated to admin:", existing.email);
    } else {
      console.log("Admin already exists:", email);
    }
    return;
  }
  const admin = await db.user.create({
    data: {
      name: "Admin Gomesin",
      email,
      password: hashPassword("admin123"),
      phone: "0812-0000-0000",
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
