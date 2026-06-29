import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireConnection } from '@/components/layout/RequireConnection'
import { Screen0Connect } from '@/screens/Screen0Connect'
import { Screen1Initiate } from '@/screens/Screen1Initiate'
import { Screen2Monitor } from '@/screens/Screen2Monitor'
import { Screen3Dispute } from '@/screens/Screen3Dispute'
import { Screen4Dashboard } from '@/screens/Screen4Dashboard'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Screen0Connect /> },
      {
        path: '/initiate',
        element: (
          <RequireConnection>
            <Screen1Initiate />
          </RequireConnection>
        ),
      },
      {
        path: '/monitor',
        element: (
          <RequireConnection>
            <Screen2Monitor />
          </RequireConnection>
        ),
      },
      {
        path: '/dispute',
        element: (
          <RequireConnection>
            <Screen3Dispute />
          </RequireConnection>
        ),
      },
      {
        path: '/dashboard',
        element: (
          <RequireConnection>
            <Screen4Dashboard />
          </RequireConnection>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
