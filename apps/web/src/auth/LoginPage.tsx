import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Field, Footer } from '../components/index.js';
import { api } from '../api.js';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const login = useMutation({
    mutationFn: () => api.login({ username, password }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    }
  });

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-hero">
          <p className="eyebrow">Self-hosted uptime</p>
          <h1>Device Monitoring</h1>
          <p>Monitor devices, latency, beat history, and alert transitions from one clean command-center dashboard.</p>
          <div className="feature-pills" aria-label="Key features">
            <span>Live status</span>
            <span>Beat history</span>
            <span>Telegram / Discord alerts</span>
          </div>
        </div>

        <form
          className="card login-card"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <div className="login-card-header">
            <p className="eyebrow">Secure access</p>
            <h2>Sign in</h2>
            <p>Use the admin account created on first boot.</p>
          </div>
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          {login.error ? <p className="error auth-error">{login.error.message}</p> : null}
          <button className="primary full-width" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="login-status-link">
            Just checking if things are up? <Link to="/status">View the public status page →</Link>
          </p>
        </form>
      </section>
      <Footer />
    </main>
  );
}
