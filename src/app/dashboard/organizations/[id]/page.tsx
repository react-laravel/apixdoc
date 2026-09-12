"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TeamManagement } from "@/components/team-management";
import { apiFetch } from "@/lib/api-fetch";
import type { Organization, Project } from "@/lib/types";

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const sequence = useRef(0);
  const [creating, setCreating] = useState(false);
  const creationLock = useRef(false);
  const fetchData = useCallback(async () => {
    const version = ++sequence.current;
    setError(null);
    try {
      const [orgData, projData] = await Promise.all([
        apiFetch<Organization>(`/api/organizations/${params.id}`),
        apiFetch<Project[]>(`/api/projects?organizationId=${params.id}`),
      ]);
      if (version !== sequence.current) return;
      setOrg(orgData);
      setProjects(projData);
    } catch (err) {
      if (version === sequence.current)
        setError(err instanceof Error ? err.message : "加载失败");
      throw err;
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    setOrg(null);
    setLoading(true);
    fetchData().catch(() => {});
    const requestSequence = sequence;
    return () => {
      requestSequence.current++;
    };
  }, [fetchData]);

  const handleCreateProject = async () => {
    if (!projectName.trim() || creationLock.current) return;
    creationLock.current = true;
    setCreating(true);

    try {
      const created = await apiFetch<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName,
          description: projectDesc,
          organizationId: params.id,
        }),
      });
      setProjects((prev) => [...prev, created]);
      setProjectDialogOpen(false);
      setProjectName("");
      setProjectDesc("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      creationLock.current = false;
      setCreating(false);
    }
  };

  if (loading) {
    return <p className="text-zinc-500">加载中...</p>;
  }

  if (!org) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && <p className="text-zinc-500">组织不存在</p>}
        <Button variant="outline" onClick={() => fetchData().catch(() => {})}>
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{org.name}</h1>
        {org.description && (
          <p className="mt-1 text-zinc-500">{org.description}</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <TeamManagement organization={org} onReload={fetchData} />

      {/* Projects */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">项目</h2>
          {org.permissions?.canEdit !== false && (
            <Button size="sm" onClick={() => setProjectDialogOpen(true)}>
              创建项目
            </Button>
          )}
        </div>
        {projects.length === 0 ? (
          <p className="text-zinc-500">暂无项目</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{p.name}</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {p.isPublic ? "公开" : "私有"}
                  </Badge>
                </div>
                {p.description && (
                  <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                    {p.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Create Project Dialog */}
      <Dialog
        open={projectDialogOpen}
        onOpenChange={(open) => !creating && setProjectDialogOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">项目名称</label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="输入项目名称"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">描述</label>
              <Textarea
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="输入项目描述（可选）"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={creating}
              variant="outline"
              onClick={() => setProjectDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={creating || !projectName.trim()}
              onClick={handleCreateProject}
            >
              {creating ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
