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

/** Native step-up challenge；只保存当前会话绑定的短期验证请求元数据。 */
export const nativeMfaStepUpChallengeSchema = z.object({
  challengeId: z.string().min(1),
  clientId: z.string().min(1),
  expiresAt: z.string().min(1),
})

/** Native 登录二次认证请求；挑战只绑定短时登录验证状态。 */
export const nativeMfaLoginChallengeSchema = nativeMfaStepUpChallengeSchema

/** Native step-up 只返回短时 AAL2 access token，不返回 refresh token。 */
export const nativeMfaStepUpResultSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  authenticationLevel: z.literal('AAL2'),
  amr: z.enum(['otp', 'recovery']),
})

export const apiEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  message: z.string(),
  error: z.object({
    code: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    retryAfterSeconds: z.number().nonnegative().optional(),
  }).nullable().optional(),
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

/** 当前用户资料；密码和认证密钥永远不在资料响应中返回。 */
export const nativeProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  mustChangePassword: z.boolean(),
  deptId: z.string().nullable(),
  postId: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  sex: z.number().int().nullable(),
  avatar: z.string().nullable(),
  loginIp: z.string().nullable(),
  loginAt: z.string().nullable(),
  remark: z.string().nullable(),
})

export const nativeUsersPageSchema = z.object({
  items: z.array(nativeUserSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** Native 用户 XLSX 导入结果；失败行只包含行号、用户名和脱敏原因。 */
export const nativeUserImportFailureSchema = z.object({
  row: z.number().int().positive(),
  username: z.string(),
  reason: z.string(),
})

export const nativeUserImportResultSchema = z.object({
  total: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  failed: z.array(nativeUserImportFailureSchema),
})

/** Native 批量删除响应；删除数量用于页面刷新后的结果提示。 */
export const nativeBatchDeleteResultSchema = z.object({
  deleted: z.number().int().nonnegative(),
})

export const nativeDeleteResultSchema = z.object({ deleted: z.boolean() })
export const nativeApiKeyRevokeResultSchema = z.object({ revoked: z.boolean() })
/** 菜单角色绑定查询和替换使用统一的角色编码列表。 */
export const nativeMenuRoleAssignmentSchema = z.object({ roleCodes: z.array(z.string()) })
export const nativeUpdatedResultSchema = z.object({ updated: z.boolean() })

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
/** Native 角色分页响应；items 只包含当前页数据，total 表示筛选后的总数量。 */
export const nativeRolesPageSchema = z.object({
  items: z.array(nativeRoleSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})
/** Native 角色成员接口返回用户 ID 数组；分配和移除使用相同的 ID 集合。 */
export const nativeRoleUserIdsSchema = z.array(z.string())
/** 成员身份只包含角色分配页面需要展示的字段；旧服务可以继续返回 ID。 */
export const nativeRoleMemberSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
})
export const nativeRoleMembersResponseSchema = z.array(z.union([nativeRoleMemberSchema, z.string()]))
export const nativeDepartmentsSchema = z.array(nativeDepartmentSchema)

/** Native 岗位记录；岗位编码用于业务引用，排序和状态由管理页面维护。 */
export const nativePostSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
})

