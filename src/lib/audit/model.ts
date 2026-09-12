export const AUDIT_ACTIONS = {
  "organization.created": "创建组织",
  "organization.updated": "修改组织",
  "organization.deleted": "删除组织",
  "project.created": "创建项目",
  "project.deleted": "删除项目",
  "project.settings": "修改项目配置",
  "project.imported": "导入规范",
  "project.reordered": "调整目录排序",
  "folder.created": "创建目录",
  "folder.updated": "修改目录",
  "folder.deleted": "删除目录",
  "endpoint.created": "创建接口",
  "endpoint.updated": "修改接口",
  "endpoint.copied": "复制接口",
  "endpoint.deleted": "接口进入回收站",
  "endpoint.restored": "恢复接口版本",
  "team.invited": "邀请成员",
  "team.renewed": "重新生成邀请",
  "team.invitation-revoked": "撤销邀请",
  "team.joined": "加入组织",
  "team.role-changed": "修改成员角色",
  "team.removed": "移除成员",
  "team.left": "退出组织",
  "team.ownership-transferred": "转移所有权",
  "publication.publish": "发布文档",
  "publication.activate": "切换发布版本",
  "publication.revoke": "撤销版本链接",
  "publication.withdraw": "停止文档分享",
  "publication.baseline": "保存升级基线",
  "user.created": "创建账号",
  "user.deleted": "删除账号",
  "audit.retention": "清理过期审计",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;
export interface AuditRow {
  id: string;
  organizationId: string | null;
  organizationName: string;
  projectId: string | null;
  projectName: string;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  targetId: string | null;
  targetName: string;
  metadata: string;
  createdAt: string;
}
export const AUDIT_FIELDS: Record<string, string> = {
  name: "名称",
  description: "描述",
  baseUrl: "基础 URL",
  isPublic: "访问范围",
  environments: "环境",
  globalHeaders: "全局请求头",
  globalParams: "全局参数",
  parameters: "请求参数",
  headers: "请求头",
  requestBody: "请求体",
  responses: "响应",
  basic: "基本信息",
  params: "请求参数",
  body: "请求体",
  folderId: "目录",
  order: "顺序",
  parentId: "父目录",
};
export function auditDetail(metadata: string): string {
  const roles: Record<string, string> = {
    owner: "所有者",
    admin: "管理员",
    member: "编辑成员",
    viewer: "只读成员",
    user: "普通账号",
  };
  try {
    const value = JSON.parse(metadata);
    return [
      value.fields?.map((f: string) => AUDIT_FIELDS[f] || f).join("、"),
      value.version !== undefined ? `版本 ${value.version}` : "",
      value.affectedCount !== undefined ? `影响 ${value.affectedCount} 项` : "",
      value.importedCount !== undefined ? `导入 ${value.importedCount} 项` : "",
      value.removedCount !== undefined
        ? `清理 ${value.removedCount} 条过期记录`
        : "",
      value.skippedCount ? `跳过 ${value.skippedCount} 项` : "",
      value.role
        ? value.previousRole
          ? `${roles[value.previousRole] || value.previousRole} → ${roles[value.role] || value.role}`
          : `角色 ${roles[value.role] || value.role}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return "";
  }
}
