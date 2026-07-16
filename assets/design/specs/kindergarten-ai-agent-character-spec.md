# 幼儿园 AI Agent 小朋友角色规范

版本：v0.4（V2 wheelbase）
基准图：`assets/design/concepts/kindergarten-ai-agent-trio/kindergarten-ai-agent-trio-concept-v2-wheelbase.png`

## 角色定位

角色用于 AI 助手幼儿园小社区和状态看板。外观需要像幼儿园小朋友，同时一眼可以识别为 AI agent。

## 共同视觉特征

- 白色复古显示器头部外壳。
- 黑色 terminal 屏幕脸。
- 荧光浅蓝色像素眼睛和嘴巴。
- 黄色服装和黄色书包。
- 浅蓝色内衬。
- 角色下半身为各自的深蓝／浅蓝轮式底盘，不出现人类腿、脚或鞋。
- chibi 比例，头大、身体小，缩小后轮廓仍清楚。

## 角色差异

- 男孩：蓝色鸭舌帽、黄色背带裤、双大轮和稳定脚轮。
- 女孩：红色小花、黄色裙式护罩轮组和稳定脚轮。
- 无性别孩子：浅蓝圆球天线、黄色背心和三轮三角底盘。

## 主规格

- 世界网格：`32x32` tile。
- 角色帧：`48x64`。
- 运行时排序／移动锚点：`[24,64]`，轮底中心。
- 可见轮底：alpha bbox 排他坐标 `y=62`。
- 本体高度：排除帽子、花朵和天线后为 `50px`。
- 轮组碰撞：男孩 `30x6`、女孩 `26x6`、无性别孩子 `30x6`。
- 无性别孩子 `36x48` 版本仅作为早期紧凑比例参考保留。

## Planted Idle 基线

- 4 帧循环。
- 每帧 `220ms`。
- 身体、服装、书包和轮组保持稳定，只允许轻微悬挂起伏。
- 男孩和女孩只改变 terminal 眼睛、嘴巴与屏幕微光。
- 无性别孩子除 terminal 脸外，允许天线圆球做明显的伸缩和亮度脉冲。
- GIF 不应出现可见的洋红色透明边缘。

## 当前定稿文件

- 男孩：`assets/design/sprites/characters/v2/ai-agent-child-boy/`
- 女孩：`assets/design/sprites/characters/v2/ai-agent-child-girl/`
- 无性别孩子：`assets/design/sprites/characters/v2/ai-agent-child-genderless/`
- 三人同步预览：`assets/design/sprites/characters/v2/trio/`
- 教室地图匹配：`assets/design/maps/classroom-corner/runtime/v1/`

## 后续状态

第一个 `512x288`、`32px tile` 的教室角落已完成 V2 地图匹配。三名角色的
8 方向 × 4 帧轮式移动位于各自 `moving/v1/`，技术 QC 已通过，等待最终视觉批准。
后续动作候选包括 writing、researching、executing、syncing 和 error。

## 禁止跑偏

- 不使用绿色作为角色主色。
- 不把屏幕脸改成白色面板或普通人类眼睛。
- 不把 V2 轮式角色重新画成人类腿、脚、鞋或双足步态。
- 不直接复制 Star-Office-UI 的美术资产、家具形状或装饰。
- 单次只验证一个角色动作或一个小场景，不批量生成未经确认的素材。
