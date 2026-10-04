"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { loginDestination } from "@/lib/login-destination";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    setNotice(
      reason === "password"
        ? "密码已修改，请使用新密码登录"
        : reason === "signout"
          ? "所有设备已退出，请重新登录"
          : reason === "delete"
            ? "账号已删除，如需恢复请联系平台管理员"
            : "",
    );
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");

    try {
      const destination = loginDestination(
        new URLSearchParams(window.location.search).get("callbackUrl"),
      );
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        redirectTo: destination,
      });
      if (!result || result.error || !result.ok) setError("邮箱或密码错误，或账号已停用");
      else {
        const invitation = new URLSearchParams(
          window.location.hash.slice(1),
        ).get("invite");
        window.location.assign(
          destination === "/join" &&
            invitation &&
            /^[A-Za-z0-9_-]{43}$/.test(invitation)
            ? `/join#invite=${invitation}`
            : destination,
        );
      }
    } catch {
      setError("登录失败，请检查网络后重试");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col items-center text-center">
          <Image src="/logo.svg" alt="ApiX Docs" width={48} height={48} />
          <p className="mt-3 text-sm text-zinc-500">API 文档管理平台</p>
        </div>

        <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              邮箱
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              disabled={loading}
              placeholder="admin@apixdocs.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              disabled={loading}
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {notice && (
            <p
              role="status"
              className="text-sm text-emerald-700 dark:text-emerald-300"
            >
              {notice}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
          <Link
            href="/recover"
            className="block text-center text-sm text-zinc-500 underline"
          >
            忘记密码？
          </Link>
        </form>
      </div>
    </div>
  );
}
