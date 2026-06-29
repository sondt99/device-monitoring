import type { User } from '@device-monitoring/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}
