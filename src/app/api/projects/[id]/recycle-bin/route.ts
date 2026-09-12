import { documentActor } from "@/lib/documents/routes";
import { recycleBin } from "@/lib/documents/service";
import { documentSuccess, documentFailure } from "@/lib/documents/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return documentSuccess(
      await recycleBin(
        id,
        await documentActor(undefined, id),
        new URL(request.url).searchParams.get("q") || "",
        new URL(request.url).searchParams.get("cursor") || undefined,
      ),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
