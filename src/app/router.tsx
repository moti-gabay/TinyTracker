import { createBrowserRouter } from 'react-router'
import { AppShell } from './AppShell'
import { HomeScreen } from '@/features/nursing/HomeScreen'
import { BottleScreen } from '@/features/bottle/BottleScreen'
import { PumpScreen } from '@/features/pump/PumpScreen'
import { DiaperScreen } from '@/features/diaper/DiaperScreen'
import { HistoryScreen } from '@/features/history/HistoryScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'bottle', element: <BottleScreen /> },
      { path: 'pump', element: <PumpScreen /> },
      { path: 'diaper', element: <DiaperScreen /> },
      { path: 'history', element: <HistoryScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <HomeScreen /> },
    ],
  },
])
