"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Users, Loader2, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  type TeamRole,
} from "@/lib/team/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
interface Invitation {
  status: "pending" | "joined" | "used";
  organization: { id: string; name: string };
  email: string;
  role: TeamRole;
  expiresAt?: string;
  accountExists?: boolean;
  matchingAccount?: boolean;
  authenticated?: boolean;
}
export function JoinTeam() {
  const session = useSession();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [joined, setJoined] = useState(false);
  useEffect(() => {
    const read = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
        "invite",
      );
      setToken(fragment || "");
      setReady(true);
      setJoined(false);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const inspect = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      setInvitation(null);
      try {
        const result = await apiFetch<Invitation>("/api/invitations/inspect", {
          method: "POST",
          signal,
          body: JSON.stringify({ token }),
        });
        if (!signal.aborted) setInvitation(result);
      } catch (issue) {
        if (!signal.aborted)
          setError(
            issue instanceof Error ? issue.message : "邀请加载失败，请刷新重试",
          );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [token],
  );
  useEffect(() => {
    if (!ready || session.status === "loading") return;
    const controller = new AbortController();
    inspect(controller.signal);
    return () => controller.abort();
  }, [ready, inspect, session.status, session.data?.user?.id]);
  const destination = invitation
    ? `/dashboard/organizations/${invitation.organization.id}`
    : "/dashboard";
  const returnToInvite = `/join#invite=${token}`;
  const login = `/login?callbackUrl=%2Fjoin#invite=${token}`;
  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current || !invitation) return;
    setError("");
    if (!invitation.accountExists && password !== passwordAgain) {
      setError("两次输入的密码不一致");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await apiFetch<{
        organizationId: string;
        createdAccount: boolean;
        email: string;
      }>("/api/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      setJoined(true);
      if (result.createdAccount) {
        const signed = await signIn("credentials", {
          email: result.email,
          password,
          redirect: false,
          redirectTo: `/dashboard/organizations/${result.organizationId}`,
        });
        setPassword("");
        setPasswordAgain("");
        if (signed?.error) {
          setError("账号已创建并加入团队，请登录后继续");
          return;
        }
      }
      window.location.replace(
        `/dashboard/organizations/${result.organizationId}`,
      );
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "加入失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Users className="size-6" />
          </span>
          <p className="text-xs font-medium tracking-wide text-zinc-500">
            APIX DOCS · 团队协作
          </p>
          <h1 className="break-words text-xl font-semibold">
            {invitation ? `加入 ${invitation.organization.name}` : "团队邀请"}
          </h1>
        </div>
        {loading ? (
          <p
            role="status"
            className="flex justify-center gap-2 text-sm text-zinc-500"
          >
            <Loader2 className="size-4 animate-spin" />
            正在检查邀请…
          </p>
        ) : (
          invitation && (
            <>
              <div className="space-y-2 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
                <p className="break-all font-medium">{invitation.email}</p>
                <p>
                  {ROLE_LABELS[invitation.role]} ·{" "}
                  <span className="text-zinc-500">
                    {ROLE_DESCRIPTIONS[invitation.role]}
                  </span>
                </p>
              </div>
              {joined || invitation.status === "joined" ? (
                <div className="space-y-3 text-center">
                  <p className="flex justify-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    已加入团队
                  </p>
                  <Link
                    className={buttonVariants()}
                    href={
                      session.status === "authenticated"
                        ? destination
                        : `/login?callbackUrl=${encodeURIComponent(destination)}`
                    }
                  >
                    {session.status === "authenticated"
                      ? "进入组织"
                      : "登录并继续"}
                  </Link>
                </div>
              ) : invitation.status === "used" ? (
                <div className="space-y-3 text-sm text-zinc-500">
                  <p>
                    此邀请已使用。已加入的成员可以登录查看组织；如已被移除，请联系管理员重新邀请。
                  </p>
                  <a
                    className={buttonVariants({ variant: "outline" })}
                    href={login}
                  >
                    登录账号
                  </a>
                </div>
              ) : invitation.authenticated && !invitation.matchingAccount ? (
                <div className="space-y-3">
                  <p className="break-all text-sm text-zinc-500">
                    当前登录的是 {session.data?.user?.email}
                    ，请切换到邀请对应的账号。
                  </p>
                  <Button
                    className="w-full"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await signOut({ redirect: false });
                        window.location.assign(returnToInvite);
                      } catch {
                        setError("退出失败，请重试");
                        setBusy(false);
                      }
                    }}
                  >
                    切换账号
                  </Button>
                </div>
              ) : invitation.accountExists && !invitation.authenticated ? (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-500">
                    请使用上方邮箱登录，再确认加入团队。
                  </p>
                  <a
                    className={buttonVariants({ className: "w-full" })}
                    href={login}
                  >
                    登录并接受邀请
                  </a>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={accept}>
                  {!invitation.accountExists && (
                    <>
                      <div className="space-y-2">
                        <label htmlFor="join-name" className="text-sm">
                          你的姓名
                        </label>
                        <Input
                          id="join-name"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={80}
                          required
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="join-password" className="text-sm">
                          设置密码
                        </label>
                        <Input
                          id="join-password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={8}
                          required
                          disabled={busy}
                        />
                        <p className="text-xs text-zinc-500">
                          至少 8 位，建议使用较长且唯一的密码。
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="join-password-again"
                          className="text-sm"
                        >
                          再次输入密码
                        </label>
                        <Input
                          id="join-password-again"
                          type="password"
                          autoComplete="new-password"
                          value={passwordAgain}
                          onChange={(e) => setPasswordAgain(e.target.value)}
                          required
                          disabled={busy}
                        />
                      </div>
                    </>
                  )}
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {invitation.accountExists
                      ? "确认加入团队"
                      : "创建账号并加入团队"}
                  </Button>
                </form>
              )}
            </>
          )
        )}
        {error && (
          <p
            role="alert"
            className="break-words text-sm leading-6 text-red-600"
          >
            {error}
          </p>
        )}
        {!loading && !invitation && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => inspect(new AbortController().signal)}
          >
            重新检查邀请
          </Button>
        )}
        <p className="text-center text-xs text-zinc-400">
          只有确认接受邀请后，才会成为组织成员。
        </p>
      </section>
    </main>
  );
}
