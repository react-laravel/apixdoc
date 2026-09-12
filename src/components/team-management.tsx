"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  canInviteRole,
  canManageMember,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type TeamRole,
} from "@/lib/team/roles";
import type { Organization, OrganizationMember } from "@/lib/types";
type Invite = NonNullable<Organization["invitations"]>[number];
type Action =
  | {
      kind: "role" | "remove" | "transfer";
      member: OrganizationMember;
      version: number;
    }
  | { kind: "renew" | "revoke"; invite: Invite; version: number }
  | { kind: "leave"; version: number };
const eventLabels: Record<string, string> = {
  "account-deleted": "删除账号",
  "account-disabled": "停用账号",
  "account-enabled": "启用账号",
  invited: "邀请",
  renewed: "重新生成邀请",
  "invitation-revoked": "撤销邀请",
  joined: "加入组织",
  "role-changed": "调整角色",
  removed: "移除成员",
  left: "退出组织",
  "ownership-transferred": "转移所有权",
};
const date = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export function TeamManagement({
  organization: org,
  onReload,
}: {
  organization: Organization;
  onReload: () => Promise<void>;
}) {
  const router = useRouter();
  const role = org.currentRole || "viewer";
  const manager = role === "owner" || role === "admin";
  const canLeave =
    role !== "owner" ||
    org.members.filter((member) => member.role === "owner").length > 1;
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [issued, setIssued] = useState<{
    url: string;
    email: string;
    expiresAt: string;
  } | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [nextRole, setNextRole] = useState<TeamRole>("member");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const members = useMemo(
    () =>
      org.members.filter((m) =>
        `${m.user.name} ${m.user.email}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [org.members, query],
  );
  const roles = (Object.keys(ROLE_LABELS) as TeamRole[]).filter((value) =>
    canInviteRole(role, value),
  );
  const reload = async () => {
    try {
      await onReload();
    } catch {
      setError("操作已完成，但列表刷新失败，请刷新页面");
    }
  };
  const run = async (work: () => Promise<void>) => {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "操作失败，请重试");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  const openAction = (value: Action) => {
    setAction(value);
    setError("");
    setConfirmation("");
    if (value.kind === "role") setNextRole(value.member.role as TeamRole);
  };
  const issueLink = async (path: string, method: string, data: object) => {
    const result = await apiFetch<{
      token: string;
      invitation: { email: string; expiresAt: string };
    }>(path, { method, body: JSON.stringify(data) });
    setIssued({
      ...result.invitation,
      url: `${window.location.origin}/join#invite=${result.token}`,
    });
    setInviteOpen(true);
    setAction(null);
    await reload();
  };
  const submitAction = () =>
    run(async () => {
      if (!action) return;
      const base = `/api/organizations/${org.id}`;
      const data: Record<string, unknown> = { version: action.version };
      if ("member" in action) data.userId = action.member.user.id;
      if (action.kind === "role") {
        data.role = nextRole;
        await apiFetch(`${base}/members`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
      } else if (action.kind === "remove")
        await apiFetch(`${base}/members`, {
          method: "DELETE",
          body: JSON.stringify(data),
        });
      else if (action.kind === "transfer")
        await apiFetch(`${base}/ownership`, {
          method: "POST",
          body: JSON.stringify({ ...data, confirmation }),
        });
      else if (action.kind === "leave") {
        await apiFetch(`${base}/leave`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        router.push("/dashboard");
        router.refresh();
        return;
      } else if (action.kind === "revoke")
        await apiFetch(`${base}/invitations/${action.invite.id}`, {
          method: "DELETE",
          body: JSON.stringify(data),
        });
      else if (action.kind === "renew") {
        await issueLink(
          `${base}/invitations/${action.invite.id}`,
          "PATCH",
          data,
        );
        return;
      }
      setAction(null);
      setNotice("团队信息已更新");
      await reload();
    });
  const actionTitles = {
    role: "调整成员角色",
    remove: "移除成员",
    transfer: "转移所有权",
    leave: "退出组织",
    renew: "重新生成邀请链接",
    revoke: "撤销邀请",
  };
  const menuItem =
    "cursor-pointer rounded px-3 py-2 text-sm outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800";
  return (
    <div className="space-y-7">
      {(error || notice) && !inviteOpen && !action && (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 text-red-600" : "border-emerald-200 text-emerald-700 dark:text-emerald-400"}`}
        >
          {error || notice}
        </p>
      )}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">
            团队成员{" "}
            <span className="text-sm font-normal text-zinc-500">
              {org.members.length}
            </span>
          </h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(onReload)}
            aria-label="刷新团队信息"
          >
            <RefreshCw className="size-4" />
          </Button>
          {manager && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setInviteOpen(true);
                setIssued(null);
                setEmail("");
                setInviteRole("member");
                setError("");
              }}
            >
              <UserPlus className="size-4" />
              邀请成员
            </Button>
          )}
        </div>
        <Input
          aria-label="搜索成员"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索姓名或邮箱"
          className="max-w-sm"
        />
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 p-4">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-medium dark:bg-zinc-800"
              >
                {member.user.name.slice(0, 1).toUpperCase() || "U"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {member.user.name}
                  {member.user.status === "disabled" && (
                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                      账号已停用
                    </span>
                  )}
                  {member.user.id === org.currentUserId && (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      你
                    </span>
                  )}
                </p>
                <p className="break-all text-xs text-zinc-500">
                  {member.user.email}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {ROLE_LABELS[member.role as TeamRole] || member.role}
              </Badge>
              {member.user.id !== org.currentUserId &&
                canManageMember(role, member.role) && (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        disabled={busy}
                        aria-label={`管理 ${member.user.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-50 min-w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <DropdownMenu.Item
                          className={menuItem}
                          onSelect={() =>
                            openAction({
                              kind: "role",
                              member,
                              version: org.teamVersion!,
                            })
                          }
                        >
                          调整角色
                        </DropdownMenu.Item>
                        {role === "owner" &&
                          member.user.status !== "disabled" && (
                            <DropdownMenu.Item
                              className={menuItem}
                              onSelect={() =>
                                openAction({
                                  kind: "transfer",
                                  member,
                                  version: org.teamVersion!,
                                })
                              }
                            >
                              转移所有权
                            </DropdownMenu.Item>
                          )}
                        <DropdownMenu.Item
                          className={`${menuItem} text-red-600`}
                          onSelect={() =>
                            openAction({
                              kind: "remove",
                              member,
                              version: org.teamVersion!,
                            })
                          }
                        >
                          移除成员
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                )}
            </li>
          ))}
          {!members.length && (
            <li className="p-8 text-center text-sm text-zinc-500">
              没有匹配的成员
            </li>
          )}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
          <p>{ROLE_DESCRIPTIONS[role]}</p>
          {canLeave ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                openAction({ kind: "leave", version: org.teamVersion! })
              }
            >
              退出组织
            </Button>
          ) : (
            <span>退出前请先转移所有权</span>
          )}
        </div>
      </section>
      {manager && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            待处理邀请{" "}
            <span className="font-normal text-zinc-500">
              {org.invitations?.length || 0}
            </span>
          </h2>
          {org.invitations?.length ? (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {org.invitations.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center gap-2 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm">{invite.email}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {ROLE_LABELS[invite.role]} ·{" "}
                      {new Date(invite.expiresAt).getTime() <= Date.now()
                        ? "已过期"
                        : `${date(invite.expiresAt)} 到期`}
                    </p>
                  </div>
                  {canInviteRole(role, invite.role) && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          openAction({
                            kind: "renew",
                            invite,
                            version: org.teamVersion!,
                          })
                        }
                      >
                        重新生成链接
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          openAction({
                            kind: "revoke",
                            invite,
                            version: org.teamVersion!,
                          })
                        }
                      >
                        撤销
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-5 text-sm text-zinc-500">
              暂无待处理邀请。生成链接后，发送给对应邮箱的同事。
            </p>
          )}
        </section>
      )}
      {manager && (
        <Link
          className="inline-block text-sm text-blue-600 hover:underline"
          href={`/dashboard/audit?organizationId=${org.id}`}
        >
          查看组织操作记录
        </Link>
      )}
      {manager && !!org.events?.length && (
        <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">
            最近团队操作
          </summary>
          <ol className="mt-4 max-h-80 space-y-3 overflow-auto">
            {org.events.map((event) => (
              <li key={event.id} className="text-xs leading-5">
                <p className="break-all">
                  <strong className="font-medium">{event.actorName}</strong> ·{" "}
                  {eventLabels[event.action] || event.action} · {event.target}
                </p>
                <p className="text-zinc-500">
                  {date(event.createdAt)}
                  {event.detail && ` · ${event.detail}`}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setInviteOpen(open);
            if (!open) setIssued(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {issued ? "邀请链接已生成" : "邀请团队成员"}
            </DialogTitle>
            <DialogDescription>
              {issued
                ? `仅用于 ${issued.email}，${date(issued.expiresAt)} 到期。请将链接发给对应成员。`
                : "对方确认后才会加入组织。新成员可以通过邀请创建账号。"}
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-3">
              <Input
                aria-label="邀请链接"
                value={issued.url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(issued.url);
                    setNotice("链接已复制");
                  } catch {
                    setError("复制失败，请选中上方链接手动复制");
                  }
                }}
              >
                <Copy className="size-4" />
                复制邀请链接
              </Button>
              <p className="text-xs leading-5 text-zinc-500">
                关闭后可重新生成链接；重新生成会让旧链接失效。
              </p>
            </div>
          ) : (
            <form
              id="team-invite"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(() =>
                  issueLink(
                    `/api/organizations/${org.id}/invitations`,
                    "POST",
                    { email, role: inviteRole, version: org.teamVersion },
                  ),
                );
              }}
            >
              <div className="space-y-2">
                <label htmlFor="invite-email" className="text-sm">
                  成员邮箱
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                  autoComplete="off"
                  maxLength={254}
                />
              </div>
              <Select
                value={inviteRole}
                disabled={busy}
                onValueChange={(v) => setInviteRole(v as TeamRole)}
              >
                <SelectTrigger aria-label="邀请角色">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                {ROLE_DESCRIPTIONS[inviteRole]}
              </p>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-emerald-700">
              {notice}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setInviteOpen(false);
                setIssued(null);
              }}
            >
              {issued ? "完成" : "取消"}
            </Button>
            {!issued && (
              <Button form="team-invite" type="submit" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                生成邀请链接
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!action}
        onOpenChange={(open) => !busy && !open && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action ? actionTitles[action.kind] : "成员操作"}
            </DialogTitle>
            <DialogDescription>
              {action && "member" in action
                ? `${action.member.user.name} · ${action.member.user.email}`
                : action && "invite" in action
                  ? action.invite.email
                  : org.name}
            </DialogDescription>
          </DialogHeader>
          {action?.kind === "role" && (
            <>
              <Select
                value={nextRole}
                onValueChange={(v) => setNextRole(v as TeamRole)}
                disabled={busy}
              >
                <SelectTrigger aria-label="新的成员角色">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-zinc-500">
                {ROLE_DESCRIPTIONS[nextRole]}
                。角色调整后，该成员发出的待处理邀请会失效。
              </p>
            </>
          )}
          {action?.kind === "transfer" && (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-zinc-500">
                对方将获得所有者权限，你将成为管理员。你发出的待处理邀请会失效。
              </p>
              <label htmlFor="owner-confirmation" className="block text-sm">
                输入接任者邮箱确认
              </label>
              <Input
                id="owner-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                disabled={busy}
              />
            </div>
          )}
          {["remove", "leave"].includes(action?.kind || "") && (
            <p className="text-sm leading-6 text-zinc-500">
              退出或移除后，将失去此组织私有项目的访问权限，发出的待处理邀请也会失效。项目文档和已有操作记录保留。
            </p>
          )}
          {action?.kind === "renew" && (
            <p className="text-sm text-zinc-500">
              旧链接将立即失效，新链接有效期为 7 天。
            </p>
          )}
          {action?.kind === "revoke" && (
            <p className="text-sm text-zinc-500">
              撤销后，对方将无法通过此链接加入组织。
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              取消
            </Button>
            <Button
              disabled={
                busy ||
                (action?.kind === "transfer" &&
                  confirmation !== action.member.user.email)
              }
              onClick={submitAction}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}确认
              {action ? actionTitles[action.kind] : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