export const nativePostsSchema = z.array(nativePostSchema)
export const nativePostsPageSchema = z.object({
  items: z.array(nativePostSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

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
/** API Key 列表分页响应；items 仅包含脱敏元数据。 */
export const nativeApiKeysPageSchema = z.object({
  items: z.array(nativeApiKeySchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** API Key 可用权限目录；allowed 表示当前登录主体可以签发该范围。 */
export const nativePermissionCatalogEntrySchema = z.object({
  permission: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
  risk: z.string(),
  registered: z.boolean(),
  allowed: z.boolean(),
})
export const nativePermissionCatalogSchema = z.object({ entries: z.array(nativePermissionCatalogEntrySchema) })
export type NativePermissionCatalogEntry = z.infer<typeof nativePermissionCatalogEntrySchema>

/** API Key 签发或轮换返回值；apiKey 只允许在签发响应中存在一次。 */
export const nativeIssuedApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string(),
  apiKey: z.string().min(1),
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable(),
})

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
export const nativeSystemConfigsPageSchema = z.object({
  items: z.array(nativeSystemConfigSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})
export const nativeDictionaryTypesSchema = z.array(nativeDictionaryTypeSchema)
export const nativeDictionaryItemsSchema = z.array(nativeDictionaryItemSchema)
export const nativeDictionaryItemsPageSchema = z.object({
  items: z.array(nativeDictionaryItemSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})
export const nativeNoticesSchema = z.array(nativeNoticeSchema)

/** 用户自己的站内通知；公告管理使用独立的数据模型。 */
export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})
export const notificationsSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
})
export const nativeNoticesPageSchema = z.object({
  items: z.array(nativeNoticeSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

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

/** Native 计划任务分页响应；旧数组响应由客户端适配器转换为此结构。 */
export const nativeJobsPageSchema = z.object({
  items: z.array(nativeJobSchema),
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})

/** Native 任务手动执行响应；只确认请求已提交，不把执行日志混入写操作响应。 */
export const nativeJobTriggerResultSchema = z.object({
  triggered: z.boolean(),
})

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
export type NativeMfaStepUpChallenge = z.infer<typeof nativeMfaStepUpChallengeSchema>
export type NativeMfaLoginChallenge = z.infer<typeof nativeMfaLoginChallengeSchema>
export type NativeMfaStepUpResult = z.infer<typeof nativeMfaStepUpResultSchema>
export type NativeUser = z.infer<typeof nativeUserSchema>
export type NativeProfile = z.infer<typeof nativeProfileSchema>
export type NativeUsersPage = z.infer<typeof nativeUsersPageSchema>
export type NativeUserImportFailure = z.infer<typeof nativeUserImportFailureSchema>
export type NativeUserImportResult = z.infer<typeof nativeUserImportResultSchema>
export type NativeBatchDeleteResult = z.infer<typeof nativeBatchDeleteResultSchema>
export type NativeApiKeyRevokeResult = z.infer<typeof nativeApiKeyRevokeResultSchema>
export type NativeDeleteResult = z.infer<typeof nativeDeleteResultSchema>
export type NativeMenuRoleAssignment = z.infer<typeof nativeMenuRoleAssignmentSchema>
export type NativeUpdatedResult = z.infer<typeof nativeUpdatedResultSchema>
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

export type NativeProfileWriteInput = {
  displayName: string
  email?: string | null
  phoneNumber?: string | null
  sex?: number | null
  avatar?: string | null
}
export type NativeRoleWriteInput = { code?: string; name: string; enabled?: boolean }
export type NativeDepartmentWriteInput = { code: string; name: string; parentId?: string | null; sortOrder?: number; enabled?: boolean }
export type NativeSystemConfigWriteInput = { key?: string; value: string; description?: string | null; enabled?: boolean }
export type NativeDictionaryTypeWriteInput = { code?: string; name: string; enabled?: boolean }
export type NativeDictionaryItemWriteInput = { value?: string; label: string; sortOrder?: number; enabled?: boolean }
export type NativeNoticeWriteInput = { title: string; content: string; noticeType: string; enabled?: boolean }
export type NativeRole = z.infer<typeof nativeRoleSchema>
export type NativeRolesPage = z.infer<typeof nativeRolesPageSchema>
export type NativeRoleUserIds = z.infer<typeof nativeRoleUserIdsSchema>
export type NativeRoleMember = z.infer<typeof nativeRoleMemberSchema>
export type NativeDepartment = z.infer<typeof nativeDepartmentSchema>
export type NativePost = z.infer<typeof nativePostSchema>
export type NativePostsPage = z.infer<typeof nativePostsPageSchema>
export type NativePostWriteInput = { code?: string; name: string; sortOrder?: number; enabled?: boolean }
export type NativeOperationLog = z.infer<typeof nativeOperationLogSchema>
export type NativeOperationLogsPage = z.infer<typeof nativeOperationLogsPageSchema>
export type NativeLoginLog = z.infer<typeof nativeLoginLogSchema>
export type NativeLoginLogsPage = z.infer<typeof nativeLoginLogsPageSchema>
export type NativeJob = z.infer<typeof nativeJobSchema>
export type NativeJobsPage = z.infer<typeof nativeJobsPageSchema>
export type NativeJobWriteInput = {
  code?: string
  name: string
  group?: string
  invokeTarget: string
  jobParams?: string | null
  cron: string
  concurrent?: boolean
  enabled?: boolean
  remark?: string | null
}
export type NativeJobTriggerResult = z.infer<typeof nativeJobTriggerResultSchema>
export type NativeJobLog = z.infer<typeof nativeJobLogSchema>
export type NativeJobLogsPage = z.infer<typeof nativeJobLogsPageSchema>
export type NativeApiKey = z.infer<typeof nativeApiKeySchema>
export type NativeApiKeysPage = z.infer<typeof nativeApiKeysPageSchema>
export type NativeIssuedApiKey = z.infer<typeof nativeIssuedApiKeySchema>
export type NativeSystemConfig = z.infer<typeof nativeSystemConfigSchema>
export type NativeSystemConfigsPage = z.infer<typeof nativeSystemConfigsPageSchema>
export type NativeDictionaryType = z.infer<typeof nativeDictionaryTypeSchema>
export type NativeDictionaryItem = z.infer<typeof nativeDictionaryItemSchema>
export type NativeDictionaryItemsPage = z.infer<typeof nativeDictionaryItemsPageSchema>
export type NativeNotice = z.infer<typeof nativeNoticeSchema>
export type Notification = z.infer<typeof notificationSchema>
export type Notifications = z.infer<typeof notificationsSchema>
export type NativeNoticesPage = z.infer<typeof nativeNoticesPageSchema>
