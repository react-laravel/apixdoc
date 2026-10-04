"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronRight, Copy, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/method-badge";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { Markdown } from "./markdown";
import { createDocumentationNavigation } from "@/lib/documentation/navigation";
import { isJsonContentType } from "@/lib/json-document";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DocumentationView({
  project,
  initialEndpoint,
  embedded = false,
  canOpenWorkspace = false,
}: {
  project: Project;
  initialEndpoint?: string;
  embedded?: boolean;
  canOpenWorkspace?: boolean;
}) {
  const { endpoints, endpointById, entries } = useMemo(
    () => createDocumentationNavigation(project),
    [project],
  );
  const initialId = initialEndpoint && endpointById.has(initialEndpoint)
    ? initialEndpoint
    : endpoints[0]?.id || "";
  const [selection, setSelection] = useState({
    projectId: project.id,
    initialEndpoint,
    id: initialId,
  });
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(
    !!initialEndpoint && endpointById.has(initialEndpoint),
  );
  // Client navigation can replace the linked endpoint without remounting the
  // reader. Reset only for a new route target; normal project refreshes keep it.
  if (selection.projectId !== project.id || selection.initialEndpoint !== initialEndpoint) {
    setSelection({ projectId: project.id, initialEndpoint, id: initialId });
    setMobileDetail(!!initialEndpoint && endpointById.has(initialEndpoint));
  }
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const directoryRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusDetail = useRef(false);
  const selected = endpointById.get(selection.id) ?? endpoints[0];
  const activeEndpointId = selected?.id ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => entries.filter((item) => item.searchText.includes(normalizedQuery)),
    [entries, normalizedQuery],
  );
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    if (focusDetail.current) {
      headingRef.current?.focus({ preventScroll: true });
      focusDetail.current = false;
    }
  }, [activeEndpointId, mobileDetail]);
  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };
  const select = (id: string) => {
    focusDetail.current = true;
    if (id === activeEndpointId && mobileDetail) {
      if (mainRef.current) mainRef.current.scrollTop = 0;
      headingRef.current?.focus({ preventScroll: true });
      focusDetail.current = false;
    }
    setSelection({ projectId: project.id, initialEndpoint, id });
    setMobileDetail(true);
    if (!embedded) {
      const url = new URL(window.location.href);
      url.searchParams.set("endpoint", id);
      window.history.replaceState(null, "", url);
    }
  };
  const copyLink = async () => {
    try {
      const url = new URL(`/docs/${project.id}`, window.location.origin);
      if (project.publication)
        url.searchParams.set("release", project.publication.id);
      if (project.isPublicationPreview) url.searchParams.set("review", "1");
      else if (project.isDraftPreview || embedded)
        url.searchParams.set("preview", "1");
      if (activeEndpointId) url.searchParams.set("endpoint", activeEndpointId);
      await navigator.clipboard.writeText(url.toString());
      setNotice("文档链接已复制");
    } catch {
      setNotice("复制失败，可复制浏览器地址栏链接");
    }
  };
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-white dark:bg-zinc-950",
        embedded ? "h-full" : "h-dvh",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 sm:px-5">
        <BookOpen aria-hidden className="size-5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <h1 title={project.name} className="truncate text-sm font-semibold">{project.name}</h1>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            API 文档 · {endpoints.length} 个接口
            {project.publication ? ` · ${project.publication.title}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {project.isPublicationPreview
            ? "内部发布记录"
            : project.isPublic
              ? "公开文档"
              : "团队文档"}
        </Badge>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={copyLink}>
          <Copy className="size-3.5" />
          {project.isPublicationPreview || project.isDraftPreview || embedded
            ? "复制内部链接"
            : "复制链接"}
        </Button>
        {canOpenWorkspace && !embedded && (
          <Link
            href={`/dashboard/projects/${project.id}`}
            aria-label="打开工作台"
            className="shrink-0 text-xs text-blue-600"
          >
            <span className="hidden sm:inline">打开工作台</span>
            <ChevronRight className="inline size-3" />
          </Link>
        )}
      </header>
      {project.isPublicationPreview && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          内部发布记录预览
          {project.publicationRevoked ? " · 此版本公开链接已撤销" : ""}
        </p>
      )}
      {(project.isDraftPreview || embedded) && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          内部预览 · 此处展示工作区内容，尚未发布的修改不会出现在对外文档。
        </p>
      )}
      {project.publication && (
        <div className="flex shrink-0 flex-wrap gap-3 border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
          <span>
            发布 #{project.publication.number} ·{" "}
            {project.publication.createdAt.slice(0, 10)}
          </span>
          <a
            className="text-blue-600"
            href={`/api/projects/${project.id}/publications/${project.publication.id}/export?format=openapi${project.isPublicationPreview ? "&internal=1" : ""}`}
          >
            下载 OpenAPI
          </a>
          <a
            className="text-blue-600"
            href={`/api/projects/${project.id}/publications/${project.publication.id}/export?format=postman${project.isPublicationPreview ? "&internal=1" : ""}`}
          >
            下载 Postman
          </a>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="shrink-0 border-b border-zinc-200 bg-blue-50 px-4 py-2 text-xs text-blue-700 dark:border-zinc-800 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {notice}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="文档目录"
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-zinc-200 md:flex md:w-72 dark:border-zinc-800",
            mobileDetail && "hidden",
          )}
        >
          <div className="relative p-3">
            <Search className="pointer-events-none absolute left-5 top-5 size-4 text-zinc-400" />
            <Input
              ref={searchRef}
              aria-label="搜索文档接口"
              placeholder="搜索接口、路径或目录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") clearSearch();
                if (filtered.length && event.key === "Enter") {
                  event.preventDefault();
                  select(filtered[0].endpoint.id);
                }
                if (filtered.length && event.key === "ArrowDown") {
                  event.preventDefault();
                  directoryRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                }
              }}
              className="pl-8 pr-8 text-xs"
            />
            {query && (
              <button
                type="button"
                aria-label="清空文档搜索"
                onClick={clearSearch}
                className="absolute right-5 top-5 rounded text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          {normalizedQuery && (
            <p role="status" className="px-4 pb-2 text-[11px] text-zinc-500">找到 {filtered.length} 个接口</p>
          )}
          <nav ref={directoryRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-4">
            {filtered.map(({ endpoint, folderPath }) => (
              <button
                key={endpoint.id}
                type="button"
                title={`${endpoint.method} ${endpoint.path}\n${folderPath}`}
                onClick={() => select(endpoint.id)}
                aria-current={activeEndpointId === endpoint.id ? "page" : undefined}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  activeEndpointId === endpoint.id
                    ? "bg-blue-50 dark:bg-blue-950/50"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
                )}
              >
                <MethodBadge method={endpoint.method} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {endpoint.name || endpoint.path}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-zinc-500">
                    {endpoint.path}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-zinc-400">
                    {folderPath}
                  </span>
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">
                {endpoints.length ? "没有匹配的接口" : "项目还没有接口文档"}
              </p>
            )}
          </nav>
        </aside>
        <main
          ref={mainRef}
          aria-label="接口文档内容"
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
            !mobileDetail && "hidden md:block",
          )}
        >
          <div className="border-b border-zinc-200 px-3 py-2 md:hidden dark:border-zinc-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileDetail(false)}
            >
              <ArrowLeft className="size-4" />
              文档目录
            </Button>
          </div>
          <div key={activeEndpointId} className="mx-auto max-w-4xl space-y-7 p-4 sm:p-8">
            {selected ? (
              <>
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <MethodBadge method={selected.method} />
                    <code className="break-all text-sm text-zinc-500">
                      {selected.path}
                    </code>
                  </div>
                  <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
                    {selected.name || selected.path}
                  </h2>
                  {(selected.serverUrl || project.baseUrl) && (
                    <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                      {selected.serverUrl || project.baseUrl}
                    </p>
                  )}
                </div>
                {selected.description ? (
                  <Markdown>{selected.description}</Markdown>
                ) : (
                  project.description && (
                    <Markdown>{project.description}</Markdown>
                  )
                )}
                {!!selected.parameters?.length && (
                  <section>
                    <h3 className="mb-3 font-semibold">请求参数</h3>
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                          <tr>
                            {["参数", "位置", "类型", "说明 / 示例"].map(
                              (label) => (
                                <th
                                  key={label}
                                  className="px-3 py-2 font-medium"
                                >
                                  {label}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {selected.parameters.map((parameter, index) => (
                            <tr
                              key={parameter.id || index}
                              className="border-t border-zinc-100 dark:border-zinc-800"
                            >
                              <td className="px-3 py-3 font-mono">
                                {parameter.name}
                                {parameter.required && (
                                  <span className="ml-1 text-red-500">*</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-zinc-500">
                                {parameter.location}
                              </td>
                              <td className="px-3 py-3 font-mono text-blue-600 dark:text-blue-400">
                                {parameter.type}
                              </td>
                              <td className="max-w-xs px-3 py-3">
                                <p>{parameter.description || "—"}</p>
                                {parameter.example && (
                                  <code className="mt-1 block break-all text-zinc-500">
                                    {parameter.example}
                                  </code>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {!!selected.headers?.length && (
                  <section>
                    <h3 className="mb-3 font-semibold">请求头</h3>
                    <div className="space-y-2">
                      {selected.headers.map((header, index) => (
                        <div
                          key={header.id || index}
                          className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800"
                        >
                          <code className="font-medium">{header.key}</code>
                          <code className="ml-3 break-all text-zinc-500">
                            {header.value}
                          </code>
                          {header.description && (
                            <p className="mt-1 text-zinc-500">
                              {header.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {selected.requestBody && (
                  <section className="space-y-3">
                    <h3 className="font-semibold">
                      请求体{" "}
                      <code className="ml-2 text-xs font-normal text-zinc-500">
                        {selected.requestBody.contentType}
                      </code>
                    </h3>
                    {selected.requestBody.example && (
                      <JsonWorkbench
                        label="请求体示例"
                        value={selected.requestBody.example}
                        readOnly
                        template={/\{\{[^{}]+\}\}/.test(
                          selected.requestBody.example,
                        )}
                        language={
                          isJsonContentType(selected.requestBody.contentType)
                            ? "json"
                            : "text"
                        }
                      />
                    )}
                    {selected.requestBody.schema &&
                      selected.requestBody.schema !== "{}" && (
                        <DeferredDetails summary="查看请求结构">
                          <JsonWorkbench
                            label="请求结构"
                            value={selected.requestBody.schema}
                            readOnly
                          />
                        </DeferredDetails>
                      )}
                  </section>
                )}
                <section className="space-y-3">
                  <h3 className="font-semibold">响应</h3>
                  {selected.responses?.length ? (
                    selected.responses.map((response, index) => (
                      <div
                        key={response.id || index}
                        className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="secondary">
                            {response.statusKey || response.statusCode}
                          </Badge>
                          <span className="text-sm">
                            {response.description}
                          </span>
                          <code className="text-xs text-zinc-500">
                            {response.contentType}
                          </code>
                        </div>
                        {response.example && (
                          <JsonWorkbench
                            label={`响应示例 ${response.statusKey || response.statusCode}`}
                            value={response.example}
                            readOnly
                            language={
                              isJsonContentType(response.contentType)
                                ? "json"
                                : "text"
                            }
                          />
                        )}
                        {response.schema && response.schema !== "{}" && (
                          <DeferredDetails summary="查看响应结构">
                            <JsonWorkbench
                              label={`响应结构 ${response.statusKey || response.statusCode}`}
                              value={response.schema}
                              readOnly
                            />
                          </DeferredDetails>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
                      暂未定义响应
                    </p>
                  )}
                </section>
                <p className="border-t border-zinc-100 pt-4 text-xs text-zinc-400 dark:border-zinc-800">
                  只读文档不显示运行环境配置，已识别的认证示例会隐藏。
                </p>
              </>
            ) : (
              <div className="py-20 text-center text-zinc-500">
                项目还没有接口文档
              </div>
            )}
            {!!Object.keys(project.documentationSchemas || {}).length && (
              <section className="space-y-3">
                <h3 className="font-semibold">数据模型</h3>
                <p className="text-xs text-zinc-500">
                  接口结构中的 #/components/schemas 引用可在此查看。
                </p>
                {Object.entries(project.documentationSchemas || {}).map(
                  ([name, schema]) => (
                    <DeferredDetails
                      key={name}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                      summary={name}
                      model
                    >
                      <div className="mt-3">
                        <JsonWorkbench
                          label={`数据模型 ${name}`}
                          value={schema}
                          readOnly
                        />
                      </div>
                    </DeferredDetails>
                  ),
                )}
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function DeferredDetails({
  summary,
  children,
  className,
  model = false,
}: {
  summary: string;
  children: ReactNode;
  className?: string;
  model?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={model ? "cursor-pointer font-mono text-sm" : "cursor-pointer text-xs text-zinc-500"}>
        {summary}
      </summary>
      {open && children}
    </details>
  );
}
