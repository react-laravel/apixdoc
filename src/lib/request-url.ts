export function buildRequestUrl(
  baseUrl: string,
  path: string,
  query: { key: string; value: string }[] = [],
): string {
  if (!baseUrl.trim()) throw new Error("请先在项目设置中配置基础 URL");
  const base = new URL(baseUrl.trim());
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("基础 URL 必须使用 http 或 https");
  // An endpoint is relative to the configured API base path, including /v1 prefixes.
  const [route, search = ""] = path
    .trim()
    .split("#", 1)[0]
    .split(/\?([\s\S]*)/);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/${route.replace(/^\/+/, "")}`;
  base.hash = "";
  const pathQuery = new URLSearchParams(search);
  for (const [key, value] of pathQuery) base.searchParams.append(key, value);
  for (const parameter of query)
    if (parameter.key.trim())
      base.searchParams.append(parameter.key.trim(), parameter.value);
  return base.toString();
}
