"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Search, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { PasswordField } from "@/components/accounts/password-field";
import { ApiError, apiFetch } from "@/lib/api-fetch";
import {
  ACCOUNT_STATUSES,
  type Account,
  type AccountAction,
} from "@/lib/accounts/model";
type Page = { items: Account[]; total: number; next: string | null };
const actions: Record<AccountAction, { title: string; description: string }> = {
  disable: {
    title: "停用账号",
    description:
      "阻止登录并退出所有设备，撤销待处理邀请。组织成员关系和内容保留，之后可以重新启用。",
  },
  enable: {
    title: "启用账号",
    description: "允许账号重新登录。此前撤销的邀请和登录不会恢复。",
  },
  delete: {
    title: "删除账号",
    description:
      "退出所有组织并撤销邀请与登录。保留已创建的项目和接口，可恢复账号；恢复后需重新邀请加入组织。组织所有者必须先转移所有权。",
  },
  restore: {
    title: "恢复账号",
    description:
      "恢复为普通账号。原密码仍可使用，也可以另行生成恢复链接；组织成员关系及平台管理员权限不会自动恢复。",
  },
  role: {
    title: "修改账号角色",
    description:
      "平台管理员可以管理所有账号及查看全部审计。修改角色后该账号需重新登录。",
  },
  recovery: {
    title: "生成恢复链接",
    description:
      "生成半小时有效的一次性链接。请私下交给账号本人；使用链接重设密码后，所有旧登录均失效。重新生成会撤销之前的链接。",
  },
  "revoke-recovery": {
    title: "撤销恢复链接",
    description: "让已生成的恢复链接立即失效，现有密码和登录保持不变。",
  },
};
const selectClass =
  "h-9 rounded-md border border-zinc-200 bg-transparent px-3 text-sm dark:border-zinc-700";
