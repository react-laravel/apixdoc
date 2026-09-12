import { documentActor } from "@/lib/documents/routes";
import { readDocumentHistory } from "@/lib/documents/service";
import { documentSuccess, documentFailure } from "@/lib/documents/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(id);
    return documentSuccess(
      await readDocumentHistory(
        id,
        actor,
        Number(new URL(request.url).searchParams.get("before")) || undefined,
      ),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
