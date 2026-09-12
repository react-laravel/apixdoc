"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { documentSnapshot } from "@/lib/documents/model";
import type { DocumentSection } from "@/lib/documents/model";
import {
  DocumentConflictDialog,
  type DocumentConflict,
} from "@/components/document-conflict";
import { DocumentHistory } from "@/components/document-history";
import { HeadersPanel } from "@/components/endpoint-detail/headers-panel";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { Copy, Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodBadge } from "@/components/method-badge";
import type {
  EndpointDetailData,
  EndpointParam,
  EndpointResponse,
  GlobalHeader,
  GlobalParam,
  Environment,
  SendRequestResult,
} from "@/lib/types";
import { BasicInfoPanel } from "@/components/endpoint-detail/basic-info-panel";
import { ParamsPanel } from "@/components/endpoint-detail/params-panel";
import { RequestBodyPanel } from "@/components/endpoint-detail/request-body-panel";
import { ResponsesPanel } from "@/components/endpoint-detail/responses-panel";
import { record } from "@/lib/specification/value";
import { mergeMedia, readMedia } from "@/lib/specification/media";
import {
  parseDocumentJson,
  stringifyDocumentJson,
} from "@/lib/documentation/json";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { TestPanel } from "@/components/endpoint-detail/test-panel";

function editorDrafts(endpoint: EndpointDetailData) {
  const body = endpoint.requestBody;
  const doc = documentSnapshot({
    ...endpoint,
    requestBody: body
      ? {
          ...body,
          content: mergeMedia(
            body.content,
            body.contentType,
            body.schema,
            body.example,
          ),
        }
      : null,
  });
  return {
    basic: {
      name: doc.name,
      method: doc.method,
      path: doc.path,
      description: doc.description,
    },
    params: { parameters: doc.parameters },
    headers: { headers: doc.headers },
    body: { requestBody: doc.requestBody },
    responses: { responses: doc.responses },
  };
}
interface EndpointDetailProps {
  onCopy?: () => void;
  onDelete?: () => void;
  actionBusy?: boolean;
  projectId?: string;
  environments?: Environment[];
  endpoint: EndpointDetailData;
  projectBaseUrl: string;
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  onSave: (
    data: Partial<EndpointDetailData>,
    version: number,
    section: DocumentSection,
  ) => Promise<EndpointDetailData>;
  onRestored?: (endpoint: EndpointDetailData) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function EndpointDetail({
  endpoint,
  projectId,
  environments,
  projectBaseUrl,
  globalHeaders,
  globalParams,
  onSave,
  onRestored,
  onDirtyChange,
  onCopy,
  onDelete,
  actionBusy = false,
}: EndpointDetailProps) {
  const sourceVariables = useMemo(() => {
    try {
      return stringifyDocumentJson(
        record(parseDocumentJson(endpoint.sourceDefinition || "{}"))
          .variables || {},
      );
    } catch {
      return "{}";
    }
  }, [endpoint.sourceDefinition]);
  // Basic info
  const [name, setName] = useState(endpoint.name);
  const [method, setMethod] = useState(endpoint.method);
  const [path, setPath] = useState(endpoint.path);
  const [description, setDescription] = useState(endpoint.description);

  // Params
  const [params, setParams] = useState<EndpointParam[]>(
    endpoint.parameters ?? [],
  );

  const [headers, setHeaders] = useState(endpoint.headers || []);
  const [bodyEnabled, setBodyEnabled] = useState(!!endpoint.requestBody);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conflict, setConflict] = useState<DocumentConflict | null>(null);
  // Request body
  const [bodyContentType, setBodyContentType] = useState(
    endpoint.requestBody?.contentType || "application/json",
  );
  const [bodySchema, setBodySchema] = useState(
    endpoint.requestBody?.schema || "",
  );
  const [bodyExample, setBodyExample] = useState(
    endpoint.requestBody?.example || "",
  );

  const [bodyContent, setBodyContent] = useState(
    endpoint.requestBody?.content || "{}",
  );

  // Responses
  const [responses, setResponses] = useState<EndpointResponse[]>(
    endpoint.responses ?? [],
  );

