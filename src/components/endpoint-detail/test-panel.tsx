"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Copy,
  Download,
  History,
  Loader2,
  RotateCcw,
  Send,
  Square,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { RequestRows } from "@/components/request/request-rows";
import { RequestAuthEditor } from "@/components/request/request-auth";
import { RequestHistory } from "@/components/request/request-history";
import { CurlImportDialog } from "@/components/request/curl-import-dialog";
import {
  formatBytes,
  inspectJson,
  isJsonContentType,
} from "@/lib/json-document";
import {
  createRequestDraft,
  readRequestAuth,
  draftFromRequest,
  extractPathParameters,
  prepareRequest,
} from "@/lib/request/prepare";
import { reconcileDocumentDraft } from "@/lib/request/reconcile";
import { environmentVariables } from "@/lib/request/variables";
import { exportCurl } from "@/lib/request/curl";
import {
  createHistoryEntry,
  displayRequestUrl,
  HISTORY_LIMIT,
  historyStorageKey,
  parseHistory,
  serializeHistory,
} from "@/lib/request/history";
import {
  REQUEST_METHODS,
  requestRow,
  type PreparedRequest,
  type RequestDraft,
  type RequestHistoryEntry,
} from "@/lib/request/types";
import type {
  EndpointHeader,
  EndpointParam,
  Environment,
  GlobalHeader,
  GlobalParam,
  SendRequestResult,
} from "@/lib/types";

export interface SendRequestOptions extends PreparedRequest {
  signal?: AbortSignal;
}
interface TestPanelProps {
  projectId?: string;
  endpointId?: string;
  method: string;
  path: string;
  projectBaseUrl: string;
  environments?: Environment[];
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  params: EndpointParam[];
  endpointAuth?: string;
  endpointServerUrl?: string;
  endpointVariables?: string;
  endpointHeaders?: EndpointHeader[];
  bodyExample: string;
  bodyContentType?: string;
  onSend: (options: SendRequestOptions) => Promise<SendRequestResult>;
  onImportResponse: (response: SendRequestResult) => void;
}
const emptyEnvironments: Environment[] = [];

