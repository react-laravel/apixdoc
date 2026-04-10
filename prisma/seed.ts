import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@apixdocs.com";
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        password: hashSync("admin123", 12),
        role: "admin",
      },
    });
    console.log("Admin user created: admin@apixdocs.com / admin123");
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
