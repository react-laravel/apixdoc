"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Menu, ChevronDown, X, Settings } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { DashboardNavProps } from "@/lib/types";

export function DashboardNav({
  user: initialUser,
  projectName: initialProjectName,
}: DashboardNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const user = initialUser;
  const [projectName, setProjectName] = useState(initialProjectName);
  const pathname = usePathname();

  // Fetch project name if not provided via prop
  useEffect(() => {
    if (initialProjectName) return;
    const match = pathname.match(/^\/dashboard\/projects\/([^/]+)$/);
    if (!match) return;

    let cancelled = false;
    apiFetch<{ name: string }>(`/api/projects/${match[1]}`)
      .then((data) => {
        if (!cancelled) {
          setProjectName(data.name);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initialProjectName, pathname]);

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-6">
        {/* Logo - first on the left */}
        <Link href="/dashboard" className="flex shrink-0 items-center" aria-label="ApiX Docs">
          <img src="/logo.svg" alt="ApiX Docs" className="h-8 w-auto sm:h-9" />
        </Link>

        {/* Menu + nav items */}
        <div className="flex items-center gap-1">
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-8 w-8"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="菜单"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>

          {/* Desktop nav - visible on sm+ */}
          <nav className="hidden items-center gap-1 sm:flex">
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
            {user?.role === "admin" && (
              <Link href="/dashboard/users">
                <Button variant="ghost" size="sm">
                  用户管理
                </Button>
              </Link>
            )}
          </nav>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Project name + settings on mobile */}
          {projectName && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-medium sm:hidden">
                {projectName}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden h-8 w-8 flex-shrink-0"
                onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}
                aria-label="设置"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* User dropdown */}
          {user && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="gap-1"
              >
                <span className="text-sm">{user.name}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
              </Button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={() => signOut({ callbackUrl: "/" })}
                    >
                      退出
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 sm:hidden">
          <nav className="flex flex-col gap-1">
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
              <span className="block rounded px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">组织管理</span>
            </Link>
            <Link href="/dashboard/projects" onClick={() => setMobileOpen(false)}>
              <span className="block rounded px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">项目管理</span>
            </Link>
            {user?.role === "admin" && (
              <Link href="/dashboard/users" onClick={() => setMobileOpen(false)}>
                <span className="block rounded px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">用户管理</span>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
