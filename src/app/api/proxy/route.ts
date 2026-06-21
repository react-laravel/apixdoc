import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isHttpRequestMethod,
  PROXY_TIMEOUT_MS,
  readLimitedResponseBody,
  sanitizeProxyHeaders,
  validateExternalUrl,
} from "@/lib/security";
import { type ApiResponse } from "@/lib/utils";

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { url, method, headers, body: requestBody } = body;
    const normalizedMethod =
      typeof method === "string" ? method.toUpperCase() : "";

    if (!url || !normalizedMethod) {
      return NextResponse.json(
        { success: false, error: "url and method are required" },
        { status: 400 }
      );
    }

    if (!isHttpRequestMethod(normalizedMethod)) {
      return NextResponse.json(
        { success: false, error: "Unsupported HTTP method" },
        { status: 400 }
      );
    }

    const targetUrl = await validateExternalUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    const fetchOptions: RequestInit = {
      method: normalizedMethod,
      headers: sanitizeProxyHeaders(headers),
      redirect: "manual",
      signal: controller.signal,
    };

    if (requestBody && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
      fetchOptions.body =
        typeof requestBody === "string"
          ? requestBody
          : JSON.stringify(requestBody);
    }

    try {
      const startTime = Date.now();
      const response = await fetch(targetUrl, fetchOptions);
      const duration = Date.now() - startTime;
      const responseBody = await readLimitedResponseBody(response);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return NextResponse.json({
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          duration,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "请求超时"
        : error instanceof Error
          ? error.message
          : "请求失败";
    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof DOMException && error.name === "AbortError" ? 504 : 502 },
    );
  }
}
