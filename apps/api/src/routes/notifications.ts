import type { FastifyInstance } from 'fastify';
import { createNotificationChannelSchema, updateNotificationChannelSchema } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { createChannel, deleteChannel, getChannel, listChannels, sendToChannel, updateChannel } from '../notifications/service.js';

export async function registerNotificationRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/notification-channels', async () => ({ channels: listChannels(db) }));

  app.post('/api/notification-channels', async (request, reply) => {
    const channel = createChannel(db, createNotificationChannelSchema.parse(request.body));
    return reply.code(201).send({ channel });
  });

  app.patch('/api/notification-channels/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const channel = updateChannel(db, id, updateNotificationChannelSchema.parse(request.body));
    if (!channel) return reply.code(404).send({ error: 'Notification channel not found' });
    return { channel };
  });

  app.delete('/api/notification-channels/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!deleteChannel(db, id)) return reply.code(404).send({ error: 'Notification channel not found' });
    return reply.code(204).send();
  });

  app.post('/api/notification-channels/:id/test', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const channel = getChannel(db, id, false);
    if (!channel) return reply.code(404).send({ error: 'Notification channel not found' });
    await sendToChannel(db, id, {
      device: { id: 0, name: 'Device Monitoring Test', host: 'localhost' },
      previousStatus: 'unknown',
      currentStatus: 'up',
      latencyMs: 1,
      error: null,
      checkedAt: new Date().toISOString()
    });
    return { ok: true };
  });
}
