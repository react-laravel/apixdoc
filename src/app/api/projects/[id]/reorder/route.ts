import { documentActor } from "@/lib/documents/routes";
import { changeLayout } from "@/lib/documents/layout";
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
    const actor = await documentActor(undefined, id);
    return documentSuccess(
      await changeLayout(id, actor, await documentBody(request), "reorder"),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
