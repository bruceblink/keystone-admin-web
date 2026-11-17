# 列表操作约定

本文只记录列表工具栏的跨页面约定。视觉规范见 [DESIGN.md](DESIGN.md)，业务接口和权限以项目 [README](README.md) 及后端实现为准。

| 能力 | 实现位置 | 行为 |
| --- | --- | --- |
| 列表操作 | `src/shared/ui/ListToolbar.tsx`、`src/shared/ui/Button.tsx` | 位于查询条件之后、所属列表卡片的标题之前；操作按新增、导入、导出、删除、刷新排序，缺失项跳过。 |
| 查询和分页 | 各页面表单、`src/shared/navigation/useUrlQueryState.ts` | 保留页面已有筛选、分页和 URL 状态；工具栏迁移不改变查询提交行为。 |
| 删除确认 | `src/shared/ui/DeleteConfirmModal.tsx` | 沿用页面已有的确认、禁用和失败处理。 |
| 加载与错误 | `Spinner`、`InitialQueryError`、`StaleQueryError` | 初次加载和错误时，列表操作入口仍然存在；读取失败保留重试方式。 |
| 窄屏表格 | `src/styles.css` 的表格容器 | 表格在容器内横向滚动；工具栏按钮按完整按钮换行。 |

列表布局的验收至少包括：正常结果、首次读取失败、按钮的禁用状态、桌面和窄屏显示，以及取消操作不提交写请求。业务动作的完整验收仍按各页面和后端分别执行。
