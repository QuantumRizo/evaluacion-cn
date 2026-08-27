import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';

import LoginPage from './pages/LoginPage';
import EvaluationsPage from './pages/EvaluationsPage';
import EvaluationFormPage from './pages/EvaluationFormPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminReportPage from './pages/admin/AdminReportPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function RootRedirect() {
  const { user, employee, isLoading, isAdmin } = useAuth();
  if (isLoading) return <LoadingSpinner fullPage />;
  if (!user || !employee) return <Navigate to="/login" replace />;
  // Admins land on /admin but can also visit /evaluaciones
  return <Navigate to={isAdmin ? '/admin' : '/evaluaciones'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />

      {/* Employee routes - also accessible by admins */}
      <Route
        path="/evaluaciones"
        element={
          <ProtectedRoute>
            <EvaluationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/evaluar/:cycleId/:evaluatedId"
        element={
          <ProtectedRoute>
            <EvaluationFormPage />
          </ProtectedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reporte/:cycleId/:employeeId"
        element={
          <ProtectedRoute requireAdmin>
            <AdminReportPage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
