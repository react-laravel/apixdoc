"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DashboardNavProps {
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export function DashboardNav({ user }: DashboardNavProps) {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <Link
          href="/dashboard"
          className="text-base font-bold tracking-tight text-zinc-900 sm:text-lg dark:text-zinc-50"
        >
          ApiX Docs
        </Link>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:gap-4">
          <nav className="flex items-center gap-1 overflow-x-auto">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                组织管理
              </Button>
            </Link>
            <Link href="/dashboard/projects">
              <Button variant="ghost" size="sm">
                项目管理
              </Button>
            </Link>
          </nav>

          {user.role === "admin" && (
            <Link href="/dashboard/users">
              <Button variant="ghost" size="sm">
                用户管理
              </Button>
            </Link>
          )}

          <div className="hidden items-center gap-2 text-sm text-zinc-600 sm:flex dark:text-zinc-400">
            <span>{user.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {user.role}
            </Badge>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            退出
          </Button>
        </div>
      </div>
    </header>
  );
}
