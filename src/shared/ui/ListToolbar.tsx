import type { PropsWithChildren } from 'react'

/** 将列表操作放在筛选区之后，并在加载和错误状态下保留操作入口。 */
export function ListToolbar({ children, label = '列表操作' }: PropsWithChildren<{ label?: string }>) {
  return <div className="list-toolbar" role="group" aria-label={label}>{children}</div>
}
