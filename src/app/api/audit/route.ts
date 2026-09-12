import { auth } from "@/lib/auth";
import { readAudit, auditCsv, type AuditQuery } from "@/lib/audit/read";
import type { AuditRow } from "@/lib/audit/model";
import {
  DocumentError,
  documentFailure,
  documentSuccess,
} from "@/lib/documents/http";
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new DocumentError("请先登录", 401);
    const params = new URL(request.url).searchParams;
    const query: AuditQuery = {};
    for (const key of [
      "organizationId",
      "projectId",
      "actorId",
      "action",
      "q",
      "from",
      "to",
      "cursor",
    ] as const) {
      const value = params.get(key);
      if (value) query[key] = value;
    }
    const exporting = params.get("format") === "csv";
    const result = await readAudit(session.user.id, query, exporting);
    if (exporting)
      return new Response(
        auditCsv(
          result.items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
          })) as AuditRow[],
        ),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="audit-events.csv"',
            "Cache-Control": "private, no-store",
          },
        },
      );
    return documentSuccess(result);
  } catch (error) {
    return documentFailure(error);
  }
}
