import { Outlet } from 'react-router-dom';
import { EmptyState } from '../components/index.js';
import { useMe } from './useMe.js';

export function RequireAdmin() {
  const me = useMe();

  if (!me.isAdmin) {
    return (
      <section className="card">
        <EmptyState title="Admins only" description="Your account has viewer access, which can't manage this page." />
      </section>
    );
  }

  return <Outlet />;
}
