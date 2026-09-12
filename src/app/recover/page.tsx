"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/accounts/password-field";
export default function RecoverPage() {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    let active = true;
    setToken(value);
    if (!value) return;
    apiFetch("/api/account/recovery", {
      method: "POST",
      body: JSON.stringify({ token: value, action: "inspect" }),
    })
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/account/recovery", {
        method: "POST",
        body: JSON.stringify({ token, password, action: "reset" }),
      });
      setDone(true);
      setToken("");
      setPassword("");
      setConfirm("");
      window.history.replaceState(null, "", "/recover");
    } catch (e) {
      setError(e instanceof Error ? e.message : "重设失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold">恢复账号</h1>
        {done ? (
          <>
            <p
              role="status"
              className="text-sm text-emerald-700 dark:text-emerald-300"
            >
              密码已重设，旧登录及此恢复链接已失效。
            </p>
            <Link
              href="/login"
              className="block rounded-md bg-zinc-900 px-4 py-2 text-center text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              使用新密码登录
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-500">
              {token
                ? "设置新密码后，所有设备都需要重新登录。"
                : "请联系平台管理员获取一次性恢复链接。链接有效期为半小时，仅限本人使用。"}
            </p>
            {error && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {error}
              </p>
            )}
            {token && !ready && !error && (
              <p role="status" className="text-sm text-zinc-500">
                正在验证恢复链接…
              </p>
            )}
            {ready && (
              <form onSubmit={submit} className="space-y-4">
                <PasswordField
                  id="recovery-password"
                  label="新密码"
                  value={password}
                  onChange={setPassword}
                  newPassword
                  disabled={busy}
                />
                <PasswordField
                  id="recovery-confirm"
                  label="确认新密码"
                  value={confirm}
                  onChange={setConfirm}
                  newPassword
                  disabled={busy}
                />
                <p className="text-xs text-zinc-500">
                  至少 8 位，不超过 72 字节。
                </p>
                <Button className="w-full" disabled={busy}>
                  {busy ? "正在重设…" : "重设密码"}
                </Button>
              </form>
            )}
            <Link
              href="/login"
              className="block text-center text-sm text-blue-600 underline"
            >
              返回登录
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
