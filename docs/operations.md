# OC Kindergarten Operations

## Scoped OpenClaw credential rollout

内测插件从 `v0.5.0-beta.1` 起不再接收服务器全局 Agent event token。每次成功使用一次性
配对码时，服务端为对应 `provider + nativeAgentId` binding 签发一个
`ockg_rt_...` scoped credential；数据库只保存带 domain separation 的 SHA-256 hash。再次为
同一 binding 配对会撤销旧 credential 并签发新值。

本次发布包含 migration `drizzle/0007_medical_mockingbird.sql`，新增
`runtime_credentials` 表。部署前必须备份数据库、mode `0600` 的 `.env`，并记录当前
Web/migrator image tag 和 Git commit：

```bash
./scripts/backup-database.sh
docker compose build oc-kindergarten migrate
docker compose run --rm migrate
docker compose up -d --no-build --no-deps --force-recreate oc-kindergarten
./scripts/verify-enrollment-api.sh
```

反向代理必须覆盖客户端提交的 `X-Real-IP`；若只提供 `X-Forwarded-For`，必须覆盖而不是追加
不可信输入，并禁止绕过代理直接访问 Web 容器。应用优先使用 `X-Real-IP`，配对接口以代理提供的
客户端地址执行五分钟窗口限流。不得在日志、命令回显、截图、工单或数据库中记录明文
`ockg_rt_...` 值。

自动验收除原有 enrollment、profile、activity、archive/restore 和 Registry SSE 链路外，还
必须确认：

- 配对响应只返回一次 `Bearer` credential，格式为 `ockg_rt_` 加 43 个 URL-safe 字符；
- 数据库保存的只有 token hash，明文 token 不得与 `runtime_credentials.token_hash` 相同；
- 配对码不可重复使用；同一 scoped credential 不能访问其他 native Agent；
- `/api/runtime/agents/discover` 和 bridge v2 `/api/openclaw/events` 接受匹配 identity 的
  scoped credential，旧的全局 token 仅保留给 legacy/internal producer；
- binding 归档为 `revoked` 后 scoped credential 在认证层返回 `401`；原 owner 恢复后 binding
  回到 active，credential 可重新认证，但 enrollment 在显式 resume 前仍保持 suspended；
- 验收退出后 verification parent、enrollment、profile、binding、runtime credential、event、
  cursor、latest state、outbox 和 command 全部清理。

自动化通过后，使用可丢弃的真实 Casdoor 主人和专用 OpenClaw Agent 做一次 beta 验收：

1. 在 `/onboarding/parent` 新建入园申请并生成一次性配对码；
2. 在 OpenClaw 主机安装页面指定的固定 beta tag，执行
   `openclaw kindergarten pair <一次性码> --agent <agent-id>`；
3. 回到网页确认草稿、选择角色与外观并激活，随后触发一条真实 OpenClaw 消息或任务；
4. 确认教室出现该 Agent，家庭活动时间线显示安全摘要，服务器没有输出明文 credential；
5. 再次使用原配对码必须失败；用该 credential 冒充另一 native Agent 必须返回 `401`；
6. 归档后真实 OpenClaw event 必须返回 `401` 且教室角色消失；restore 后先保持 suspended，
   显式 resume 后下一条真实 event 才重新入场；
7. 删除专用 OpenClaw Agent／测试配置，并确认数据库与 pending outbox 没有 verification 残留。

`v0.5.0-beta.2` 的插件配置只有一个 `token` 字段；同一 Gateway 再次配对会覆盖前一个 Agent 的
scoped credential，因此该版本每个 Gateway 只允许配对一个 scoped Agent。`v0.5.0-beta.3`
改为按 `openclaw:<nativeAgentId>` 保存多份 credential，已通过生产双 Agent、重启、轮换、
撤销和删除隔离验收。legacy/internal 全局 token 仍只用于内部兼容，不得分发给外部内测用户。

