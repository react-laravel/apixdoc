import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { logFailure } from "../src/lib/operations/failures";
import {
  BootstrapError,
  bootstrapAdministrator,
} from "../src/lib/operations/bootstrap";
bootstrapAdministrator()
  .then((result) =>
    console.log(
      result.created ? "管理员已初始化" : "管理员已存在，账号与密码保持不变",
    ),
  )
  .catch((error) => {
    console.error(
      error instanceof BootstrapError
        ? error.message
        : `初始化失败，问题编号 ${logFailure(error, "bootstrap")}`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
