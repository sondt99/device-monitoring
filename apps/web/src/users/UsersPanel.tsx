import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User, UserRole } from '@device-monitoring/shared';
import { useMe } from '../auth/useMe.js';
import { ConfirmDialog, EmptyState, Field, LoadingBlock, SectionHeader } from '../components/index.js';
import { formatDateTime } from '../lib/format.js';
import { api } from '../api.js';

export function UsersPanel() {
  const queryClient = useQueryClient();
  const { user: me } = useMe();
  const users = useQuery({ queryKey: ['users'], queryFn: api.users });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [deleting, setDeleting] = useState<User | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: () => api.createUser({ username: username.trim(), password, role }),
    onSuccess: () => {
      setUsername('');
      setPassword('');
      setRole('viewer');
      invalidate();
    }
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role: nextRole }: { id: number; role: UserRole }) => api.updateUser(id, { role: nextRole }),
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: api.deleteUser,
    onSuccess: () => {
      setDeleting(null);
      invalidate();
    }
  });

  const list = users.data?.users ?? [];

  return (
    <section className="stack">
      <div className="card table-card">
        <SectionHeader eyebrow="Access" title="User accounts" description="Admins can manage devices, channels, and maintenance. Viewers have read-only access." />

        <form
          className="notification-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim() && password) create.mutate();
          }}
        >
          <Field label="Username" className="field-name">
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Password" hint="At least 12 characters">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Role" className="field-type">
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {create.error ? <p className="error form-error">{create.error.message}</p> : null}
          <button className="primary form-submit" type="submit" disabled={create.isPending || !username.trim() || !password}>
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
        </form>

        {users.isLoading ? <LoadingBlock label="Loading users…" /> : null}
        {!users.isLoading && list.length === 0 ? <EmptyState title="No users" description="This shouldn't happen — at least one admin always exists." /> : null}
        {list.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((user) => {
                  const isSelf = user.id === me?.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.username}</strong>
                        {isSelf ? <span className="muted-cell"> (you)</span> : null}
                      </td>
                      <td>
                        <select
                          value={user.role}
                          disabled={isSelf || changeRole.isPending}
                          onChange={(e) => changeRole.mutate({ id: user.id, role: e.target.value as UserRole })}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="mono muted-cell">{formatDateTime(user.createdAt)}</td>
                      <td className="row-actions">
                        <button className="ghost danger" type="button" disabled={isSelf} onClick={() => setDeleting(user)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.username ?? 'user'}?`}
        description="This account will immediately lose access. This action cannot be undone."
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
