export function loginDestination(value: string | null): string {
  return value && /^\/docs\/[A-Za-z0-9_-]+(?:\?[^#\\]*)?$/.test(value)
    ? value
    : "/dashboard";
}
