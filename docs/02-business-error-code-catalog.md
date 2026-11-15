# Admin Web 业务错误码目录引用

更新日期：2026-11-16。

Admin Web 使用 Phoenix 主目录 `keystone-phoenix/docs/11-business-error-code-catalog.md`。Native 与 Phoenix 负责发布服务端业务错误码；Admin Web 只保存服务端代码集合、目录反查元数据和客户端本地代码，不执行最终认证或授权判断。

## 目录分层

| 集合 | 当前内容 | 用途 |
| --- | --- | --- |
| `SERVER_ERROR_CODES` | 主目录的 21 个服务端代码 | 校验服务端返回的稳定代码集合 |
| `BUSINESS_ERROR_CATALOG` | 21 个代码的默认状态、业务条件、提示键和安全标志 | 按代码反查业务条件和安全页面提示 |
| `CLIENT_ERROR_CODES` | `network_error`、`invalid_response`、`mfa_step_up_in_progress`、`mfa_step_up_cancelled` | 表示前端请求、响应解析或 MFA 状态机失败，不发布为服务端代码 |

`getBusinessErrorDefinition(code)` 是前端的反查入口。`ApiError` 原样保留服务端的 HTTP 状态、错误码、请求标识和诊断字段；页面可以根据反查结果生成安全提示，但不能把默认状态改成另一个状态。

## 兼容范围

- 当前服务端凭据代码是单数 `invalid_credential`。旧后端或旧 MFA 流程可能仍出现 `invalid_credentials`（复数）；该字符串只能留在兼容判断和旧提示映射中，不得加入 `SERVER_ERROR_CODES`，也不得由新接口发布。
- `authorization_unavailable` 是后端旧边界的 `503` 兼容代码。前端保留其提示和默认元数据，但不能把所有 `503` 都归为该代码。
- `mfa_state_conflict`、`https_required` 和 `mfa_invalid_code` 属于服务端目录。它们不是 `CLIENT_ERROR_CODES`，页面不得把它们降级为网络错误。

## 静态检查

从三个仓库的父目录运行：

```sh
python3 keystone-phoenix/scripts/check_error_code_catalog.py \
  --native-root keystone-native \
  --admin-root keystone-admin-web
```

脚本只解析 `errors.ts`、两个后端目录和主目录表格。它检查 `SERVER_ERROR_CODES`、`BUSINESS_ERROR_CATALOG`、可读提示映射和客户端本地集合没有交叉污染。通过后仍需分别执行 `pnpm test:run`、类型检查、构建和真实浏览器验收。