  const [activeTab, setActiveTab] = useState("basic");
  const [testVisited, setTestVisited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const savingRef = useRef(false);
  const drafts = editorDrafts({
    ...endpoint,
    name,
    method,
    path,
    description,
    parameters: params,
    headers,
    requestBody: bodyEnabled
      ? {
          contentType: bodyContentType,
          schema: bodySchema,
          example: bodyExample,
          content: bodyContent,
        }
      : null,
    responses,
  });
  type Section = keyof typeof drafts;
  const [savedDrafts, setSavedDrafts] = useState(() =>
    Object.fromEntries(
      Object.entries(drafts).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  );
  const [baseVersions, setBaseVersions] = useState(() =>
    Object.fromEntries(
      Object.keys(drafts).map((key) => [key, endpoint.version || 1]),
    ),
  );
  const hydratedVersion = useRef(endpoint.version || 1);
  const acknowledge = useCallback(
    (next: EndpointDetailData, force?: Section | "all") => {
      const values = editorDrafts(next);
      const sections = (Object.keys(values) as Section[]).filter(
        (section) =>
          force === "all" ||
          force === section ||
          JSON.stringify(drafts[section]) === savedDrafts[section],
      );
      if (sections.includes("basic")) {
        setName(next.name);
        setMethod(next.method);
        setPath(next.path);
        setDescription(next.description);
      }
      if (sections.includes("params")) setParams(values.params.parameters);
      if (sections.includes("headers")) setHeaders(values.headers.headers);
      if (sections.includes("responses"))
        setResponses(values.responses.responses);
      if (sections.includes("body")) {
        const body = values.body.requestBody;
        setBodyEnabled(!!body);
        setBodyContentType(body?.contentType || "application/json");
        setBodySchema(body?.schema || "");
        setBodyExample(body?.example || "");
        setBodyContent(body?.content || "{}");
      }
      setSavedDrafts((previous) => ({
        ...previous,
        ...Object.fromEntries(
          sections.map((section) => [section, JSON.stringify(values[section])]),
        ),
      }));
      setBaseVersions((previous) => ({
        ...previous,
        ...Object.fromEntries(
          sections.map((section) => [section, next.version || 1]),
        ),
      }));
      hydratedVersion.current = next.version || 1;
    },
    [drafts, savedDrafts],
  );
  useEffect(() => {
    if ((endpoint.version || 1) !== hydratedVersion.current)
      acknowledge(endpoint);
  }, [endpoint, acknowledge]);
  const dirtySections = (Object.keys(drafts) as Section[]).filter(
    (key) => JSON.stringify(drafts[key]) !== savedDrafts[key],
  );
  const dirty = dirtySections.length > 0;

  useEffect(() => {
    onDirtyChange?.(dirty || saving);
  }, [dirty, saving, onDirtyChange]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.href === window.location.href ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (!window.confirm("有未保存的修改，确定离开此页面吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty, saving]);

  const saveSection = async (
    section: Section,
    replacement?: Record<string, unknown>,
    version?: number,
  ) => {
    if (savingRef.current) return;
    if (section === "basic" && !path.trim()) {
      setSaveNotice("请填写接口路径");
      return;
    }
    if (section === "body" && bodyEnabled && !replacement) {
      try {
        parseDocumentJson(bodySchema || "{}");
      } catch {
        setSaveNotice("请先修正请求体 Schema 的 JSON 格式");
        return;
      }
    }
    const submitted = replacement || drafts[section];
    savingRef.current = true;
    setSaving(true);
    setSaveNotice(null);
    try {
      const updated = await onSave(
        submitted,
        version ?? baseVersions[section],
        section,
      );
      acknowledge(updated, section);
      setConflict(null);
      setSaveNotice(updated.saveMerged ? "已合并其他人的修改并保存" : "已保存");
    } catch (error) {
      if (error instanceof ApiError && error.code === "DOCUMENT_CONFLICT")
        setConflict(error.data as DocumentConflict);
      setSaveNotice(
        error instanceof Error ? error.message : "保存失败，修改已保留，请重试",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const addParam = useCallback(() => {
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
  }, []);

  const updateParam = useCallback(
    (index: number, field: keyof EndpointParam, value: string | boolean) => {
      setParams((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;
          if (field === "type") {
            let schema = record(undefined);
            try {
              schema = record(parseDocumentJson(p.schema || "{}"));
            } catch {
              return p;
            }
            return {
              ...p,
              type: String(value),
              schema: stringifyDocumentJson({ ...schema, type: value }),
            };
          }
          return { ...p, [field]: value };
        }),
      );
    },
    [],
  );

  const removeParam = useCallback((index: number) => {
    setParams((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addResponse = useCallback(() => {
    setResponses((prev) => [
      ...prev,
      {
        statusCode: 200,
        description: "",
        contentType: "application/json",
        example: "",
      },
    ]);
  }, []);

  const addResponseWithStatus = useCallback((statusCode: number) => {
    setResponses((prev) => {
      const exists = prev.some((r) => r.statusCode === statusCode);
      if (exists) return prev;
      return [
        ...prev,
        {
          statusCode,
          description: "",
          contentType: "application/json",
          example: "",
        },
      ];
    });
  }, []);

  const updateResponse = useCallback(
    (index: number, field: keyof EndpointResponse, value: string | number) => {
      setResponses((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                [field]: value,
                ...(field === "statusCode"
                  ? { statusKey: "" }
                  : field === "statusKey"
                    ? {
                        statusCode: /^\d{3}$/.test(String(value))
                          ? Number(value)
                          : 0,
                      }
                    : {}),
              }
            : r,
        ),
      );
    },
    [],
  );

  const removeResponse = useCallback((index: number) => {
    setResponses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const importTestResponse = useCallback(
    (response: {
      status: number;
      body: string;
      headers: Record<string, string>;
    }) => {
      setActiveTab("responses");
      setSaveNotice("响应已导入，请保存");
      const exists = responses.some((r) => r.statusCode === response.status);
      if (exists) {
        setResponses((prev) =>
          prev.map((r) =>
            r.statusCode === response.status
              ? {
                  ...r,
                  description: r.description || `${response.status} response`,
                  example: response.body,
                  contentType:
                    response.headers["content-type"]?.split(";")[0] ||
                    r.contentType,
                }
              : r,
          ),
        );
        return;
      }
      setResponses((prev) => [
        ...prev,
        {
          statusCode: response.status,
          description: `${response.status} response`,
          contentType:
            response.headers["content-type"]?.split(";")[0] ||
            "application/json",
          example: response.body,
        },
      ]);
    },
    [responses],
  );

  // Extract schema field names for duplicate detection
  const extractSchemaFieldNames = (schemaText: string): string[] => {
    if (!schemaText || !schemaText.trim()) return [];
    try {
      const schema = JSON.parse(schemaText);
      if (schema.properties && typeof schema.properties === "object") {
        return Object.keys(schema.properties);
      }
      if (schema.type === "array" && schema.items?.properties) {
        return Object.keys(schema.items.properties);
      }
    } catch {
      // not valid JSON
    }
    return [];
  };

  const duplicateFields = (() => {
    const bodyFieldNames = new Set(extractSchemaFieldNames(bodySchema));
    const queryPathHeaderNames = params
      .filter((p) => ["query", "path", "header"].includes(p.location))
      .map((p) => p.name.trim())
      .filter(Boolean);
    return queryPathHeaderNames.filter((name) => bodyFieldNames.has(name));
  })();

  const normalizedName = name.trim().replace(/\s+/g, " ");
  const normalizedPath = path.trim().replace(/\s+/g, " ");
  const normalizedMethodPath = `${method} ${path}`.trim().replace(/\s+/g, " ");
  const shouldShowName =
    normalizedName &&
    normalizedName !== normalizedPath &&
    normalizedName !== normalizedMethodPath;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <MethodBadge method={method} />
        <span className="min-w-0 break-all pr-6 font-mono text-xs text-zinc-600 sm:pr-0 sm:text-sm dark:text-zinc-400">
          {path}
        </span>
        {shouldShowName && (
          <span className="min-w-0 break-words pr-6 text-base font-semibold sm:text-lg">
            {name}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || actionBusy}
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-3.5" />
            版本历史
          </Button>
          {onCopy && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving || actionBusy}
              onClick={onCopy}
            >
              <Copy className="size-3.5" />
              复制接口
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-400 hover:text-red-600"
              disabled={saving || actionBusy}
              onClick={onDelete}
              aria-label="删除接口"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div
        className="mb-4 flex flex-wrap items-center gap-2 text-xs"
        role="status"
        aria-live="polite"
      >
        <span
          className={
            dirty
              ? "rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "text-zinc-500"
          }
        >
          {saving
            ? "正在保存…"
            : dirty
              ? `${dirtySections.length} 个分区有未保存修改`
              : "所有修改已保存"}
        </span>
        <span className="text-zinc-400">v{endpoint.version || 1}</span>
        {saveNotice && (dirty || saveNotice !== "已保存") && (
          <span className="text-zinc-500">{saveNotice}</span>
        )}
      </div>
      {conflict && (
        <DocumentConflictDialog
          key={`${conflict.section}-${conflict.version}`}
          conflict={conflict}
          saving={saving}
          onClose={() => setConflict(null)}
          onResolve={(value, version) =>
            saveSection(conflict.section, value, version)
          }
        />
      )}
      {historyOpen && (
        <DocumentHistory
          endpointId={endpoint.id}
          onClose={() => setHistoryOpen(false)}
          beforeRestore={() =>
            !dirty ||
            window.confirm("恢复版本会替换当前未保存修改，确定继续吗？")
          }
          onRestored={(updated) => {
            acknowledge(updated, "all");
            onRestored?.(updated);
            setSaveNotice(updated.restoreNotice || "已恢复历史版本");
          }}
        />
      )}
      <fieldset disabled={saving} className="min-w-0">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (!saving) {
              setActiveTab(value);
              if (value === "test") setTestVisited(true);
              setSaveNotice(null);
            }
          }}
        >
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="params">请求参数</TabsTrigger>
            <TabsTrigger value="headers">请求头</TabsTrigger>
            <TabsTrigger value="body">请求体</TabsTrigger>
            <TabsTrigger value="responses">响应</TabsTrigger>
            {endpoint.sourceImportId && (
              <TabsTrigger value="source">导入原文</TabsTrigger>
            )}
            <TabsTrigger value="test">在线测试</TabsTrigger>
          </TabsList>

          {endpoint.sourceImportId && (
            <TabsContent value="source">
              <p className="mb-3 text-xs text-zinc-500">
                导入时的完整接口定义，包含引用、认证与扩展字段。基本表单修改会合并到导出结果。
              </p>
              <JsonWorkbench
                label="导入接口原文"
                value={endpoint.sourceDefinition || "{}"}
                readOnly
              />
            </TabsContent>
          )}
          <TabsContent value="basic">
            <BasicInfoPanel
              method={method}
              path={path}
              name={name}
              description={description}
              onMethodChange={setMethod}
              onPathChange={setPath}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onSave={() => saveSection("basic")}
              saving={saving}
            />
          </TabsContent>

          <TabsContent value="params">
            <ParamsPanel
              params={params}
              onAdd={addParam}
              onUpdate={updateParam}
              onRemove={removeParam}
              onSave={() => saveSection("params")}
              saving={saving}
              duplicateFields={duplicateFields}
            />
          </TabsContent>

          <TabsContent value="headers">
            <HeadersPanel
              headers={headers}
              onChange={setHeaders}
              onSave={() => saveSection("headers")}
              saving={saving}
            />
          </TabsContent>
          <TabsContent value="body">
            <RequestBodyPanel
              enabled={bodyEnabled}
              onEnabledChange={setBodyEnabled}
              contentType={bodyContentType}
              schema={bodySchema}
              example={bodyExample}
              contentTypes={Object.keys(JSON.parse(bodyContent))}
              onContentTypeChange={(type) => {
                try {
                  parseDocumentJson(bodySchema || "{}");
                } catch {
                  setSaveNotice("请先修正当前 Schema，再切换格式");
                  return;
                }
                const content = mergeMedia(
                  bodyContent,
                  bodyContentType,
                  bodySchema,
                  bodyExample,
                );
                const media = readMedia(content, type);
                setBodyContent(content);
                setBodyContentType(type);
                setBodySchema(media.schema);
                setBodyExample(media.example);
              }}
              onSchemaChange={setBodySchema}
              onExampleChange={setBodyExample}
              onSave={() => saveSection("body")}
              saving={saving}
              duplicateFields={duplicateFields}
            />
          </TabsContent>

          <TabsContent value="responses">
            <ResponsesPanel
              responses={responses}
              onUpdate={updateResponse}
              onRemove={removeResponse}
              onAdd={addResponse}
              onAddWithStatus={addResponseWithStatus}
              onSave={() => saveSection("responses")}
              saving={saving}
              onImportFromTest={importTestResponse}
              testResponse={null}
            />
          </TabsContent>

          <TabsContent
            value="test"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            {testVisited && (
              <TestPanel
                projectId={projectId}
                endpointId={endpoint.id}
                environments={environments}
                endpointHeaders={headers}
                endpointAuth={endpoint.auth}
                endpointVariables={sourceVariables}
                endpointServerUrl={endpoint.serverUrl}
                method={method}
                path={path}
                projectBaseUrl={projectBaseUrl}
                globalHeaders={globalHeaders}
                globalParams={globalParams}
                params={params}
                bodyExample={bodyEnabled ? bodyExample : ""}
                bodyContentType={bodyContentType}
                onSend={async ({ signal, ...request }) =>
                  apiFetch<SendRequestResult>("/api/proxy", {
                    method: "POST",
                    signal,
                    body: JSON.stringify(request),
                  })
                }
                onImportResponse={(response) => importTestResponse(response)}
              />
            )}
          </TabsContent>
        </Tabs>
      </fieldset>
    </div>
  );
}
