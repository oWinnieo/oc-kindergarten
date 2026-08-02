# Dev → Prod 用户身份与资料迁移参考

状态：隔离保护、内测资格记录和迁移工具已实现；待生产环境配置完成后演练与执行。
记录日期：2026-08-02。

## 1. 已确认的决定

OC Kindergarten 的 dev 与 prod 按以下原则建设和迁移：

1. **共用 Casdoor 用户体系**：同一个人继续使用原 Casdoor 账号登录 dev 和 prod。
2. **数据库必须分开**：dev 与 prod 各自拥有独立 PostgreSQL、数据卷、凭据、备份和 Compose 项目。
3. **上线时单向迁移**：正式上线前，将符合范围的 Kindergarten 用户资料从 dev 一次性迁移到 prod。
4. **prod 成为正式资料源**：上线后不允许 dev 自动覆盖 prod，也不建立双向同步。
5. **需要测试数据时从 prod 单向刷新 dev**：必须先脱敏，并且不得把 dev 的测试修改写回 prod。

这里的“共用一套用户资料”是指：用户第一次进入 prod 时，能用同一个 Casdoor 身份认领迁移后的
Kindergarten 资料。它不表示 dev 与 prod 长期共用同一个业务数据库。

## 2. 当前服务器状态与阻塞项

2026-08-02 核对服务器时发现：

- `dev/docker-compose.yml` 与 `prod/docker-compose.yml` 都声明 Compose 项目名 `oc-oc-kindergarten`；
- 两者都指向 `/opt/persist/oc-kindergarten/postgres`；
- 当前只有一套正在运行的 Kindergarten PostgreSQL；
- dev 有 `.env` 并正在运行；prod 没有独立 `.env`，也没有独立 prod 容器或数据库。

因此，**当前 prod 不是一个已隔离、可安全启动的生产环境**。仓库现在会强制校验以下值；prod 的
独立凭据、域名和数据目录准备好以前，不得直接在 prod 目录执行 `docker compose up`：

- Compose 项目名改为 `oc-kindergarten-dev` 与 `oc-kindergarten-prod`；
- PostgreSQL 数据目录改为：
  - `/opt/persist/oc-kindergarten/dev/postgres`
  - `/opt/persist/oc-kindergarten/prod/postgres`
- dev/prod 分别配置 `.env`、数据库用户、密码、数据库名和 `DATABASE_URL`；
- 应用端口、镜像标签、反向代理 upstream 和备份目录分开；
- 分别验证容器网络、健康检查、迁移记录和恢复流程。

## 3. 身份匹配规则

Kindergarten 不保存 Casdoor 密码。`parent_users` 中用于认出同一个人的稳定键是：

```text
(oidc_issuer, oidc_subject)
```

邮箱不能作为迁移主键。邮箱可能被修改，也可能为空。

迁移时必须保留：

- `parent_users.id`（Kindergarten 内部 UUID）；
- `oidc_issuer`；
- `oidc_subject`；
- `email`、`display_name`、`avatar_url`、`timezone`、`language`；
- `created_at`、`updated_at`。

prod 必须使用相同的 Casdoor issuer，确保同一个用户返回相同 subject。dev 和 prod 推荐使用各自独立的
Casdoor OAuth Client ID/Secret 与回调地址；客户端可以不同，issuer/subject 身份必须保持稳定。

若 prod 改用另一个 Casdoor issuer 或 subject 会变化，必须先准备经过人工审核的身份映射表；不得按邮箱自动合并。

## 4. 本次默认迁移范围

默认只迁移已明确选择加入迁移清单的 Kindergarten 用户资料及其选择记录：

```text
parent_users
beta_participants
```

候选范围固定为 `beta_participants.migration_eligible = true` 且
`acknowledged_at IS NOT NULL`。没有记录或未勾选的内测用户不会被工具选中。

默认不迁移：

- NextAuth JWT、Cookie、`NEXTAUTH_SECRET` 或其他环境秘密；
- 一次性配对码及其 hash、有效期；
- runtime credential 或 token hash；
- pending outbox、操作命令、限流状态；
- dev 的测试 Agent、事件、活动、Moments 和场景状态；
- dev 日志、备份文件或任何 `.env`。

用户在 prod 需要重新登录一次。仅迁移 `parent_users` 时，用户的 OpenClaw/Hermes Agent 需要在 prod
重新入园和配对，由 prod 签发新的环境专属 credential。

如果以后决定保留内测 Agent、历史活动或 Moments，必须另开迁移方案，按外键闭包评估以下表，不能临时只复制
其中几张：

```text
agent_enrollments
agent_profiles
provider_agent_bindings
runtime_credentials
agent_event_cursors
agent_latest_states
agent_event_log
agent_share_settings
agent_moments
agent_moment_items
agent_action_commands
event_outbox
```

即使迁移 Agent 资料，也建议清除一次性配对状态、撤销 dev runtime credential，并要求在 prod 重新配对。

## 5. 上线前准备

迁移负责人必须完成：

- [ ] dev/prod 基础设施和数据库已按第 2 节隔离；
- [ ] prod 已执行仓库中全部 Drizzle schema migration；
- [ ] prod 数据库已创建可恢复备份，并验证备份文件非空；
- [ ] dev 数据库已创建迁移前备份；
- [ ] Casdoor prod 客户端回调域名正确，issuer 与 dev 一致；
- [ ] 冻结 `beta_participants` 迁移资格选择，并确认每个候选都有告知版本和确认时间；
- [ ] prod 尚无同 identity 的冲突资料，或冲突处理规则已经人工批准；
- [ ] 已在一次性数据库副本完成迁移演练和登录验收；
- [ ] 已准备回滚负责人、回滚命令和最长允许停写时间。

## 6. 推荐执行流程

