import { z } from 'zod'

const sessionSchema = z.object({
  id: z.string(),
  user: z.string(),
  role: z.string(),
  ip: z.string(),
  lastSeen: z.string(),
  currentPage: z.string(),
})

export const userSchema = z.object({
  // Native 登录令牌不返回用户主键；管理页面当前只需要展示身份信息。
  id: z.string().default(''),
  username: z.string(),
  displayName: z.string(),
  role: z.string(),
})

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
})

export const nativeTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
  refreshExpiresIn: z.number(),
  username: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  sessionId: z.string(),
  clientId: z.string(),
})

export const apiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  message: z.string(),
  error: z.object({ code: z.string() }).nullable().optional(),
})

export const nativeServerInfoSchema = z.object({
  javaVersion: z.string(),
  jvmName: z.string(),
  osName: z.string(),
  osVersion: z.string(),
  processors: z.number(),
  maxMemory: z.number(),
  totalMemory: z.number(),
  freeMemory: z.number(),
  heapUsed: z.number(),
  uptimeMs: z.number(),
})

export const nativeCacheInfoSchema = z.object({
  provider: z.string(),
  activeSessions: z.number(),
  loginLogEntries: z.number(),
})

export const nativeOnlineSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  ipAddress: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  accessExpiresAt: z.string(),
})

export const nativeOnlineUsersSchema = z.object({
  items: z.array(nativeOnlineSessionSchema),
  page: z.number(),
  size: z.number(),
  total: z.number(),
})

/** Native 用户管理接口返回的公开字段；凭据和权限版本不会从此接口返回。 */
export const nativeUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  deptId: z.string().nullable(),
  postId: z.string().nullable(),
  enabled: z.boolean(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  sex: z.number().int().nullable(),
  avatar: z.string().nullable(),
  loginIp: z.string().nullable(),
  loginAt: z.string().nullable(),
  remark: z.string().nullable(),
  roles: z.array(z.string()),
})

export const nativeUsersPageSchema = z.object({
  items: z.array(nativeUserSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** Native 角色查询接口返回的权限摘要；写操作使用独立的 MFA 保护入口。 */
export const nativeRoleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  dataScope: z.string(),
  deptScope: z.string().nullable(),
  permissions: z.array(z.string()),
})

/** Native 组织结构节点；parentId 为空表示根部门。 */
export const nativeDepartmentSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
})

export const nativeRolesSchema = z.array(nativeRoleSchema)
export const nativeDepartmentsSchema = z.array(nativeDepartmentSchema)

/** Native 菜单树节点；菜单详情和子节点保持原始层级，页面只读展示。 */
export const nativeMenuSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  path: z.string().nullable(),
  component: z.string().nullable(),
  menuType: z.string(),
  permission: z.string().nullable(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
})

export type NativeMenu = z.infer<typeof nativeMenuSchema>

export interface NativeMenuNode {
  menu: NativeMenu
  children: NativeMenuNode[]
}

export const nativeMenuNodeSchema: z.ZodType<NativeMenuNode> = z.lazy(() => z.object({
  menu: nativeMenuSchema,
  children: z.array(nativeMenuNodeSchema),
}))

export const nativeMenusSchema = z.array(nativeMenuNodeSchema)

/** 菜单写入字段；后端会按权限和数据范围再次核验。 */
export type NativeMenuWriteInput = {
  parentId?: string | null
  code: string
  name: string
  path?: string | null
  component?: string | null
  menuType: string
  permission?: string | null
  sortOrder?: number
  enabled?: boolean
}

/** Native API Key 列表只返回脱敏元数据，永远不接受明文 apiKey 字段。 */
export const nativeApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const nativeApiKeysSchema = z.array(nativeApiKeySchema)

/** API Key 签发或轮换返回值；apiKey 只允许在签发响应中存在一次。 */
export const nativeIssuedApiKeySchema = nativeApiKeySchema.extend({ apiKey: z.string().min(1) })

/** Native 系统配置记录；敏感配置的值仍由后端按权限返回。 */
export const nativeSystemConfigSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  value: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  updatedAt: z.string().nullable(),
})

/** Native 字典类型和字典项；条目通过类型编码单独查询。 */
export const nativeDictionaryTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  enabled: z.boolean(),
})

export const nativeDictionaryItemSchema = z.object({
  id: z.string().uuid(),
  typeCode: z.string(),
  value: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
})

/** Native 管理公告；内容仅用于只读详情摘要。 */
export const nativeNoticeSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  noticeType: z.string(),
  published: z.boolean(),
  enabled: z.boolean(),
  publishAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().nullable(),
})

export const nativeSystemConfigsSchema = z.array(nativeSystemConfigSchema)
export const nativeDictionaryTypesSchema = z.array(nativeDictionaryTypeSchema)
export const nativeDictionaryItemsSchema = z.array(nativeDictionaryItemSchema)
export const nativeNoticesSchema = z.array(nativeNoticeSchema)

