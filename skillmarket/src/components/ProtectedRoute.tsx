import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/useApp';
import { Spinner } from './ui';

export default function ProtectedRoute() {
  const { user, ready } = useApp();
  const location = useLocation();
  if (!ready) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}
