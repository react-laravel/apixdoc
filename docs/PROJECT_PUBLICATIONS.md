# 项目设置与文档发布

## 设置并发保护

项目详情包含 `settingsVersion`。更新项目设置时，使用 `PUT /api/projects/{id}` 并携带 `version: settingsVersion`。环境与全局配置写接口同样要求版本号，并统一返回包含最新设置版本的项目配置。独立配置读取仍保留原有 data 结构，同时返回 settingsVersion 和 X-Settings-Version。

设置内容与版本号使用一致的数据库快照读取。保存以项目事务锁保护：非重叠字段合并，列表整体比较；同字段冲突返回 `PROJECT_SETTINGS_CONFLICT` 和可供对比的数据。客户端确认后按返回的当前版本号提交，不应盲目重试旧请求。内置窗口保留编辑基线和草稿，并在关闭未保存修改时提醒。

设置基线保留最近 20 个版本，仅用于并发合并，不对公开文档暴露。导入环境也更新配置版本，旧表单不能把新导入的环境静默清空。只有 owner/admin 可以改变 isPublic；一般成员未修改的旧访问范围不会覆盖管理员的新设置。

## 工作区与发布快照

- `/docs/{projectId}` 读取当前发布版本。
- `/docs/{projectId}?release={publicationId}` 固定到指定发布版本。
- `/docs/{projectId}?preview=1` 是成员内部的工作区预览，匿名或非成员不可访问。
- `/docs/{projectId}?release={publicationId}&review=1` 是编辑成员的内部发布记录预览，可查看已撤销的版本。

发布时保存经过处理的文档内容，不包含环境、全局配置、来源定义或编辑历史。已识别的结构化认证示例会隐藏；描述与业务示例仍须由作者检查。编辑、删除、导入和修改项目名称不会改变已有快照。内部发布说明不出现在公开文档中。

外部用户读取普通项目/接口 API 或普通导出接口时，也只获得当前发布版本；项目成员的工作区仍使用当前编辑数据。已发布页面的下载与复制链接绑定其显示的版本，避免下载到后续草稿。

访问权限不冻结：项目改为仅团队可见后，所有版本都要求成员权限。撤销某个版本会使该版本公开链接失效；停止所有版本分享会撤销全部公开链接，之后发布新版本也不会使旧链接复活。编辑成员仍可在内部查看或下载撤销记录。

旧项目在升级后首次读取文档或修改内容前，会保留当时的文档作为升级基线。公开和团队私有链接都保留原访问范围；新建项目须显式发布，不能靠更改 isPublic 自动发布草稿。

## 发布管理接口

`GET /api/projects/{id}/publications` 对编辑成员开放，返回当前发布状态、工作区指纹、访问范围、版本记录和最近操作。记录每页 20 项，使用 next 作为 before 参数继续读取。工作区预览错误不会阻止管理已有发布版本。

`POST /api/projects/{id}/publications` 仅允许 owner/admin。请求携带发布状态的 version，以及以下 action：

| action | 额外字段 | 行为 |
| --- | --- | --- |
| publish | fingerprint、title、可选 note | 发布当前已保存文档，创建新记录 |
| activate | publicationId | 将未撤销的历史版本设为当前，草稿不变 |
| revoke | publicationId | 撤销该版本的公开链接；当前版本被撤销时暂停入口 |
| withdraw | confirmation（当前项目名称） | 撤销所有版本并停止分享 |

发布前再次验证工作区内容和访问范围。预览后发生变化返回 409，操作者需要重新检查；发布状态变化也返回 409。每个快照最大 32 MB，版本名最多 80 字，内部说明最多 2000 字。

`GET /api/projects/{id}/publications/{publicationId}/export?format=openapi|postman&syntax=json|yaml` 导出固定快照（Postman 仅 JSON）。正常访问检查当前权限及撤销状态；增加 internal=1 时仅编辑成员可以下载内部记录，不能通过此参数绕过成员验证。发布快照和操作记录随项目删除一起清理。

本地验证：`npm run test:publications` 在 localhost/127.0.0.1 开发数据库创建、验证并清理独立数据，覆盖冻结内容、访问范围、固定链接、撤销、升级基线、设置合并及导入环境。
