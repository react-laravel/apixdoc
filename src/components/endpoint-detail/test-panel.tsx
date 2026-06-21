"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { EndpointParam, GlobalHeader, GlobalParam, SendRequestResult } from "@/lib/types";

function getAuthTokenStorageKey(baseUrl: string) {
  const normalized = baseUrl.trim();
  if (!normalized) return "apixdoc.auth-token.default";
  try {
    const url = new URL(normalized);
    return `apixdoc.auth-token.${url.origin}`;
  } catch {
    return `apixdoc.auth-token.${normalized}`;
  }
}

export interface SendRequestOptions {
  headers: Array<{ key: string; value: string }>;
  queryParams: Array<{ key: string; value: string }>;
  body: string;
  authToken: string;
}

interface TestPanelProps {
  method: string;
  path: string;
  projectBaseUrl: string;
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  params: EndpointParam[];
  bodyExample: string;
  onSend: (options: SendRequestOptions) => Promise<SendRequestResult>;
  onImportResponse: (response: SendRequestResult) => void;
}

export function TestPanel({
  method,
  path,
  projectBaseUrl,
  globalHeaders,
  globalParams,
  params,
  bodyExample,
  onSend,
  onImportResponse,
}: TestPanelProps) {
  const [testHeaders, setTestHeaders] = useState<
    Array<{ key: string; value: string }>
  >(
    (globalHeaders ?? [])
      .filter((h) => h.enabled)
      .map((h) => ({ key: h.key, value: h.value })),
  );
  const [testQueryParams, setTestQueryParams] = useState<
    Array<{ key: string; value: string }>
  >(
    [
      ...(globalParams ?? [])
        .filter((p) => p.enabled && p.location === "query")
        .map((p) => ({ key: p.name, value: p.value })),
      ...(params ?? [])
        .filter((p) => p.location === "query")
        .map((p) => ({ key: p.name, value: p.example })),
    ],
  );
  const [testBody, setTestBody] = useState(bodyExample);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    body: string;
    duration: number;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  useEffect(() => {
    setAuthToken(localStorage.getItem(getAuthTokenStorageKey(projectBaseUrl)) ?? "");
    setTokenNotice(null);
  }, [projectBaseUrl]);

  const handleSend = async () => {
    setTestLoading(true);
    setTestResponse(null);
    setTestError(null);

    try {
      const result = await onSend({
        headers: testHeaders,
        queryParams: testQueryParams,
        body: testBody || bodyExample,
        authToken,
      });
      setTestResponse(result);
    } catch (err) {
      setTestError(
        err instanceof Error ? err.message : "网络错误，请检查请求地址",
      );
    } finally {
      setTestLoading(false);
    }
  };

  const handleImportResponse = () => {
    if (!testResponse) return;
    onImportResponse(testResponse);
  };

  const maskedAuthToken = authToken
    ? `${authToken.slice(0, 10)}...${authToken.slice(-6)}`
    : "";

  const addTestHeader = () => {
    setTestHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateTestHeader = (index: number, field: "key" | "value", value: string) => {
    setTestHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
    );
  };

  const removeTestHeader = (index: number) => {
    setTestHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const addTestQueryParam = () => {
    setTestQueryParams((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateTestQueryParam = (index: number, field: "key" | "value", value: string) => {
    setTestQueryParams((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  };

  const removeTestQueryParam = (index: number) => {
    setTestQueryParams((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* URL */}
      <div>
        <label className="mb-1 block text-sm font-medium">请求 URL</label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs sm:text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Badge variant="secondary" className="text-xs">
            {method}
          </Badge>
          <span className="min-w-0 break-all text-zinc-600 dark:text-zinc-400">
            {projectBaseUrl}
            {path}
          </span>
        </div>
      </div>

      {/* Auth Token */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">Laravel Token</div>
            <div className="mt-1 break-all font-mono text-xs text-zinc-500">
              {authToken
                ? `已保存：${maskedAuthToken}`
                : "调用登录接口后，会自动从响应中的 token / access_token / plainTextToken 保存"}
            </div>
          </div>
          {authToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.removeItem(getAuthTokenStorageKey(projectBaseUrl));
                setAuthToken("");
                setTokenNotice("已清除保存的 Token");
              }}
            >
              清除 Token
            </Button>
          )}
        </div>
        {tokenNotice && (
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            {tokenNotice}
          </div>
        )}
      </div>

      {/* Headers */}
      <div>
        <label className="mb-2 block text-sm font-medium">请求头</label>
        <div className="space-y-2">
          {testHeaders.map((h, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Key"
                value={h.key}
                onChange={(e) => updateTestHeader(i, "key", e.target.value)}
                className="h-8 w-full text-xs sm:w-44 sm:flex-none"
              />
              <Input
                placeholder="Value"
                value={h.value}
                onChange={(e) => updateTestHeader(i, "value", e.target.value)}
                className="h-8 w-full text-xs sm:w-72 sm:flex-none"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTestHeader(i)}
                className="h-8 shrink-0 text-xs sm:w-auto"
              >
                删除
              </Button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={addTestHeader}
              className="h-8 w-full text-xs sm:w-auto sm:flex-none"
            >
              添加
            </Button>
          </div>
        </div>
      </div>

      {/* Query Params */}
      <div>
        <label className="mb-2 block text-sm font-medium">查询参数</label>
        <div className="space-y-2">
          {testQueryParams.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Key"
                value={p.key}
                onChange={(e) => updateTestQueryParam(i, "key", e.target.value)}
                className="h-8 w-full text-xs sm:w-44 sm:flex-none"
              />
              <Input
                placeholder="Value"
                value={p.value}
                onChange={(e) => updateTestQueryParam(i, "value", e.target.value)}
                className="h-8 w-full text-xs sm:w-72 sm:flex-none"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTestQueryParam(i)}
                className="h-8 shrink-0 text-xs sm:w-auto"
              >
                删除
              </Button>
            </div>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={addTestQueryParam}
              className="h-8 w-full text-xs sm:w-auto sm:flex-none"
            >
              添加
            </Button>
          </div>
        </div>
      </div>

      {/* Request Body */}
      {"POST PUT PATCH".includes(method.toUpperCase()) && (
        <div>
          <label className="mb-1 block text-sm font-medium">请求体</label>
          <Textarea
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            placeholder='{"key": "value"}'
          />
        </div>
      )}

      {/* Send Button */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSend} disabled={testLoading}>
          {testLoading ? "发送中..." : "发送请求"}
        </Button>
      </div>

      {/* Error */}
      {testError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {testError}
        </div>
      )}

      {/* Response */}
      {testResponse && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Badge
              variant={
                testResponse.status >= 200 && testResponse.status < 300
                  ? "default"
                  : "secondary"
              }
            >
              {testResponse.status}
            </Badge>
            <span className="text-sm text-zinc-500">
              {testResponse.duration}ms
            </span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              响应体
            </label>
            <pre className="max-h-96 max-w-full overflow-auto rounded bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-900">
              {(() => {
                try {
                  return JSON.stringify(
                    JSON.parse(testResponse.body),
                    null,
                    2,
                  );
                } catch {
                  return testResponse.body;
                }
              })()}
            </pre>
          </div>

          <details className="rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-500">
              响应头
            </summary>
            <pre className="max-h-32 max-w-full overflow-auto border-t border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800">
              {JSON.stringify(testResponse.headers, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {testResponse && (
        <div className="flex">
          <Button variant="outline" size="sm" onClick={handleImportResponse}>
            将测试结果添加到响应
          </Button>
        </div>
      )}
    </div>
  );
}
