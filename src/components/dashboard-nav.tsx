"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { Menu, ChevronDown, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardNavProps } from "@/lib/types";

export function DashboardNav({ user }: DashboardNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    {
      href: "/dashboard",
      label: "组织管理",
      active:
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/organizations"),
    },
    {
      href: "/dashboard/projects",
      label: "项目管理",
      active: pathname.startsWith("/dashboard/projects"),
    },
    {
      href: "/dashboard/tools/json",
      label: "工具",
      active: pathname.startsWith("/dashboard/tools"),
    },
    ...(user?.canReadAudit || user?.role === "admin"
      ? [
          {
            href: "/dashboard/audit",
            label: "操作记录",
            active: pathname.startsWith("/dashboard/audit"),
          },
        ]
      : []),
    ...(user?.role === "admin"
      ? [
          {
            href: "/dashboard/operations",
            label: "运行状态",
            active: pathname.startsWith("/dashboard/operations"),
          },
          {
            href: "/dashboard/users",
            label: "用户管理",
            active: pathname.startsWith("/dashboard/users"),
          },
        ]
      : []),
  ];
  const navigation = links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      onClick={() => setMobileOpen(false)}
      aria-current={link.active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-sm transition-colors",
        link.active
          ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      )}
    >
      {link.label}
    </Link>
  ));
  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-h-14 items-center gap-3 px-3 py-2 sm:gap-6 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center"
          aria-label="ApiX Docs"
        >
          <img src="/logo.svg" alt="ApiX Docs" className="h-8 w-auto" />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 sm:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="菜单"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <nav aria-label="主导航" className="hidden items-center gap-1 sm:flex">
          {navigation}
        </nav>
        {user && (
          <div className="ml-auto min-w-0">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="sm" className="max-w-40 gap-2">
                  <span className="truncate">{user.name || user.email}</span>
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <DropdownMenu.Item
                    onSelect={() => signOut({ callbackUrl: "/" })}
                    className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-red-600 outline-none focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-950"
                  >
                    <LogOut className="size-4" />
                    退出登录
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )}
      </div>
      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="移动导航"
          className="flex flex-col gap-1 border-t border-zinc-200 px-3 py-2 sm:hidden dark:border-zinc-800"
        >
          {navigation}
        </nav>
      )}
    </header>
  );
}
