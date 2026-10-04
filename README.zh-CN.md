# ApiX Docs

[English](README.md) | **简体中文**

面向 API 文档管理、请求调试与团队协作的网页平台。
基于 Next.js、React、TypeScript 和 PostgreSQL 构建。

**[打开 ApiX Docs](https://apixdoc.dogeow.com/)** ·
[快速开始](#快速开始) · [开发文档](#开发文档)

线上工作台需要账号登录。此链接是应用入口，不是匿名试玩沙箱。
账号由管理员创建，或通过团队邀请加入；项目没有公布演示账号或密码。

## 截图

以下为 **2026-09-30** 从线上站点实际截取的未登录页面。
展示范围是公开入口，不是登录后的 API 编辑器或调试工作台。
详见[截图来源说明](docs/screenshots/README.md)。

### 公开首页

![ApiX Docs 公开首页：产品标识和登录入口](docs/screenshots/home-2026-09-30.jpg)

### 登录页

![ApiX Docs 登录页：尚未填写的邮箱和密码输入框](docs/screenshots/login-2026-09-30.jpg)

空白表单中的邮箱文字是界面占位提示，不是演示账号。

## 功能

- **API 文档**：项目与文件夹、Markdown 描述、参数、请求头、请求体、响应示例和 Schema。
- **请求调试**：环境与变量、路径/查询参数、Bearer/Basic/API Key 认证、取消请求、响应统计、可按地址/环境搜索、按方法/结果筛选的会话历史，以及 cURL 导入导出。
- **请求与响应 JSON**：请求体和示例支持校验、编辑；API 返回内容可切换原文、JSON 格式化和结构浏览，复制、下载及导入响应示例保留原始内容。
- **导入导出**：OpenAPI 3.0/3.1 JSON/YAML、Postman Collection 2.1，支持导入预览、保留原始文件和同格式导出。
- **文档分享**：独立文档页、公开/私有访问、版本化发布快照与回滚。
- **团队协作**：组织、邀请、角色权限、文档历史、恢复/回收站和编辑冲突保护。
- **运维基础**：账号管理、审计记录、健康检查、响应式布局和深色模式。

已支持的流程与边界记录在[产品路线图](docs/PRODUCT_ROADMAP.md)中。
高级格式转换、SSO、账号邮件自动发送、计费以及更完整的备份/运维能力仍在迭代；
项目没有宣称所有规划中的商业化能力都已完成。

## 快速开始

### 环境要求

- Node.js **22**，与 [`.nvmrc`](.nvmrc) 一致，以及 npm。
- 为本应用准备一个 PostgreSQL 数据库和数据库用户。
- 请使用独立开发数据库。迁移、初始化和数据库验收命令会修改数据。

### 安装与配置

```bash
git clone https://github.com/react-laravel/apixdoc.git
cd apixdoc
nvm use
npm ci
```

如果不使用 nvm，可通过自己习惯的版本管理器切换到 Node.js 22。
新建本地 `.env` 文件，填入自己的配置：

```dotenv
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/apixdoc?schema=public"
AUTH_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
AUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="REPLACE_WITH_A_UNIQUE_ADMIN_PASSWORD"
```

可以使用以下命令生成 `AUTH_SECRET` 的随机值：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

继续前请替换所有占位值。初始管理员密码至少 **12 个字符**，最多 **72 个 UTF-8 字节**。
不要公开 `.env` 或任何凭据；Git 已忽略环境配置文件。

### 初始化与启动

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

打开 **<http://localhost:3000>**，使用刚配置的管理员账号登录。
初始化脚本仅在符合条件时创建初始管理员，不会重设已有管理员的密码，也不会将已有普通账号自动提升为管理员。
详见[账号管理](docs/ACCOUNTS.md)。

首页代码位于 `src/app/page.tsx`，开发时修改后会自动更新。
项目使用 `next/font` 加载 Geist 字体。

### 检查与生产构建

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run start
```

`npm run start` 启动已构建的生产版本，默认端口为 3000。
其他命令包括 `test:watch`、`test:coverage`、`db:migrate`（开发迁移）和
`db:studio`（查看或编辑数据库）。

浏览器测试需要先运行 `npx playwright install chromium` 安装测试浏览器，
再执行 `npm run test:e2e`。[Playwright 配置](playwright.config.ts)会启动或复用
3000 端口上的本地开发服务；涉及登录和数据库的测试仍需对应的本地配置与数据。

`test:team`、`test:documents`、`test:publications`、`test:audit` 和
`test:accounts` 会验证依赖数据库的流程。运行前请阅读相应文档，使用可清理的本地测试数据。

## 项目结构

```text
src/app/             页面与 API 路由
src/components/      工作台、文档、JSON 和通用界面组件
src/lib/             认证、数据库、请求、权限与数据模型
prisma/              数据库结构、迁移和管理员初始化
scripts/             流程验收与运维脚本
tests/e2e/           Playwright 浏览器测试
docs/                功能、部署和运维文档
```

## 开发文档

部分详细开发文档目前仅提供中文。

- [产品路线图与现有限制](docs/PRODUCT_ROADMAP.md)
- [团队协作与权限](docs/TEAM_COLLABORATION.md)
- [文档历史与冲突处理](docs/DOCUMENT_HISTORY.md)
- [项目发布快照](docs/PROJECT_PUBLICATIONS.md)
- [请求历史、筛选与展示隐私](docs/REQUEST_HISTORY.md)
- [账号管理与恢复](docs/ACCOUNTS.md)
- [审计与运维](docs/AUDIT_AND_OPERATIONS.md)
- [生产部署](docs/DEPLOYMENT.md)
- [截图来源](docs/screenshots/README.md)

## 部署

仓库现有部署使用 GitHub Actions 自托管 runner、Deployer、PostgreSQL、PM2 和 nginx。
**推送到 `main` 会触发生产部署。** 环境变量、数据库迁移、管理员初始化和进程配置，
请以本项目的[部署文档](docs/DEPLOYMENT.md)为准。

仅部署一个空的 Next.js 服务不足以运行完整应用，还需要数据库与认证配置。

## 了解 Next.js

项目最初由 `create-next-app` 初始化。以下是框架学习资料：

- [Next.js 文档](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Next.js GitHub 仓库](https://github.com/vercel/next.js)

顶部语言链接切换的是 README 文档，不会改变应用界面的语言。
