import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Footer } from './components/index.js';
import { useMe } from './auth/useMe.js';
import { useLiveTitle } from './lib/useLiveTitle.js';
import { useTheme } from './lib/useTheme.js';
import { api } from './api.js';

/**
 * Monochrome theme glyphs. Emoji (☀️/🌙) render in their own fixed colours and
 * would be the only uncontrolled hue in the interface, so the toggle draws its
 * own icons in `currentColor` instead.
 */
function ThemeIcon({ theme }: { theme: 'dark' | 'light' }) {
  return theme === 'dark' ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.7 8.7 0 1 0 11.1 11.1Z" />
    </svg>
  );
}

export function AppShell() {
  const { user, isAdmin, statusPageEnabled } = useMe();
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
            <ThemeIcon theme={theme} />
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
        {/* Only advertised when the server actually registered the route —
            otherwise this link is a guaranteed dead end. */}
        {statusPageEnabled ? (
          <a className="nav-link nav-link-external" href="/status" target="_blank" rel="noreferrer">
            Status page ↗
          </a>
        ) : null}
      </nav>

      <Outlet />
      <Footer />
    </main>
  );
}
