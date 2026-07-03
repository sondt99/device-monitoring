import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { api } from '../api.js';
import { makeApiMock, makeUser } from './mockApi.js';

vi.mock('../api.js', () => ({ api: {} }));

function renderApp(path: string) {
  window.history.pushState({}, '', path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

describe('routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the public status page without authentication', async () => {
    Object.assign(api, makeApiMock(null));
    renderApp('/status');

    expect(await screen.findByText('System status')).toBeInTheDocument();
    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
    expect(vi.mocked(api.me)).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated visitors from the dashboard to the login page', async () => {
    Object.assign(api, makeApiMock(null));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('shows the dashboard shell for an authenticated user', async () => {
    Object.assign(api, makeApiMock(makeUser('admin')));
    renderApp('/');

    expect(await screen.findByText('command center')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Devices' })).toBeInTheDocument();
  });
});