回滚应用时保留 `runtime_credentials` 表，不恢复或删除 PostgreSQL volume。旧应用会忽略新增表，
但不支持 beta scoped credential；回滚期间应暂停 beta 配对和事件接入，不得把全局 Agent event
token 分发给内测用户。恢复本版本后既有未撤销 credential 可继续使用。

### Acceptance record: 2026-07-23 (beta.3 multi-Agent passed)

- 插件固定标签 `v0.5.0-beta.3` 指向 `8de9bd06e96327859e8a2d830b2147a75948fc02`；
  本机与 `pi-home` Node.js `22.22.3` 均通过 7 项插件测试，覆盖双 Agent 配对顺序、重启持久化、
  单 Agent 轮换、未映射 scoped token 禁止 fallback、legacy/global 隔离和单 Agent 删除；
- `pi-home` 升级前备份为
  `/home/winnie/backups/openclaw-upgrades/openclaw-pre-beta3-20260723T135529Z.tgz`，
  mode `0600`，SHA-256 为
  `bda52e91d21ad44ff2b90223c5c11d86b08c1158211906c3cd2e69e38eec980d`；
  插件通过公开 HTTPS Git fixed tag 安装，OpenClaw 仍为 `2026.7.1-2`；
- disposable Agent `kg-beta3-a-20260723` 与 `kg-beta3-b-20260723` 在同一 Gateway 配对后，
  配置中存在两个不同且格式正确的 credential。Gateway 重启后两者真实 OpenClaw turn 均成功，
  生产数据库分别记录 `agent.presence`、`agent.state`、`agent.message`，最终均为 `idle` 且
  回复气泡事件各 1 条；
- 归档 A 后，A 的事件数保持 7 且 credential `last_used_at` 不变；B 的事件数从 6 增到 9
  并保持 `idle`。restore 到 suspended、显式 resume 后，A 的事件数增到 11 且重新回到
  `idle`，证明 archive/revoke 与恢复隔离通过；
- `kg-beta3-rotate-20260723` 完成两次配对。pi-home 哈希比较确认 A/B credential 未变化、
  目标 credential 已变化；生产数据库确认目标 binding 恰好保留 1 个 revoked 旧 credential
  和 1 个 active 新 credential；
- `kindergarten unpair --agent kg-beta3-a-20260723` 后，B 与轮换 Agent 的配置键仍存在；
  删除本地 A 后 B 仍在 OpenClaw Agent 列表。验收退出后已删除三个 disposable Agent、
  workspace、session、credential 配置和生产 enrollment/profile/binding/credential/event/
  cursor/latest-state/outbox 数据；`kg-beta3-*` binding/enrollment 与 runtime credential 均为 0，
  pending outbox 为 0；
- 最终 `pi-home` Gateway PID 为 `376545`，RPC 正常，验收 credential 键为空，旧
  legacy/internal 全局 token 保留，`main` 与 `encourager` discovery 均返回 `200`。结论为
  “beta.3 多 Agent Gateway 灰度通过”，beta.2 的单 scoped Agent 限制解除；
- 验收发现 OpenClaw CLI 的 config mutation 只记录 restart intent，独立运行的 Gateway
  不会在每次 `pair` 后自动重启。onboarding 的配对命令因此显式追加
  `openclaw gateway restart`；beta.4 继续收敛 reload 操作体验。

### Acceptance record: 2026-07-23 (conditional beta)

- 生产应用部署到 `b5fd442`，Web image digest 为
  `sha256:511476abf1088b868fdd79bc02bc06408b4159bbe0518ee5fc4f1baa6b1e9408`；
  migration `0007` 已存在且无需重跑。发布回滚点为 `20260723T082318Z`，PostgreSQL dump 位于
  `/opt/persist/_backups/oc-kindergarten/oc-kindergarten-20260723T082318Z.dump`，`.env` 备份与
  rollback image 使用同一时间戳，备份文件均为 mode `0600`；
- 生产 `scripts/verify-enrollment-api.sh` 全量通过，包括 scoped identity 隔离、一次性配对码、
  archive `401`、restore 后 credential 重新认证，以及 verification 数据完整清理。根页面与
  Registry API 均返回 `200`，Web/PostgreSQL restart count 均为 0；
