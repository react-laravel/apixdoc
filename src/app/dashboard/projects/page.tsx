"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-fetch";
import type { Organization, ProjectListItem } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setError(null);
    try {
      const organizations = await apiFetch<Organization[]>("/api/organizations");
      const projectGroups = await Promise.all(
        organizations.map(async (organization) => {
          const data = await apiFetch<ProjectListItem[]>(
            `/api/projects?organizationId=${organization.id}`,
          );
          return data.map((project) => ({
            ...project,
            organization,
          }));
        }),
      );
      setProjects(projectGroups.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">项目管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          查看当前账号可访问的全部项目
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500">加载中...</p>
      ) : projects.length === 0 ? (
        <p className="text-zinc-500">暂无项目，请先进入组织创建项目</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-[760px] w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">项目</th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">组织</th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">状态</th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">内容</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                    {project.description && (
                      <p className="mt-1 max-w-[360px] truncate text-xs text-zinc-500">
                        {project.description}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    <Link
                      href={`/dashboard/organizations/${project.organization.id}`}
                      className="hover:underline"
                    >
                      {project.organization.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="outline" className="text-[10px]">
                      {project.isPublic ? "公开" : "私有"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-nowrap gap-2">
                      <Badge variant="secondary">
                        {project._count.folders} 个文件夹
                      </Badge>
                      <Badge variant="secondary">
                        {project._count.endpoints} 个接口
                      </Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
