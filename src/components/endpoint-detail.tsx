"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MethodBadge } from "@/components/method-badge";
import type {
  EndpointDetailData,
  EndpointParam,
  EndpointResponse,
  GlobalHeader,
  GlobalParam,
} from "@/lib/types";
import { BasicInfoPanel } from "@/components/endpoint-detail/basic-info-panel";
import { ParamsPanel } from "@/components/endpoint-detail/params-panel";
import { RequestBodyPanel } from "@/components/endpoint-detail/request-body-panel";
import { ResponsesPanel } from "@/components/endpoint-detail/responses-panel";
import { TestPanel } from "@/components/endpoint-detail/test-panel";

function isLoginPath(path: string) {
  return /(^|\/)login(\/|$)/i.test(path) || /(^|\/)auth(\/|$)/i.test(path);
}

interface EndpointDetailProps {
  endpoint: EndpointDetailData;
  projectBaseUrl: string;
  globalHeaders: GlobalHeader[];
  globalParams: GlobalParam[];
  onSave: (data: Partial<EndpointDetailData>) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function EndpointDetail({
  endpoint,
  projectBaseUrl,
  globalHeaders,
  globalParams,
  onSave,
  onDirtyChange,
}: EndpointDetailProps) {
  // Basic info
  const [name, setName] = useState(endpoint.name);
  const [method, setMethod] = useState(endpoint.method);
  const [path, setPath] = useState(endpoint.path);
  const [description, setDescription] = useState(endpoint.description);

  // Params
  const [params, setParams] = useState<EndpointParam[]>(
    endpoint.parameters ?? [],
  );

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

  // Responses
  const [responses, setResponses] = useState<EndpointResponse[]>(
    endpoint.responses ?? [],
  );

  const [activeTab, setActiveTab] = useState("basic");
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const savingRef = useRef(false);
  const drafts = {
    basic: { name, method, path, description },
    params: {
      parameters: params.map(
        ({ name, type, required, location, description, example }) => ({
          name,
          type,
          required,
          location,
          description,
          example,
        }),
      ),
    },
    body: {
      requestBody: {
        contentType: bodyContentType,
        schema: bodySchema,
        example: bodyExample,
      },
    },
    responses: {
      responses: responses.map(
        ({ statusCode, description, contentType, example }) => ({
          statusCode,
          description,
          contentType,
          example,
        }),
      ),
    },
  };
  type Section = keyof typeof drafts;
  const [savedDrafts, setSavedDrafts] = useState(() =>
    Object.fromEntries(
      Object.entries(drafts).map(([key, value]) => [
        key,
        JSON.stringify(value),
      ]),
    ),
  );
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

  const saveSection = async (section: Section) => {
    if (savingRef.current) return;
    if (section === "basic" && !path.trim()) {
      setSaveNotice("请填写接口路径");
      return;
    }
    const submitted = drafts[section];
    savingRef.current = true;
    setSaving(true);
    setSaveNotice(null);
    try {
      if (await onSave(submitted)) {
        setSavedDrafts((previous) => ({
          ...previous,
          [section]: JSON.stringify(submitted),
        }));
        setSaveNotice("已保存");
      } else {
        setSaveNotice("保存失败，修改已保留，请重试");
      }
    } catch {
      setSaveNotice("保存失败，修改已保留，请重试");
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
        prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
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
        prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
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
        {saveNotice && (dirty || saveNotice !== "已保存") && (
          <span className="text-zinc-500">{saveNotice}</span>
        )}
      </div>
      <fieldset disabled={saving} className="min-w-0">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (!saving) {
              setActiveTab(value);
              setSaveNotice(null);
            }
          }}
        >
          <TabsList className="mb-4 w-full justify-start overflow-x-auto">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="params">请求参数</TabsTrigger>
            <TabsTrigger value="body">请求体</TabsTrigger>
            <TabsTrigger value="responses">响应</TabsTrigger>
            <TabsTrigger value="test">在线测试</TabsTrigger>
          </TabsList>

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

          <TabsContent value="body">
            <RequestBodyPanel
              contentType={bodyContentType}
              schema={bodySchema}
              example={bodyExample}
              onContentTypeChange={setBodyContentType}
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

          <TabsContent value="test">
            <TestPanel
              method={method}
              path={path}
              projectBaseUrl={projectBaseUrl}
              globalHeaders={globalHeaders}
              globalParams={globalParams}
              params={params}
              bodyExample={bodyExample}
              onSend={async ({ headers, queryParams, body, authToken }) => {
                const queryString = queryParams
                  .filter((p) => p.key)
                  .map(
                    (p) =>
                      `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`,
                  )
                  .join("&");

                const fullUrl = `${projectBaseUrl}${path}${queryString ? `?${queryString}` : ""}`;

                if (!projectBaseUrl) {
                  throw new Error("请先在项目设置中配置 Base URL");
                }

                const headersObj: Record<string, string> = {};
                for (const h of headers) {
                  if (h.key) headersObj[h.key] = h.value;
                }

                const normalizedMethod = method.toUpperCase();
                const requestHasBody = ["POST", "PUT", "PATCH"].includes(
                  normalizedMethod,
                );
                const hasContentTypeHeader = Object.keys(headersObj).some(
                  (key) => key.toLowerCase() === "content-type",
                );
                if (requestHasBody && !hasContentTypeHeader) {
                  headersObj["Content-Type"] =
                    bodyContentType || "application/json";
                }

                const hasAuthorizationHeader = Object.keys(headersObj).some(
                  (key) => key.toLowerCase() === "authorization",
                );
                if (
                  authToken &&
                  !hasAuthorizationHeader &&
                  !isLoginPath(path)
                ) {
                  headersObj.Authorization = `Bearer ${authToken}`;
                }

                const res = await fetch("/api/proxy", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: fullUrl,
                    method: normalizedMethod,
                    headers: headersObj,
                    body: requestHasBody ? body : undefined,
                  }),
                });
                const json = await res.json();
                if (!json.success) {
                  throw new Error(json.error || "请求失败");
                }
                return json.data;
              }}
              onImportResponse={(response) => importTestResponse(response)}
            />
          </TabsContent>
        </Tabs>
      </fieldset>
    </div>
  );
}
