import type { FastifyInstance } from 'fastify';
import { loginSchema } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { mapUser } from '../db/mappers.js';
import { clearSessionCookie, createSession, destroySession, setSessionCookie, sessionCookieName } from '../auth/sessions.js';
import { verifyPasswordOrDummy } from '../auth/passwords.js';

export async function registerAuthRoutes(app: FastifyInstance, db: Db, secureCookies: boolean): Promise<void> {
  // Brute-force / credential-stuffing guard: a much tighter budget than the
  // global limiter (unauthenticated, internet-reachable endpoint). Keyed on
  // client IP by the rate-limit plugin (see TRUST_PROXY for proxied setups).
  const loginRateLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

  app.post('/api/auth/login', loginRateLimit, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username) as
      | (Record<string, unknown> & { password_hash: string })
      | undefined;
    // Always run one argon2 verify (against a dummy hash when the user doesn't
    // exist) so response timing doesn't reveal whether the username is valid.
    const passwordOk = await verifyPasswordOrDummy(row ? String(row.password_hash) : undefined, body.password);
    if (!row || !passwordOk) {
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
