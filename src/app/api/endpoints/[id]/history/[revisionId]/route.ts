import { documentActor } from "@/lib/documents/routes";
import { readDocumentRevision } from "@/lib/documents/service";
import { documentSuccess, documentFailure } from "@/lib/documents/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(id);
    return documentSuccess(
      await readDocumentRevision(id, (await params).revisionId, actor),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
