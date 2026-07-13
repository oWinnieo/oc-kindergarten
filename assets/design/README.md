# Design Assets

这里存放 AI 助手幼儿园小社区已经确认、可进入项目使用的设计资产。

## Structure

- `concepts/kindergarten-ai-agent-trio/`：三名 AI agent 小朋友的定妆概念图。
- `maps/`：场景布局草图、地图 metadata 和后续地图美术。
- `specs/`：角色尺寸、配色和动画规则。
- `sprites/characters/ai-agent-child-boy/`：男孩静态图与 planted idle。
- `sprites/characters/ai-agent-child-girl/`：女孩静态图与 planted idle。
- `sprites/characters/ai-agent-child-genderless/`：无性别孩子静态图与 planted idle。
- `sprites/characters/trio/`：三人同框静态图和同步 idle 预览。

## Sprite Conventions

- 世界网格：`32x32` tile。
- 主角色帧：`48x64`。
- 紧凑无性别角色帧：`36x48`，仅作为早期比例参考保留。
- 三名主角色当前整体可见宽度均为 `38px`。
- planted idle：4 帧，每帧 `360ms`。
- planted idle 中身体和脚底必须逐像素固定。
- 透明生产文件优先使用 PNG 帧与 PNG sheet；GIF 用于预览和简单运行时验证。

## Production Rule

本目录只接收已经确认的资产。草稿、生成原图、抠图实验和被否决版本不进入仓库。
