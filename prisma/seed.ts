import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@apixdocs.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        password: hashSync(adminPassword, 12),
        role: "admin",
      },
    });
    console.log(`Admin user created: ${adminEmail}`);
  } else {
    console.log("Admin user already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
