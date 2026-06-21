"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
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
import { apiFetch } from "@/lib/api-fetch";
import type { Organization } from "@/lib/types";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<Organization[]>("/api/organizations");
      setOrganizations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleCreate = async () => {
    if (!formName.trim()) return;

    setSubmitting(true);
    try {
      const created = await apiFetch<Organization>("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: formName, description: formDesc }),
      });
      setOrganizations((prev) => [...prev, created]);
      setDialogOpen(false);
      setFormName("");
      setFormDesc("");
    } catch (err) {
      // Silently fail for now — could show a toast
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">组织管理</h1>
        <Button onClick={() => setDialogOpen(true)}>创建组织</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">组织列表</h2>
        {loading ? (
          <p className="text-zinc-500">加载中...</p>
        ) : organizations.length === 0 ? (
          <p className="text-zinc-500">暂无组织，点击上方按钮创建</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {organizations.map((org) => (
              <Link
                key={org.id}
                href={`/dashboard/organizations/${org.id}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <h3 className="font-medium">{org.name}</h3>
                {org.description && (
                  <p className="mt-1 text-sm text-zinc-500 line-clamp-2">
                    {org.description}
                  </p>
                )}
                <div className="mt-3 flex gap-3">
                  <Badge variant="secondary">
                    {org._count?.projects ?? 0} 个项目
                  </Badge>
                  <Badge variant="secondary">
                    {org._count?.members ?? 0} 个成员
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建组织</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                组织名称
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="输入组织名称"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">描述</label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="输入组织描述（可选）"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
