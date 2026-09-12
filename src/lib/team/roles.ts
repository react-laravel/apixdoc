export const TEAM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export type InvitedRole = Exclude<TeamRole, "owner">;
export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "编辑成员",
  viewer: "只读成员",
};
export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: "管理组织、成员与所有权",
  admin: "管理项目，邀请和管理普通成员",
  member: "编辑接口、文档与运行配置",
  viewer: "阅读文档，不接触运行凭据",
};
export function isInvitedRole(role: unknown): role is InvitedRole {
  return role === "admin" || role === "member" || role === "viewer";
}
export function canInviteRole(actor?: string | null, role?: string): boolean {
  return actor === "owner"
    ? isInvitedRole(role)
    : actor === "admin" && (role === "member" || role === "viewer");
}
export function canManageMember(
  actor?: string | null,
  target?: string,
): boolean {
  return (
    target !== "owner" &&
    (actor === "owner" ||
      (actor === "admin" && (target === "member" || target === "viewer")))
  );
}
