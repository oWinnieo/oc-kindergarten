# OpenClaw plugin moved

OC Kindergarten OpenClaw 插件已经拆分为独立仓库，此目录不再保存可执行插件源码。

- Dev：`oc-workspace/oc-kindergarten-openclaw-plugin`
- Private beta release：`oWinnieo/oc-kindergarten-openclaw-plugin`
- 稳定插件 ID：`oc-kindergarten-bridge`

服务端协议、数据库迁移和网页入园流程继续由本仓库维护。不要把插件源码复制回此目录；
插件改动应在独立 dev 仓库完成，再通过受控 dev-to-prod 发布链路发布。
