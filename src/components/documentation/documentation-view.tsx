"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronRight, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/method-badge";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { Markdown } from "./markdown";
import {
  collectProjectEndpoints,
  folderPath,
} from "@/lib/documentation/navigation";
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
  const endpoints = useMemo(() => collectProjectEndpoints(project), [project]);
  const [selectedId, setSelectedId] = useState(
    initialEndpoint && endpoints.some((item) => item.id === initialEndpoint)
      ? initialEndpoint
      : endpoints[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(!!initialEndpoint);
  const [notice, setNotice] = useState("");
  const selected = endpoints.find((item) => item.id === selectedId);
  const pathOf = (folderId: string | null) => {
    try {
      return folderPath(folderId, project.folders);
    } catch {
      return ["目录结构异常"];
    }
  };
  const filtered = endpoints.filter((item) =>
    `${item.method} ${item.path} ${item.name} ${pathOf(item.folderId).join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const select = (id: string) => {
    setSelectedId(id);
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
      if (selectedId) url.searchParams.set("endpoint", selectedId);
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
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
        <BookOpen className="size-6 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1 basis-[calc(100%-40px)] sm:basis-auto">
          <h1 className="truncate text-base font-semibold">{project.name}</h1>
          <p className="mt-1 text-xs text-zinc-500">
            API 文档 · {endpoints.length} 个接口
          </p>
        </div>
        <Badge variant="outline">
          {project.isPublic ? "公开文档" : "团队文档"}
        </Badge>
        <Button variant="ghost" size="sm" onClick={copyLink}>
          <Copy className="size-3.5" />
          复制链接
        </Button>
        {canOpenWorkspace && !embedded && (
          <Link
            href={`/dashboard/projects/${project.id}`}
            className="text-xs text-blue-600"
          >
            打开工作台
            <ChevronRight className="inline size-3" />
          </Link>
        )}
      </header>
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
              aria-label="搜索文档接口"
              placeholder="搜索接口、路径或目录"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8 text-xs"
            />
          </div>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {filtered.map((endpoint) => (
              <button
                key={endpoint.id}
                onClick={() => select(endpoint.id)}
                aria-current={selectedId === endpoint.id ? "page" : undefined}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-lg p-3 text-left",
                  selectedId === endpoint.id
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
                    {pathOf(endpoint.folderId).join(" / ") || "未分组"}
                  </span>
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">
                没有匹配的接口
              </p>
            )}
          </nav>
        </aside>
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto",
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
          <div className="mx-auto max-w-4xl space-y-7 p-4 sm:p-8">
            {selected ? (
              <>
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <MethodBadge method={selected.method} />
                    <code className="break-all text-sm text-zinc-500">
                      {selected.path}
                    </code>
                  </div>
                  <h2 className="text-2xl font-semibold">
                    {selected.name || selected.path}
                  </h2>
                  {project.baseUrl && (
                    <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                      {project.baseUrl}
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
                        <details>
                          <summary className="cursor-pointer text-xs text-zinc-500">
                            查看请求结构
                          </summary>
                          <JsonWorkbench
                            label="请求结构"
                            value={selected.requestBody.schema}
                            readOnly
                          />
                        </details>
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
                            {response.statusCode}
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
                            label={`响应示例 ${response.statusCode}`}
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
                          <details>
                            <summary className="cursor-pointer text-xs text-zinc-500">
                              查看响应结构
                            </summary>
                            <JsonWorkbench
                              label={`响应结构 ${response.statusCode}`}
                              value={response.schema}
                              readOnly
                            />
                          </details>
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
          </div>
        </main>
      </div>
    </div>
  );
}