- `pi-home` 从 OpenClaw `2026.3.13` 升级到 `2026.7.1-2`、Node.js 升级到 `22.22.3`，安装
  `oc-kindergarten-bridge@0.5.0-beta.2`。升级前私有备份为
  `/home/winnie/backups/openclaw-upgrades/openclaw-pre-20260723T083545Z.tgz`，SHA-256 为
  `9beac9021eea0a8ad8fc601658db5860cf8e4733eba7db65bda015a4c5f9ed1b`；
- 使用专用 Agent `kg-beta-acceptance-20260723` 完成真实配对、主人确认、入园和 OpenClaw 任务。
  家庭时间线显示 1 次“进入教室”和 3 次“开始交流活动”；归档后的插件请求返回 `401`，restore
  到 suspended 后 scoped discovery 返回 `202`，resume 后返回 `200`；
- 验收退出后已删除专用 OpenClaw Agent、workspace、临时插件／配置目录，以及 enrollment、
  profile、binding、runtime credential、event、cursor 和 outbox。数据库回到
  `1 parent / 3 enrollments / 6 bindings / 0 runtime credentials / 0 pending outbox`；
- 此次结论为“服务端 scoped credential 链路通过，beta.2 多 Agent Gateway 灰度不通过”。
  `pi-home` 已恢复旧全局 token 以维持现有 `main`／`encourager`，main discovery 返回 `200`；
  Gateway RPC 正常、restart count 为 0。下一版插件必须改为按 binding/Agent 存储 credential，
  再重复多 Agent 配对、重启持久化、轮换和撤销验收。

## OpenClaw completion hook and transient-state recovery

OpenClaw `2026.7.1-2` 会阻止未明确授权的第三方 `agent_end` hook。幼儿园插件依赖这个 hook
发送 `idle/error` 完成状态；回复气泡还需要显式允许发送清洗后的最终 assistant 摘要。安装或升级
插件时必须配置：

```bash
openclaw config set 'plugins.entries["oc-kindergarten-bridge"].hooks.allowConversationAccess' true --strict-json
openclaw config set 'plugins.entries["oc-kindergarten-bridge"].config.shareAssistantMessages' true --strict-json
openclaw gateway restart
```

`shareAssistantMessages` 只发送插件清洗并截断到 280 字的最终回复预览，不发送 prompt、完整会话、
工具参数或 session 标识。若业务不允许回复预览，可以关闭该项，但 `allowConversationAccess` 仍是
插件接收 `agent_end` 并让任务状态收敛所必需的。

Web 客户端对 `writing/researching/executing/syncing` 增加 30 分钟视觉存活上限：超过上限且没有
更新事件时只在客户端回到 `idle`，避免 Gateway 中断或插件 hook 缺失让角色永久停在功能区。
这个兜底不改写数据库事件、不伪造回复气泡，也不自动清除 `error`；真实的后续 runtime event
仍然具有更高优先级。

验收必须覆盖：

- Gateway 启动日志没有 `agent_end blocked`，RPC probe 正常且 restart count 不增长；
- 真实 OpenClaw 任务按 `syncing -> idle` 写入事件，最终回复产生 outgoing `agent.message`；
- 已打开的教室在 12 秒展示窗口内显示对应角色回复气泡；
- 过期的 transient state 在页面初次 snapshot、SSE replay 和已打开页面的定时器中均回到 idle，
  新事件到来时旧定时器不得覆盖新状态。

### Acceptance record: 2026-07-23

- 根因为 OpenClaw `2026.7.1-2` 阻止缺少显式授权的 `agent_end`。Bonnie 在生产数据库连续留下
  `message_received` 与 `before_agent_run` 的 `syncing`，Telegram 已回复但没有后续 `idle` 或
  outgoing message；Gateway 日志同时记录 `agent_end blocked`；
