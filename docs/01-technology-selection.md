# Keystone Native Frontend 技术选型与架构设计

更新日期：2026-11-14。本文只描述新项目 `keystone-admin-web`。旧项目
`keystone-frontend` 保留为历史参考，不在本项目中重构、复制或兼容。

## 术语与命名规则

| 名称 | 英文 | 职责 | 不负责的内容 |
| --- | --- | --- | --- |
| 管理前端 | Admin Frontend | 渲染管理页面、收集用户操作、调用 Native API | 不保存业务数据，不执行授权决策 |
| Native API | Keystone Native API | 提供认证、授权、业务数据和文件接口 | 不负责浏览器布局和组件状态 |
| API 客户端 | API Client | 处理请求、令牌、错误和响应校验 | 不决定页面展示样式 |
| 服务端状态 | Server State | 来自 Native API 的列表、详情、指标和操作结果 | 不包含临时弹窗、输入框和导航状态 |
| 客户端状态 | Client State | 保存当前用户、导航、筛选草稿和显示偏好 | 不复制服务端数据缓存 |
| 运行监控工作台 | Operations Monitoring Workspace | 展示健康状态、趋势、节点详情和在线会话 | 不替代日志审计和数据库管理 |

固定术语使用 `Native API`、`API Client`、`Server State`、`Client State` 和
`Operations Monitoring Workspace`。页面、组件和测试中的业务名称使用中文；代码标识符使用英文。

## 结论

新项目采用 **React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + shadcn/ui**。
服务端数据使用 **TanStack Query** 管理，登录、导航和显示偏好使用 **Zustand** 管理，
运行监控图表使用 **Apache ECharts 6**。API 类型从 Native OpenAPI 生成，并在请求入口使用
运行时 schema 校验。测试使用 **Vitest**、**Playwright** 和 **axe-core**。

项目使用单应用结构，不引入 SSR、微前端和旧版 PureAdmin 运行时。生产部署输出静态文件，
由 Nginx 或 CDN 提供页面，并将 `/api` 反向代理到 Native API。生产 Docker 镜像只由 GitHub
Actions 构建；本机只运行 `pnpm dev`、本地 API、测试服务和浏览器测试。

这个选择使用 React 更大的生态和官方 shadcn/ui 组件分发方式，再用统一设计令牌解决旧后台的
视觉耦合问题。它适合 Native API 的 REST、SSE、XLSX 导入导出和 UUID 字符串接口。

## 需求边界

### 必须支持

- 用户名密码登录、刷新、退出、MFA 挑战和会话失效提示。
- 用户、角色、部门、岗位、菜单、配置、字典、公告、日志、任务和运行监控页面。
- UUID 字符串作为页面键、路由参数、选择值和表格行标识。
- XLSX 导入和导出。拒绝 `.xls`、CSV 和未知格式。
- 权限码和数据范围只用于显示可用操作。最终授权由 Native API 决定。
- 运行监控的 LIVE、stale、offline 和 partial 状态。
- 大屏和移动端。移动端首屏先显示健康摘要和主要趋势，再打开筛选和详情。
- 键盘、触摸、屏幕阅读器、减少动态效果和无图表降级路径。

### 明确不做

- 不迁移旧 `keystone-frontend` 的页面、状态树、接口封装或主题覆盖。
- 不在浏览器中执行密码、权限、数据范围和 API Key 的最终判断。
- 不把访问令牌、刷新令牌、密码或敏感 XLSX 内容写入 `localStorage`。
- 不在前端实现第二套业务缓存、第二套分页语义或旧接口别名。
- 不使用 3D、地图、装饰性动画、背景光效或需要 hover 才能读懂的图表。

## 方案比较

| 方案 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| React 19 + Vite SPA | 生态和人才覆盖广；官方 shadcn/ui 组件可直接纳入项目；构建简单；适合静态部署 | JSX 和状态组合需要明确约束 | **采用** |
| Nuxt SSR/Hybrid | 有 SSR、路由和服务端数据能力 | 本项目是受保护的管理后台；SSR 会增加令牌边界、部署和缓存复杂度 | 不采用 |
| Vue 3 + Vite SPA | 模板语法直观，Composition API 成熟，国内后台使用广泛 | 官方 shadcn/ui 组件路线不如 React 直接；本项目需要自行维护更多组件适配 | 备选 |
| 继续扩展旧 PureAdmin | 初期页面多 | 接口、状态、主题和历史后端模型强耦合，无法满足从零重做的边界 | **明确不采用** |

