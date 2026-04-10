"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Organization {
  id: string;
  name: string;
  description: string;
  members: Array<{
    id: string;
    user: { id: string; email: string; name: string };
    role: string;
  }>;
}

interface Project {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
}

export default function OrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [orgRes, projRes] = await Promise.all([
        fetch(`/api/organizations/${params.id}`),
        fetch(`/api/projects?organizationId=${params.id}`),
      ]);
      const orgJson = await orgRes.json();
      const projJson = await projRes.json();

      if (orgJson.success) setOrg(orgJson.data);
      if (projJson.success) setProjects(projJson.data);
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddMember = async () => {
    if (!memberEmail.trim()) return;

    try {
      const res = await fetch(`/api/organizations/${params.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail, role: memberRole }),
      });
      const json = await res.json();
      if (json.success) {
        setOrg((prev) =>
          prev ? { ...prev, members: [...prev.members, json.data] } : prev
        );
        setMemberDialogOpen(false);
        setMemberEmail("");
        setMemberRole("member");
      }
    } catch {
      // handled silently
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          description: projectDesc,
          organizationId: params.id,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProjects((prev) => [...prev, json.data]);
        setProjectDialogOpen(false);
        setProjectName("");
        setProjectDesc("");
      }
    } catch {
      // handled silently
    }
  };

  if (loading) {
    return <p className="text-zinc-500">加载中...</p>;
  }

  if (!org) {
    return <p className="text-zinc-500">组织不存在</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{org.name}</h1>
        {org.description && (
          <p className="mt-1 text-zinc-500">{org.description}</p>
        )}
      </div>

      {/* Members */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">成员</h2>
          <Button size="sm" onClick={() => setMemberDialogOpen(true)}>
            添加成员
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left font-medium">姓名</th>
                <th className="px-4 py-3 text-left font-medium">邮箱</th>
                <th className="px-4 py-3 text-left font-medium">角色</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">{m.user.name}</td>
                  <td className="px-4 py-3 text-zinc-500">{m.user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{m.role.toUpperCase()}</Badge>
                  </td>
                </tr>
              ))}
              {org.members.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    暂无成员
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Projects */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">项目</h2>
          <Button size="sm" onClick={() => setProjectDialogOpen(true)}>
            创建项目
          </Button>
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

      {/* Add Member Dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加成员</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                用户邮箱
              </label>
              <Input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">角色</label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">OWNER</SelectItem>
                  <SelectItem value="admin">ADMIN</SelectItem>
                  <SelectItem value="member">MEMBER</SelectItem>
                  <SelectItem value="viewer">VIEWER</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleAddMember}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                项目名称
              </label>
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
              variant="outline"
              onClick={() => setProjectDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreateProject}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
