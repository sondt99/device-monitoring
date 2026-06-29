import type { Db } from '../db/database.js';
import { hashPassword } from './passwords.js';

export async function bootstrapAdmin(db: Db, username?: string, password?: string): Promise<void> {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existing.count > 0) return;
  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required to create the first admin user');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long');
  }
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
}
