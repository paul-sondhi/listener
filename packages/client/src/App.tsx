import { ReactNode, memo, useRef, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import AppPage from './components/AppPage'
import PrivacyPolicy from './components/PrivacyPolicy'
import './App.css'

// Props interface for ProtectedRoute component
interface ProtectedRouteProps {
  children: ReactNode
}

// Protected route component with TypeScript - optimized to reduce re-renders
export const ProtectedRoute = memo(({ children }: ProtectedRouteProps): React.JSX.Element => {
  const { user, loading } = useAuth()
  
  // Use refs to track previous values and only log on changes
  const prevState = useRef({ user: !!user, loading, userEmail: user?.email })
  
  useEffect(() => {
    const currentState = { user: !!user, loading, userEmail: user?.email }
    
    // Only log if the state actually changed
    if (
      prevState.current.user !== currentState.user ||
      prevState.current.loading !== currentState.loading ||
      prevState.current.userEmail !== currentState.userEmail
    ) {
      // eslint-disable-next-line no-console
      console.log('PROTECTED_ROUTE:', currentState);
      prevState.current = currentState
    }
  }, [user, loading])

  // Show loading spinner while authentication is being verified
  if (loading) {
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    )
  }

  // Redirect to login if user is not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
})

// Main App content component (contains Routes)
function AppContent(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
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