| UI 方案 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| Element Plus 默认主题 | 表格和表单齐全 | 默认视觉接近旧后台；覆盖样式容易形成隐式耦合 | 不采用 |
| 统一 Tailwind 令牌 + shadcn/ui | 组件源码在项目内；可精确控制颜色、密度、焦点、抽屉和模态框；适合响应式工作台 | 需要自行维护组件和可访问性回归 | **采用** |
| 完整商业 UI 套件 | 组件数量多，初期开发快 | 视觉定制受限，授权和长期升级约束不明确 | 不采用 |

## 技术栈

| 层 | 选择 | 规则 |
| --- | --- | --- |
| 运行时 | Node.js 24 LTS，浏览器目标为现代 Chromium、Safari 和 Firefox | 以 Vite 官方支持的 Node 版本为准；锁定 pnpm 和依赖版本 |
| 框架 | React 19 stable，函数组件和 Hooks | 开启 TypeScript strict；组件只接收已校验的类型 |
| 构建 | Vite 8，单入口 SPA | 不做 SSR；拆分路由和图表代码；生产构建在 CI 执行 |
| 样式 | Tailwind CSS 4 + CSS variables | 颜色、间距、圆角、阴影和焦点样式使用令牌，不在页面散落色值 |
| 组件 | 官方 shadcn/ui 项目内组件，底层使用可访问的 Radix primitives | `Dialog`、`Sheet`、`DropdownMenu`、`Tabs`、`Table`、`Toast` 和 `Command` 统一维护 |
| 服务端状态 | `@tanstack/react-query` | 查询键按资源和 UUID 组成；写操作成功后精确失效相关查询 |
| 客户端状态 | Zustand | 只保存身份摘要、导航、筛选草稿和显示偏好；不复制列表缓存 |
| 路由 | React Router | 受保护路由在入口检查会话；重要筛选和选中项使用 URL 查询参数 |
| 图表 | Apache ECharts 6 | 监控趋势优先使用 SVG；高密度数据才切换 Canvas；图表旁保留文本摘要 |
| 请求 | 原生 `fetch` 封装的 `API Client` | 统一超时、取消、重试、401 刷新、错误分类和响应 schema 校验 |
| 运行时校验 | Zod 或等价的轻量 schema 库 | 只在 API 入口校验一次；内部传递已确定类型的数据 |
| API 类型 | `openapi-typescript` 生成 Native DTO 类型 | 生成文件不手改；Native OpenAPI 变更后重新生成并检查破坏性变化 |
| 单元测试 | Vitest | 测试 API 编解码、状态机、权限显示和图表数据转换 |
| 浏览器验收 | Playwright + axe-core | Chromium 必跑；关键流程补 WebKit；使用真实窗口验收登录、导航、模态框和移动视图 |
| 包管理 | pnpm | `packageManager`、锁文件和 CI 使用相同版本；依赖升级单独提交 |

React 19.3 是当前 React 主版本；Vite 8 的官方文档要求 Node.js 20.19+ 或 22.12+，因此开发
基线选择 Node.js 24 LTS。Zustand 只负责轻量客户端状态，TanStack Query 负责服务端状态的缓存、
刷新和失效。Apache ECharts 支持 SVG/Canvas、响应式配置和无障碍描述，适合监控趋势而不需要自建绘图引擎。

## API 和安全边界

### Native API 适配

前端只暴露 `src/shared/api` 中的领域接口。页面不能直接拼接 URL 或读取原始响应。Native
API 的 `/api/v1` 前缀、UUID 字符串、分页结构、错误分类和 XLSX 响应由适配器统一转换。

当前前端已按 Native API 的实际约定实现以下入口：

1. Native 统一返回 `{ success, data, message, error }`。登录和刷新令牌位于 `data`，刷新请求
   发送 `refreshToken` 与 `clientId`。当前前端只在页面内存保存令牌，页面刷新后需要重新登录；
   如果 Native 后续提供安全 Cookie 会话，再由 API Client 单独适配。
