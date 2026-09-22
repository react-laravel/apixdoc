import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  FolderOpen,
  Globe2,
  LockKeyhole,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectListItem } from "@/lib/types";
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-wider text-blue-600 dark:text-blue-400">
          工作空间
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      {children && (
        <div className="flex shrink-0 gap-2 sm:pt-7">{children}</div>
      )}
    </div>
  );
}
export function ListSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 size-4 text-zinc-400"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onChange("");
          }
        }}
        className="h-10 bg-white pl-9 pr-10 shadow-none [&::-webkit-search-cancel-button]:appearance-none dark:bg-zinc-900"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 size-8"
          aria-label={`清空${label}`}
          onClick={() => onChange("")}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
export function EmptyList({
  icon: Icon = FolderOpen,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800">
        <Icon aria-hidden className="size-7 text-zinc-400" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
        {description}
      </p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function ListSkeleton() {
  return (
    <div
      role="status"
      aria-label="正在加载列表"
      className="grid gap-3 sm:grid-cols-2"
    >
      <span className="sr-only">正在加载列表…</span>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden
          className="h-36 animate-pulse space-y-4 rounded-xl border border-zinc-200 bg-white p-5 motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="h-4 w-2/5 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-1/3 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
export function ProjectCard({
  project,
  organization,
}: {
  project: Pick<ProjectListItem, "id" | "name" | "description" | "isPublic"> & {
    _count?: ProjectListItem["_count"];
  };
  organization?: { id: string; name: string };
}) {
  return (
    <article className="group relative flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white transition-colors hover:border-blue-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-800">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="flex flex-1 flex-col rounded-xl p-5 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-blue-500"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <FolderOpen aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold leading-6 group-hover:text-blue-700 dark:group-hover:text-blue-300">
              {project.name}
            </h2>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
              {project.isPublic ? (
                <Globe2 aria-hidden className="size-3" />
              ) : (
                <LockKeyhole aria-hidden className="size-3" />
              )}
              {project.isPublic ? "公开文档" : "团队可见"}
            </span>
          </div>
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-zinc-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none dark:text-zinc-600"
          />
        </div>
        <p className="mt-4 line-clamp-2 min-h-10 break-words text-sm leading-5 text-zinc-500 dark:text-zinc-400">
          {project.description || "进入项目，查看和维护接口文档。"}
        </p>
        {project._count && (
          <div className="mt-4 flex gap-4 text-xs text-zinc-500">
            <span>
              <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                {project._count.endpoints}
              </strong>{" "}
              个接口
            </span>
            <span>{project._count.folders} 个文件夹</span>
          </div>
        )}
      </Link>
      {organization && (
        <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <Link
            href={`/dashboard/organizations/${organization.id}`}
            className="relative z-10 inline-flex max-w-full items-center gap-1.5 rounded text-xs text-zinc-500 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <Building2 aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{organization.name}</span>
          </Link>
        </div>
      )}
    </article>
  );
}
