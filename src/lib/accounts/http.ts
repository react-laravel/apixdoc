import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TeamError, teamBody, teamSuccess } from "@/lib/team/errors";
import { operationFailure } from "@/lib/operations/failures";
export { teamBody as accountBody, teamSuccess as accountSuccess };
export async function accountActor() {
  const session = await auth();
  if (!session?.user?.id) throw new TeamError("请先登录", 401);
  return session.user.id;
}
export function accountFailure(error: unknown) {
  if (error instanceof TeamError)
    return NextResponse.json(
      { success: false, error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034", "P2025"].includes(error.code)
  )
    return NextResponse.json(
      { success: false, error: "账号状态已变化，请刷新后重试" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  return operationFailure(error, "accounts");
}
