"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MethodBadge } from "@/components/method-badge";
import { HTTP_METHODS } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_FIELD_NAMES = new Set([
  "token",
  "access_token",
  "api_token",
  "plainTextToken",
  "plain_text_token",
]);

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

function findAuthToken(payload: unknown, depth = 0): string | null {
  if (depth > 5 || payload == null) return null;

  if (typeof payload === "string") {
    try {
      return findAuthToken(JSON.parse(payload), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const token = findAuthToken(item, depth + 1);
      if (token) return token;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (TOKEN_FIELD_NAMES.has(key) && typeof value === "string" && value.length > 8) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    const token = findAuthToken(value, depth + 1);
    if (token) return token;
  }

  return null;
}

function isLoginPath(path: string) {
  return /(^|\/)login(\/|$)/i.test(path) || /(^|\/)auth(\/|$)/i.test(path);
}


interface Param {
  id?: string;
  name: string;
  type: string;
  required: boolean;
  location: string;
  description: string;
  example: string;
}

interface ResponseItem {
  id?: string;
  statusCode: number;
  description: string;
  contentType: string;
  example: string;
}

interface EndpointData {
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  parameters?: Param[];
  requestBody?: {
    id?: string;
    contentType: string;
    schema: string;
    example: string;
  } | null;
  responses?: ResponseItem[];
}

interface EndpointDetailProps {
  endpoint: EndpointData;
  projectBaseUrl: string;
  globalHeaders: Array<{
    key: string;
    value: string;
    enabled: boolean;
  }>;
  globalParams: Array<{
    name: string;
    value: string;
    location: string;
    enabled: boolean;
  }>;
  onSave: (data: Partial<EndpointData>) => void;
}

export function EndpointDetail({
  endpoint,
  projectBaseUrl,
  globalHeaders,
  globalParams,
  onSave,
}: EndpointDetailProps) {
  // Basic info
  const [name, setName] = useState(endpoint.name);
  const [method, setMethod] = useState(endpoint.method);
  const [path, setPath] = useState(endpoint.path);
  const [description, setDescription] = useState(endpoint.description);

  // Params
  const [params, setParams] = useState<Param[]>(endpoint.parameters ?? []);

  // Request body
  const [bodyContentType, setBodyContentType] = useState(
    endpoint.requestBody?.contentType || "application/json"
  );
  const [bodySchema, setBodySchema] = useState(
    endpoint.requestBody?.schema || ""
  );
  const [bodyExample, setBodyExample] = useState(
    endpoint.requestBody?.example || ""
  );

  // Responses
  const [responses, setResponses] = useState<ResponseItem[]>(
    endpoint.responses ?? []
  );

  // Test tab state
  const [testHeaders, setTestHeaders] = useState<
    Array<{ key: string; value: string }>
  >(
    (globalHeaders ?? [])
      .filter((h) => h.enabled)
      .map((h) => ({ key: h.key, value: h.value }))
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
    ]
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

  const handleSaveBasic = () => {
    onSave({ name, method, path, description });
  };

  const handleSaveParams = () => {
    onSave({ parameters: params });
  };

  const handleSaveBody = () => {
    onSave({
      requestBody: {
        contentType: bodyContentType,
        schema: bodySchema,
        example: bodyExample,
      },
    });
  };

  const handleSaveResponses = () => {
    onSave({ responses });
  };

  const addParam = () => {
    setParams((prev) => [
      ...prev,
      {
        name: "",
        type: "string",
        required: false,
        location: "query",
        description: "",
        example: "",
      },
    ]);
  };

  const updateParam = (index: number, field: keyof Param, value: string | boolean) => {
    setParams((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeParam = (index: number) => {
    setParams((prev) => prev.filter((_, i) => i !== index));
  };

  const addResponse = () => {
    setResponses((prev) => [
      ...prev,
      { statusCode: 200, description: "", contentType: "application/json", example: "" },
    ]);
  };

  const addResponseWithStatus = (statusCode: number) => {
    setResponses((prev) => {
      const exists = prev.some((r) => r.statusCode === statusCode);
      if (exists) return prev;
      return [
        ...prev,
        { statusCode, description: "", contentType: "application/json", example: "" },
      ];
    });
  };

  const addTestResponse = () => {
    if (!testResponse) return;
    const exists = responses.some((r) => r.statusCode === testResponse.status);
    if (exists) {
      setResponses((prev) =>
        prev.map((r) =>
          r.statusCode === testResponse.status
            ? {
                ...r,
                description: r.description || `${testResponse.status} response`,
                example: testResponse.body,
              }
            : r,
        ),
      );
      return;
    }
    setResponses((prev) => [
      ...prev,
      {
        statusCode: testResponse.status,
        description: `${testResponse.status} response`,
        contentType: testResponse.headers["content-type"]?.split(";")[0] || "application/json",
        example: testResponse.body,
      },
    ]);
  };

  const updateResponse = (
    index: number,
    field: keyof ResponseItem,
    value: string | number
  ) => {
    setResponses((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const removeResponse = (index: number) => {
    setResponses((prev) => prev.filter((_, i) => i !== index));
  };

  const addTestHeader = () => {
    setTestHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateTestHeader = (index: number, field: "key" | "value", value: string) => {
    setTestHeaders((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h))
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
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeTestQueryParam = (index: number) => {
    setTestQueryParams((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendRequest = async () => {
    setTestLoading(true);
    setTestResponse(null);
    setTestError(null);

    const queryString = testQueryParams
      .filter((p) => p.key)
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join("&");

    const fullUrl = `${projectBaseUrl}${path}${queryString ? `?${queryString}` : ""}`;

    if (!projectBaseUrl) {
      setTestError("请先在项目设置中配置 Base URL");
      setTestLoading(false);
      return;
    }

    const headersObj: Record<string, string> = {};
    for (const h of testHeaders) {
      if (h.key) headersObj[h.key] = h.value;
    }

    const normalizedMethod = method.toUpperCase();
    const requestHasBody = ["POST", "PUT", "PATCH"].includes(normalizedMethod);
    const hasContentTypeHeader = Object.keys(headersObj).some(
      (key) => key.toLowerCase() === "content-type"
    );
    if (requestHasBody && !hasContentTypeHeader) {
      headersObj["Content-Type"] = bodyContentType || "application/json";
    }

    const hasAuthorizationHeader = Object.keys(headersObj).some(
      (key) => key.toLowerCase() === "authorization"
    );
    if (authToken && !hasAuthorizationHeader && !isLoginPath(path)) {
      headersObj.Authorization = `Bearer ${authToken}`;
    }

    const requestBody = requestHasBody ? (testBody || bodyExample) : undefined;

    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          method: normalizedMethod,
          headers: headersObj,
          body: requestBody,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setTestResponse(json.data);
        const token = findAuthToken(json.data?.body);
        if (token) {
          localStorage.setItem(getAuthTokenStorageKey(projectBaseUrl), token);
          setAuthToken(token);
          setTokenNotice("已自动保存登录 Token，后续接口会自动携带 Authorization 请求头");
        }
      } else {
        setTestError(json.error || "请求失败");
      }
    } catch (err) {
      setTestError(
        err instanceof Error ? err.message : "网络错误，请检查请求地址"
      );
    } finally {
      setTestLoading(false);
    }
  };

  const hasBody = ["POST", "PUT", "PATCH"].includes(method.toUpperCase());
  const maskedAuthToken = authToken
    ? `${authToken.slice(0, 10)}...${authToken.slice(-6)}`
    : "";
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const normalizedPath = path.trim().replace(/\s+/g, " ");
  const normalizedMethodPath = `${method} ${path}`.trim().replace(/\s+/g, " ");
  const shouldShowName =
    normalizedName &&
    normalizedName !== normalizedPath &&
    normalizedName !== normalizedMethodPath;

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <MethodBadge method={method} />
        <span className="min-w-0 break-all pr-6 font-mono text-xs text-zinc-600 sm:pr-0 sm:text-sm dark:text-zinc-400">
          {path}
        </span>
        {shouldShowName && (
          <span className="min-w-0 break-words pr-6 text-base font-semibold sm:text-lg">
            {name}
          </span>
        )}
      </div>

      <Tabs defaultValue="basic">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="params">请求参数</TabsTrigger>
          <TabsTrigger value="body">请求体</TabsTrigger>
          <TabsTrigger value="responses">响应</TabsTrigger>
          <TabsTrigger value="test">在线测试</TabsTrigger>
        </TabsList>

        {/* Basic Info */}
        <TabsContent value="basic" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                请求方法
              </label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">路径</label>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/api/resource"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">描述</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={handleSaveBasic}>保存</Button>
        </TabsContent>

        {/* Params */}
        <TabsContent value="params" className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <th className="px-3 py-2 text-left font-medium">名称</th>
                  <th className="px-3 py-2 text-left font-medium">类型</th>
                  <th className="px-3 py-2 text-left font-medium">必填</th>
                  <th className="px-3 py-2 text-left font-medium">位置</th>
                  <th className="px-3 py-2 text-left font-medium">描述</th>
                  <th className="px-3 py-2 text-left font-medium">示例</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p, i) => (
                  <tr
                    key={i}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">
                      <Input
                        value={p.name}
                        onChange={(e) => updateParam(i, "name", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.type}
                        onValueChange={(v) => updateParam(i, "type", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">string</SelectItem>
                          <SelectItem value="number">number</SelectItem>
                          <SelectItem value="integer">integer</SelectItem>
                          <SelectItem value="boolean">boolean</SelectItem>
                          <SelectItem value="array">array</SelectItem>
                          <SelectItem value="object">object</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(e) =>
                          updateParam(i, "required", e.target.checked)
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.location}
                        onValueChange={(v) => updateParam(i, "location", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="query">query</SelectItem>
                          <SelectItem value="path">path</SelectItem>
                          <SelectItem value="header">header</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={p.description}
                        onChange={(e) =>
                          updateParam(i, "description", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={p.example}
                        onChange={(e) =>
                          updateParam(i, "example", e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParam(i)}
                        className="text-xs"
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addParam}>
              添加参数
            </Button>
            <Button size="sm" onClick={handleSaveParams}>
              保存
            </Button>
          </div>
        </TabsContent>

        {/* Request Body */}
        <TabsContent value="body" className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Content-Type
            </label>
            <Select value={bodyContentType} onValueChange={setBodyContentType}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="application/json">
                  application/json
                </SelectItem>
                <SelectItem value="application/x-www-form-urlencoded">
                  application/x-www-form-urlencoded
                </SelectItem>
                <SelectItem value="multipart/form-data">
                  multipart/form-data
                </SelectItem>
                <SelectItem value="text/plain">text/plain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              JSON Schema
            </label>
            <Textarea
              value={bodySchema}
              onChange={(e) => setBodySchema(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder='{"type": "object", "properties": {...}}'
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              请求体示例
            </label>
            <Textarea
              value={bodyExample}
              onChange={(e) => setBodyExample(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder='{"key": "value"}'
            />
          </div>
          <Button onClick={handleSaveBody}>保存</Button>
        </TabsContent>

        {/* Responses */}
        <TabsContent value="responses" className="space-y-4">
          {responses.map((r, i) => (
            <div
              key={i}
              className="relative space-y-3 rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => removeResponse(i)}
                className="absolute right-2 top-2 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                aria-label="删除此响应"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    状态码
                  </label>
                  <Input
                    type="number"
                    value={r.statusCode}
                    onChange={(e) =>
                      updateResponse(i, "statusCode", parseInt(e.target.value) || 0)
                    }
                    className="h-8 w-full text-xs sm:w-24"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium">
                    描述
                  </label>
                  <Input
                    value={r.description}
                    onChange={(e) =>
                      updateResponse(i, "description", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    Content-Type
                  </label>
                  <Select
                    value={r.contentType}
                    onValueChange={(v) => updateResponse(i, "contentType", v)}
                  >
                    <SelectTrigger className="h-8 w-48 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="application/json">
                        application/json
                      </SelectItem>
                      <SelectItem value="text/plain">text/plain</SelectItem>
                      <SelectItem value="text/html">text/html</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  响应示例
                </label>
                <Textarea
                  value={r.example}
                  onChange={(e) => updateResponse(i, "example", e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-400">快速添加：</span>
              {[200, 201, 400, 401, 403, 404, 422, 500].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => addResponseWithStatus(code)}
                  disabled={responses.some((r) => r.statusCode === code)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-xs font-mono transition-colors",
                    code < 300
                      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      : code < 500
                      ? "border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-30 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      : "border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-30 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40",
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addResponse}>
                添加响应
              </Button>
              <Button size="sm" onClick={handleSaveResponses}>
                保存
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Test */}
        <TabsContent value="test" className="space-y-6">
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
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">请求头</label>
              <Button variant="outline" size="sm" onClick={addTestHeader}>
                添加
              </Button>
            </div>
            <div className="space-y-2">
              {testHeaders.map((h, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Key"
                    value={h.key}
                    onChange={(e) => updateTestHeader(i, "key", e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) =>
                      updateTestHeader(i, "value", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTestHeader(i)}
                    className="text-xs"
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Query Params */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">查询参数</label>
              <Button variant="outline" size="sm" onClick={addTestQueryParam}>
                添加
              </Button>
            </div>
            <div className="space-y-2">
              {testQueryParams.map((p, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    placeholder="Key"
                    value={p.key}
                    onChange={(e) =>
                      updateTestQueryParam(i, "key", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Value"
                    value={p.value}
                    onChange={(e) =>
                      updateTestQueryParam(i, "value", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTestQueryParam(i)}
                    className="text-xs"
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Request Body */}
          {hasBody && (
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
            <Button onClick={handleSendRequest} disabled={testLoading}>
              {testLoading ? "发送中..." : "发送请求"}
            </Button>
            {testResponse && (
              <Button variant="outline" size="sm" onClick={addTestResponse}>
                添加到响应
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
                        2
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
