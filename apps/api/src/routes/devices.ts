import type { FastifyInstance } from 'fastify';
import { createDeviceSchema, updateDeviceSchema } from '@device-monitoring/shared';
import type { Db } from '../db/database.js';
import { createDevice, deleteDevice, getDevice, getUptimeReport, listBeats, listDevices, updateDevice } from '../devices/repository.js';

export async function registerDeviceRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/devices', async () => ({ devices: listDevices(db) }));

  app.post('/api/devices', async (request, reply) => {
    const device = createDevice(db, createDeviceSchema.parse(request.body));
    return reply.code(201).send({ device });
  });

  app.get('/api/devices/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const device = getDevice(db, id);
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    return { device };
  });

  app.patch('/api/devices/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const device = updateDevice(db, id, updateDeviceSchema.parse(request.body));
    if (!device) return reply.code(404).send({ error: 'Device not found' });
    return { device };
  });

  app.delete('/api/devices/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!deleteDevice(db, id)) return reply.code(404).send({ error: 'Device not found' });
    return reply.code(204).send();
  });

  app.get('/api/devices/:id/beats', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getDevice(db, id)) return reply.code(404).send({ error: 'Device not found' });
    const limit = Math.min(1000, Math.max(1, Number((request.query as { limit?: string }).limit ?? 200)));
    return { beats: listBeats(db, id, limit) };
  });

  app.get('/api/devices/:id/uptime', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!getDevice(db, id)) return reply.code(404).send({ error: 'Device not found' });
    const days = Math.min(365, Math.max(1, Number((request.query as { days?: string }).days ?? 30)));
    return { uptime: getUptimeReport(db, id, days) };
  });
}
