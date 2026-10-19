import { z } from 'zod';
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import type { ClientEvent } from '@sinc/shared';
import { verifyJwt } from '../auth/crypto';
import { HttpError } from '../errors';
import type { SincApp } from '../services/app';
import type { Redis } from 'ioredis';
import type { RealtimeBus } from './bus';

const Position = z.number().finite().min(0).max(60 * 60 * 48);
const Status = z.enum(['ready', 'buffering', 'drifted', 'paused', 'disconnected', 'opened_external_app']);

const ClientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.join'), roomId: z.string().min(1).max(80), userId: z.string().max(80) }),
  z.object({ type: z.literal('room.leave'), roomId: z.string().min(1).max(80), userId: z.string().max(80) }),
  z.object({ type: z.literal('playback.play'), positionSec: Position }),
  z.object({ type: z.literal('playback.pause'), positionSec: Position }),
  z.object({ type: z.literal('playback.seek'), positionSec: Position }),
  z.object({ type: z.literal('playback.rate'), rate: z.number().finite() }),
  z.object({ type: z.literal('playback.sync'), clientPositionSec: Position }),
  z.object({ type: z.literal('participant.status'), status: Status }),
  z.object({ type: z.literal('external.confirm_opened') }),
  z.object({ type: z.literal('chat.message'), text: z.string().max(500) }),
  z.object({ type: z.literal('reaction'), emoji: z.string().max(8) }),
  z.object({ type: z.literal('watchlist.add'), title: z.string().max(120), service: z.string().max(40).optional(), circleId: z.string().max(80).optional() }),
  z.object({
    type: z.literal('vote.create'),
    circleId: z.string().min(1).max(80),
    question: z.string().max(140),
    options: z.array(z.string().max(80)).max(6),
    endsAt: z.string().max(40),
  }),
  z.object({ type: z.literal('vote.cast'), optionId: z.string().min(1).max(80) }),
  z.object({ type: z.literal('time.ping'), clientSentAt: z.number().finite() }),
]);

export async function attachRealtime(httpServer: HttpServer, app: SincApp, bus: RealtimeBus, jwtSecret: string, redis: Redis | null): Promise<Server> {
  const io = new Server(httpServer, { cors: { origin: true, credentials: true }, maxHttpBufferSize: 32_000 });
  if (redis) {
    try {
      if (redis.status !== 'ready') await redis.connect();
      const sub = redis.duplicate();
      await sub.connect();
      io.adapter(createAdapter(redis, sub));
    } catch (error) {
      console.warn('[redis] adapter skipped', error instanceof Error ? error.message : error);
    }
  }
  bus.attach(io);

  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const payload = token ? verifyJwt(token, jwtSecret) : null;
    if (!payload) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = payload.sub;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('event', async (payload: unknown) => {
      const parsed = ClientEventSchema.safeParse(payload);
      if (!parsed.success) {
        socket.emit('event', { type: 'error', code: 'bad_event', message: 'Не понял событие' });
        return;
      }
      try {
        const user = await app.userFromAuthHeader(`Bearer ${String(socket.handshake.auth?.token ?? '')}`);
        const effect = await app.handleSocket(user, parsed.data as ClientEvent);
        if (effect.joinRoomId) socket.join(effect.joinRoomId);
        for (const event of effect.toSender) socket.emit('event', event);
        if (effect.roomId) {
          for (const event of effect.toRoom) io.to(effect.roomId).emit('event', event);
        }
      } catch (error) {
        const known = error instanceof HttpError ? error : null;
        socket.emit('event', { type: 'error', code: known?.code ?? 'error', message: known?.message ?? 'Что-то пошло не так' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        const user = await app.userFromAuthHeader(`Bearer ${String(socket.handshake.auth?.token ?? '')}`);
        const effect = await app.handleSocket(user, { type: 'room.leave', roomId: '', userId: user.id });
        if (effect.roomId) {
          for (const event of effect.toRoom) io.to(effect.roomId).emit('event', event);
        }
      } catch {
        // The room already forgot this socket.
      }
    });
  });

  return io;
}
