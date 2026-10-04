"use client";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Menu,
  ChevronDown,
  LogOut,
  UserRound,
  Building2,
  FolderOpen,
  History,
  Users,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardNavProps } from "@/lib/types";
export function DashboardNav({ user }: DashboardNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false),
    pathname = usePathname();
  const links = [
    {
      href: "/dashboard",
      label: "组织",
      icon: Building2,
      active:
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/organizations"),
    },
    {
      href: "/dashboard/projects",
      label: "项目",
      icon: FolderOpen,
      active: pathname.startsWith("/dashboard/projects"),
    },
    ...(user?.canReadAudit || user?.role === "admin"
      ? [
          {
            href: "/dashboard/audit",
            label: "操作记录",
            icon: History,
            active: pathname.startsWith("/dashboard/audit"),
          },
        ]
      : []),
  ];
  const management = [
    { href: "/dashboard/users", label: "用户管理", icon: Users },
    { href: "/dashboard/operations", label: "运行状态", icon: Activity },
  ];
  const menuItem =
    "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800";
  const navigation = (mobile = false) =>
    links.map(({ icon: Icon, ...link }) => (
      <Link
        key={link.href}
        href={link.href}
        onClick={() => setMobileOpen(false)}
        aria-current={link.active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500",
          mobile && "py-3",
          link.active
            ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        )}
      >
        <Icon className="size-4" />
        {link.label}
      </Link>
    ));
  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-h-14 items-center gap-3 px-3 sm:gap-5 sm:px-5">
        <Link
          href="/dashboard"
          aria-label="ApiX Docs 首页"
          className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Image src="/logo.svg" alt="" width={32} height={32} />
          <span className="hidden text-sm font-semibold tracking-tight sm:block">
            ApiX Docs
          </span>
        </Link>
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="打开导航菜单"
            >
              <Menu className="size-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="left-0 top-0 flex h-dvh max-h-dvh w-[min(20rem,calc(100%-3rem))] translate-x-0 translate-y-0 flex-col rounded-none border-y-0 border-l-0 p-5 sm:rounded-none">
            <DialogHeader>
              <DialogTitle>ApiX Docs</DialogTitle>
              <DialogDescription>团队的接口工作空间</DialogDescription>
            </DialogHeader>
            <nav aria-label="移动导航" className="mt-4 flex flex-col gap-1">
              {navigation(true)}
            </nav>
            {user?.role === "admin" && (
              <div className="mt-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                <p className="mb-2 px-3 text-xs text-zinc-400">平台管理</p>
                {management.map(({ icon: Icon, ...link }) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className={cn(menuItem, "text-zinc-500")}
                  >
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
            <Link
              href="/dashboard/account"
              onClick={() => setMobileOpen(false)}
              className={cn(
                menuItem,
                "mt-auto border-t border-zinc-100 pt-5 dark:border-zinc-800",
              )}
            >
              <UserRound className="size-4" />
              个人设置
            </Link>
          </DialogContent>
        </Dialog>
        <nav
          aria-label="主导航"
          className="hidden min-w-0 items-center gap-1 lg:flex"
        >
          {navigation()}
        </nav>
        {user && (
          <div className="ml-auto min-w-0">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" className="h-10 max-w-48 gap-2 px-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold dark:bg-zinc-800">
                    {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{user.name || user.email}</span>
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="min-w-0 px-3 py-2">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {user.email}
                    </p>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <DropdownMenu.Item asChild>
                    <Link href="/dashboard/account" className={menuItem}>
                      <UserRound className="size-4" />
                      个人设置
                    </Link>
                  </DropdownMenu.Item>
                  {user.role === "admin" && (
                    <>
                      <DropdownMenu.Separator className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                      {management.map(({ icon: Icon, ...link }) => (
                        <DropdownMenu.Item key={link.href} asChild>
                          <Link href={link.href} className={menuItem}>
                            <Icon className="size-4" />
                            {link.label}
                          </Link>
                        </DropdownMenu.Item>
                      ))}
                    </>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                  <DropdownMenu.Item
                    onSelect={() => signOut({ callbackUrl: "/" })}
                    className={cn(menuItem, "text-red-600 dark:text-red-400")}
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
    </header>
  );
}