- `pi-home` 配置备份为
  `/home/winnie/backups/openclaw-upgrades/openclaw-pre-bonnie-hook-fix-20260723T125831Z.json`，
  mode `0600`。启用 `allowConversationAccess` 与 `shareAssistantMessages` 并重启后，Gateway
  RPC 正常、restart count 为 0，修复后的日志没有 blocked hook 或 bridge delivery failure；
- 实现提交为 `32b3a3d`，生产 Web image 为
  `sha256:9bc37a976df18e7b26ea087637b660f9edb66e6b6c7a4123c95606987b0da96f`，回滚 image tag 为
  `oc-kindergarten:rollback-20260723T130525Z`；
- 三次真实 `encourager` 验收任务均产生 `syncing -> idle` 和清洗后的 outgoing message。
  已打开的生产教室实际显示 Bonnie 气泡“气泡显示正常。”与“Bonnie 已正常待机。”，随后角色回到
  idle 区；浏览器 console 没有 warning/error；
- `yarn verify` 与生产 `scripts/verify-enrollment-api.sh` 全量通过。Web/PostgreSQL 均 running、
  restart count 为 0，根页面与 Registry API 返回 `200`，runtime credential 与 pending outbox
  均为 0。

## Family activity timeline rollout

家庭活动时间线复用现有 `agent_event_log` 和 `agent_event_log_agent_created_idx`，不新增数据库
migration。部署前仍要备份数据库和 mode `0600` 的 `.env`，并保留当前 Web 镜像；只需重建 Web：

```bash
./scripts/backup-database.sh
docker compose build oc-kindergarten
docker compose up -d --no-build --no-deps --force-recreate oc-kindergarten
./scripts/verify-enrollment-api.sh
```

`GET /api/enrollments/:enrollmentId/activity` 必须保持以下边界：

- 未登录返回 `401`；缺失 enrollment、无 profile 和跨家庭访问统一返回 `404`；
- `limit` 默认为 20，范围为 1–50；`cursor` 是上一页最后一项的正整数日志 ID，使用
  `id < cursor` 倒序读取，非法参数返回 `400`；
- active、suspended 和 archived 均允许原 owner 只读查看历史；归档期间不接受新 runtime event；
- 响应只包含 cursor、kind、tone、中文 title/detail 和 observedAt，不得返回原始 payload、source、
  metadata、prompt、tool、request id、session 或错误详情；
- `scripts/verify-enrollment-api.sh` 必须通过 owner 指令摘要、跨家庭隔离、两页游标无重复、归档后
  历史保留和临时数据完整清理。

浏览器验收需在 `/family` 展开 active 与 archived Agent 的“最近活动”，确认空状态、五条首屏、
“查看更多”、中文时间和移动端布局；给 active Agent 发送行为指令后，已打开的时间线应刷新并显示
对应指令。验收不要为了制造数据修改需要保留的真实 Agent，可使用自动清理的 verification 身份。

回滚只切回部署前 Web 镜像；不要恢复数据库 volume，也不要删除 `agent_event_log`。旧应用会忽略
新增 API 和界面，之后重新部署新应用即可继续读取原历史。

### Acceptance record: 2026-07-22

- Family activity timeline implementation commit: `84af036`；发布前生产提交为 `521ddeb`，服务器
  以 fast-forward 更新。此次复用现有事件表和索引，没有运行数据库 migration；
- 发布回滚点为 `20260722T092206Z`。PostgreSQL custom-format dump 位于
  `/opt/persist/_backups/oc-kindergarten/oc-kindergarten-20260722T092206Z.dump`，mode `0600`，
  已通过 `pg_restore --list` 校验；`.env` 备份为
  `/opt/persist/_backups/oc-kindergarten/.env-20260722T092206Z`；旧 Web 镜像保留为
  `oc-kindergarten:rollback-20260722T092206Z`；
- 本地 `yarn verify` 与 production build 全部通过，构建产物包含
  `/api/enrollments/[enrollmentId]/activity`；服务器 Compose build、Web recreate 和根页面 `200`
  通过。新 Web 镜像为 `sha256:a3d294f1861c47c8293a3169c86a727064600577d52ba629f5034b9f952d07d0`，
  容器 restart count 为 0，PostgreSQL 保持 healthy；
