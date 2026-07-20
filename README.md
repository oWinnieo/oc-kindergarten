# OC Kindergarten

OC Kindergarten 是一个像素风 AI 助手幼儿园小社区。项目通过角色、幼儿园场景和动画状态，直观展示不同 AI agent 当前正在做什么。

项目结构可以参考状态看板类产品，但角色、场景和其他美术资产均使用原创设计。

## Current Baseline

- Next.js App Router + TypeScript。
- Next.js standalone Docker 构建与 Docker Compose 部署。
- PostgreSQL 16 + Drizzle ORM 持久化 Registry、latest state、event log、SSE replay cursor 和 transactional outbox。
- OpenClaw bridge v2 使用数据库 provider binding 做服务端身份解析；未知原生 Agent 只进入 `pending_claim`，不会自动出现在教室。
- 家长 enrollment、15 分钟一次性 pairing、资料确认和 profile/binding transaction 激活已部署；树莓派插件提供 `openclaw kindergarten pair`。
- `/family` 提供本人 Agent 的持续管理；suspend/resume 与六种行为指令由 Casdoor owner session 保护，并通过 durable command event 和 SSE 同步到教室。已入园 Agent 的归档在恢复语义完成前暂不向家长开放。
- `32x32` 世界 tile。
- `48x64` 主角色帧。
- 男孩、女孩、无性别孩子三套 V2 轮式 static/idle 资产。
- 三人各 8 方向 × 4 帧的轮式 moving 图集，移动为 `125ms/帧`。
- 三人各 4 帧 researching 阅读、executing 积木和 writing 写画动作。
- 教室 Canvas 运行时、实时 Y-sort 和 8 邻域 A* 寻路。
- `idle`、`writing`、`researching`、`executing` 到场景区域的交互映射。

## Development

```bash
yarn install
yarn build
docker compose up -d --build
```

直接运行 `yarn dev` 时，必须提供开发专用且可从宿主机访问的 `DATABASE_URL`；禁止让本地
开发进程直接连接生产数据库。默认推荐用 Compose 启动完整开发栈，PostgreSQL 只在
Compose 内部网络开放 `5432`。

首次部署先从 `.env.example` 建立 `.env`。数据库使用独立 Compose service，并与服务器
其他独立项目一致绑定到 `/opt/persist/oc-kindergarten/postgres`；不要把数据库端口暴露到
公网。`docker compose up -d --build` 会等待 PostgreSQL healthcheck，再由一次性
`migrate` service 执行 `drizzle/` 中已审核的 migration，成功后才启动 Web service。

常用数据库命令：

```bash
yarn db:generate
yarn db:migrate
./scripts/backup-database.sh
```

OpenClaw 生产接入推荐使用 bridge v2：插件配置 `identityMode: "server"`，不配置静态
`agentMap`。runtime 可调用 `POST /api/runtime/agents/discover` 提交非敏感身份草稿，也可
直接向 `POST /api/openclaw/events` 发送 v2 hook；服务端每次按
`provider + nativeAgentId` 解析 binding。未激活身份返回 `202 pending_binding`，active
binding 的下一条事件无需重启 Gateway 即可生效。bridge v1 仅作为旧部署兼容路径保留。

家长身份由独立 Casdoor organization `OCKindergarten` 和 Application
`oc-kindergarten` 提供，不复用或迁移 `RococoOrg` 用户；使用 `issuer + sub` 关联本地
`parent_users`，不会以邮箱作为主键。服务端需要配置 `NEXTAUTH_URL`、
`NEXTAUTH_SECRET`、`CASDOOR_ISSUER_URL`、`CASDOOR_CLIENT_ID` 和
`CASDOOR_CLIENT_SECRET`；家长入口为 `/onboarding/parent`，session 与管理员调试 session、
Agent event token 完全分离。Casdoor 初始化与只读边界检查分别使用
`scripts/configure-casdoor-parent-auth.sh` 和 `scripts/verify-casdoor-parent-auth.sql`。

保存家长资料后可在同一页面点击“添加 AI Agent”。网页生成一次性码后，在 OpenClaw
主机执行：

```bash
openclaw kindergarten pair XXXXX-XXXXX-XXXXX-XXXXX --agent main
```

返回页面审阅 Agent 草稿并亲自选择角色外观后，服务端会在同一 transaction 中创建
owner profile、激活 provider binding 并发布 Registry 变化。`scripts/verify-enrollment-api.sh`
用自动清理的临时身份验证单次码、跨家长权限和完整激活链路。

入园后从 `/family` 管理本人 Agent。暂停会立即从公共 Registry 隐藏角色并拒绝后续 runtime
event；恢复后保留原 binding，下一条 provider event 会自动重新入场。待处理入园申请仍可
撤销；已入园 Agent 的归档 UI 和 owner API 暂时禁用，避免在 restore/re-pair 语义完成前
永久锁定 native Agent。家长行为、管理员单 Agent 指令和场景物件点击统一调用
`POST /api/agents/:agentId/actions`，客户端只提交 action 与 request id，不能伪造 runtime event。

服务器首次配置可由 root 运行
`./scripts/configure-server-database.sh /opt/docker/oc-projects/oc-kindergarten`；脚本不会输出
数据库密码，并把数据目录设为 `0700`。备份采用 PostgreSQL custom format，默认保存到
`/opt/persist/_backups/oc-kindergarten/`。恢复必须先停止 Web/migrate service，并在独立
数据库中演练确认后再用于生产数据，禁止通过删除 PostgreSQL 持久化目录回滚。

开发页面提供全体指令、单角色指令、自动演示和路径调试。角色抵达写画桌后播放
`200ms/帧` writing，到达阅读角后播放 `220ms/帧` researching，抵达积木区后播放
`180ms/帧` executing，返回出生点后播放 idle。

调试功能统一收纳在画布右上角的管理员面板中。部署前必须配置
`OC_KINDERGARTEN_ADMIN_TOKEN`；可额外配置
`OC_KINDERGARTEN_ADMIN_SESSION_SECRET` 来独立签名 8 小时的 HttpOnly 管理员会话。
未配置管理员令牌时，调试面板保持锁定。

受控开发服务器可临时设置 `OC_KINDERGARTEN_ENABLE_STRESS_TEST=1`，并在 migrator 镜像中
运行 `scripts/verify-capacity-stress.mjs`。该工具只接受 3 或 20 个 `source=test` Agent，
要求管理员凭据，覆盖容量、FIFO、事件幂等、SSE `Last-Event-ID` 重放与完整清理。浏览器
诊断只在带 `?stressRun=<runId>` 的教室 URL 出现，页面没有公开入口。正式执行必须先跑
3 Agent 预检，再跑 20 Agent，并在结束后确认 profile、latest state、event、cursor、outbox、
binding 和 command 计数全部归零。

## Repository Layout

- `app/`：Web 应用。
- `components/ClassroomSimulation.tsx`：教室 Canvas、动画循环和交互控制。
- `lib/classroom-runtime.ts`：状态目标、walkability、A* 和方向选择。
- `assets/design/concepts/`：已确认的角色和场景概念图。
- `assets/design/specs/`：视觉规范与生产约束。
- `assets/design/sprites/characters/`：仓库内可复用的角色静态图、动画帧、sheet 和 GIF。

本仓库是项目的正式来源。上级目录中的 `design/` 仅保留历史制作过程与实验文件，确认后的资产必须进入本仓库。