export function TestPanel(props: TestPanelProps) {
  const {
    projectId,
    endpointId,
    projectBaseUrl,
    endpointAuth,
    endpointServerUrl,
    endpointVariables,
    environments = emptyEnvironments,
    onSend,
    onImportResponse,
  } = props;
  const session = useSession();
  const userId = session.data?.user?.id;
  const [initialDefaults] = useState(() => createRequestDraft(props));
  const [draft, setDraft] = useState<RequestDraft>(initialDefaults);
  const previousDefaults = useRef(initialDefaults);
  const documentSignature = JSON.stringify({
    method: props.method,
    path: props.path,
    params: props.params,
    globalParams: props.globalParams,
    globalHeaders: props.globalHeaders,
    endpointHeaders: props.endpointHeaders,
    endpointAuth: props.endpointAuth,
    bodyExample: props.bodyExample,
    bodyContentType: props.bodyContentType,
  });
  const previousSignature = useRef(documentSignature);
  const [selectedEnvironment, setSelectedEnvironment] = useState("project");
  const [tab, setTab] = useState("params");
  const [curlOpen, setCurlOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<RequestHistoryEntry[]>([]);
  const historyRef = useRef<RequestHistoryEntry[]>([]);
  const [outcome, setOutcome] = useState<RequestHistoryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const storageKey =
    userId && projectId && endpointId
      ? historyStorageKey(userId, projectId, endpointId)
      : null;
  const activeScope = useRef(storageKey);
  useLayoutEffect(() => {
    if (activeScope.current === storageKey) return;
    activeScope.current = storageKey;
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
    setOutcome(null);
    setError(null);
  }, [storageKey]);
  const environmentStorageKey =
    userId && projectId
      ? `apixdoc.environment.v1:${userId}:${projectId}`
      : null;
  const environmentSignature = JSON.stringify(
    [...environments].sort((a, b) => a.name.localeCompare(b.name)),
  );
  const environment = useMemo(
    () =>
      selectedEnvironment === "endpoint" && endpointServerUrl
        ? {
            name: "接口默认",
            baseUrl: endpointServerUrl,
            variables: JSON.stringify(
              Object.fromEntries([
                ...environmentVariables(
                  environments.find((env) => env.isDefault)?.variables || "{}",
                ),
                ...environmentVariables(endpointVariables || "{}"),
              ]),
            ),
          }
        : environments.find((env) => `env:${env.name}` === selectedEnvironment),
    [selectedEnvironment, endpointServerUrl, endpointVariables, environments],
  );
  const customAddress = /^https?:\/\//i.test(draft.address.trim());
  const environmentName = customAddress
    ? "自定义地址"
    : environment?.name || "项目默认";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    let entries: RequestHistoryEntry[] = [];
    try {
      if (storageKey)
        entries = parseHistory(sessionStorage.getItem(storageKey));
    } catch {
      setNotice("浏览器存储不可用，历史仅保留在当前页面");
    }
    historyRef.current = entries;
    setHistory(entries);
  }, [storageKey]);
  useEffect(() => {
    const choices: Environment[] = JSON.parse(environmentSignature);
    const defaultName = choices.find((choice) => choice.isDefault)?.name;
    const fallback = endpointServerUrl
      ? "endpoint"
      : defaultName
        ? `env:${defaultName}`
        : "project";
    setDraft((previous) => ({
      ...previous,
      auth: readRequestAuth(endpointAuth),
    }));
    try {
      const remembered = environmentStorageKey
        ? sessionStorage.getItem(environmentStorageKey)
        : null;
      setSelectedEnvironment(
        remembered &&
          (remembered === "project" ||
            (remembered === "endpoint" && !!endpointServerUrl) ||
            choices.some((choice) => `env:${choice.name}` === remembered))
          ? remembered
          : fallback,
      );
    } catch {
      setSelectedEnvironment(fallback);
    }
  }, [
    environmentStorageKey,
    environmentSignature,
    endpointAuth,
    endpointServerUrl,
  ]);

  useEffect(() => {
    if (previousSignature.current === documentSignature) return;
    const before = previousDefaults.current;
    const after = createRequestDraft(JSON.parse(documentSignature));
    previousSignature.current = documentSignature;
    previousDefaults.current = after;
    setDraft((current) => reconcileDocumentDraft(current, before, after));
    if (draft.documentLinked)
      setNotice("已同步文档默认配置，保留了你的临时修改");
  }, [documentSignature, draft.documentLinked]);

  const prepared = useMemo(() => {
    try {
      return { request: prepareRequest(draft, projectBaseUrl, environment) };
    } catch (issue) {
      return {
        error: issue instanceof Error ? issue.message : "请求配置不正确",
      };
    }
  }, [draft, projectBaseUrl, environment]);
  const sharedVariables = useMemo(() => {
    try {
      return [
        ...environmentVariables(environment?.variables || "{}").entries(),
      ];
    } catch {
      return [];
    }
  }, [environment]);
  const update = (patch: Partial<RequestDraft>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError(null);
    setNotice(null);
  };
  const updateAddress = (address: string) => {
    const names = draft.interpolate ? extractPathParameters(address) : [];
    update({
      address,
      pathParams: names.map(
        (name) =>
          draft.pathParams.find((row) => row.key === name) || requestRow(name),
      ),
    });
  };
  const storeHistory = (entries: RequestHistoryEntry[]) => {
    const bounded = entries.slice(0, HISTORY_LIMIT);
    historyRef.current = bounded;
    if (mounted.current) setHistory(bounded);
    if (!storageKey) return;
    try {
      const serialized = serializeHistory(bounded);
      sessionStorage.setItem(storageKey, serialized);
      if (mounted.current && JSON.parse(serialized).length < bounded.length)
        setNotice("历史内容较大，部分记录仅保留在当前页面");
    } catch {
      if (mounted.current)
        setNotice("浏览器存储空间不足，历史仅保留在当前页面");
    }
  };
  const send = async () => {
    if (requestRef.current) return;
    if (!prepared.request) {
      setError(prepared.error || "请检查请求配置");
      return;
    }
    const controller = new AbortController();
    const request = prepared.request;
    const selectedName = environmentName;
    const scope = storageKey;
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await onSend({ ...request, signal: controller.signal });
      if (activeScope.current !== scope) return;
      if (controller.signal.aborted)
        throw new DOMException("请求已取消", "AbortError");
      const entry = createHistoryEntry(request, selectedName, { response });
      storeHistory([entry, ...historyRef.current]);
      if (mounted.current)
        setOutcome({ ...entry, response, responseTruncated: false });
    } catch (issue) {
      if (activeScope.current !== scope) return;
      const message = controller.signal.aborted
        ? "请求已取消"
        : issue instanceof Error
          ? issue.message
          : "请求失败";
      const entry = createHistoryEntry(request, selectedName, {
        error: message,
      });
      storeHistory([entry, ...historyRef.current]);
      if (mounted.current) {
        setError(message);
        setOutcome(entry);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (mounted.current && activeScope.current === scope) setLoading(false);
    }
  };
  const copyCurl = async () => {
    if (!prepared.request) {
      setNotice(prepared.error || "请检查请求配置");
      return;
    }
    try {
      await navigator.clipboard.writeText(exportCurl(prepared.request));
      setNotice("cURL 已复制");
    } catch {
      setNotice("复制失败，请在实际请求预览中检查配置");
    }
  };
  const restore = (entry: RequestHistoryEntry) => {
    if (loading) return;
    setDraft(draftFromRequest(entry.request));
    setSelectedEnvironment("project");
    setOutcome(entry);
    setError(null);
    setTab("params");
    setNotice("已载入历史请求，点击发送可重新请求");
  };
  const bodyTemplate = draft.interpolate && /\{\{[^{}]+\}\}/.test(draft.body);
  const response = outcome?.response;
  const responseIsJson = useMemo(
    () =>
      !!response &&
      (isJsonContentType(response.headers["content-type"] || "") ||
        !!inspectJson(response.body).root),
    [response],
  );

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter" &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.preventDefault();
          void send();
        }
      }}
    >
      <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select
            value={selectedEnvironment}
            disabled={loading}
            onValueChange={(value) => {
              setSelectedEnvironment(value);
              update({ auth: { type: "none" } });
              try {
                if (environmentStorageKey)
                  sessionStorage.setItem(environmentStorageKey, value);
              } catch {
                setNotice("环境选择仅保留在当前页面");
              }
            }}
          >
            <SelectTrigger aria-label="调试环境" className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">项目默认</SelectItem>
              {endpointServerUrl && (
                <SelectItem value="endpoint">接口默认</SelectItem>
              )}
              {environments.map((env) => (
                <SelectItem key={env.id || env.name} value={`env:${env.name}`}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(draft.timeoutMs)}
            disabled={loading}
            onValueChange={(value) => update({ timeoutMs: Number(value) })}
          >
            <SelectTrigger aria-label="请求超时" className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5000, 15000, 30000, 60000].map((time) => (
                <SelectItem key={time} value={String(time)}>
                  {time / 1000} 秒超时
                </SelectItem>
              ))}
              {![5000, 15000, 30000, 60000].includes(draft.timeoutMs) && (
                <SelectItem value={String(draft.timeoutMs)}>
                  {draft.timeoutMs / 1000} 秒超时
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setCurlOpen(true)}
            >
              <Download className="size-3.5" />
              导入 cURL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!prepared.request}
              onClick={copyCurl}
            >
              <Copy className="size-3.5" />
              复制 cURL
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={loading}
              aria-label="恢复文档配置"
              title="恢复文档配置"
              onClick={() => {
                setDraft(createRequestDraft(props));
                setNotice("已恢复文档配置");
                setError(null);
              }}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={draft.method}
            disabled={loading}
            onValueChange={(method) => update({ method })}
          >
            <SelectTrigger
              aria-label="调试请求方法"
              className="w-28 shrink-0 font-mono text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REQUEST_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="调试请求地址"
            value={draft.address}
            disabled={loading}
            onChange={(event) => updateAddress(event.target.value)}
            placeholder="/users/{id} 或 https://api.example.com/users"
            className="min-w-40 flex-1 font-mono text-xs"
          />
          {loading ? (
            <Button
              variant="outline"
              onClick={() => requestRef.current?.abort()}
            >
              <Square className="size-3.5" />
              取消请求
            </Button>
          ) : (
            <Button
              onClick={send}
              title="⌘ / Ctrl + Enter"
              className="w-full sm:w-auto"
            >
              <Send className="size-3.5" />
              发送请求
            </Button>
          )}
        </div>
        <div className="mt-2 min-w-0 break-all font-mono text-[11px] text-zinc-500">
          {prepared.request ? (
            displayRequestUrl(prepared.request.url)
          ) : (
            <span className="font-sans text-amber-700 dark:text-amber-400">
              {prepared.error}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          {customAddress
            ? "完整地址优先于环境基础地址。"
            : "调试配置独立于文档。"}
          切换环境会清空自动认证。
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:flex sm:h-9 sm:justify-start">
          <TabsTrigger value="params">
            参数
            {draft.query.length + draft.pathParams.length
              ? ` ${draft.query.length + draft.pathParams.length}`
              : ""}
          </TabsTrigger>
          <TabsTrigger value="headers">
            请求头{draft.headers.length ? ` ${draft.headers.length}` : ""}
          </TabsTrigger>
          <TabsTrigger value="body">请求内容</TabsTrigger>
          <TabsTrigger value="auth">认证</TabsTrigger>
          <TabsTrigger value="variables">变量</TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1 size-3.5" />
            历史{history.length ? ` ${history.length}` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="params"
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {!!draft.pathParams.length && (
            <div>
              <h3 className="mb-2 text-xs font-medium">路径参数</h3>
              <RequestRows
                label="路径参数"
                rows={draft.pathParams}
                onChange={(pathParams) => update({ pathParams })}
                lockedKeys
                disabled={loading}
              />
            </div>
          )}
          <div>
            <h3 className="mb-2 text-xs font-medium">查询参数</h3>
            <RequestRows
              label="查询参数"
              rows={draft.query}
              onChange={(query) => update({ query })}
              disabled={loading}
            />
          </div>
        </TabsContent>
        <TabsContent
          value="headers"
          className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <RequestRows
            label="请求头"
            rows={draft.headers}
            onChange={(headers) => update({ headers })}
            disabled={loading}
          />
        </TabsContent>
        <TabsContent
          value="body"
          className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {["GET", "HEAD"].includes(draft.method) ? (
            <p className="py-5 text-center text-sm text-zinc-500">
              {draft.method} 请求不发送请求体
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={draft.bodyMode}
                  disabled={loading}
                  onValueChange={(bodyMode: RequestDraft["bodyMode"]) =>
                    update({ bodyMode })
                  }
                >
                  <SelectTrigger aria-label="请求体模式" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw">原始内容</SelectItem>
                    <SelectItem value="urlencoded">表单编码</SelectItem>
                    <SelectItem value="none">无请求体</SelectItem>
                  </SelectContent>
                </Select>
                {draft.bodyMode === "raw" && (
                  <Input
                    aria-label="请求体 Content-Type"
                    value={draft.contentType}
                    disabled={loading}
                    onChange={(event) =>
                      update({ contentType: event.target.value })
                    }
                    className="min-w-40 flex-1 font-mono text-xs"
                  />
                )}
              </div>
              {draft.bodyMode === "raw" && (
                <JsonWorkbench
                  label="测试请求体"
                  template={bodyTemplate}
                  value={draft.body}
                  onChange={(body) => update({ body })}
                  disabled={loading}
                  language={
                    isJsonContentType(draft.contentType) ? "json" : "text"
                  }
                  filename={
                    isJsonContentType(draft.contentType)
                      ? "request-body.json"
                      : "request-body.txt"
                  }
                />
              )}
              {draft.bodyMode === "raw" &&
                bodyTemplate &&
                prepared.request?.body !== undefined && (
                  <details className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-500">
                      解析后的请求体
                    </summary>
                    <JsonWorkbench
                      label="解析后的请求体"
                      value={prepared.request.body}
                      readOnly
                      language={
                        isJsonContentType(draft.contentType) ? "json" : "text"
                      }
                    />
                  </details>
                )}
              {draft.bodyMode === "urlencoded" && (
                <RequestRows
                  label="表单字段"
                  rows={draft.bodyFields}
                  onChange={(bodyFields) => update({ bodyFields })}
                  disabled={loading}
                />
              )}
            </>
          )}
        </TabsContent>
        <TabsContent
          value="auth"
          className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <RequestAuthEditor
            value={draft.auth}
            onChange={(auth) => update({ auth })}
            disabled={loading}
          />
        </TabsContent>
        <TabsContent
          value="variables"
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.interpolate}
              disabled={loading}
              onChange={(event) =>
                update({
                  interpolate: event.target.checked,
                  pathParams: event.target.checked
                    ? extractPathParameters(draft.address).map(
                        (key) =>
                          draft.pathParams.find((row) => row.key === key) ||
                          requestRow(key),
                      )
                    : [],
                })
              }
            />
            解析变量与路径占位符
          </label>
          {!draft.interpolate && (
            <p className="text-xs text-zinc-500">
              cURL 和历史请求默认按原文发送，可在这里启用变量解析。
            </p>
          )}
          <div>
            <h3 className="mb-2 text-xs font-medium">
              {environmentName} · 共享变量
            </h3>
            {sharedVariables.length ? (
              <div className="flex flex-wrap gap-2">
                {sharedVariables.map(([key]) => (
                  <code
                    key={key}
                    className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800"
                  >{`{{${key}}}`}</code>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                该环境暂无变量，可在项目设置中配置。
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium">临时变量</h3>
            <p className="mb-3 text-xs text-zinc-500">
              同名临时变量优先使用，不会修改共享环境。JSON
              字符串中的变量会自动转义。
            </p>
            <RequestRows
              label="变量"
              rows={draft.variables}
              onChange={(variables) => update({ variables })}
              disabled={loading}
            />
          </div>
        </TabsContent>
        <TabsContent
          value="history"
          className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <RequestHistory
            entries={history}
            disabled={loading}
            onRestore={restore}
            onDelete={(id) =>
              storeHistory(history.filter((entry) => entry.id !== id))
            }
            onClear={() => storeHistory([])}
          />
        </TabsContent>
      </Tabs>
      {notice && (
        <p
          role="status"
          className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
        >
          {error}
        </p>
      )}
      {prepared.request && (
        <details className="rounded-lg border border-zinc-200 dark:border-zinc-700">
          <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-500">
            <Terminal className="mr-2 inline size-3.5" />
            查看实际请求
          </summary>
          <JsonWorkbench
            label="实际请求"
            value={JSON.stringify(prepared.request, null, 2)}
            readOnly
          />
        </details>
      )}
      {loading && (
        <div
          role="status"
          className="flex items-center gap-2 py-4 text-sm text-zinc-500"
        >
          <Loader2 className="size-4 animate-spin" />
          正在请求 {environmentName}…
        </div>
      )}
      {response && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={response.status < 400 ? "default" : "secondary"}>
              {response.status}
            </Badge>
            <span className="text-xs text-zinc-500">
              {response.duration} ms
            </span>
            <span className="text-xs text-zinc-500">
              {formatBytes(new TextEncoder().encode(response.body).length)}
            </span>
            <span className="text-xs text-zinc-500">{outcome.environment}</span>
            <Button
              className="ml-auto"
              variant="outline"
              size="sm"
              disabled={!!outcome.responseTruncated}
              onClick={() => onImportResponse(response)}
            >
              将测试结果添加到响应
            </Button>
          </div>
          <p
            className="truncate font-mono text-[11px] text-zinc-500"
            title={displayRequestUrl(outcome.request.url)}
          >
            {outcome.request.method} {displayRequestUrl(outcome.request.url)}
          </p>
          {outcome.responseTruncated && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              历史响应仅保留前 64 KB，请重新发送以获取完整内容。
            </p>
          )}
          <JsonWorkbench
            label="响应体"
            value={response.body}
            readOnly
            language={responseIsJson ? "json" : "text"}
            filename={`response-${response.status}.${responseIsJson ? "json" : "txt"}`}
          />
          <details className="rounded border border-zinc-200 dark:border-zinc-700">
            <summary className="cursor-pointer px-3 py-2 text-xs text-zinc-500">
              响应头 · {Object.keys(response.headers).length}
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <tbody>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-t border-zinc-100 dark:border-zinc-800"
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
      {curlOpen && (
        <CurlImportDialog
          open={curlOpen}
          onOpenChange={setCurlOpen}
          onImport={(value) => {
            setDraft(value);
            setSelectedEnvironment("project");
            setTab(value.bodyMode === "none" ? "params" : "body");
            setError(null);
            setNotice("cURL 已载入，尚未发送，也未修改接口文档");
          }}
        />
      )}
    </div>
  );
}
