import { checkReadiness } from "@/lib/operations/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await checkReadiness();
  return Response.json(
    { status: result.ready ? "ready" : "unavailable" },
    {
      status: result.ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        ...(!result.ready ? { "Retry-After": "5" } : {}),
      },
    },
  );
}