### 6.1 专用迁移工具

仓库提供 `scripts/migrate-parent-users.mjs`（`yarn users:migrate`），只处理符合资格的
`parent_users` 和对应 `beta_participants`。工具已经实现：

- `SOURCE_DATABASE_URL` 与 `TARGET_DATABASE_URL` 使用独立环境变量，且不得指向同一 endpoint；
- 默认或 `--dry-run` 只输出数量和冲突类型；
- 按 `(oidc_issuer, oidc_subject)` 检测冲突；
- 保留原 `parent_users.id`，并在 UUID 冲突时停止；
- 在单个 prod 数据库事务中导入，任何错误整体回滚；
- 输出源/目标数量和校验结果，不输出邮箱、subject 或连接字符串；
- 默认拒绝覆盖 prod 已被用户修改的字段；覆盖策略必须显式指定并经过批准。

dry-run 示例：

```bash
SOURCE_KINDERGARTEN_ENV=dev \
TARGET_KINDERGARTEN_ENV=prod \
SOURCE_DATABASE_URL='postgresql://...' \
TARGET_DATABASE_URL='postgresql://...' \
yarn users:migrate --dry-run
```

正式执行还必须输入 `--apply --confirm=MIGRATE_ELIGIBLE_BETA_PARENTS`。不要在 shell history 中
直接填写真实密码；上线时应由受控 secret 注入环境变量。

不要把两个数据库的明文密码写入命令历史、日志或迁移产物。

### 6.2 迁移演练

1. 从 dev 备份恢复一个临时源副本；从 prod 备份恢复一个临时目标副本。
2. 对临时目标执行最新 schema migration。
3. 运行迁移工具 `--dry-run`，记录待迁移、已存在、UUID 冲突和 identity 冲突数量。
4. 在临时目标执行正式模式。
5. 执行第 7 节验证；使用一个可丢弃的真实 Casdoor 用户完成 prod 登录验收。
6. 删除临时数据库和迁移过程中产生的含个人资料文件。

### 6.3 正式切换

1. 短暂停止 dev 的用户资料修改入口；不一定需要停止只读访问。
2. 记录 dev/prod Git commit、镜像 ID、数据库迁移版本和时间。
3. 分别备份 dev 与 prod，备份权限设为 `0600`，记录恢复命令。
4. 执行迁移工具 `--dry-run`；结果与演练预期不一致时停止。
5. 使用固定确认短语，在 prod 事务中迁移符合资格的 `parent_users` 与选择记录。
6. 执行第 7 节验证。
7. 让一个迁移用户登录 prod，确认系统识别为原 UUID，并能看到原展示名、头像、时区和语言。
8. 开放 prod；用户需要重新登录，不迁移旧会话。
9. 将 prod 标记为正式资料源；恢复 dev 时禁止自动向 prod 回写。

## 7. 数据验证

源和目标都应检查 identity 唯一性：

```sql
SELECT oidc_issuer, oidc_subject, count(*)
FROM parent_users
GROUP BY 1, 2
HAVING count(*) > 1;
```

结果必须为零行。

检查基础数量：

```sql
SELECT
  count(*) AS users,
  count(DISTINCT id) AS ids,
  count(DISTINCT (oidc_issuer, oidc_subject)) AS identities
FROM parent_users;
```

对本次迁移清单还必须验证：

- 源端选中用户数 = prod 成功插入或明确跳过的用户数；
- 每个迁移 UUID 在 prod 恰好出现一次；
- 每个 `(issuer, subject)` 在 prod 恰好出现一次；
- prod 不存在 UUID 对应不同 identity 的情况；
- prod 登录后 NextAuth session 中的 `parentUserId` 等于迁移 UUID；
- 展示名、头像、时区、语言与批准的迁移快照一致；
- 每个迁移 UUID 在 prod 有一条对应 `beta_participants`，且告知版本与首次确认时间保留；
- 数据库日志、应用日志和迁移报告中没有密码、token、完整 subject 或不必要的个人资料。

## 8. 回滚

在 prod 开放登录前发现问题：

1. 保持 prod 用户入口关闭；
2. 停止迁移工具和所有 prod 写入；
3. 恢复迁移前 prod 数据库备份；
4. 重跑第 7 节检查，确认 prod 回到迁移前状态；
5. 保留脱敏故障摘要，安全删除含个人资料的失败迁移产物。

在 prod 已开放且产生新资料后，不得直接恢复旧备份覆盖新数据。此时必须停止自动处理，导出受影响 UUID，逐用户制定
修复或合并方案并记录审计结果。

## 9. 上线后的资料流向

- prod 是 Kindergarten 正式用户资料的唯一权威源；
- dev 继续使用相同 Casdoor 身份，但 dev 数据库中的资料只是测试副本；
- 不建立 dev → prod 自动同步；
- 如测试需要，可由 prod → dev 做经过审批的单向脱敏刷新；
- dev 中对展示名、头像、时区、语言的修改不应被视为生产资料修改；
- 所有生产资料修正都应在 prod 完成。

## 10. 最终验收标准

只有同时满足以下条件，迁移才算完成：

- [ ] dev 与 prod 数据库、数据卷、Compose 项目和备份已经分离；
- [ ] prod 使用相同 Casdoor issuer，迁移用户 subject 稳定；
- [ ] 用户和 identity 数量校验通过，无 UUID/identity 冲突；
- [ ] 迁移用户能在 prod 重新登录并命中原 `parentUserId`；
- [ ] prod 显示批准迁移的 Kindergarten 资料；
- [ ] dev 会话、配对码和 runtime credential 没有进入 prod；
- [ ] prod 已成为正式资料源，dev 不会回写覆盖 prod；
- [ ] 回滚备份、恢复命令和迁移报告已归档，敏感临时文件已删除。
