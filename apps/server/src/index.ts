import cors from '@fastify/cors';
import Fastify from 'fastify';
import { loadConfig } from './config';
import { HttpError } from './errors';
import { registerRoutes } from './api/routes';
import { RealtimeBus } from './realtime/bus';
import { attachRealtime } from './realtime/gateway';
import { AnalyticsQueue, dispatchDueReminders } from './services/analytics-queue';
import { SincApp, UnavailableStorage } from './services/app';
import { RoomHub } from './store/hub';
import { MemoryRepository } from './store/memory';
import { connectRedis } from './store/redis';
import type { Repository } from './store/types';

const config = loadConfig();
const redis = connectRedis(config.redisUrl);

async function repository(): Promise<Repository> {
  if (config.persistence === 'postgres') {
    const { PrismaRepository } = await import('./store/prisma');
    return new PrismaRepository();
  }
  return new MemoryRepository();
}

const repo = await repository();
const analytics = new AnalyticsQueue(repo);
const bus = new RealtimeBus();
const sinc = new SincApp(repo, new RoomHub(redis), analytics, bus, new UnavailableStorage(), config.jwtSecret);
const app = Fastify({ logger: true, bodyLimit: 256 * 1024 });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof HttpError) {
    reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    return;
  }
  app.log.error(error);
  reply.status(500).send({ error: { code: 'internal', message: 'Что-то пошло не так' } });
});

await app.register(cors, { origin: true, credentials: true });
app.get('/health', async () => ({ ok: true, persistence: config.persistence, redis: Boolean(config.redisUrl) }));
registerRoutes(app, sinc);

await app.listen({ port: config.port, host: config.host });
await attachRealtime(app.server, sinc, bus, config.jwtSecret, redis);
const stopAnalytics = analytics.start();
const reminders = setInterval(() => void dispatchDueReminders(repo), 15_000);
reminders.unref?.();

app.log.info(`Sinc API on http://${config.host}:${config.port} (${config.persistence})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    stopAnalytics();
    clearInterval(reminders);
    await app.close();
    process.exit(0);
  });
}
