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

describe('role-based UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows admin controls for admins', async () => {
    Object.assign(api, makeApiMock(makeUser('admin')));
    renderApp('/devices');

    expect(await screen.findByRole('button', { name: '+ Add device' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });

  it('hides admin controls for viewers', async () => {
    Object.assign(api, makeApiMock(makeUser('viewer')));
    renderApp('/devices');

    // Wait for the shell to finish loading before asserting absence.
    expect(await screen.findByText('command center')).toBeInTheDocument();
    expect(await screen.findByText('Devices', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add device' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('blocks viewers from the users page client-side', async () => {
    Object.assign(api, makeApiMock(makeUser('viewer')));
    renderApp('/settings/users');

    expect(await screen.findByText('Admins only')).toBeInTheDocument();
    expect(vi.mocked(api.users)).not.toHaveBeenCalled();
  });

  it('shows the maintenance scheduling form only to admins', async () => {
    Object.assign(api, makeApiMock(makeUser('viewer')));
    renderApp('/maintenance');

    expect(await screen.findByText('Maintenance windows')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Schedule window/ })).not.toBeInTheDocument();
  });
});
