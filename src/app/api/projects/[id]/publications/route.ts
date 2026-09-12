import { documentActor } from "@/lib/documents/routes";
import {
  publicationStatus,
  changePublication,
} from "@/lib/publications/service";
import {
  documentBody,
  documentSuccess,
  documentFailure,
} from "@/lib/documents/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return documentSuccess(
      await publicationStatus(
        id,
        await documentActor(undefined, id),
        Number(new URL(request.url).searchParams.get("before")) || undefined,
      ),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(undefined, id);
    return documentSuccess(
      await changePublication(id, actor, await documentBody(request)),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