2. 登录、刷新、退出、MFA 和权限错误使用稳定错误码、HTTP 状态和字段结构。
3. API 返回的 UUID 一律使用规范字符串，前端不按整数或排序值处理 UUID。
4. XLSX 上传只接受 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   和 `.xlsx` 文件名；下载响应明确设置文件名。
5. 运行监控通过 `/monitor/serverInfo`、`/monitor/cacheInfo` 和 `/monitor/onlineUsers` 组合
   读取。Native 未提供的 CPU、磁盘和网络指标使用 `null`，前端显示为不可用并将状态标为
   `PARTIAL`，不使用模拟数值冒充服务端指标。

前端的 `API Client` 只做入口校验、错误映射、超时和取消。权限和数据范围以 Native API
返回为准。前端隐藏按钮不能视为授权控制。

### 令牌处理

- access token 和 refresh token 只保存在当前页面内存中的 session store；Native 当前返回
  refresh token 响应字段，页面刷新后需要重新登录。
- 不把 refresh token、access token、密码、MFA secret 或 API Key 写入 localStorage、IndexedDB、URL 或日志。
- 同一时间只允许一个 refresh 请求；其他 401 请求等待同一个 refresh 结果。
- refresh 失败后清理内存状态，转到登录页，并保留用户可读的“会话已失效”原因。
- 退出时调用 Native API，随后清理 session store 和 Query cache。

## 页面和交互架构

### 路由分层

```text
/login
/dashboard
/monitor
/users
/roles
/departments
/posts
/menus
/configs
/dictionaries
/notices
/audit/login
/audit/operations
/jobs
/profile
```

每个资源页面默认进入查询列表。新增和编辑在 `Dialog` 中完成；危险操作使用确认对话框。
详情使用抽屉或详情页，不把查询、创建和编辑混在一个默认页面。

### 运行监控工作台

分析任务是“快速判断平台健康、定位异常、处理在线会话”。页面采用三层读取顺序：

1. 顶部状态栏显示 LIVE/stale/offline/partial、最后更新时间、刷新和数据来源。
2. 中央主视图显示 CPU 与主机内存的 30 分钟趋势，使用直接标签和阈值标注。
3. 右侧详情显示节点、BEAM、磁盘和 ETS 缓存；底部显示在线会话和强制下线操作。

桌面端保持左侧导航、中央证据区和右侧检查区的稳定宽度。移动端先显示健康摘要、主趋势和
核心指标；筛选、节点详情和会话详情放入 `Sheet`，打开时不移除趋势图。触摸目标最小 44px，
键盘路径使用可见焦点和 Escape 关闭面板。数据断线保留最后一次有效值，并同时显示状态和时间。

### 设计令牌

| 角色 | 默认用途 |
| --- | --- |
| slate | 页面背景、边界、次级文字 |
| indigo | 主导航、主操作、选中状态 |
| cyan | 趋势对比线和辅助信息 |
| amber | 阈值、延迟和需要关注的状态 |
| red | 仅严重故障和危险操作 |
| green | 在线、成功和健康状态 |

颜色之外同时使用文字、图标、边框和位置表达状态。图表不依赖 hover 才能读取主要值。

## 目录结构

```text
keystone-admin-web/
├── docs/
├── public/
├── src/
│   ├── app/                  # 应用启动、路由、Query、主题
│   ├── entities/             # 用户、角色、部门、任务、监控数据类型
│   ├── features/             # 登录、筛选、导入导出、强制下线等动作
│   ├── pages/                # 路由页面；页面只编排功能
│   ├── widgets/              # 管理壳、监控工作台、表格工具栏
│   └── shared/               # API、schema、UI、格式化、测试工具
├── e2e/
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
└── README.md
```

单个 TSX 文件控制在 600 行以内。超过 600 行时按页面、数据转换、表格和对话框职责拆分，
不通过关闭检查或自动生成大文件规避限制。

## 状态和 URL 约定

- URL 保存页面、筛选条件、分页、排序、时间范围和选中的稳定 UUID。
- 暂时的 hover、输入草稿、动画帧和打开中的提示不写入 URL。
- URL 状态优先于本地显示偏好；非法值回退到默认查询，不阻断页面加载。
- 页面刷新恢复查询状态，但不恢复认证令牌和敏感表单内容。
- Query 缓存按资源、筛选和 UUID 组成，监控快照设置短 stale 时间并保留 stale 数据。

