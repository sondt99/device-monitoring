import type { FastifyInstance } from 'fastify';
import { createUserSchema, updateUserSchema } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { requireRole } from '../auth/sessions.js';
import { HttpError } from '../errors.js';
import { createUser, deleteUser, listUsers, updateUser } from '../users/repository.js';

export async function registerUserRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const adminOnly = { preHandler: requireRole('admin') };

  app.get('/api/users', adminOnly, async () => ({ users: listUsers(db) }));

  app.post('/api/users', adminOnly, async (request, reply) => {
    const user = await createUser(db, createUserSchema.parse(request.body));
    return reply.code(201).send({ user });
  });

  app.patch('/api/users/:id', adminOnly, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const input = updateUserSchema.parse(request.body);
    if (id === request.user?.id && input.role) {
      throw new HttpError(400, 'Cannot change your own role');
    }
    const user = await updateUser(db, id, input);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return { user };
  });

  app.delete('/api/users/:id', adminOnly, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (id === request.user?.id) {
      throw new HttpError(400, 'Cannot delete your own account');
    }
    if (!deleteUser(db, id)) return reply.code(404).send({ error: 'User not found' });
    return reply.code(204).send();
  });
}
