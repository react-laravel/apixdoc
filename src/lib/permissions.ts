import { prisma } from "@/lib/prisma";

export type OrganizationRole = "owner" | "admin" | "member" | "viewer";
export interface ProjectPermissions {
  canRead: boolean;
  canEdit: boolean;
  canConfigure: boolean;
  canReadConfiguration: boolean;
  canManage: boolean;
}
export function projectPermissions(
  role?: string | null,
  isPublic = false,
): ProjectPermissions {
  const canEdit = role === "owner" || role === "admin" || role === "member";
  const canManage = role === "owner" || role === "admin";
  return {
    canRead: isPublic || canEdit || role === "viewer",
    canEdit,
    canConfigure: canEdit,
    canReadConfiguration: canEdit,
    canManage,
  };
}
export function canEditContent(role?: string | null): boolean {
  return projectPermissions(role).canEdit;
}
export function canConfigureProject(role?: string | null): boolean {
  return projectPermissions(role).canConfigure;
}
export function canManageProject(role?: string | null): boolean {
  return projectPermissions(role).canManage;
}
export async function getProjectAccess(projectId: string, userId?: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const membership =
    project && userId
      ? await prisma.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId,
              organizationId: project.organizationId,
            },
          },
        })
      : null;
  return {
    project,
    membership,
    permissions: projectPermissions(membership?.role, project?.isPublic),
  };
}
