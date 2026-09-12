export function loginDestination(value: string | null): string {
  if (value === "/join") return value;
  if (value && /^\/dashboard\/organizations\/[A-Za-z0-9_-]+$/.test(value))
    return value;
  return value && /^\/docs\/[A-Za-z0-9_-]+(?:\?[^#\\]*)?$/.test(value)
    ? value
    : "/dashboard";
}
