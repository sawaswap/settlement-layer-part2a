import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { NetworkMismatchOverlay } from './NetworkMismatchOverlay'

/**
 * Single mounted application shell (Agreement C.5 SPA constraint). The header
 * and the network overlay live here, above the routed Outlet, so wallet
 * connection state and contract event listeners persist across screen
 * transitions — no full page reloads.
 */
export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <NetworkMismatchOverlay />
    </div>
  )
}
