import { documentActor } from "@/lib/documents/routes";
import { restoreDocument } from "@/lib/documents/service";
import {
  documentSuccess,
  documentFailure,
  documentBody,
} from "@/lib/documents/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(id);
    const body = await documentBody(request);
    return documentSuccess(
      await restoreDocument(
        id,
        typeof body.revisionId === "string" ? body.revisionId : undefined,
        actor,
        body,
      ),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
