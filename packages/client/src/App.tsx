import { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import AppPage from './components/AppPage'
import './App.css'

// Props interface for ProtectedRoute component
interface ProtectedRouteProps {
  children: ReactNode
}

// Protected route component with TypeScript
export const ProtectedRoute = ({ children }: ProtectedRouteProps): React.JSX.Element => {
  const { user, loading } = useAuth()

  console.log('PROTECTED_ROUTE:', { user: !!user, loading, userEmail: user?.email });

  // Show loading spinner while authentication is being verified
  if (loading) {
    console.log('PROTECTED_ROUTE: Showing loading spinner');
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    )
  }

  // Redirect to login if user is not authenticated
  if (!user) {
    console.log('PROTECTED_ROUTE: No user, redirecting to /login');
    return <Navigate to="/login" replace />
  }

  console.log('PROTECTED_ROUTE: User authenticated, rendering children');
  return <>{children}</>
}

// Main App content component (contains Routes)
function AppContent(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

// Root App component (without Router)
export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
} 