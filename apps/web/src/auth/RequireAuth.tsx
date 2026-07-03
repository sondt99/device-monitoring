import { Navigate, Outlet } from 'react-router-dom';
import { LoadingBlock } from '../components/index.js';
import { useMe } from './useMe.js';

export function RequireAuth() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <main className="login-shell loading-shell">
        <LoadingBlock />
      </main>
    );
  }
  if (me.error) return <Navigate to="/login" replace />;

  return <Outlet />;
}
