import { NavLink } from 'react-router'
import { cn } from '@/components/ui/cn'
import { Icon, type IconName } from '@/components/ui/Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Nurse', icon: 'timer' },
  { to: '/bottle', label: 'Bottle', icon: 'bottle' },
  { to: '/pump', label: 'Pump', icon: 'pump' },
  { to: '/diaper', label: 'Diaper', icon: 'diaper' },
  { to: '/history', label: 'History', icon: 'list' },
]

export function TabBar() {
  return (
    <nav
      className="flex shrink-0 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2',
              isActive ? 'text-accent' : 'text-text-muted',
            )
          }
        >
          <Icon name={tab.icon} size={22} />
          <span className="text-[0.7rem] font-medium">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
