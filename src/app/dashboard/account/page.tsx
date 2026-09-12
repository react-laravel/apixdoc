"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { UserRound, LockKeyhole, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { Account } from "@/lib/accounts/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordField } from "@/components/accounts/password-field";
type Profile = Account & { ownerships: { id: string; name: string }[] };
const panel =
  "space-y-5 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900";
export default function AccountPage() {
  const [account, setAccount] = useState<Profile | null>(null),
    [name, setName] = useState("");
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [exitPassword, setExitPassword] = useState(""),
    [deletePassword, setDeletePassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const { update } = useSession(),
    router = useRouter();
  async function load() {
    setError("");
    try {
      const profile = await apiFetch<Profile>("/api/account");
      setAccount(profile);
      setName(profile.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    let active = true;
    apiFetch<Profile>("/api/account")
      .then((profile) => {
        if (active) {
          setAccount(profile);
          setName(profile.name);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !account) return;
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const saved = await apiFetch<Account>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ name, version: account.accountVersion }),
      });
      setAccount({ ...account, ...saved });
      setName(saved.name);
      setNotice("个人资料已保存");
      await update().catch(() => null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy("");
    }
  }
  async function security(
    e: React.FormEvent,
    action: "password" | "signout" | "delete",
  ) {
    e.preventDefault();
    if (busy || !account) return;
    setError("");
    setNotice("");
    if (action === "password" && password !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(action);
    try {
      await apiFetch("/api/account/security", {
        method: "POST",
        body: JSON.stringify({
          action,
          version: account.accountVersion,
          currentPassword:
            action === "password"
              ? current
              : action === "signout"
                ? exitPassword
                : deletePassword,
          password,
          confirmation,
        }),
      });
      await signOut({ redirect: false }).catch(() => null);
      window.location.assign(`/login?reason=${action}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      setBusy("");
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">个人设置</h1>
        <p className="mt-2 text-sm text-zinc-500">
          管理显示姓名、登录密码和账号状态。
        </p>
      </div>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-red-200 p-4 text-sm text-red-600 dark:border-red-900 dark:text-red-400"
        >
          {error}
          <Button variant="link" onClick={load} disabled={!!busy}>
            重新加载
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}
      {!account ? (
        <p className="text-sm text-zinc-500">
          {error ? "暂时无法读取账号信息" : "正在加载…"}
        </p>
      ) : (
        <>
          <form onSubmit={save} className={panel}>
            <h2 className="flex items-center gap-2 font-semibold">
              <UserRound className="size-4" />
              个人资料
            </h2>
            <div>
              <span className="text-sm text-zinc-500">登录邮箱</span>
              <p className="mt-1 break-all">{account.email}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="profile-name" className="text-sm font-medium">
                显示姓名
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                disabled={!!busy}
                autoComplete="name"
              />
            </div>
            <Button
              disabled={!!busy || name.trim() === account.name || !name.trim()}
            >
              {busy === "profile" ? "保存中…" : "保存资料"}
            </Button>
          </form>
          <form onSubmit={(e) => security(e, "password")} className={panel}>
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <LockKeyhole className="size-4" />
                修改密码
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                至少 8 位，不超过 72 字节。修改后所有设备均需重新登录。
              </p>
            </div>
            <PasswordField
              id="current-password"
              label="当前密码"
              value={current}
              onChange={setCurrent}
              disabled={!!busy}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField
                id="new-password"
                label="新密码"
                value={password}
                onChange={setPassword}
                newPassword
                disabled={!!busy}
              />
              <PasswordField
                id="confirm-password"
                label="确认新密码"
                value={confirm}
                onChange={setConfirm}
                newPassword
                disabled={!!busy}
              />
            </div>
            <Button disabled={!!busy}>
              {busy === "password" ? "修改中…" : "修改密码并重新登录"}
            </Button>
          </form>
          <form onSubmit={(e) => security(e, "signout")} className={panel}>
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <LogOut className="size-4" />
                退出全部设备
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                让所有已登录设备退出，包括当前设备。
              </p>
            </div>
            <PasswordField
              id="exit-password"
              label="验证当前密码"
              value={exitPassword}
              onChange={setExitPassword}
              disabled={!!busy}
            />
            <Button variant="outline" disabled={!!busy}>
              {busy === "signout" ? "正在退出…" : "退出全部设备"}
            </Button>
          </form>
          <details className={panel}>
            <summary className="cursor-pointer font-semibold text-red-600 dark:text-red-400">
              删除账号
            </summary>
            <p className="text-sm text-zinc-500">
              删除后将退出所有组织，撤销待处理邀请及登录。已创建的项目和接口保留；平台管理员可恢复账号，但组织成员关系需要重新邀请。
            </p>
            {account.ownerships.length > 0 ? (
              <div className="space-y-2 text-sm">
                <p>请先转移以下组织的所有权：</p>
                {account.ownerships.map((org) => (
                  <Link
                    key={org.id}
                    href={`/dashboard/organizations/${org.id}`}
                    className="block break-all text-blue-600 underline"
                  >
                    {org.name}
                  </Link>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => security(e, "delete")}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label htmlFor="delete-confirmation" className="text-sm">
                    输入完整邮箱确认删除
                  </label>
                  <Input
                    id="delete-confirmation"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    required
                    autoComplete="off"
                    disabled={!!busy}
                  />
                </div>
                <PasswordField
                  id="delete-password"
                  label="确认当前密码"
                  value={deletePassword}
                  onChange={setDeletePassword}
                  disabled={!!busy}
                />
                <Button
                  variant="destructive"
                  disabled={!!busy || confirmation !== account.email}
                >
                  {busy === "delete" ? "删除中…" : "删除我的账号"}
                </Button>
              </form>
            )}
          </details>
        </>
      )}
    </div>
  );
}
