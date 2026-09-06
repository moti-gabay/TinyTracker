import { Outlet } from 'react-router'
import { StatusBanner } from '@/features/status/StatusBanner'
import { ToastHost } from '@/components/ui/Toast'
import { TabBar } from './TabBar'

export function AppShell() {
  return (
    // dvh, not vh: mobile browser chrome collapses and vh would overflow.
    <div className="flex h-dvh flex-col bg-bg">
      <StatusBanner />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
      <ToastHost />
    </div>
  )
}
