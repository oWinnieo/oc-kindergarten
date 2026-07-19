# Kindergarten AI Agent Sprites V2

本目录存放第二版轮式幼儿园 AI 角色的正式运行时精灵。

## 已定稿内容

- 男孩、女孩、无性别孩子各 1 张 48×64 RGBA `static` 精灵
- 每名角色各 4 帧 48×64 `idle` 动画
- 每名角色的 2×2 精灵表、横向条、透明 GIF 和 6 倍预览 GIF
- 三人静态并排图、同步待机 GIF、预览图和本体尺寸校验图
- 每名角色各 8 方向 × 4 帧的 `moving/v1` 轮式移动，共 96 帧
- 移动帧、方向条、透明 GIF、图集、三人预览与技术 QC 元数据
- 每名角色各 4 帧 researching、executing、writing、syncing 与 error 批准动作，共 60 帧
- 状态动作帧、横向条、2×2 表、透明 GIF、三人预览与技术 QC 元数据

`static`、`idle`、`moving/v1`、researching、executing、writing、syncing 和 error 均已批准；
移动与状态动作正式文件由
`approved/v2-wheelbase-animation-baseline-lock-v4.json` 的 SHA-256 锁定。
旧 v1/v2/v3 锁作为不可变父级基线保留；v4 共锁定 429 个文件。

## 尺寸规则

- 排除帽子、花朵和天线后，三名角色第一帧的头壳顶部到轮组底部统一为 50 px
- 轮组底部统一锚定在 48×64 画布的 `y=62`
- 装饰不参与本体尺寸计算，但保留在最终精灵中
- moving 与 actions 必须复用同角色的 idle 校准倍率，不允许按整张动作表统一填满 64px 单元格
- 正面 moving 与 researching 的逐帧可见高度精确匹配 idle：男孩 55 px、女孩 51 px、无性别角色 58 px
- 运行时排序／移动锚点为 `[24,64]`，位于轮底中心
- 移动为 8 方向机械滑行，每方向 4 帧，运行时按 125 ms/帧播放
- researching 为正面阅读绘本，4 帧，220 ms/帧
- executing 为背面放置小积木，4 帧，180 ms/帧
- executing 背面帧遵循远近遮挡：举起的手和积木进入后脑壳／背包轮廓后由人物前景遮住；无性别角色第 2、3 帧带专项 QC
- writing 为背面在写画桌前书写／绘画，4 帧，200 ms/帧；四帧精确匹配批准 idle 的角色可见高度，并带远侧手／画笔遮挡 QC
- syncing 为正面读取并确认贴近躯干的消息卡，4 帧，200 ms/帧；四帧精确匹配批准 idle 的角色可见高度
- error 为正面检查贴近躯干的诊断阅读器，4 帧，240 ms/帧；四帧精确匹配批准 idle 的角色可见高度

`trio/static/kindergarten-ai-agent-trio-v2-wheelbase-body-size-guide-8x.png`
中的两条青色横线分别标记共同本体头顶和轮组底部基准。

moving 与 actions 的对应检查图分别位于：

- `trio/moving/v1/previews/kindergarten-ai-agent-trio-move-body-size-guide-8x.png`
- `trio/actions/v1/kindergarten-ai-agent-trio-state-actions-body-size-guide-8x.png`
- `trio/actions/v1/kindergarten-ai-agent-trio-state-actions-body-size-guide-v2-8x.png`（researching / executing / writing 批准尺寸基线）
- `trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v3-preview-6x.png`（增加 syncing 的四状态批准预览）
- `trio/actions/v1/kindergarten-ai-agent-trio-state-actions-v4-preview-6x.png`（增加 error 的五状态批准预览）

## 参考概念

`assets/design/concepts/kindergarten-ai-agent-trio/kindergarten-ai-agent-trio-concept-v2-wheelbase.png`

原始生成图、处理中间文件和构建脚本保留在项目根目录的
`design/sprites/characters/v2/`，不属于正式游戏资源。

角色、地图和移动的完整契约见
`.hidden/docs/art/v2-wheelbase/`；教室匹配验证见
`assets/design/maps/classroom-corner/runtime/v1/`。
