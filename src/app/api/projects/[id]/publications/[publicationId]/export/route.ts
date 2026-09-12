import { auth } from "@/lib/auth";
import {
  readPublishedDocument,
  readStoredPublication,
} from "@/lib/publications/service";
import {
  exportOpenApi,
  exportPostman,
  serializeSpecification,
} from "@/lib/documentation/export";
import { DocumentError, documentFailure } from "@/lib/documents/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; publicationId: string }> },
) {
  try {
    const { id, publicationId } = await params;
    const session = await auth();
    const query = new URL(request.url).searchParams;
    const format = query.get("format") || "openapi",
      syntax = query.get("syntax") || "json";
    if (
      !["openapi", "postman"].includes(format) ||
      !["json", "yaml"].includes(syntax) ||
      (format === "postman" && syntax !== "json")
    )
      throw new DocumentError("导出格式不正确");
    const data =
      query.get("internal") === "1"
        ? session?.user
          ? await readStoredPublication(id, publicationId, session.user)
          : (() => {
              throw new DocumentError("请登录", 401);
            })()
        : await readPublishedDocument(id, session?.user?.id, publicationId);
    return new Response(
      serializeSpecification(
        format === "postman" ? exportPostman(data) : exportOpenApi(data),
        syntax as "json" | "yaml",
      ),
      {
        headers: {
          "Content-Type":
            syntax === "yaml"
              ? "application/yaml; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="published-${id}-${data.publication!.number}.${syntax}"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return documentFailure(error);
  }
}
