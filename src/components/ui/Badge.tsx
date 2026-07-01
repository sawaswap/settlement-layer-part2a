import type { PropsWithChildren } from 'react'

type BadgeProps = PropsWithChildren<{
  /** A tailwind background colour utility, e.g. 'bg-state-active'. */
  className?: string
  title?: string
}>

/** Small pill used for state and role indicators. */
export function Badge({ children, className = 'bg-slate-200 text-slate-800', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  )
}
