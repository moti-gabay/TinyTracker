import { NavLink } from 'react-router'
import { cn } from '@/components/ui/cn'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useT } from '@/lib/i18n'
import type { Key } from '@/lib/i18n/en'

const TABS: { to: string; label: Key; icon: IconName }[] = [
  { to: '/', label: 'tabs.nurse', icon: 'timer' },
  { to: '/bottle', label: 'tabs.bottle', icon: 'bottle' },
  { to: '/pump', label: 'tabs.pump', icon: 'pump' },
  { to: '/diaper', label: 'tabs.diaper', icon: 'diaper' },
  { to: '/history', label: 'tabs.history', icon: 'list' },
]

export function TabBar() {
  const t = useT()
  return (
    <nav
      className="flex shrink-0 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('tabs.main')}
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
          <span className="text-[0.7rem] font-medium">{t(tab.label)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
