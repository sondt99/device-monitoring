import type { CreateUserInput, UpdateUserInput, User } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { hashPassword } from '../auth/passwords.js';
import { mapUser } from '../db/mappers.js';
import { HttpError } from '../errors.js';

export function listUsers(db: Db): User[] {
  return db
    .prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE')
    .all()
    .map((row) => mapUser(row as Record<string, unknown>));
}

export function getUser(db: Db, id: number): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

function otherAdminCount(db: Db, excludingId: number): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND id <> ?`).get(excludingId) as {
    count: number;
  };
  return row.count;
}

export async function createUser(db: Db, input: CreateUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(input.username, passwordHash, input.role);
  return getUser(db, Number(result.lastInsertRowid)) as User;
}

export async function updateUser(db: Db, id: number, input: UpdateUserInput): Promise<User | null> {
  const current = getUser(db, id);
  if (!current) return null;
  if (input.role && input.role !== 'admin' && current.role === 'admin' && otherAdminCount(db, id) === 0) {
    throw new HttpError(400, 'Cannot remove the last remaining admin');
  }
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  db.prepare(`UPDATE users SET role = ?, password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?`).run(
    input.role ?? current.role,
    passwordHash,
    new Date().toISOString(),
    id
  );
  return getUser(db, id);
}

export function deleteUser(db: Db, id: number): boolean {
  const current = getUser(db, id);
  if (!current) return false;
  if (current.role === 'admin' && otherAdminCount(db, id) === 0) {
    throw new HttpError(400, 'Cannot remove the last remaining admin');
  }
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}
