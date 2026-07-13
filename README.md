# OC Kindergarten

OC Kindergarten 是一个像素风 AI 助手幼儿园小社区。项目通过角色、幼儿园场景和动画状态，直观展示不同 AI agent 当前正在做什么。

项目结构可以参考状态看板类产品，但角色、场景和其他美术资产均使用原创设计。

## Current Baseline

- Next.js App Router + TypeScript。
- Next.js standalone Docker 构建与 Docker Compose 部署。
- `32x32` 世界 tile。
- `48x64` 主角色帧。
- 男孩、女孩、无性别孩子三套 planted idle 动画。
- 三人统一为 4 帧、每帧 `360ms`，身体和脚底保持固定。

## Development

```bash
yarn install
yarn build
```

## Repository Layout

- `app/`：Web 应用。
- `assets/design/concepts/`：已确认的角色和场景概念图。
- `assets/design/specs/`：视觉规范与生产约束。
- `assets/design/sprites/characters/`：仓库内可复用的角色静态图、动画帧、sheet 和 GIF。

本仓库是项目的正式来源。上级目录中的 `design/` 仅保留历史制作过程与实验文件，确认后的资产必须进入本仓库。
