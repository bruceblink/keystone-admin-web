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
