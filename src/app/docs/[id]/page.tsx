import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProjectAccess } from "@/lib/permissions";
import {
  readDraftDocument,
  readPublishedDocument,
  readStoredPublication,
} from "@/lib/publications/service";
import { DocumentError } from "@/lib/documents/http";
import { DocumentationView } from "@/components/documentation/documentation-view";
export const metadata = {
  title: "API 文档 · ApiX Docs",
  robots: { index: false, follow: false },
};
export default async function DocumentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    endpoint?: string;
    release?: string;
    preview?: string;
    review?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await auth();
  try {
    const data =
      query.review === "1" && query.release
        ? session?.user
          ? await readStoredPublication(id, query.release, session.user)
          : (() => {
              throw new DocumentError("请登录", 401);
            })()
        : query.preview === "1"
          ? session?.user
            ? await readDraftDocument(id, session.user)
            : (() => {
                throw new DocumentError("请登录", 401);
              })()
          : await readPublishedDocument(id, session?.user?.id, query.release);
    const access = session?.user
      ? await getProjectAccess(id, session.user.id)
      : null;
    return (
      <DocumentationView
        project={data}
        initialEndpoint={query.endpoint}
        canOpenWorkspace={!!access?.membership && access.permissions.canRead}
      />
    );
  } catch (error) {
    if (error instanceof DocumentError && error.status === 401) {
      const values = new URLSearchParams();
      for (const key of ["endpoint", "release", "preview", "review"] as const)
        if (query[key]) values.set(key, query[key]!);
      redirect(
        `/login?callbackUrl=${encodeURIComponent(`/docs/${id}${values.size ? `?${values}` : ""}`)}`,
      );
    }
    if (error instanceof DocumentError) notFound();
    throw error;
  }
}
