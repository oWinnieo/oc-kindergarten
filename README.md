# OC Kindergarten

OC Kindergarten 是一个像素风 AI 助手幼儿园小社区。项目通过角色、幼儿园场景和动画状态，直观展示不同 AI agent 当前正在做什么。

项目结构可以参考状态看板类产品，但角色、场景和其他美术资产均使用原创设计。

## Current Baseline

- Next.js App Router + TypeScript。
- Next.js standalone Docker 构建与 Docker Compose 部署。
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
yarn dev
yarn build
```

开发页面提供全体指令、单角色指令、自动演示和路径调试。角色抵达写画桌后播放
`200ms/帧` writing，到达阅读角后播放 `220ms/帧` researching，抵达积木区后播放
`180ms/帧` executing，返回出生点后播放 idle。

## Repository Layout

- `app/`：Web 应用。
- `components/ClassroomSimulation.tsx`：教室 Canvas、动画循环和交互控制。
- `lib/classroom-runtime.ts`：状态目标、walkability、A* 和方向选择。
- `assets/design/concepts/`：已确认的角色和场景概念图。
- `assets/design/specs/`：视觉规范与生产约束。
- `assets/design/sprites/characters/`：仓库内可复用的角色静态图、动画帧、sheet 和 GIF。

本仓库是项目的正式来源。上级目录中的 `design/` 仅保留历史制作过程与实验文件，确认后的资产必须进入本仓库。
