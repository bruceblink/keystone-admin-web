---
version: alpha
name: "Keystone Admin"
description: "面向平台管理人员的深色管理界面。"
colors:
  background: "#08111f"
  surface: "#0e1a2b"
  raised: "#132238"
  text: "#e7eef9"
  primary: "#8797ff"
  accent: "#55d6e8"
  danger: "#fb7c8e"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
rounded:
  DEFAULT: "14px"
components:
  button: {}
  card: {}
  dialog: {}
---

# Keystone Admin 界面设计

## 产品和依据

管理人员使用本界面查询和维护平台数据。界面以中文为主，保留 API、UUID 等固定名称。操作需要在桌面和窄屏下可见，并保持清晰的危险操作提示。

颜色、字体和圆角由 [src/styles.css](src/styles.css) 中的运行时样式决定；本文件记录当前设计意图，不生成样式。原有深色底色、分层卡片、青色焦点和紫色主按钮继续使用。

## 列表布局

页面依次显示页面标题、查询条件、列表操作、列表标题和数据。查询与重置留在查询表单内。新增、导入、导出、删除、刷新按可用操作顺序排列。列表操作在首次加载和读取失败时仍可访问；具体操作继续遵循页面已有的权限、禁用和确认逻辑。

列表操作使用 [ListToolbar](src/shared/ui/ListToolbar.tsx) 和 [Button](src/shared/ui/Button.tsx)。操作区与对应列表位于同一张卡片，并放在列表标题上方。按钮高度、图标间距和文本方向一致。空间不足时整颗按钮换行；表格在自身容器内横向滚动，不扩大页面宽度。字典类型和条目保留各自的操作区。

## 状态和交互

主要操作使用紫色按钮，常规操作使用次级按钮，删除使用危险色。禁用状态必须与实际可执行状态一致；焦点使用现有青色轮廓。加载、空结果和错误继续使用页面的共享状态组件，不因布局调整而隐藏重试入口。
