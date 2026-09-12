import { documentActor } from "@/lib/documents/routes";
import { exportDocumentRevision } from "@/lib/documents/service";
import { documentFailure } from "@/lib/documents/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const { id, revisionId } = await params;
    const result = await exportDocumentRevision(
      id,
      revisionId,
      await documentActor(id),
    );
    return new Response(result.document, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="endpoint-${id}-v${result.version}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return documentFailure(error);
  }
}
