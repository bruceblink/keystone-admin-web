# Keystone Native Frontend

Native 后端的新管理前端项目。项目从空目录开始实现，不迁移旧版
`keystone-frontend` 的页面、状态树或接口封装。

技术选型和实现边界见 [`docs/01-technology-selection.md`](docs/01-technology-selection.md)。当前方案
采用 React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + shadcn/ui 风格的项目内组件。

## 本地运行

```bash
pnpm install
pnpm dev
```

开发环境默认允许 Native API 不可用时使用内存 Mock 快照。设置
`VITE_ENABLE_MOCK=false` 可以强制只请求真实的 `/api/v1` API。生产构建不会启用 Mock
回退。

```bash
pnpm typecheck
pnpm test:run
pnpm build
```

当前首阶段包含登录、受保护管理壳和运行监控工作台。前端按 Native 的统一
`{ success, data, message, error }` 响应解包；登录和刷新使用 `data.accessToken`、
`data.refreshToken`，令牌只保存在当前页面内存。Native 当前没有 `/auth/me` 或监控快照接口，
监控页面通过 `/monitor/serverInfo`、`/monitor/cacheInfo` 和 `/monitor/onlineUsers` 组合读取，
Native 未提供的 CPU、磁盘和网络指标会明确显示为不可用。强制下线当前会话后，前端会清理
身份状态并返回登录页；相关联调需要使用 `VITE_ENABLE_MOCK=false`。
