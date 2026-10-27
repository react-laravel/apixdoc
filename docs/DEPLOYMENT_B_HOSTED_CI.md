# ApiXDoc 在 B 的 GitHub 托管构建与受限发布方案

这是新增方案，保留既有部署文档供查阅。候选父版本为 `801d20069e58bab9351094657bb94b13c5da8300`，仓库为 `react-laravel/apixdoc`。本次只准备补丁和验证材料，尚未安装账号、公钥、sudoers 或服务启动检查，尚未设置 GitHub Secrets、提交补丁或运行正式发布。

## 发布结果和范围

GitHub 托管 Ubuntu 24.04 使用 Node 24.16.0、现有 `package-lock.json` 和 `npm ci` 构建。`prisma generate` 只生成客户端，不执行数据库迁移。TypeScript、ESLint、Vitest 和新增部署边界测试通过后，输出 Next standalone 轻包。B 不安装开发依赖、不执行 npm/Prisma CLI/seed/migrate；B 上保持一个正常运行的 ApiXDoc 版本。

只有 `main` 的推送自动发布；手动执行默认 `validate_only=true`，仅构建和离线验证，不上传到 B。手动关闭该开关也必须来自 `main` 才能发布。旧工作流文件原位替换为 GitHub hosted 构建，不再依赖 A 的 runner、Deployer、PM2 或主站通知命令。

## 每次发布如何工作

1. 归档包括 `server.js`、Next 必需运行文件、静态资源、已生成的 Prisma 客户端、动态 pg 驱动、原 npm lock 和迁移 SQL 元数据。构建使用公开占位参数，真实认证和数据库配置继续只保存在 B 的 `/etc/dogeow-tests/apixdoc.env.json`。打包器排除所有 `.env*`、开发源码和调试 source map；验证 Next 内部依赖别名后展开为普通文件，服务器拒绝归档中的软链接、硬链接、设备、目录项和越界路径。
2. 独立 `apixdoc-deploy` 账号只接受 `receive|validate|publish` 与一个完整的 40 位版本号。SSH 公钥使用 `restrict,command="/usr/local/libexec/apixdoc-ssh-gateway"`；账号的 home、`.ssh`、authorized_keys、入口和发布程序全部归 root 所有。公钥不能取得通用 shell、SFTP、PTY 或转发能力。
3. `receive` 串行接收最多一份 96 MiB 压缩包；解包内容不超过 192 MiB，单文件不超过 64 MiB。上传前预留压缩包、最大解包空间及 1 GiB 安全余量；解包时再次校验至少剩余 1 GiB。每个文件需符合清单和 SHA-256。
4. 固定目录内先准备新版本，再原子切换 `releases/current`。外层 `/var/www/apixdoc/current` 由 root 持有并指向 `releases/current`；deploy 只能改变自己的内层版本链接。sudoers 仅允许 `/usr/bin/systemctl restart dogeow-test-apixdoc.service` 这一条完整参数，不授权 daemon-reload、任意 unit、runuser 或任意命令。
5. systemd 的新增 `ExecStartPre` 继承现有应用 UID 974，用原私有数据库配置建立 **READ ONLY** 事务，只查询 `_prisma_migrations`。它比较每个 `migration.sql` 的 SHA-256 和已完成账本，拒绝新增待执行迁移、checksum 改动、未完成或已回滚记录、未知或重复记录。它不执行 SQL 文件，不执行 DDL、seed 或业务写入。
6. 启动后，直接回环端口与 B 本机 HTTPS 都检查九个匿名契约：首页、登录页、providers/session/csrf 200；operations 401；无参数 projects 400；live 与真实 Prisma ready 200。通过 B 本机 TLS 验证域名证书，并逐个请求新版本全部 `_next/static` 和 `public` 文件比较 SHA-256。
7. 只有启动及全部健康检查通过才提交发布状态并删除旧代码，成功后保留一个代码版本。失败则先切回旧代码、重启并验证旧代码；数据库和最新业务数据始终保留。SSH 断开不取消进行中的切换；恢复日志让后续受限命令处理已中断的事务。断电或不可恢复的磁盘故障仍可能需要管理员处理，不能承诺主机故障下零中断。

## 首次安装需要另行批准的精确动作

目前线上 `/var/www/apixdoc/current -> releases/source-39`、独立服务和私有配置保持运行。下列动作 **尚未执行**，应在用户批准 ApiXDoc 这一仓库的新长期发布权限及补丁后，由管理员一次完成：

