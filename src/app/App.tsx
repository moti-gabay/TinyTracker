import { RouterProvider } from 'react-router'
import { SyncProvider } from '@/lib/sync/SyncProvider'
import { router } from './router'

export function App() {
  return (
    <>
      <SyncProvider />
      <RouterProvider router={router} />
    </>
  )
}
