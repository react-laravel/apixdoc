"use client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RequestAuth } from "@/lib/request/types";

export function RequestAuthEditor({
  value,
  onChange,
  disabled,
}: {
  value: RequestAuth;
  onChange: (value: RequestAuth) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Select
        value={value.type}
        disabled={disabled}
        onValueChange={(type: RequestAuth["type"]) =>
          onChange(
            type === "bearer"
              ? { type, token: "" }
              : type === "basic"
                ? { type, username: "", password: "" }
                : type === "apiKey"
                  ? { type, key: "X-API-Key", value: "", location: "header" }
                  : { type: "none" },
          )
        }
      >
        <SelectTrigger aria-label="认证方式" className="w-full sm:w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">不自动添加认证</SelectItem>
          <SelectItem value="bearer">Bearer Token</SelectItem>
          <SelectItem value="basic">Basic Auth</SelectItem>
          <SelectItem value="apiKey">API Key</SelectItem>
        </SelectContent>
      </Select>
      {value.type === "none" && (
        <p className="text-xs text-zinc-500">
          已在请求头中配置的认证仍会随请求发送。
        </p>
      )}
      {value.type === "bearer" && (
        <Input
          disabled={disabled}
          aria-label="Bearer Token"
          type="password"
          autoComplete="off"
          placeholder="Token 或 {{token}}"
          value={value.token}
          onChange={(event) =>
            onChange({ ...value, token: event.target.value })
          }
          className="font-mono text-xs"
        />
      )}
      {value.type === "basic" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            disabled={disabled}
            aria-label="Basic 用户名"
            placeholder="用户名或 {{username}}"
            value={value.username}
            onChange={(event) =>
              onChange({ ...value, username: event.target.value })
            }
          />
          <Input
            disabled={disabled}
            aria-label="Basic 密码"
            type="password"
            autoComplete="off"
            placeholder="密码或 {{password}}"
            value={value.password}
            onChange={(event) =>
              onChange({ ...value, password: event.target.value })
            }
          />
        </div>
      )}
      {value.type === "apiKey" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
          <Input
            disabled={disabled}
            aria-label="API Key 名称"
            value={value.key}
            onChange={(event) =>
              onChange({ ...value, key: event.target.value })
            }
          />
          <Input
            disabled={disabled}
            aria-label="API Key 值"
            type="password"
            autoComplete="off"
            placeholder="值或 {{apiKey}}"
            value={value.value}
            onChange={(event) =>
              onChange({ ...value, value: event.target.value })
            }
          />
          <Select
            value={value.location}
            disabled={disabled}
            onValueChange={(location: "header" | "query") =>
              onChange({ ...value, location })
            }
          >
            <SelectTrigger aria-label="API Key 位置">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="header">请求头</SelectItem>
              <SelectItem value="query">查询参数</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
