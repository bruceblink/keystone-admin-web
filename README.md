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

管理页面使用路由级懒加载。生产构建的初始 JavaScript 包保持在 Vite 默认警告阈值以内，各业务页面按路由独立加载。

当前首阶段包含登录、受保护管理壳、运行监控工作台、用户查询页面（基线 `f9486e1`）、角色与组织查询页（基线 `001be90`）、菜单/权限与 API Key 查询页（基线 `aa34c78`）、登录日志与任务查询页（基线 `ef69228`）、配置/字典/通知公告查询页（基线 `85ce1e3`）、操作审计查询页（基线 `dfc0446`）、用户新增/编辑模态框（基线 `9d9c689`）、角色/组织新增/编辑模态框（基线 `b465902`）、菜单/API Key 写操作模态框（基线 `d653cae`）、配置/字典/通知公告写操作模态框（基线 `b5d7e2a`）、定时任务新增/编辑/启停/执行操作（基线 `bf199a7`）、用户 `.xlsx` 导入导出（基线 `7ae322e`）和用户、公告、任务批量删除（基线 `95fb099`）。用户页对接
`GET /api/v1/users`，支持用户名、展示名筛选和分页，并提供 `.xlsx` 导入导出和当前页批量删除。2026-11-14 已在 macOS Chrome
真实窗口使用 Native 开发服务完成登录、用户列表读取和用户名筛选验收。操作审计页对接
`GET /api/v1/operation-logs`，支持操作用户、动作、资源类型筛选和分页，只提供查询能力。

角色页对接 `GET /api/v1/roles`，组织页对接 `GET /api/v1/departments`；菜单页对接 `GET /api/v1/menus`，API Key 页对接 `GET /api/v1/api-keys`，仅展示脱敏元数据；登录日志页对接 `GET /api/v1/login-logs`，任务页对接 `GET /api/v1/jobs`、`GET /api/v1/jobs/logs` 以及新增/编辑/启停/执行和批量删除接口；配置、字典和通知公告页对接对应 Native 查询接口。各页均以查询为默认入口，角色支持状态和关键词筛选，组织和菜单按父子关系展示层级，任务支持只读执行日志查看。用户、角色、组织、菜单、API Key、配置、字典和通知公告已提供对应模态框或签发/轮换操作，保存期间锁定提交，成功后刷新列表；用户、公告和任务提供确认模态框批量删除，删除错误在页面中明确反馈。

Native 已提供用户、角色、岗位、部门、菜单、配置、字典、公告、任务、登录日志、操作日志、API Key、个人资料、监控和文件接口。前端当前优先补齐岗位管理、非用户资源的 Excel 导入导出，以及角色、部门、菜单和审计资源的确认删除流程；外部身份提供商、Passkey、多节点和生产窗口不属于当前本地验收范围。

前端按 Native 的统一
`{ success, data, message, error }` 响应解包；登录和刷新使用 `data.accessToken`、
`data.refreshToken`，令牌只保存在当前页面内存。Native 当前没有 `/auth/me` 或监控快照接口，
监控页面通过 `/monitor/serverInfo`、`/monitor/cacheInfo` 和 `/monitor/onlineUsers` 组合读取，
Native 未提供的 CPU、磁盘和网络指标会明确显示为不可用。强制下线当前会话后，前端会清理
身份状态并返回登录页；相关联调需要使用 `VITE_ENABLE_MOCK=false`。