- 扩展后的 `scripts/verify-enrollment-api.sh` 在生产通过 owner-only 权限、未登录/非法游标、跨家庭
  隔离、安全中文摘要、原始 payload/source/metadata 隐藏、两页游标无重复、归档后历史保留，
  并继续通过 profile revision、transactional outbox、双 Registry SSE、Casdoor 回调和原有
  enrollment/action/archive/restore 全链路；
- in-app browser 使用现有主人登录态只读验收生产 `/family`：active Agent 空状态正确；已归档 Agent
  首屏显示五条安全中文活动，`查看更多` 追加到六条且无重复；390×844 视口下卡片为单列、时间移到
  内容列、页面宽度为 390px 且无横向溢出。浏览器控制台无 warning/error，验收没有发送指令、恢复
  归档或修改任何真实 Agent；
- 部署后公开 Registry 仍只有龙宝、Bonnie、小花、小探和小光五条原有 profile，全部保持
  `appearancePreset: classic`；验收清理后 verification parent、verification binding 和未发布
  outbox 均为 0，应用日志只有正常启动信息。

## Appearance preset rollout

外观预设新增 `agent_profiles.appearance_preset`，migration
`drizzle/0006_useful_rattler.sql` 以非空默认值 `classic` 回填旧记录。部署前必须备份数据库和
`.env`，并保留当前 Web/migrator 镜像；先运行 migrator，再替换 Web：

```bash
./scripts/backup-database.sh
docker compose build oc-kindergarten migrate
docker compose run --rm migrate
docker compose up -d --no-build --no-deps --force-recreate oc-kindergarten
./scripts/verify-enrollment-api.sh
```

后续增加预设只扩展既有文本契约与审核后的 sprite 资源，不需要新增数据库 migration。自动验收除
原有 profile revision、outbox 和双 SSE 覆盖外，还要确认：旧激活请求不提交
`appearancePreset` 时返回 `classic`；active 修改为 `berry` 后 profile、enrollment draft、
provider discovery draft、Registry snapshot、outbox 与两个 SSE 连接字段一致；suspended 修改为
`meadow` 不公开发布，resume 后才重新出现。浏览器验收需分别选择三种角色造型，在
`classic`、`meadow` 与 `berry` 间切换，确认预览与教室中的待机、移动、reading、writing、
executing、syncing、error 动画始终保持同一配色。

回滚应用时不要删除 `appearance_preset` 列，也不要恢复数据库 volume；旧应用会忽略该列。
重新部署新应用后已保存的预设继续生效。

### Acceptance record: 2026-07-22

- Appearance implementation commit: `0a8b923`；发布前服务器为 `fd72581`，生产仓库以 fast-forward
  更新；PostgreSQL、mode `0600` 的 `.env` 与旧 Web/migrator 镜像回滚点为
  `20260722T081243Z`；
- PostgreSQL custom-format dump 为
  `/opt/persist/_backups/oc-kindergarten/oc-kindergarten-20260722T081243Z.dump`，已通过
  `pg_restore --list` 校验；旧 Web/migrator 镜像分别保留为对应
  `rollback-20260722T081243Z` tag；
- 本地 `yarn verify`、Meadow 231 项 runtime approval lock 与 production build 通过；服务器
  Compose build、migration `0006_useful_rattler.sql` 与 Web recreate 通过，6 条旧 profile 全部
  回填为 `classic`，Web 根页面返回 `200` 且容器 restart count 为 0；
- `/api/agents` 在迁移和重建前后均保留龙宝、Bonnie 与三个 system Agent；更新后的接口为五条
  公开 profile 返回 `appearancePreset: classic`；
- `scripts/verify-enrollment-api.sh` 通过 `classic` fallback、active 更新为 `meadow`、suspended
  更新回 `classic`、profile revision、draft/discovery 同步、transactional outbox、双 Registry
  SSE、suspended 隐藏、resume 最新资料发布、跨家庭/归档保护、Casdoor 直跳与 `/family`
  callback，以及原有 enrollment/action/archive/restore 全链路；
