import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { SincApp } from '../services/app';
import { HttpError } from '../errors';

const Email = z.string().trim().max(120).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Нужна почта');
const Name = z.string().trim().min(1, 'Как вас зовут?').max(40, 'Имя слишком длинное');
const Permissions = z.object({
  everyoneCanPause: z.boolean().optional(),
  everyoneCanSeek: z.boolean().optional(),
  everyoneCanInvite: z.boolean().optional(),
  chatEnabled: z.boolean().optional(),
  reactionsEnabled: z.boolean().optional(),
  spoilerMode: z.boolean().optional(),
}).optional();

export function registerRoutes(app: FastifyInstance, sinc: SincApp): void {
  app.post('/api/auth/register', async (request) => sinc.register(parse(z.object({ email: Email, name: Name, password: z.string().min(8, 'Пароль от 8 символов').max(72) }), request.body)));
  app.post('/api/auth/login', async (request) => sinc.login(parse(z.object({ email: Email, password: z.string().min(1).max(72) }), request.body)));
  app.post('/api/auth/guest', async (request) => sinc.guest(parse(z.object({ name: Name }), request.body).name));

  app.get('/api/me', async (request) => sinc.me(await actor(sinc, request.headers.authorization)));
  app.post('/api/me/plan/trial', async (request) => {
    const user = await actor(sinc, request.headers.authorization);
    return sinc.setTrialPlan(user, parse(z.object({ plan: z.enum(['free', 'pro']) }), request.body).plan);
  });
  app.get('/api/home', async (request) => sinc.home(await actor(sinc, request.headers.authorization)));

  app.post('/api/rooms', async (request) => {
    const user = await actor(sinc, request.headers.authorization);
    return sinc.createRoom(user, parse(z.object({
      sourceType: z.enum(['native', 'external_service']),
      sourceUrl: z.string().max(2000).optional(),
      service: z.enum(['kinopoisk', 'okko', 'ivi', 'other']).optional(),
      externalTitle: z.string().max(120).optional(),
      externalDeepLink: z.string().max(2000).optional(),
      externalWebUrl: z.string().max(2000).optional(),
      permissions: Permissions,
      circleId: z.string().max(80).optional(),
      drm: z.object({ provider: z.string().max(40), licenseUrl: z.string().max(2000).optional() }).optional(),
    }), request.body));
  });
  app.post('/api/rooms/join', async (request) => sinc.joinByCode(await actor(sinc, request.headers.authorization), parse(z.object({ code: z.string().min(1).max(12) }), request.body).code));
  app.get('/api/rooms/:code', async (request) => sinc.getRoom(await actor(sinc, request.headers.authorization), codeOf(request.params)));
  app.delete('/api/rooms/:code', async (request, reply) => {
    await sinc.deleteRoom(await actor(sinc, request.headers.authorization), codeOf(request.params));
    return reply.code(204).send();
  });
  app.delete('/api/rooms/:code/messages/:messageId', async (request, reply) => {
    const params = request.params as { code?: string; messageId?: string };
    await sinc.deleteMessage(await actor(sinc, request.headers.authorization), String(params.code ?? ''), String(params.messageId ?? ''));
    return reply.code(204).send();
  });
  app.post('/api/rooms/:code/reports', async (request, reply) => {
    await sinc.report(await actor(sinc, request.headers.authorization), parse(z.object({
      targetType: z.enum(['message', 'user']),
      targetId: z.string().min(1).max(80),
      reason: z.string().min(1).max(300),
    }), request.body));
    return reply.code(204).send();
  });
  app.post('/api/rooms/:code/uploads', async (request) => {
    const body = parse(z.object({ fileName: z.string().min(1).max(180), contentType: z.string().min(1).max(120) }), request.body);
    return sinc.upload(await actor(sinc, request.headers.authorization), codeOf(request.params), body.fileName, body.contentType);
  });
  app.post('/api/rooms/:code/voice', async (request) => {
    await actor(sinc, request.headers.authorization);
    return sinc.voice();
  });

  app.post('/api/blocks', async (request, reply) => {
    await sinc.block(await actor(sinc, request.headers.authorization), parse(z.object({ userId: z.string().min(1).max(80) }), request.body).userId);
    return reply.code(204).send();
  });

  app.get('/api/circles', async (request) => sinc.circles(await actor(sinc, request.headers.authorization)));
  app.post('/api/circles', async (request) => sinc.createCircle(await actor(sinc, request.headers.authorization), parse(z.object({ name: z.string().min(2).max(60) }), request.body).name));
  app.get('/api/circles/:id', async (request) => sinc.circle(await actor(sinc, request.headers.authorization), idOf(request.params)));
  app.post('/api/circles/:id/members', async (request) => sinc.addMember(await actor(sinc, request.headers.authorization), idOf(request.params), parse(z.object({ email: Email }), request.body).email));
  app.post('/api/circles/:id/watchlist', async (request) => {
    const body = parse(watchBody, request.body);
    return sinc.addWatch(await actor(sinc, request.headers.authorization), { ...body, circleId: idOf(request.params) });
  });
  app.post('/api/circles/:id/votes', async (request) => {
    const body = parse(z.object({ question: z.string().min(1).max(140), options: z.array(z.string().max(80)).min(2).max(6), endsAt: z.string().min(4).max(40) }), request.body);
    return sinc.createVote(await actor(sinc, request.headers.authorization), { ...body, circleId: idOf(request.params) });
  });
  app.post('/api/votes/:id/cast', async (request) => sinc.castVote(await actor(sinc, request.headers.authorization), idOf(request.params)));

  app.get('/api/watchlist', async (request) => sinc.watchlist(await actor(sinc, request.headers.authorization)));
  app.post('/api/watchlist', async (request) => sinc.addWatch(await actor(sinc, request.headers.authorization), parse(watchBody, request.body)));

  app.post('/api/schedules', async (request) => sinc.createSchedule(await actor(sinc, request.headers.authorization), parse(z.object({
    title: z.string().min(1).max(120),
    startsAt: z.string().min(4).max(40),
    timezone: z.string().min(1).max(80),
    circleId: z.string().max(80).optional(),
    posterUrl: z.string().max(2000).optional(),
  }), request.body)));
  app.get('/api/schedules/:id', async (request) => sinc.schedule(await actor(sinc, request.headers.authorization), idOf(request.params)));
  app.post('/api/schedules/:id/rsvp', async (request) => sinc.rsvp(await actor(sinc, request.headers.authorization), idOf(request.params), parse(z.object({ response: z.enum(['yes', 'no']) }), request.body).response));
  app.post('/api/schedules/:id/start', async (request) => sinc.startSchedule(await actor(sinc, request.headers.authorization), idOf(request.params)));

  app.post('/api/analytics', async (request, reply) => {
    const body = parse(z.object({ name: z.string().max(40), props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }), request.body);
    await sinc.track(await actor(sinc, request.headers.authorization), body.name, body.props);
    return reply.code(204).send();
  });
}

const watchBody = z.object({
  circleId: z.string().max(80).optional(),
  title: z.string().min(1).max(120),
  service: z.string().max(40).optional(),
  externalUrl: z.string().max(2000).optional(),
  posterUrl: z.string().max(2000).optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'invalid_input', result.error.issues[0]?.message ?? 'Проверьте поля');
  return result.data;
}

function actor(sinc: SincApp, header: string | undefined) {
  return sinc.userFromAuthHeader(header);
}

function codeOf(params: unknown): string {
  return String((params as { code?: string }).code ?? '');
}

function idOf(params: unknown): string {
  return String((params as { id?: string }).id ?? '');
}
