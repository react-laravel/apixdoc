import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auditRetention, retentionOptions } from "../src/lib/audit/retention";
Promise.resolve()
  .then(() => auditRetention(retentionOptions(process.argv.slice(2))))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "清理失败");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
