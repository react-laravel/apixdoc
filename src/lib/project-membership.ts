import { prisma } from "@/lib/prisma";
import { canEditContent } from "@/lib/permissions";

/** Public visitors and viewers receive documentation, never shared runtime credentials. */
export async function canReadProjectConfiguration(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organization: { projects: { some: { id: projectId } } } },
    select: { role: true },
  });
  return canEditContent(membership?.role);
}