/** Native 操作审计记录；详情字段只用于查询展示，不在前端执行解析或写入。 */
export const nativeOperationLogSchema = z.object({
  id: z.string().uuid(),
  actorUsername: z.string(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  detail: z.string().nullable(),
  createdAt: z.string().nullable(),
})

export const nativeOperationLogsPageSchema = z.object({
  items: z.array(nativeOperationLogSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** Native 登录日志记录；消息只用于审计展示，前端不执行任何解析。 */
export const nativeLoginLogSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  status: z.string(),
  ipAddress: z.string().nullable(),
  message: z.string().nullable(),
  userAgent: z.string().nullable(),
  loginAt: z.string().nullable(),
})

export const nativeLoginLogsPageSchema = z.object({
  items: z.array(nativeLoginLogSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** Native 计划任务查询记录；执行和删除由独立写操作流程负责。 */
export const nativeJobSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  group: z.string(),
  invokeTarget: z.string(),
  jobParams: z.string().nullable(),
  cron: z.string(),
  concurrent: z.boolean(),
  enabled: z.boolean(),
  remark: z.string().nullable(),
  lastStatus: z.string().nullable(),
  lastRunAt: z.string().nullable(),
})

export const nativeJobsSchema = z.array(nativeJobSchema)

/** Native 任务执行日志分页记录。异常详情只读展示，不在前端执行。 */
export const nativeJobLogSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  jobCode: z.string(),
  jobName: z.string(),
  jobGroup: z.string(),
  invokeTarget: z.string(),
  jobParams: z.string().nullable(),
  cron: z.string(),
  triggerType: z.number().int(),
  status: z.number().int(),
  jobMessage: z.string().nullable(),
  exceptionInfo: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string().nullable(),
})

export const nativeJobLogsPageSchema = z.object({
  items: z.array(nativeJobLogSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

export const monitorSnapshotSchema = z.object({
  status: z.enum(['LIVE', 'STALE', 'OFFLINE', 'PARTIAL']),
  capturedAt: z.string(),
  source: z.string(),
  node: z.string(),
  cpu: z.number().nullable(),
  memory: z.number().nullable(),
  beam: z.object({
    processes: z.number().nullable(),
    reductions: z.number().nullable(),
    runQueue: z.number().nullable(),
  }),
  disk: z.object({
    used: z.number().nullable(),
    total: z.number().nullable(),
  }),
  network: z.object({
    inbound: z.number().nullable(),
    outbound: z.number().nullable(),
  }),
  ets: z.object({
    tables: z.number().nullable(),
    entries: z.number().nullable(),
    memory: z.number().nullable(),
  }),
  sessions: z.array(sessionSchema),
  trend: z.array(z.object({ timestamp: z.string(), cpu: z.number().nullable(), memory: z.number() })),
})

export type User = z.infer<typeof userSchema>
export type NativeUser = z.infer<typeof nativeUserSchema>
export type NativeUsersPage = z.infer<typeof nativeUsersPageSchema>
export type NativeUserWriteInput = {
  username?: string
  password?: string
  displayName: string
  deptId?: string | null
  postId?: string | null
  email?: string | null
  phoneNumber?: string | null
  sex?: number | null
  avatar?: string | null
  remark?: string | null
  enabled?: boolean
  clearDept?: boolean
  roleCodes?: string[] | null
}
export type NativeRoleWriteInput = { code?: string; name: string; enabled?: boolean }
export type NativeDepartmentWriteInput = { code: string; name: string; parentId?: string | null; sortOrder?: number; enabled?: boolean }
export type NativeSystemConfigWriteInput = { key?: string; value: string; description?: string | null; enabled?: boolean }
export type NativeDictionaryTypeWriteInput = { code?: string; name: string; enabled?: boolean }
export type NativeDictionaryItemWriteInput = { value?: string; label: string; sortOrder?: number; enabled?: boolean }
export type NativeNoticeWriteInput = { title: string; content: string; noticeType: string; enabled?: boolean }
export type NativeRole = z.infer<typeof nativeRoleSchema>
export type NativeDepartment = z.infer<typeof nativeDepartmentSchema>
export type NativeOperationLog = z.infer<typeof nativeOperationLogSchema>
export type NativeOperationLogsPage = z.infer<typeof nativeOperationLogsPageSchema>
export type NativeLoginLog = z.infer<typeof nativeLoginLogSchema>
export type NativeLoginLogsPage = z.infer<typeof nativeLoginLogsPageSchema>
export type NativeJob = z.infer<typeof nativeJobSchema>
export type NativeJobLog = z.infer<typeof nativeJobLogSchema>
export type NativeJobLogsPage = z.infer<typeof nativeJobLogsPageSchema>
export type NativeApiKey = z.infer<typeof nativeApiKeySchema>
export type NativeIssuedApiKey = z.infer<typeof nativeIssuedApiKeySchema>
export type NativeSystemConfig = z.infer<typeof nativeSystemConfigSchema>
export type NativeDictionaryType = z.infer<typeof nativeDictionaryTypeSchema>
export type NativeDictionaryItem = z.infer<typeof nativeDictionaryItemSchema>
export type NativeNotice = z.infer<typeof nativeNoticeSchema>
