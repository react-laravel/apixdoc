import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/permissions";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
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
  searchParams: Promise<{ endpoint?: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const { project, permissions } = await getProjectAccess(
    id,
    session?.user?.id,
  );
  if (!project) notFound();
  const { endpoint } = await searchParams;
  if (!permissions.canRead) {
    if (!session?.user)
      redirect(
        `/login?callbackUrl=${encodeURIComponent(`/docs/${id}${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`)}`,
      );
    notFound();
  }
  const data = await prisma.project.findUnique({
    where: { id },
    include: {
      folders: { orderBy: { order: "asc" } },
      endpoints: {
        orderBy: { order: "asc" },
        include: {
          parameters: true,
          headers: true,
          requestBody: true,
          responses: { orderBy: { statusCode: "asc" } },
        },
      },
    },
  });
  if (!data) notFound();
  return (
    <DocumentationView
      project={sanitizeDocumentationProject(data)}
      initialEndpoint={endpoint}
      canOpenWorkspace={!!session?.user && permissions.canRead}
    />
  );
}
