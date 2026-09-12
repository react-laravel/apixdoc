"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JsonWorkbench } from "@/components/json/json-workbench";
import {
  formatBytes,
  inspectJson,
  isJsonContentType,
} from "@/lib/json-document";
import { buildRequestUrl } from "@/lib/request-url";
import { Badge } from "@/components/ui/badge";
import type {
  EndpointParam,
  GlobalHeader,
  GlobalParam,
  SendRequestResult,
} from "@/lib/types";

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
  signal?: AbortSignal;
}

interface TestPanelProps {
  method: string;
  path: string;
  projectBaseUrl: string;
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  params: EndpointParam[];
  bodyExample: string;
  bodyContentType?: string;
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
  bodyContentType = "application/json",
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
  >([
    ...(globalParams ?? [])
      .filter((p) => p.enabled && p.location === "query")
      .map((p) => ({ key: p.name, value: p.value })),
    ...(params ?? [])
      .filter((p) => p.location === "query")
      .map((p) => ({ key: p.name, value: p.example })),
  ]);
  const [testBody, setTestBody] = useState(bodyExample);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    body: string;
    duration: number;
  } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAuthToken(
        localStorage.getItem(getAuthTokenStorageKey(projectBaseUrl)) ?? "",
      );
      setTokenNotice(null);
    } catch {
      setTokenNotice("浏览器存储不可用，可临时填写 Token 发起请求");
    }
  }, [projectBaseUrl]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  const requestUrl = (() => {
    try {
      return buildRequestUrl(projectBaseUrl, path, testQueryParams);
    } catch {
      return `${projectBaseUrl}${path}`;
    }
  })();

  const handleSend = async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setTestLoading(true);
    setTestResponse(null);
    setTestError(null);

    try {
      const result = await onSend({
        headers: testHeaders,
        queryParams: testQueryParams,
        body: testBody,
        authToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setTestResponse(result);
    } catch (err) {
      setTestError(
        controller.signal.aborted
          ? "请求已取消"
          : err instanceof Error
            ? err.message
            : "网络错误，请检查请求地址",
      );
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setTestLoading(false);
    }
  };

  const handleImportResponse = () => {
    if (!testResponse) return;
    onImportResponse(testResponse);
  };

  const addTestHeader = () => {
    setTestHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateTestHeader = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
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

  const updateTestQueryParam = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
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
            {requestUrl}
          </span>
        </div>
      </div>

      {/* Auth Token */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">Bearer Token</div>
            <div className="mt-1 break-all font-mono text-xs text-zinc-500">
              {authToken
                ? "已填写访问令牌"
                : "填写访问令牌；保存后仅用于当前 API 地址"}
            </div>
          </div>
          {authToken && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  localStorage.removeItem(
                    getAuthTokenStorageKey(projectBaseUrl),
                  );
                  setTokenNotice("已清除保存的 Token");
                } catch {
                  setTokenNotice("已清除当前 Token，浏览器存储清理失败");
                }
                setAuthToken("");
              }}
            >
              清除 Token
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="password"
            autoComplete="off"
            aria-label="Bearer Token"
            placeholder="输入 Token（无需 Bearer 前缀）"
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!authToken.trim() || !projectBaseUrl}
            onClick={() => {
              try {
                localStorage.setItem(
                  getAuthTokenStorageKey(projectBaseUrl),
                  authToken.trim(),
                );
                setTokenNotice("Token 已保存到此浏览器");
              } catch {
                setTokenNotice("保存失败，本次请求仍可使用当前 Token");
              }
            }}
          >
            保存 Token
          </Button>
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
            <div
              key={i}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
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
            <div
              key={i}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <Input
                placeholder="Key"
                value={p.key}
                onChange={(e) => updateTestQueryParam(i, "key", e.target.value)}
                className="h-8 w-full text-xs sm:w-44 sm:flex-none"
              />
              <Input
                placeholder="Value"
                value={p.value}
                onChange={(e) =>
                  updateTestQueryParam(i, "value", e.target.value)
                }
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
      {["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) && (
        <div>
          <label className="mb-1 block text-sm font-medium">请求体</label>
          <JsonWorkbench
            label="测试请求体"
            value={testBody}
            onChange={setTestBody}
            language={isJsonContentType(bodyContentType) ? "json" : "text"}
            filename="request-body.json"
          />
        </div>
      )}

      {/* Send Button */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSend} disabled={testLoading}>
          {testLoading ? "发送中..." : "发送请求"}
        </Button>
        {testLoading && (
          <Button
            variant="outline"
            onClick={() => {
              requestRef.current?.abort();
              setTestError("请求已取消");
            }}
          >
            取消请求
          </Button>
        )}
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
              {testResponse.duration} ms
            </span>
            <span className="text-sm text-zinc-500">
              {formatBytes(new TextEncoder().encode(testResponse.body).length)}
            </span>
          </div>

          <JsonWorkbench
            label="响应体"
            value={testResponse.body}
            readOnly
            language={
              isJsonContentType(testResponse.headers["content-type"] || "") ||
              inspectJson(testResponse.body).root
                ? "json"
                : "text"
            }
            filename={`response-${testResponse.status}.${isJsonContentType(testResponse.headers["content-type"] || "") || inspectJson(testResponse.body).root ? "json" : "txt"}`}
          />

          <details className="rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-500">
              响应头
            </summary>
            <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <tbody>
                  {Object.entries(testResponse.headers).map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                    >
                      <th className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                        {key}
                      </th>
                      <td className="break-all px-3 py-2 font-mono">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
