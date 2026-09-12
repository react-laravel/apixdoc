import { documentActor } from "@/lib/documents/routes";
import { createDocument } from "@/lib/documents/service";
import {
  DocumentError,
  documentSuccess,
  documentFailure,
  documentBody,
} from "@/lib/documents/http";
export async function POST(request: Request) {
  try {
    const actor = await documentActor();
    const body = await documentBody(request);
    if (typeof body.projectId !== "string")
      throw new DocumentError("项目不正确");
    await documentActor(undefined, body.projectId);
    return documentSuccess(
      await createDocument(body.projectId, actor, body),
      201,
    );
  } catch (error) {
    return documentFailure(error);
  }
}