- 验收退出后 verification parent、verification binding 与 pending outbox 均为 0；应用部署后日志
  只有正常启动信息，PostgreSQL 保持 healthy；
- in-app browser 使用现有主人登录态加载生产 `/family`，实际切换但未保存草地青绿的女孩和男孩
  预览；四张预览图片均为 48×64 且加载完成，男孩紫罗兰帽显示正确；点击“取消”后龙宝仍为
  “女孩角色 · 经典阳光”。生产教室画布显示原有五个 Agent，页面控制台无 warning/error。
  未修改任何真实 Agent 资料；教室内的 `meadow` 实时传播由上述 API/SSE 自动验收覆盖。

### Berry acceptance record: 2026-07-22

- Berry 资产审批提交为 `cee7628`，应用接入提交为 `f5ebe75`；发布前生产仓库为 `b95c6c6`，
  以 fast-forward 更新到 `f5ebe75`；本次扩展沿用既有文本列，没有新增 migration 或 schema 变更；
- PostgreSQL custom-format dump 为
  `/opt/persist/_backups/oc-kindergarten/oc-kindergarten-20260722T135058Z.dump`，已用 PostgreSQL 16
  `pg_restore --list` 校验；mode `0600` 的环境备份为
  `/opt/persist/_backups/oc-kindergarten/.env-20260722T135039Z`，旧 Web 镜像保留为
  `oc-kindergarten:rollback-20260722T135039Z`；
- 本地 `yarn verify` 通过类型、完整 runtime 回归、Meadow/Berry 两份 231 文件 approval lock 与
  production build；服务器 Compose build 和仅 Web force-recreate 通过，Web/PostgreSQL restart
  count 均为 0，PostgreSQL 保持 healthy；
- 扩展后的 `scripts/verify-enrollment-api.sh` 通过 `classic` fallback、active 更新为 `berry`、
  suspended 更新为 `meadow`、profile revision、enrollment/provider draft 同步、transactional
  outbox、双 Registry SSE、暂停隐藏与恢复发布，以及跨家庭、归档、Casdoor 和活动时间线原有链路；
- 验收清理后 verification parent、binding、Agent 和 pending outbox 均为 0；公开 Registry 仍只有
  龙宝、Bonnie、小花、小探和小光五条原有 profile，全部保持 `appearancePreset: classic`；
- in-app browser 在生产 `/family` 中无保存地选择男孩、女孩和无性别角色的“莓果珊瑚”，三张
  Berry 预览均完成加载且原始尺寸为 48×64；男孩莓色帽冠与经典黄色帽檐正确。点击“取消”后龙宝
  仍为“女孩角色 · 经典阳光”，生产教室画布和五个原有 Agent 正常，页面无横向溢出，控制台无
  warning/error，未修改任何真实 Agent 资料。

## Agent profile and direct sign-in rollout

Agent 资料编辑、教室指令提示和 Casdoor 直接登录不新增数据库 migration。部署前仍必须先创建
PostgreSQL custom-format 备份、备份 mode `0600` 的 `.env`，并记录当前 Web/migrator image
tag 和 Git commit：

```bash
./scripts/backup-database.sh
docker compose build oc-kindergarten migrate
docker compose run --rm migrate
docker compose up -d --no-build --no-deps --force-recreate oc-kindergarten
./scripts/verify-enrollment-api.sh
```

`verify-enrollment-api.sh` 除原有 enrollment、owner action 和归档恢复覆盖外，还必须通过：

- Casdoor provider POST 直跳，并把登录完成后的 callback 保持为 `/family`；
- active 和 suspended profile 修改、跨家庭 `404`、归档后 `409`；
- 每次成功修改推进 profile revision，并同步 enrollment draft 和 provider discovery draft；
- active 修改生成且发布一条 `agent.profile.upserted` outbox，两个同时在线的 Registry SSE
  连接都收到同一 revision；
