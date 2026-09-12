import { logFailure } from "@/lib/operations/failures";
import { parseTree, findNodeAtLocation, type ParseError } from "jsonc-parser";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
export class DocumentError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "DOCUMENT_ERROR",
    public data?: unknown,
  ) {
    super(message);
  }
}
export function documentFailure(error: unknown) {
  if (error instanceof DocumentError)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        data: error.data,
      },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2034", "P2025", "P2002"].includes(error.code)
  )
    return NextResponse.json(
      {
        success: false,
        error: "内容正在被修改，请重新载入后重试",
        code: "RETRY_DOCUMENT",
      },
      { status: 409 },
    );
  const requestId = logFailure(error, "documents");
  return NextResponse.json(
    { success: false, error: "文档操作失败，请稍后重试", requestId },
    {
      status: 500,
      headers: {
        "X-Request-ID": requestId,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
export const documentSuccess = (data: unknown, status = 200) =>
  NextResponse.json(
    { success: true, data },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
export async function documentBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const allowed = new URL(process.env.AUTH_URL || request.url).origin;
  if (origin && origin !== allowed)
    throw new DocumentError("请求来源不正确", 403);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 12 * 1024 * 1024)
    throw new DocumentError("请求内容超过 12 MB");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const errors: ParseError[] = [];
    const tree = parseTree(text, errors, { disallowComments: true });
    if (!tree || errors.length) throw new Error();
    const capture = (
      parent: Record<string, unknown>,
      path: (string | number)[],
      keys: string[],
    ) => {
      for (const key of keys) {
        const node = findNodeAtLocation(tree, [...path, key]);
        if (node && node.type !== "string")
          parent[key] = text.slice(node.offset, node.offset + node.length);
      }
    };
    capture(value, [], ["schema", "example", "content"]);
    if (value.requestBody && typeof value.requestBody === "object")
      capture(
        value.requestBody,
        ["requestBody"],
        ["schema", "example", "content"],
      );
    for (const key of ["params", "parameters", "responses"])
      if (Array.isArray(value[key]))
        value[key].slice(0, 2001).forEach((row: unknown, index: number) => {
          if (row && typeof row === "object" && !Array.isArray(row))
            capture(
              row as Record<string, unknown>,
              [key, index],
              key === "responses" ? ["schema", "example"] : ["schema"],
            );
        });
    return value;
  } catch {
    throw new DocumentError("请求格式不正确");
  }
}
export function requireVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new DocumentError(
      "请先读取当前版本，再提交修改",
      428,
      "VERSION_REQUIRED",
    );
  return Number(value);
}
