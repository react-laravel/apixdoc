import { documentActor } from "@/lib/documents/routes";
import { copyDocument } from "@/lib/documents/service";
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
      await copyDocument(
        id,
        actor,
        request.body ? await documentBody(request) : {},
      ),
      201,
    );
  } catch (error) {
    return documentFailure(error);
  }
}