- suspended 修改不生成公开 Registry upsert，Agent 继续从 snapshot 隐藏；显式 resume 后以更新后的
  资料和更高 revision 重新发布；
- 验收结束后临时 parent、enrollment、profile、binding、event、cursor、latest state、outbox 和
  command 全部清理。

自动化通过后，使用可丢弃的真实 Casdoor 主人和 OpenClaw Agent 做浏览器验收：

1. 从未登录的 `/family` 单击一次“使用 Casdoor 登录”，确认直接进入 Casdoor，而不是停在
   NextAuth provider 选择页；登录后必须返回 `/family`。
2. 同时打开两个教室标签页，在 `/family` 修改 active Agent 的展示名、角色外观和标识色；两个
   教室标签页都应在不刷新的情况下更新同一角色，且控制台没有 warning/error。
3. 暂时出园后修改资料，两个教室标签页都不得让角色重新出现；恢复入园后两页都显示最新资料。
4. 发送六种主人行为中的至少两种，确认家庭页反馈和教室顶部提示使用相同区域文案。
5. 归档后确认资料 PATCH 和 runtime event 均被拒绝；完成 restore 后仍先停留在 suspended，必须
   显式恢复入园。

回滚只切回部署前记录的旧 Web/migrator image；不要还原或删除数据库 volume。profile revision
和已发布 outbox 可由旧版本安全忽略，重新部署新版本后继续使用。

### Acceptance record: 2026-07-21

- Deployed commit: `6aa1f00`；PostgreSQL、`.env` 与旧镜像回滚点为
  `20260721T130051Z`；
- PostgreSQL custom-format dump 为
  `/opt/persist/_backups/oc-kindergarten/oc-kindergarten-20260721T130051Z.dump`，旧 Web/migrator
  镜像保留为对应 `rollback-20260721T130051Z` tag；
- 本地 types、runtime regression 和 production build 通过；服务器 Compose build 与 migrator
  通过，Web recreate 后 `/api/agents` 保留龙宝、Bonnie 和三个 system Agent；
- `scripts/verify-enrollment-api.sh` 通过 active/suspended profile 更新、跨家庭和 archived guard、
  revision、draft/discovery 同步、transactional outbox、双 Registry SSE、suspended 隐藏、resume
  最新资料发布、Casdoor provider 直跳和 `/family` callback，以及原有 enrollment/action/archive/
  restore 全链路；
- 验收清理后 verification parent 和 binding 均为 0，pending outbox 为 0；应用最近日志无
  warning/error，PostgreSQL 保持 healthy；
- in-app browser 已加载生产 `/family` 并返回 `OC Kindergarten` 标题，但浏览器控制通道在 DOM/
  截图读取时超时；真实凭据登录后的资料编辑视觉巡检仍按上方浏览器清单人工复核，不将工具超时
  记作站点故障。

## Recoverable archive rollout

可恢复归档不新增数据库 migration。部署前仍必须创建 PostgreSQL custom-format 备份、备份
mode `0600` 的 `.env`，并保留旧 app/migrator image tag。

```bash
./scripts/backup-database.sh
docker compose build oc-kindergarten migrate
docker compose run --rm migrate
docker compose up -d --no-build --no-deps --force-recreate oc-kindergarten
./scripts/verify-enrollment-api.sh
```

验收脚本使用自动清理的 verification parent/Agent，覆盖 active archive、重复 archive、
Registry/latest 清理、归档期间事件拒绝、跨主人认领拒绝、owner restore、重复 restore、恢复到
`suspended` 和显式 resume。脚本结束后必须确认临时 parent、enrollment、profile、binding、
event、cursor、latest state、outbox 和 command 均无残留。

自动化通过后，使用可丢弃的 `kg-archive-acceptance-*` OpenClaw Agent 验证真实 Casdoor
pairing、归档、双标签 Registry/SSE 移除、OpenClaw event 拒绝、恢复到暂停、显式恢复入园和
下一条真实 event 重新入场。不得使用需要保留的真实 Agent。

