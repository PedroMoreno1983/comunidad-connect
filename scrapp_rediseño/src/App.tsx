import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { Toaster } from 'react-hot-toast';

// Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardLayout from './layouts/DashboardLayout';
import SenalVivoPage from './pages/dashboard/SenalVivoPage';

// Shared Pages (Admin y User)
import DashboardPage from './pages/dashboard/DashboardPage';
import UserDashboardPage from './pages/dashboard/UserDashboardPage';
import BrandsPage from './pages/dashboard/BrandsPage';
import SourcesPage from './pages/dashboard/SourcesPage';
import MentionsPage from './pages/dashboard/MentionsPage';
import AccountPage from './pages/dashboard/AccountPage';
import AlertsCenter from './pages/dashboard/AlertsCenter';
import ReportsPage from './pages/dashboard/ReportsPage';
import AIAnalysisPage from './pages/dashboard/AIAnalysisPage';
import ErrorBoundary from './components/ErrorBoundary';
// Admin Only Pages
import LiveTranscriptMonitor from './pages/dashboard/LiveTranscriptMonitor';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
 
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Dashboard Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard principal según rol */}
            <Route 
              index 
              element={
                <ErrorBoundary>
                  {isAdmin ? <DashboardPage /> : <UserDashboardPage />}
                </ErrorBoundary>
              } 
            />
            
            {/* Rutas compartidas (filtradas por backend) */}
            <Route path="brands" element={<BrandsPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="mentions" element={<MentionsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="ai-analysis" element={<AIAnalysisPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="alerts" element={<AlertsCenter />} /> 
            <Route path="live-transcripts" element={<LiveTranscriptMonitor />} />
            <Route path="senal-vivo" element={<SenalVivoPage />} />
            
            {/* Rutas solo para ADMIN */}
            {isAdmin && (
              <>
                {/* Agregar rutas admin si las hay */}
              </>
            )}
          </Route>

          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;