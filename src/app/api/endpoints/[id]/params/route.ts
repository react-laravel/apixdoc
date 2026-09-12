import { documentActor } from "@/lib/documents/routes";
import { updateDocument } from "@/lib/documents/service";
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
    return documentSuccess(
      await updateDocument(id, actor, "params", await documentBody(request)),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
