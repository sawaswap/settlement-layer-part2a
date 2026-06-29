import type { PropsWithChildren } from 'react'

/** Shared scaffold for screens still under construction in the M1 plan. */
export function ScreenPlaceholder({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        {children}
      </div>
    </div>
  )
}