export default function UsersPage() {
  const { data: session, status: authStatus } = useSession(),
    router = useRouter();
  const [page, setPage] = useState<Page>({ items: [], total: 0, next: null }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [applied, setApplied] = useState({ q: "", status: "" });
  const [create, setCreate] = useState(false),
    [selection, setSelection] = useState<{
      account: Account;
      action: AccountAction;
    } | null>(null);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("user");
  const [currentPassword, setCurrentPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState(""),
    [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<{
      url: string;
      expiresAt: string;
    } | null>(null),
    [copied, setCopied] = useState(false);
  const request = useRef({ sequence: 0 });
  const load = useCallback(
    async (cursor?: string) => {
      const seq = ++request.current.sequence;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          ...applied,
          ...(cursor ? { cursor } : {}),
        });
        const data = await apiFetch<Page>(`/api/users?${params}`);
        if (seq === request.current.sequence)
          setPage((prev) => ({
            ...data,
            items: cursor ? [...prev.items, ...data.items] : data.items,
          }));
      } catch (e) {
        if (seq === request.current.sequence)
          setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (seq === request.current.sequence) setLoading(false);
      }
    },
    [applied],
  );
  useEffect(() => {
    if (authStatus === "authenticated" && session?.user.role !== "admin")
      router.replace("/dashboard");
  }, [authStatus, session, router]);
  useEffect(() => {
    const activeRequests = request.current;
    if (session?.user.role === "admin") void load();
    return () => {
      activeRequests.sequence++;
    };
  }, [load, session?.user.id, session?.user.role]);
  function close() {
    if (busy) return;
    setCreate(false);
    setSelection(null);
    setPassword("");
    setCurrentPassword("");
    setConfirmation("");
    setDialogError("");
    setConflict(false);
    setRecovery(null);
    setCopied(false);
  }
  function open(account: Account, action: AccountAction) {
    close();
    setSelection({ account, action });
    setRole(account.role);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setDialogError("");
    setConflict(false);
    setNotice("");
    try {
      if (create) {
        await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ name, email, password, role }),
        });
        setCreate(false);
        setPassword("");
        setNotice("账号已创建");
      } else if (selection) {
        const result = await apiFetch<{
          account: Account;
          recovery?: { token: string; expiresAt: string };
        }>(`/api/users/${selection.account.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: selection.action,
            version: selection.account.accountVersion,
            currentPassword,
            confirmation,
            role,
          }),
        });
        setCurrentPassword("");
        setConfirmation("");
        if (result.recovery) {
          setSelection({ ...selection, account: result.account });
          setRecovery({
            url: `${window.location.origin}/recover#token=${result.recovery.token}`,
            expiresAt: result.recovery.expiresAt,
          });
        } else {
          setSelection(null);
          setNotice(`${actions[selection.action].title}成功`);
        }
      }
      await load();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : "操作失败");
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      setBusy(false);
    }
  }
  if (authStatus !== "authenticated" || session?.user.role !== "admin")
    return <p className="text-sm text-zinc-500">正在检查权限…</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="mt-2 text-sm text-zinc-500">
            管理账号访问与恢复，保留团队工作成果。
          </p>
        </div>
        <Button
          onClick={() => {
            close();
            setName("");
            setEmail("");
            setRole("user");
            setCreate(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          创建用户
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ q: query.trim(), status: filter });
        }}
        className="flex flex-wrap gap-2"
      >
        <Input
          aria-label="搜索姓名或邮箱"
          placeholder="搜索姓名或邮箱"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          className="min-w-40 flex-1"
        />
        <select
          aria-label="账号状态"
          className={selectClass}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(ACCOUNT_STATUSES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="outline" type="submit">
          <Search className="mr-2 size-4" />
          查询
        </Button>
        <Button
          variant="ghost"
          type="button"
          aria-label="刷新账号列表"
          onClick={() => load()}
          disabled={loading}
        >
          <RefreshCw className="size-4" />
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800">
          {loading ? "正在加载…" : `共 ${page.total} 个账号`}
        </div>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {page.items.map((account) => (
            <div key={account.id} className="flex items-center gap-3 px-4 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-medium dark:bg-zinc-800">
                {account.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-medium">{account.name}</span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {ACCOUNT_STATUSES[account.status]}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {account.role === "admin" ? "平台管理员" : "普通账号"}
                    {account.id === session.user.id ? " · 你" : ""}
                  </span>
                </div>
                <p className="mt-1 break-all text-sm text-zinc-500">
                  {account.email}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  创建于{" "}
                  {new Date(account.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              {account.id !== session.user.id && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button
                      aria-label={`管理 ${account.email}`}
                      variant="ghost"
                      size="icon"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      className="z-50 min-w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {(account.status === "deleted"
                        ? ["restore"]
                        : account.status === "disabled"
                          ? ["enable", "delete"]
                          : [
                              "role",
                              "recovery",
                              ...(account.resetExpiresAt &&
                              new Date(account.resetExpiresAt) > new Date()
                                ? ["revoke-recovery"]
                                : []),
                              "disable",
                              "delete",
                            ]
                      ).map((action) => (
                        <DropdownMenu.Item
                          key={action}
                          onSelect={() =>
                            open(account, action as AccountAction)
                          }
                          className={`cursor-pointer rounded px-3 py-2 text-sm outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 ${action === "delete" ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {actions[action as AccountAction].title}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          ))}
        </div>
        {!loading && !page.items.length && (
          <p className="p-10 text-center text-sm text-zinc-500">
            没有匹配的账号，试试其他关键词或状态。
          </p>
        )}
      </div>
      {page.next && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => load(page.next!)}
        >
          加载更多
        </Button>
      )}
      <Dialog
        open={create || !!selection}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {create
                ? "创建用户"
                : selection
                  ? actions[selection.action].title
                  : ""}
            </DialogTitle>
            <DialogDescription>
              {create
                ? "创建后将登录信息私下交给本人。"
                : selection
                  ? actions[selection.action].description
                  : ""}
            </DialogDescription>
          </DialogHeader>
          {recovery ? (
            <div className="space-y-4">
              <p
                role="status"
                className="text-sm text-emerald-700 dark:text-emerald-300"
              >
                恢复链接已生成，有效期至{" "}
                {new Date(recovery.expiresAt).toLocaleTimeString("zh-CN")}
                。关闭后无法再次查看。
              </p>
              <label htmlFor="recovery-link" className="text-sm">
                一次性恢复链接
              </label>
              <Input
                id="recovery-link"
                readOnly
                value={recovery.url}
                onFocus={(e) => e.target.select()}
              />
              <p className="break-all text-sm text-zinc-500">
                交付对象：{selection?.account.email}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(recovery.url);
                      setCopied(true);
                    } catch {
                      setDialogError("复制失败，请选中链接后手动复制");
                    }
                  }}
                >
                  {copied ? "已复制" : "复制链接"}
                </Button>
                <Button variant="outline" onClick={close}>
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {create ? (
                <>
                  <div className="space-y-2">
                    <label htmlFor="create-email" className="text-sm">
                      邮箱
                    </label>
                    <Input
                      id="create-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={254}
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="create-name" className="text-sm">
                      姓名
                    </label>
                    <Input
                      id="create-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      disabled={busy}
                    />
                  </div>
                  <PasswordField
                    id="create-password"
                    label="初始密码"
                    value={password}
                    onChange={setPassword}
                    newPassword
                    disabled={busy}
                  />
                  <p className="text-xs text-zinc-500">
                    至少 8 位，不超过 72 字节。
                  </p>
                </>
              ) : (
                <p className="break-all text-sm font-medium">
                  {selection?.account.name} · {selection?.account.email}
                </p>
              )}
              {(create || selection?.action === "role") && (
                <div className="space-y-2">
                  <label htmlFor="account-role" className="block text-sm">
                    账号角色
                  </label>
                  <select
                    id="account-role"
                    className={`${selectClass} w-full`}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={busy}
                  >
                    <option value="user">普通账号</option>
                    <option value="admin">平台管理员</option>
                  </select>
                </div>
              )}
              {selection?.action === "delete" && (
                <div className="space-y-2">
                  <label htmlFor="account-confirmation" className="text-sm">
                    输入该账号完整邮箱确认删除
                  </label>
                  <Input
                    id="account-confirmation"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                    required
                    disabled={busy}
                  />
                </div>
              )}
              {!create && (
                <PasswordField
                  id="admin-password"
                  label="你的当前密码"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  disabled={busy}
                />
              )}
              {dialogError && (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {dialogError}
                </p>
              )}
              {conflict && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    close();
                    void load();
                  }}
                >
                  关闭并刷新账号列表
                </Button>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={busy}
                >
                  取消
                </Button>
                <Button
                  variant={
                    selection?.action === "delete" ? "destructive" : "default"
                  }
                  disabled={
                    busy ||
                    (selection?.action === "delete" &&
                      confirmation !== selection.account.email)
                  }
                >
                  {busy ? "正在处理…" : create ? "创建账号" : "确认"}
                </Button>
              </DialogFooter>
            </form>
          )}
          {recovery && dialogError && (
            <p role="alert" className="text-sm text-red-600">
              {dialogError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
