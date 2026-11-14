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
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: z.string(),
})

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
})

export const monitorSnapshotSchema = z.object({
  status: z.enum(['LIVE', 'STALE', 'OFFLINE', 'PARTIAL']),
  capturedAt: z.string(),
  source: z.string(),
  node: z.string(),
  cpu: z.number(),
  memory: z.number(),
  beam: z.object({
    processes: z.number(),
    reductions: z.number(),
    runQueue: z.number(),
  }),
  disk: z.object({
    used: z.number(),
    total: z.number(),
  }),
  network: z.object({
    inbound: z.number(),
    outbound: z.number(),
  }),
  ets: z.object({
    tables: z.number(),
    entries: z.number(),
    memory: z.number(),
  }),
  sessions: z.array(sessionSchema),
  trend: z.array(z.object({ timestamp: z.string(), cpu: z.number(), memory: z.number() })),
})

export type User = z.infer<typeof userSchema>
