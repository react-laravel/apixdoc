import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
export class TeamError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function teamFailure(error: unknown) {
  if (error instanceof TeamError)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2034", "P2002", "P2025"].includes(error.code)
  )
    return NextResponse.json(
      { success: false, error: "成员状态已变化，请刷新后重试" },
      { status: 409 },
    );
  console.error(
    "Team operation failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return NextResponse.json(
    { success: false, error: "操作失败，请稍后重试" },
    { status: 500 },
  );
}
export async function teamBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const trustedOrigin = process.env.AUTH_URL
    ? new URL(process.env.AUTH_URL).origin
    : new URL(request.url).origin;
  if (origin && origin !== trustedOrigin)
    throw new TeamError("请求来源不正确", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new TeamError("请使用 JSON 请求");
  const source = await request.text();
  if (new TextEncoder().encode(source).length > 8192)
    throw new TeamError("请求内容过大");
  try {
    const body = JSON.parse(source);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw new TeamError("请求格式不正确");
  }
}
export function teamSuccess(data: unknown, status = 200) {
  return NextResponse.json(
    { success: true, data },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
