import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapUser } from '../db/mappers.js';
import { clearSessionCookie, createSession, destroySession, setSessionCookie, sessionCookieName } from '../auth/sessions.js';
import { verifyPassword } from '../auth/passwords.js';

export async function registerAuthRoutes(app: FastifyInstance, db: Db, secureCookies: boolean): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as
      | (Record<string, unknown> & { password_hash: string })
      | undefined;
    if (!row || !(await verifyPassword(String(row.password_hash), body.password))) {
      await reply.code(401).send({ error: 'Invalid username or password' });
      return;
    }
    const existingSession = request.cookies[sessionCookieName];
    if (existingSession) destroySession(db, existingSession);
    const sessionId = createSession(db, Number(row.id));
    setSessionCookie(reply, sessionId, secureCookies);
    return { user: mapUser(row) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[sessionCookieName];
    if (sessionId) destroySession(db, sessionId);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => ({ user: request.user }));
}
