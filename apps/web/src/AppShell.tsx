import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMe } from './auth/useMe.js';
import { useLiveTitle } from './lib/useLiveTitle.js';
import { useTheme } from './lib/useTheme.js';
import { api } from './api.js';

export function AppShell() {
  const { user, isAdmin } = useMe();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  });
  const summary = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 10_000 });
  useLiveTitle((summary.data?.down ?? 0) + (summary.data?.degraded ?? 0));

  const up = summary.data?.up ?? 0;
  const degraded = summary.data?.degraded ?? 0;
  const down = summary.data?.down ?? 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className={`pulse-dot ${down > 0 ? 'pulse-down' : degraded > 0 ? 'pulse-degraded' : ''}`} aria-hidden="true" />
          <h1>Device Monitoring</h1>
          <span className="brand-sub">command center</span>
        </div>
        <div className="topbar-status" aria-label="Fleet summary">
          <span className="status-chip chip-up">{up} online</span>
          {degraded > 0 ? <span className="status-chip chip-degraded">{degraded} degraded</span> : null}
          {down > 0 ? <span className="status-chip chip-down">{down} down</span> : null}
        </div>
        <div className="topbar-actions">
          <button
            className="ghost theme-toggle"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="user-chip">
            {user?.username ?? 'Admin'}
            {user ? <em className="role-chip">{user.role}</em> : null}
          </span>
          <button className="ghost" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Logout
          </button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Dashboard
        </NavLink>
        <NavLink to="/devices" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Devices
        </NavLink>
        <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Notifications
        </NavLink>
        <NavLink to="/maintenance" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
          Maintenance
        </NavLink>
        {isAdmin ? (
          <NavLink to="/settings/users" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Users
          </NavLink>
        ) : null}
        <a className="nav-link nav-link-external" href="/status" target="_blank" rel="noreferrer">
          Status page ↗
        </a>
      </nav>

      <Outlet />
    </main>
  );
}
