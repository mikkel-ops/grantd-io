import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { Toaster } from '@/components/ui/toaster'

// Pages
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import DashboardPage from '@/pages/DashboardPage'
import ConnectionsPage from '@/pages/ConnectionsPage'
import RolesPage from '@/pages/RolesPage'
import UsersPage from '@/pages/UsersPage'
import ChangesetsPage from '@/pages/ChangesetsPage'
import SettingsPage from '@/pages/SettingsPage'

// Layout
import DashboardLayout from '@/components/dashboard/DashboardLayout'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="changesets" element={<ChangesetsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