1. 创建仅属自身主组的系统账号 `apixdoc-deploy`，锁定密码登录。`/var/lib/apixdoc-deploy` 和 `.ssh` 由 root 持有，只有 `state/`、`state/incoming/` 属于 deploy。生成只用于此仓库、此应用的独立 SSH 密钥；私钥仅进入该仓库 `B_APIXDOC_DEPLOY_SSH_KEY`，另设 `B_APIXDOC_DEPLOY_KNOWN_HOSTS` 为已核验的 B 主机公钥行，禁止 `ssh-keyscan` 自动信任或关闭主机验证。
2. 运行只读 `deployment/inspect-apixdoc-boundary.py` 建立代码和私有状态基线。首次旧轻包缺少顶层 `prisma/migrations`，需把当前版本的 **8 个原始 migration.sql 与 migration_lock.toml** 作为只读校验元数据补入 `source-39/prisma/migrations`，逐个比对原 SHA-256；不得执行任何迁移 SQL。首次安装也要确认旧包中的 `pg` 可以由应用 UID 加载。
3. 安装 root 只读入口和发布程序到 `/usr/local/libexec/apixdoc-ssh-gateway`、`/usr/local/libexec/publish-apixdoc`，安装 ledger 检查到 `/usr/local/libexec/apixdoc-ledger.cjs`。内容必须与已审阅补丁一致。检查并安装精确 sudoers；安装 `30-ledger-check.conf` 到该服务专属 drop-in 后由管理员执行一次 daemon-reload。发布账号不取得这些文件或目录的写权限。
4. 只转交 `source-39` 的真实代码目录和普通代码文件以及 `releases/` 给 deploy；代码目录 0755、普通代码文件 0644。遍历时不跟随任何链接，不递归 chown 外部目标，也不转交 hardlink。缓存链接 `.next/cache` 及其他内部依赖链接保留链接本身，不触碰其目标的私有属主。建立 deploy 所有的 `releases/current -> source-39`，原子更新 root 所有的外层 `current -> releases/current`，确保解析后仍是原运行目录。
5. 原私有状态保留：`apixdoc.env.json` 为 root:974/0640；`shared` 为 root:974/0750；`shared/next-cache` 为 974:974/0700。shared 的 0750 是当前缓存遍历修正基线，不为 deploy 加入应用组。代码转交前后逐项比较 ENV 和 shared 树的属主、模式、内容哈希。发布账号直接读取 ENV、遍历缓存、改写 root 入口/服务配置/其他项目代码均须被拒绝。
6. 管理员以应用 UID 974 运行 ledger 检查，重启 **仅本服务**，完成真实 ready200 和匿名契约/静态资源验收，再写入 root 保护的受限 authorized_keys 并设置该仓库 Secrets。核实 B 节点代理、Nginx、SSL 和其他服务没有变动。最后才提交经过审阅的补丁，先跑 validate-only，再以用户批准的首次发布验证端到端流程。

首次安装步骤自身也须保留可回退记录：原外层 current 目标、代码属主清单、原服务配置哈希、私有状态摘要、新增 root 文件清单。安装失败应撤回新公钥入口/drop-in、恢复原 current 与代码属主，只重启本服务，保持业务数据库和私有配置原样。不要把准备阶段当作已安装或已交付。

## 权限含义和数据库变更

发布账号不能直接读取私有 ENV 或缓存；它能更换应用代码，因此这项授权包含把仓库代码作为应用 UID 执行的信任。仓库写权限和部署私钥需要按应用运行权限管理。运行中的应用继续拥有原业务数据库权限，不能把“deploy 账号无直接读权限”理解为任意恶意应用代码也无法读取它正常使用的配置。

自动部署不负责数据库升级。需要增加/修改迁移时，流水线拒绝该候选并保留旧代码；数据库升级必须单独审阅、备份、取得相应授权并验证兼容性。代码回退不会回滚数据库或业务数据。

## 本次验证边界

以逐 blob 核验的 274 个 tracked 文件为父版本，未复制本机未跟踪文件或凭据，未改用户本机仓库。A 的独立源码/依赖副本完成 Prisma 生成、类型、lint、原 448 测试和真实生产构建，轻包再通过普通文件解包校验。占位运行预览验证页面、匿名认证契约和静态资源；未配置真实数据库时 ready 必须为 503。真实数据库 ready200、服务启动检查、SSH 限权和 Secrets 的端到端验证，需在上述授权安装阶段执行，不能由离线检查代替。
