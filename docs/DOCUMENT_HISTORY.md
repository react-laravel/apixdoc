# 接口版本、冲突与回收站

## 保存协议

`GET /api/endpoints/{id}` 和项目详情返回接口的 `version`。所有内容修改和删除须携带读取时的版本号；未提供有效版本号返回 428。每个仍有草稿的分区保留自己的起始版本，不要因为另一个分区保存成功就直接更新其起始版本。

| 操作 | 请求 | 内容字段 |
| --- | --- | --- |
| 基本信息 | `PUT /api/endpoints/{id}` | `version`、name/method/path/description，可选 folderId/order |
| 请求参数 | `POST /api/endpoints/{id}/params` | `version`、`parameters` 列表；也接受 params |
| 请求头 | `POST /api/endpoints/{id}/headers` | `version`、`headers` 列表 |
| 请求体 | `POST /api/endpoints/{id}/body` | `version`、`requestBody` 对象或 null；也接受原有扁平请求体字段 |
| 响应 | `POST /api/endpoints/{id}/responses` | `version`、`responses` 列表 |
| 删除 | `DELETE /api/endpoints/{id}` | `version`；移入回收站 |

内容保存统一返回完整接口及其新版本，包括关联参数、请求头、请求体和响应。`saveMerged` 表示保存时已合并其他修改，`projectLayoutVersion` 用于更新目录的版本。子资源接口不再只返回数组或请求体对象，旧调用方需要调整。

互不冲突的字段修改自动合并。数组保持整体比较，不按不稳定的行位置猜测合并。请求体选中媒体类型的结构与示例可以分别合并，同时维护完整媒体内容。重复保存相同内容不会产生新版本。

同一字段被同时修改时返回 409 和 `code: DOCUMENT_CONFLICT`。data 包含当前版本、冲突路径、编辑前/本次/当前内容以及 proposed 合并候选。客户端需让用户确认后，以返回的当前版本号提交新请求，不能自动重试旧内容。内置编辑器会处理 `bodyExpanded` 媒体缓存并重建可保存的数据；外部客户端也可以重新读取当前接口，人工构造对应分区的请求。基线已超出保留范围时不进行猜测合并。

结构、示例和媒体缓存以字符串保存，保留 JSON 的原始数值精度；请求中的 schema/example JSON 对象也会从原始文本捕获。单接口快照最多 8 MB，参数/请求头/响应列表各最多 2000 项。

## 历史与恢复

历史只允许项目编辑成员访问，不对只读成员或匿名用户开放；因为过去版本可能包含内部请求示例和凭据。

- `GET /api/endpoints/{id}/history`：每页 20 项，使用响应 next 作为 `?before={version}` 继续读取。
- `GET /api/endpoints/{id}/history/{revisionId}`：选中快照、当前快照、当前版本及删除状态。
- `GET /api/endpoints/{id}/history/{revisionId}/export`：仅导出选中接口的该版本，保留其导入来源中的相关规范内容；原生接口默认导出 OpenAPI JSON，Postman 来源导出集合 JSON。
- `POST /api/endpoints/{id}/restore`：提供当前 `version` 和选中的 `revisionId`，创建新的恢复版本。接口已删除时可以省略 revisionId，恢复删除前内容。
- 恢复时可提供新的 path。相同方法/路径已有活动接口时返回 `RESTORE_PATH_CONFLICT`，不会覆盖已有接口。

最近 50 个版本保留创建/保存/移动/删除/恢复动作、操作者和时间。旧接口首次修改时先记录基线；没有宣称能追溯功能启用前的每次修改。恢复不会抹掉已有历史，原目录缺失时返回根目录并附带 restoreNotice。

`GET /api/projects/{id}/recycle-bin` 返回已删除接口，支持 q 搜索和 cursor 分页，每页 50 项。正常项目列表、公开文档和导出均排除回收站内容。导入替换也会归档旧接口和原始规范，恢复时检查规范定义兼容性；恢复一个接口不会自动恢复同文件中的其他接口。

## 目录与范围

项目的 `layoutVersion` 独立于接口内容版本。目录修改、删除和批量排序携带 `version: layoutVersion`；创建新目录/接口不需要覆盖旧状态。修改目录后重新读取项目，更新目录位置及受影响接口版本。排序只接受目录 id/order/parentId 与接口 id/order/folderId，不能改变项目归属。

项目事务锁保证目录/接口变更及其历史记录一起提交，拒绝目录循环和跨项目引用。项目和组织本身的删除仍不可通过此回收站恢复；项目设置与公开发布快照不属于本轮接口历史范围。

本地回归：`npm run test:documents` 使用已迁移的 localhost/127.0.0.1 开发数据库，创建并清理独立数据，验证合并、权限、冲突、恢复、规范兼容性、目录隔离、保留上限和精确数值。
