# V2 Character Colorways V1

本目录保存 V2 轮式角色的审核配色和完整运行时 sprite 资源组。

## Presets

- `classic`：现有黄色服装与背包，直接复用 V2 批准基线，不复制文件。
- `meadow`：薄荷绿、青绿与祖母绿服装／背包。三种角色各包含 1 个 idle strip、1 个
  8×4 moving atlas 和 5 个任务状态 strip，共 21 张运行时图集。
- `berry`：莓红／珊瑚配色已有三种角色的完整 idle、8 方向 moving 和五类任务动作，共 21 张
  运行时图集，并由 `approved/berry-runtime-lock-v1.json` 锁定 231 个交付文件。资源已通过审核，
  但尚未进入应用契约；在独立接入版本完成前，家庭页和 Registry 仍只允许 `classic`/`meadow`。

红橙花朵、蓝色天线、白色外壳、黑色屏幕、青色眼睛、浅蓝袖子、轮组和任务道具不随配色
预设重染。男孩 Meadow 帽子使用深葡萄紫阴影、柔和紫罗兰主体、长春花蓝紫高光与淡薰衣草
帽檐；该紫色只属于帽子，不延伸到薄荷绿背带裤或背包。

## Production and QC

原始美术由 imagegen 以经典动作图和配色板为双参考生成，背景使用洋红幕；
`generate2dsprite` 只负责切帧、透明清理与初步边缘检查；
`tools/design/build_v2_colorway_v1.py` 只负责对齐、缩放、镜像、组图和 QC，不生成或重绘美术。
Berry 高风险样板采用更严格的保形路径：直接从经典批准帧派生，只改变帽冠和服装／背包的 RGB，
透明通道、轮廓、帽檐、脸、白色外壳、袖子、轮组、状态灯与任务道具必须逐像素保持一致；
`tools/design/build_v2_berry_samples_v1.py --check` 会验证 16 张候选帧可完全复现且未进入运行时。
完整资源沿用同一规则；`tools/design/approve_v2_berry_runtime_v1.py --check` 会从经典帧重新计算
全部 168 张运行时帧，并验证 21 张图集、24 个方向条及 231 文件哈希锁。该资源锁不代表应用已接入。

硬性检查：

- 每帧 48×64 RGBA，锚点 `[24,64]`；
- 可见主体底部与对应经典帧一致，且不触碰画布边缘；
- 洋红像素与高饱和洋红幕边残留均为 0；正式紫色帽子像素不作为幕边误删；
- 每帧存在 Meadow 色像素；
- down-left 是 down-right 的精确水平镜像，up-left 同理；
- 配色版不得重画动作语义；男孩 executing 与 error 逐帧对照经典批准帧，透明轮廓 IoU
  必须至少为 `0.95`，分别保持背面放置积木与正面检查诊断器；
- 只有 idle、moving 和五类任务图集全部存在时，预设才可进入公开契约。

`palette-board/processor/pipeline-meta.json` 记录配色板 QC；每个动作目录的 `*-meta.json` 和
movement metadata 记录逐帧参考框、QC 与 SHA-256。`movement-references/` 仅是把经典批准帧
排成方向清晰的 imagegen 参考网格，不是运行时资源。

正式交付文件由 `approved/meadow-runtime-lock-v1.json` 锁定：共 231 个文件，包含三名角色
的 168 张 48×64 运行时帧、24 个移动方向条、3 个移动图集、18 个 idle／任务动作条和对应
18 个 2×2 审核表。`tools/design/approve_v2_colorway_v1.py --check` 会同时验证逐帧 QC、男孩
紫帽、斜向镜像以及 executing／error 的经典造型锁。
