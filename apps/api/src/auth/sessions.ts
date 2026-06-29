import type { FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import type { Db } from '../db/database.js';
import { mapUser } from '../db/mappers.js';

export const sessionCookieName = 'dm_session';
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;

export function createSession(db: Db, userId: number): string {
  const id = nanoid(48);
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return id;
}

export function destroySession(db: Db, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getSessionUser(db: Db, sessionId: string): ReturnType<typeof mapUser> | null {
  const row = db
    .prepare(
      `SELECT users.id, users.username, users.created_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`
    )
    .get(sessionId, new Date().toISOString()) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function setSessionCookie(reply: FastifyReply, sessionId: string, secure: boolean): void {
  reply.setCookie(sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: Math.floor(sessionTtlMs / 1000)
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName, { path: '/' });
}

export function requireAuth(db: Db) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = request.cookies[sessionCookieName];
    if (!sessionId) {
      await reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    const user = getSessionUser(db, sessionId);
    if (!user) {
      await reply.code(401).send({ error: 'Authentication required' });
      return;
    }
    request.user = user;
  };
}
