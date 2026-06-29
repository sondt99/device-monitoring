import { buildApp } from './app.js';
import { bootstrapAdmin } from './auth/bootstrap.js';
import { loadConfig } from './config.js';
import { migrate, openDatabase } from './db/database.js';
import { PingChecker } from './monitoring/checker.js';
import { MonitoringScheduler } from './monitoring/service.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
migrate(db);
await bootstrapAdmin(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);

const app = await buildApp(db, config);
const scheduler = new MonitoringScheduler(db, new PingChecker());
scheduler.start();

const shutdown = async () => {
  scheduler.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await app.listen({ host: config.HOST, port: config.PORT });
