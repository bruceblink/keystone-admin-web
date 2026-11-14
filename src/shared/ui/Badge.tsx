import type { PropsWithChildren } from 'react'

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function Badge({ tone = 'neutral', children }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
