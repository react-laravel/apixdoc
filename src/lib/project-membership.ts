import { prisma } from "@/lib/prisma";

/** Runtime configuration is scoped to organization members, including for public projects. */
export async function isProjectMember(
  projectId: string,
  userId: string,
): Promise<boolean> {
  return !!(await prisma.organizationMember.findFirst({
    where: { userId, organization: { projects: { some: { id: projectId } } } },
    select: { id: true },
  }));
}
