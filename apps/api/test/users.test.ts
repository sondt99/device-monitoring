import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../src/db/database.js';
import { HttpError } from '../src/errors.js';
import { createUser, deleteUser, listUsers, updateUser } from '../src/users/repository.js';

async function seedAdmin(db: ReturnType<typeof openDatabase>) {
  return createUser(db, { username: 'admin', password: 'a-long-enough-password', role: 'admin' });
}

describe('users repository', () => {
  it('creates users with the requested role', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const admin = await seedAdmin(db);
    const viewer = await createUser(db, { username: 'viewer', password: 'another-long-password', role: 'viewer' });

    expect(admin.role).toBe('admin');
    expect(viewer.role).toBe('viewer');
    expect(listUsers(db).map((u) => u.username).sort()).toEqual(['admin', 'viewer']);
    db.close();
  });

  it('refuses to demote the last remaining admin', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const admin = await seedAdmin(db);

    const error = await updateUser(db, admin.id, { role: 'viewer' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(400);
    db.close();
  });

  it('refuses to delete the last remaining admin', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const admin = await seedAdmin(db);

    expect(() => deleteUser(db, admin.id)).toThrow(HttpError);
    db.close();
  });

  it('allows demoting/deleting an admin when another admin exists', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const admin = await seedAdmin(db);
    await createUser(db, { username: 'second-admin', password: 'yet-another-password', role: 'admin' });

    const demoted = await updateUser(db, admin.id, { role: 'viewer' });
    expect(demoted?.role).toBe('viewer');
    db.close();
  });

  it('updates a password without changing the stored role', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const viewer = await createUser(db, { username: 'viewer', password: 'another-long-password', role: 'viewer' });

    const updated = await updateUser(db, viewer.id, { password: 'brand-new-long-password' });
    expect(updated?.role).toBe('viewer');
    db.close();
  });
});