## 性能和降级

- 默认页面最多一个主趋势图和三个轻量指标图；不在列表中为每一行创建 ECharts 实例。
- 监控采样按 5 秒到 30 秒窗口聚合，超过窗口时前端只保留可读的摘要点。
- 页面隐藏时暂停刷新和 SSE 消费；重新可见后先请求一次快照，再恢复流。
- 移动端使用 SVG 或低密度 Canvas，限制 device pixel ratio，减少动画和阴影。
- 网络慢时降低轮询频率，保留最后一次有效值；服务端错误显示错误码、重试和数据时间。
- 图表初始化失败时显示文本指标、表格和下载入口，不阻断管理操作。

## 验收计划

### 阶段 0：接口冻结

- 固定 Native OpenAPI、错误格式、分页、SSE、XLSX 和 refresh Cookie 约定。
- 记录每个页面的权限码、数据范围和允许的操作。
- 创建 API 类型生成脚本和破坏性变更检查。

### 阶段 1：基础壳和认证

- 创建 Vite + React + TypeScript 项目。
- 完成主题令牌、管理壳、登录、会话恢复、错误页和移动导航。
- 完成 Native API Client、响应校验和 refresh 单飞机制。

### 阶段 2：资源查询和模态框

- 按用户、角色、部门、岗位、菜单、配置、字典、公告、日志和任务分组实现查询页。
- 所有新增和修改使用 Dialog；导入导出使用 XLSX 文件流。
- 完成权限隐藏、后端拒绝反馈和空数据/加载/错误状态。

### 阶段 3：运行监控工作台

- 实现桌面三栏和移动 Sheet 方案。
- 接入 CPU、内存、BEAM、磁盘、ETS、网络状态和在线会话。
- 完成 stale/offline/partial、刷新、会话选择和强制下线。

### 阶段 4：验收和发布

- Vitest：API schema、令牌状态机、URL 状态、图表数据转换。
- Playwright：登录、会话恢复、资源查询、Dialog 新增/编辑、XLSX 上传下载、监控断线恢复。
- axe-core：登录、管理壳、Dialog、表格和移动 Sheet。
- macOS Chrome 真实窗口验收 `1440×900`、`390×844`；CI 使用 Chromium、WebKit 和 Firefox。
- GitHub Actions 构建静态资源和生产容器；本机不构建生产 Docker 镜像。

## 关键风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| Native API 返回结构变化 | 页面静默显示错误 | OpenAPI 生成类型、入口 schema 校验和 CI 破坏性检查 |
| refresh token 暴露给脚本 | 会话被窃取 | 采用 HttpOnly Cookie；access token 只在内存；禁止本地持久化 |
| 监控 SSE 断线 | 管理员误判为无数据 | 保留最后快照并显示 stale/offline/最后更新时间 |
| 移动端控件遮挡图表 | 无法完成监控操作 | 使用 Sheet，打开后保持主趋势可见或一键返回 |
| 图表实例过多 | 内存和电量上升 | 单页主图上限、聚合、暂停隐藏页面和文本降级 |
| 旧项目误混入 | 重新产生历史耦合 | 新目录、新 Git 历史、新依赖和新 API Client，不复制旧页面 |

## 参考资料

- [React 官方文档](https://react.dev/learn)
- [React 版本说明](https://react.dev/versions)
- [Vite 8 官方发布说明](https://github.com/vitejs/vite/blob/main/docs/blog/announcing-vite8.md)
- [Zustand 官方文档](https://zustand.docs.pmnd.rs/learn/getting-started/introduction.html)
- [TanStack Query React 官方文档](https://tanstack.com/query/latest/docs/framework/react/overview)
- [Apache ECharts 官方手册](https://echarts.apache.org/handbook/en/)
- [shadcn/ui 官方文档](https://ui.shadcn.com/docs)
- [Playwright 官方文档](https://playwright.dev/docs/intro)

## 当前状态

本文完成技术选型和架构边界。项目尚未创建应用代码。收到审阅意见后，再执行阶段 0 的接口
冻结和项目初始化；在此之前不迁移旧 `keystone-frontend` 文件。
