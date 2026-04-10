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
      <div className="flex h-14 items-center justify-between px-6">
        <Link
          href="/dashboard"
          className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          ApiX Docs
        </Link>

        <div className="flex items-center gap-4">
          {user.role === "admin" && (
            <Link href="/dashboard/users">
              <Button variant="ghost" size="sm">
                用户管理
              </Button>
            </Link>
          )}

          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
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
