# 团队协作接口

读取 `GET /api/organizations/{id}` 获得 `currentRole`、`currentUserId`、`teamVersion` 和成员列表。管理员另获待处理邀请（最多 100 条）与最近 50 条操作记录；响应不包含邀请密钥或其摘要。

团队写请求使用 JSON，并携带读取时的 `version: teamVersion`。状态已变化返回 409，重新读取并让操作者确认最新状态后再提交；不要自动覆盖。

| 操作 | 接口 | 额外请求字段 |
| --- | --- | --- |
| 生成邀请 | `POST /api/organizations/{id}/invitations` | `email`, `role`（admin/member/viewer） |
| 更新邀请链接 | `PATCH /api/organizations/{id}/invitations/{invitationId}` | 无；旧链接立即失效 |
| 撤销邀请 | `DELETE /api/organizations/{id}/invitations/{invitationId}` | 无 |
| 调整角色 | `PATCH /api/organizations/{id}/members` | `userId`, `role` |
| 移除成员 | `DELETE /api/organizations/{id}/members` | `userId` |
| 退出组织 | `POST /api/organizations/{id}/leave` | 无；最后一名所有者须先转移所有权 |
| 转移所有权 | `POST /api/organizations/{id}/ownership` | `userId`, `confirmation`（接任者完整邮箱） |

所有者管理非所有者成员；管理员仅管理 member/viewer，不能邀请、提升或移除其他管理员。不能用一般角色更新接口分配 owner，也不能修改自己的角色；退出和转移走专用接口。

邀请生成返回 `data.invitation`（id、email、role、expiresAt）和 `data.token`。前端组合当前站点的 `/join#invite={token}`。密钥不会再次读取，丢失后需重新生成。默认 7 天有效，每组织最多 100 个有效待处理邀请，同一操作者每小时最多生成 50 次。

加入流程使用两个无登录要求的 POST 接口，仍须发送 JSON：

1. `/api/invitations/inspect`：请求 `{ "token": "..." }`。返回 pending/joined/used 状态、组织信息和邀请邮箱；pending 状态包含是否已有账号、当前登录账号是否匹配。
2. `/api/invitations/accept`：已有账号须先登录，请求 `{ "token": "..." }`；新账号请求增加 `name`、`password`。邮箱由邀请确定，账号平台角色固定为 user。成功返回组织 ID、邮箱和是否新建账号，不直接返回登录凭据。

邀请消费、账号创建及成员加入原子提交。重复消费返回 410；错误账号返回 403；邮箱已有账号却未登录返回 409。已有成员不会因接受旧邀请被降权。角色变更、成员移除或退出会撤销该成员发出的待处理邀请。

兼容入口 `POST /api/organizations/{id}/members` 现在等同于生成邀请，也要求版本号，返回邀请而非已创建成员；不能继续用旧的“输入邮箱直接添加”假设。

本地验证：数据库迁移完成后运行 `npm run test:team`。检查仅允许 localhost/127.0.0.1 的开发数据库，创建独立测试组织与账号，并在结束时清理。生产数据库不要用于该命令。
