import { TeamError } from "@/lib/team/errors";
export function accountName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 80) throw new TeamError("姓名请填写 1–80 字");
  return name;
}
export function accountEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new TeamError("请填写有效邮箱");
  return email;
}
export function accountPassword(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    new TextEncoder().encode(value).length > 72
  )
    throw new TeamError("密码至少 8 位，且不超过 72 字节");
  return value;
}
export function accountVersion(actual: number, value: unknown) {
  if (!Number.isSafeInteger(value) || actual !== value)
    throw new TeamError("账号信息已变化，请刷新后重试", 409);
}