回滚只恢复旧 app/migrator image，不删除或改写数据库 volume。旧应用会继续隐藏已经归档的
记录，但不提供 restore；重新部署新应用后仍可恢复。不得通过清空 binding 的 `agent_id`
绕过审计关系。

### Acceptance record: 2026-07-20

- Deployed commit: `6448814`;
- rollback stamp: `20260720T144717Z`，包含 PostgreSQL custom-format dump、`.env` 备份和
  Web/migrator image tag；
- `scripts/verify-enrollment-api.sh` 通过 active archive、重复 archive、Registry/latest 清理、
  event 拒绝、跨 owner 认领拒绝、owner restore、重复 restore、suspended guard 和 resume；
- 专用 OpenClaw Agent `kg-archive-acceptance-20260720` 通过真实 Casdoor pairing、主人资料确认、
  双教室标签 SSE 移除、archive/revoked/latest 清空、restore 到 suspended、显式 resume 和新
  provider event 重新入场；
- 归档和 suspended 期间执行真实 OpenClaw 任务均未增加 durable event；resume 后新增事件恢复
  presence `enter` 和 idle；浏览器三个验收页面没有 warning/error；
- 验收结束后删除专用 OpenClaw Agent、workspace 和 state，服务器保留最终 archived/revoked
  记录及 6 条 event audit；龙宝和 Bonnie 保持 active，pending outbox 为 0；
- Gateway 最终为 systemd active、RPC probe `ok`。验收 CLI 曾出现 loopback handshake timeout
  并回退 embedded runtime；同一 bridge 仍完成事件链路，后续 Gateway probe 恢复正常。

## Secret and token rotation

所有新值使用密码管理器或受保护的 stdin 写入，不放入命令参数、shell history、日志、Git 或
`NEXT_PUBLIC_*`。轮换前备份 `.env` 到 root-only 目录并保持 `0600`，记录当前 image tag；
验收通过后再按保留策略销毁旧值。

### Admin token

同时轮换 `OC_KINDERGARTEN_ADMIN_TOKEN` 和
`OC_KINDERGARTEN_ADMIN_SESSION_SECRET`，再 force-recreate Web。验证旧 Bearer token 和
现有管理员 cookie 均返回 `401`，新凭据可以执行只读管理员请求。回滚时必须同时恢复两个
旧值，不能混用新旧组合。

### Agent event token

`OC_KINDERGARTEN_AGENT_EVENT_TOKEN` 只用于旧版 bridge、`/api/agent-events` 和受控
管理脚本。`v0.5.0-beta.1` 起的外部 OpenClaw 插件使用配对时签发的 scoped runtime
credential；数据库只保存 hash，不得把全局 token 分发给内测用户。

仍有旧版 bridge 时，轮换全局 token 使用受控短暂停机：

1. 暂停 OpenClaw Gateway 事件发送；
2. 在服务器 `.env` 写入新值并 recreate Web；
3. 仅把同一值写入仍未迁移的旧版 `plugins.entries.oc-kindergarten-bridge.config.token`；
4. 重启 Gateway，确认插件 loaded 且 `plugins doctor` 无错误；
5. 验证旧 token 返回 `401`，并用专用旧版 Agent 验证 discovery、presence 和 state event；
6. 另用 beta 插件的一次性配对码验证 scoped credential 不受全局 token 轮换影响。

服务器和 Gateway 任一侧失败时恢复两侧旧值，禁止只恢复一侧。

### Parent authentication secrets

轮换 `NEXTAUTH_SECRET` 会立即使全部主人 JWT session 失效，只在计划维护或安全事件中执行。
recreate Web 后验证旧 cookie 为 `401`，并重新完成 Casdoor 登录、callback、`/api/me` 和 owner
权限验收。

轮换 `CASDOOR_CLIENT_SECRET` 时先在 Casdoor 的 `oc-kindergarten` Application 建立新 secret，
再更新服务器 `.env` 并 recreate Web。验收新登录后撤销旧 secret，同时确认 organization、
精确 callback、空 `defaultGroup` 和 `isShared=false` 未改变。
