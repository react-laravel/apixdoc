import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
export function logFailure(error: unknown, category: string): string {
  const requestId = randomUUID();
  const source =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const errorType =
    typeof source.name === "string" && /^[A-Za-z0-9_]{1,80}$/.test(source.name)
      ? source.name
      : "Error";
  const code =
    typeof source.code === "string" && /^[A-Z0-9_]{1,40}$/.test(source.code)
      ? source.code
      : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      requestId,
      category,
      errorType,
      code,
    }),
  );
  return requestId;
}

export function operationFailure(error: unknown, category: string) {
  const requestId = logFailure(error, category);
  return NextResponse.json(
    { success: false, error: "操作失败，请稍后重试", requestId },
    {
      status: 500,
      headers: {
        "X-Request-ID": requestId,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
