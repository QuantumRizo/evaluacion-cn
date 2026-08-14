import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, employee, isLoading, isAdmin } = useAuth();

  if (isLoading) return <LoadingSpinner fullPage />;

  if (!user || !employee || employee.is_active === false) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/evaluaciones" replace />;
  }

  return <>{children}</>;
}
