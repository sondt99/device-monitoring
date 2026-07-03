import type { FastifyInstance } from 'fastify';
import { createMaintenanceWindowSchema, updateMaintenanceWindowSchema } from '@device-monitoring/shared';
import { requireRole } from '../auth/sessions.js';
import type { Db } from '../db/database.js';
import { getDevice } from '../devices/repository.js';
import { createMaintenanceWindow, deleteMaintenanceWindow, listMaintenanceWindows, updateMaintenanceWindow } from '../maintenance/repository.js';

export async function registerMaintenanceRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const adminOnly = { preHandler: requireRole('admin') };

  app.get('/api/maintenance-windows', async (request) => {
    const deviceId = (request.query as { deviceId?: string }).deviceId;
    return { maintenanceWindows: listMaintenanceWindows(db, deviceId ? Number(deviceId) : undefined) };
  });

  app.post('/api/maintenance-windows', adminOnly, async (request, reply) => {
    const input = createMaintenanceWindowSchema.parse(request.body);
    if (!getDevice(db, input.deviceId)) return reply.code(404).send({ error: 'Device not found' });
    const maintenanceWindow = createMaintenanceWindow(db, input, request.user?.id ?? null);
    return reply.code(201).send({ maintenanceWindow });
  });

  app.patch('/api/maintenance-windows/:id', adminOnly, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const maintenanceWindow = updateMaintenanceWindow(db, id, updateMaintenanceWindowSchema.parse(request.body));
    if (!maintenanceWindow) return reply.code(404).send({ error: 'Maintenance window not found' });
    return { maintenanceWindow };
  });

  app.delete('/api/maintenance-windows/:id', adminOnly, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!deleteMaintenanceWindow(db, id)) return reply.code(404).send({ error: 'Maintenance window not found' });
    return reply.code(204).send();
  });
}
