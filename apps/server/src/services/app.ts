import { randomInt, randomUUID } from 'node:crypto';
import {
  ALLOWED_REACTIONS,
  DEFAULT_PERMISSIONS,
  PARTICIPANT_STATUSES,
  assessNativeSource,
  createRoomCode,
  entitlementsFor,
  expectedPositionSec,
  inspectMessage,
  isAnalyticsEvent,
  reducePlayback,
  roomTitle,
  validateExternalUrl,
  type ChatMessage,
  type CircleSummary,
  type ClientEvent,
  type CreateRoomRequest,
  type HomeResponse,
  type MeResponse,
  type Participant,
  type Plan,
  type PublicUser,
  type Reaction,
  type RoomPlaybackState,
  type RoomResponse,
  type RoomSummary,
  type ScheduledWatch,
  type ServerEvent,
  type ServiceId,
  type Vote,
  type WatchlistItem,
} from '@sinc/shared';
import { hashPassword, signJwt, verifyJwt, verifyPassword } from '../auth/crypto';
import { HttpError } from '../errors';
import type { RealtimeBus } from '../realtime/bus';
import { hydrateRoom, toLiveParticipant } from './hydrate';
import type { AnalyticsQueue } from './analytics-queue';
import type { ParticipantRecord, Repository, RoomRecord, UserRecord } from '../store/types';
import type { RoomHub } from '../store/hub';

const CLIENT_ANALYTICS = new Set(['app_opened', 'returned_7_days', 'invite_shared']);
const SERVICES = new Set<ServiceId>(['kinopoisk', 'okko', 'ivi', 'other']);

export interface SocketEffect {
  joinRoomId?: string;
  roomId?: string;
  toRoom: ServerEvent[];
  toSender: ServerEvent[];
}

export interface ObjectStorage {
  createUploadUrl(input: { roomId: string; fileName: string; contentType: string }): Promise<{ uploadUrl: string; publicUrl: string }>;
  deleteRoomFiles(roomId: string): Promise<void>;
}

export class UnavailableStorage implements ObjectStorage {
  async createUploadUrl(): Promise<{ uploadUrl: string; publicUrl: string }> {
    throw new HttpError(501, 'storage_unconfigured', 'Хранилище R2 ещё не подключено. Пока используйте прямую MP4 или HLS-ссылку.');
  }

  async deleteRoomFiles(): Promise<void> {}
}

export class SincApp {
  private presence = new Map<string, string>();
  private playbackMeta = new Map<string, { accumulatedSec: number; playingSince: number | null; started: boolean; ten: boolean }>();
  private chatTimes = new Map<string, number[]>();

  constructor(
    private repo: Repository,
    private hub: RoomHub,
    private analytics: AnalyticsQueue,
    private realtime: RealtimeBus,
    private storage: ObjectStorage,
    private jwtSecret: string,
  ) {}

  async register(input: { email: string; name: string; password: string }) {
    const email = input.email.toLowerCase();
    if (await this.repo.findUserByEmail(email)) throw new HttpError(409, 'email_taken', 'Эта почта уже зарегистрирована');
    const user = await this.createUser({ email, name: input.name.trim(), passwordHash: await hashPassword(input.password) });
    this.analytics.enqueue({ name: 'signed_up', userId: user.id, props: { method: 'email' } });
    return this.auth(user);
  }

  async login(input: { email: string; password: string }) {
    const user = await this.repo.findUserByEmail(input.email.toLowerCase());
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, 'invalid_login', 'Неверная почта или пароль');
    }
    return this.auth(user);
  }

  async guest(name: string) {
    const user = await this.createUser({
      email: `guest-${randomUUID()}@guests.sinc.app`,
      name: name.trim(),
    });
    this.analytics.enqueue({ name: 'signed_up', userId: user.id, props: { method: 'guest' } });
    return this.auth(user);
  }

  async userFromAuthHeader(header: string | undefined): Promise<UserRecord> {
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Нужно войти');
    const payload = verifyJwt(header.slice(7), this.jwtSecret);
    if (!payload) throw new HttpError(401, 'unauthorized', 'Сессия истекла');
    const user = await this.repo.findUserById(payload.sub);
    if (!user) throw new HttpError(401, 'unauthorized', 'Пользователь не найден');
    return user;
  }

  async me(user: UserRecord): Promise<MeResponse> {
    const fresh = (await this.repo.findUserById(user.id)) ?? user;
    return { user: toPublic(fresh), entitlements: entitlementsFor(fresh.plan) };
  }

  async setTrialPlan(user: UserRecord, plan: Plan): Promise<MeResponse> {
    const updated = await this.repo.updateUser(user.id, { plan });
    return { user: toPublic(updated), entitlements: entitlementsFor(plan) };
  }

  async home(user: UserRecord): Promise<HomeResponse> {
    const [upcoming, recent, circles] = await Promise.all([
      this.repo.listUpcoming(user.id),
      this.repo.listRecentRooms(user.id),
      this.repo.listCircles(user.id),
    ]);
    return {
      upcoming,
      recentRooms: recent.map(toSummary),
      circles: circles.filter((circle) => circle.kind === 'group'),
    };
  }

  async createRoom(user: UserRecord, input: CreateRoomRequest): Promise<RoomResponse> {
    const permissions = { ...DEFAULT_PERMISSIONS, ...input.permissions };
    const sourceType = input.sourceType === 'external_service' ? 'external_service' : 'native';
    let sourceUrl: string | undefined;
    let externalDeepLink: string | undefined;
    let externalWebUrl: string | undefined;
    if (sourceType === 'native') {
      const assessed = assessNativeSource({ sourceUrl: input.sourceUrl, drm: input.drm });
      if (!assessed.ok) throw new HttpError(400, 'bad_source', assessed.message);
      sourceUrl = assessed.sourceUrl;
    } else {
      const deep = validateExternalUrl(input.externalDeepLink);
      const web = validateExternalUrl(input.externalWebUrl);
      if (!deep.ok) throw new HttpError(400, 'bad_source', deep.message);
      if (!web.ok) throw new HttpError(400, 'bad_source', web.message);
      externalDeepLink = deep.url;
      externalWebUrl = web.url;
    }
    if (input.circleId) await this.assertMember(user.id, input.circleId);
    const service = input.service && SERVICES.has(input.service) ? input.service : undefined;
    let code = createRoomCode(randomInt);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await this.repo.findRoomByCode(code))) break;
      code = createRoomCode(randomInt);
    }
    const now = new Date();
    const record: RoomRecord = {
      id: randomUUID(),
      code,
      hostUserId: user.id,
      sourceType,
      syncMode: sourceType === 'native' ? 'automatic' : 'manual_aligned',
      sourceUrl,
      service,
      externalTitle: input.externalTitle?.trim().slice(0, 120) || undefined,
      externalDeepLink,
      externalWebUrl,
      status: 'active',
      circleId: input.circleId,
      permissions,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    };
    const participant = this.participant(record.id, user, 'host', record.createdAt);
    await this.repo.createRoom(record);
    await this.repo.addParticipant(participant);
    const state = hydrateRoom(record, [participant], null);
    await this.hub.save(state);
    this.analytics.enqueue({ name: 'room_created', userId: user.id, props: { sourceType, code } });
    return { state, messages: [] };
  }

  async joinByCode(user: UserRecord, code: string): Promise<RoomResponse> {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) throw new HttpError(400, 'bad_code', 'Код — это 6 цифр');
    const record = await this.requireActiveRoom(normalized);
    return this.joinRecord(user, record);
  }

  async getRoom(user: UserRecord, code: string): Promise<RoomResponse> {
    const record = await this.requireActiveRoom(code.trim());
    const participants = await this.repo.listParticipants(record.id);
    if (!participants.some((person) => person.userId === user.id)) throw new HttpError(403, 'forbidden', 'Сначала войдите по коду');
    const state = await this.ensureLive(record, participants);
    return { state, messages: await this.repo.listMessages(record.id) };
  }

  async deleteRoom(user: UserRecord, code: string): Promise<void> {
    const record = await this.repo.findRoomByCode(code.trim());
    if (!record) throw new HttpError(404, 'not_found', 'Комната не найдена');
    if (record.hostUserId !== user.id) throw new HttpError(403, 'forbidden', 'Закрыть комнату может только ведущий');
    await this.repo.setRoomStatus(record.id, 'deleted');
    await this.hub.delete(record.id, record.code);
    await this.storage.deleteRoomFiles(record.id);
    this.realtime.close(record.id);
  }

  async deleteMessage(user: UserRecord, code: string, messageId: string): Promise<void> {
    const state = await this.stateForMember(user, code);
    const messages = await this.repo.listMessages(state.roomId);
    const message = messages.find((item) => item.id === messageId);
    if (!message) throw new HttpError(404, 'not_found', 'Сообщение уже удалено');
    const me = state.participants.find((person) => person.userId === user.id);
    if (message.userId !== user.id && me?.role !== 'host' && me?.role !== 'co_host') {
      throw new HttpError(403, 'forbidden', 'Удалить может автор или ведущий');
    }
    await this.repo.deleteMessage(state.roomId, messageId);
    this.realtime.emit(state.roomId, { type: 'chat.deleted', messageId });
  }

  async report(user: UserRecord, input: { targetType: string; targetId: string; reason: string }): Promise<void> {
    const reason = input.reason.trim().slice(0, 300);
    if (!reason) throw new HttpError(400, 'invalid_input', 'Напишите, что случилось');
    if (input.targetType !== 'message' && input.targetType !== 'user') throw new HttpError(400, 'invalid_input', 'Неизвестная жалоба');
    await this.repo.addReport({ id: randomUUID(), reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason, createdAt: new Date().toISOString() });
  }

  async block(user: UserRecord, blockedId: string): Promise<void> {
    if (blockedId === user.id) throw new HttpError(400, 'invalid_input', 'Себя блокировать не нужно');
    if (!(await this.repo.findUserById(blockedId))) throw new HttpError(404, 'not_found', 'Пользователь не найден');
    await this.repo.blockUser({ id: randomUUID(), userId: user.id, blockedId, createdAt: new Date().toISOString() });
  }

  async circles(user: UserRecord): Promise<CircleSummary[]> {
    return (await this.repo.listCircles(user.id)).filter((circle) => circle.kind === 'group');
  }

  async createCircle(user: UserRecord, name: string): Promise<CircleSummary> {
    if (!entitlementsFor(user.plan).circles) throw new HttpError(402, 'pro_required', 'Circle входит в Sinc Pro');
    const circle = await this.makeCircle(user, name.trim(), 'group');
    this.analytics.enqueue({ name: 'circle_created', userId: user.id, props: { circleId: circle.id } });
    return circle;
  }

  async circle(user: UserRecord, id: string) {
    const circle = await this.assertMember(user.id, id);
    const [watchlist, votes, schedules, history] = await Promise.all([
      this.repo.listWatchItems(id),
      this.repo.listVotes(id),
      this.repo.listUpcoming(user.id),
      this.repo.listRecentRooms(user.id),
    ]);
    return {
      circle,
      watchlist,
      votes,
      schedules: schedules.filter((item) => item.circleId === id),
      history: history.filter((item) => item.circleId === id).map(toSummary),
    };
  }

  async addMember(user: UserRecord, circleId: string, email: string): Promise<CircleSummary> {
    const circle = await this.assertMember(user.id, circleId);
    if (circle.ownerUserId !== user.id) throw new HttpError(403, 'forbidden', 'Приглашать может хозяин Circle');
    const friend = await this.repo.findUserByEmail(email.trim().toLowerCase());
    if (!friend) throw new HttpError(404, 'not_found', 'Такой почты в Sinc ещё нет');
    if (await this.repo.isBlocked(user.id, friend.id)) throw new HttpError(403, 'blocked', 'Этот человек в блоке');
    if (!circle.members.some((member) => member.userId === friend.id)) {
      await this.repo.addCircleMember(circle.id, {
        id: randomUUID(),
        userId: friend.id,
        name: friend.name,
        avatarUrl: friend.avatarUrl,
        role: 'member',
        joinedAt: new Date().toISOString(),
      });
    }
    const fresh = await this.repo.findCircle(circle.id);
    if (!fresh) throw new HttpError(404, 'not_found', 'Circle не найден');
    return fresh;
  }

  async watchlist(user: UserRecord): Promise<WatchlistItem[]> {
    return this.repo.listWatchItemsForUser(user.id);
  }

  async addWatch(user: UserRecord, input: { circleId?: string; title: string; service?: string; externalUrl?: string; posterUrl?: string }): Promise<WatchlistItem[]> {
    const circle = input.circleId ? await this.assertMember(user.id, input.circleId) : await this.personalCircle(user);
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new HttpError(400, 'invalid_input', 'Нужно название');
    const external = validateExternalUrl(input.externalUrl);
    const poster = validateExternalUrl(input.posterUrl);
    if (!external.ok) throw new HttpError(400, 'bad_source', external.message);
    if (!poster.ok) throw new HttpError(400, 'bad_source', poster.message);
    const service = input.service === 'file' || (input.service && SERVICES.has(input.service as ServiceId)) ? (input.service as WatchlistItem['service']) : undefined;
    await this.repo.addWatchItem({
      id: randomUUID(),
      circleId: circle.id,
      addedByUserId: user.id,
      title,
      service,
      externalUrl: external.url,
      posterUrl: poster.url,
      createdAt: new Date().toISOString(),
    });
    return this.repo.listWatchItems(circle.id);
  }

  async createVote(user: UserRecord, input: { circleId: string; question: string; options: string[]; endsAt: string }): Promise<Vote> {
    await this.assertMember(user.id, input.circleId);
    const question = input.question.trim().slice(0, 140);
    const labels = [...new Set(input.options.map((item) => item.trim()).filter(Boolean))].slice(0, 6);
    if (!question || labels.length < 2) throw new HttpError(400, 'invalid_input', 'Нужен вопрос и хотя бы два варианта');
    const ends = Date.parse(input.endsAt);
    if (!Number.isFinite(ends) || ends < Date.now()) throw new HttpError(400, 'invalid_input', 'Голосование уже закончилось бы');
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const vote: Vote = {
      id,
      circleId: input.circleId,
      question,
      endsAt: new Date(ends).toISOString(),
      createdAt,
      options: labels.map((label) => ({ id: randomUUID(), voteId: id, label: label.slice(0, 80), voterIds: [], createdAt })),
    };
    await this.repo.createVote(vote);
    return vote;
  }

  async castVote(user: UserRecord, optionId: string): Promise<Vote> {
    const vote = await this.repo.findVoteByOption(optionId);
    if (!vote) throw new HttpError(404, 'not_found', 'Вариант не найден');
    await this.assertMember(user.id, vote.circleId);
    if (Date.parse(vote.endsAt) < Date.now()) throw new HttpError(400, 'vote_closed', 'Голосование закрыто');
    for (const option of vote.options) {
      option.voterIds = option.voterIds.filter((id) => id !== user.id);
      if (option.id === optionId) option.voterIds.push(user.id);
    }
    await this.repo.saveVote(vote);
    return vote;
  }

  async createSchedule(user: UserRecord, input: { title: string; startsAt: string; timezone: string; circleId?: string; posterUrl?: string }): Promise<ScheduledWatch> {
    if (!entitlementsFor(user.plan).scheduling) throw new HttpError(402, 'pro_required', 'Планирование входит в Sinc Pro');
    if (input.circleId) await this.assertMember(user.id, input.circleId);
    const title = input.title.trim().slice(0, 120);
    const starts = Date.parse(input.startsAt);
    if (!title || !Number.isFinite(starts)) throw new HttpError(400, 'invalid_input', 'Нужны название и время');
    if (starts < Date.now() - 60_000) throw new HttpError(400, 'invalid_input', 'Это время уже прошло');
    const poster = validateExternalUrl(input.posterUrl);
    if (!poster.ok) throw new HttpError(400, 'bad_source', poster.message);
    const schedule: ScheduledWatch = {
      id: randomUUID(),
      circleId: input.circleId,
      title,
      startsAt: new Date(starts).toISOString(),
      timezone: input.timezone.trim().slice(0, 80) || 'UTC',
      posterUrl: poster.url,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      rsvps: [{ userId: user.id, name: user.name, response: 'yes' }],
    };
    await this.repo.createSchedule(schedule);
    await this.scheduleReminders(user.id, title, schedule.startsAt);
    this.analytics.enqueue({ name: 'watch_scheduled', userId: user.id, props: { scheduleId: schedule.id } });
    return schedule;
  }

  async schedule(user: UserRecord, id: string): Promise<ScheduledWatch> {
    const item = await this.repo.findSchedule(id);
    if (!item) throw new HttpError(404, 'not_found', 'Просмотр не найден');
    await this.assertCanSeeSchedule(user, item);
    return item;
  }

  async rsvp(user: UserRecord, id: string, response: 'yes' | 'no'): Promise<ScheduledWatch> {
    const item = await this.schedule(user, id);
    const updated = await this.repo.setRsvp({
      id: randomUUID(),
      scheduledWatchId: item.id,
      userId: user.id,
      name: user.name,
      response,
      createdAt: new Date().toISOString(),
    });
    if (response === 'yes') await this.scheduleReminders(user.id, item.title, item.startsAt);
    return updated;
  }

  async startSchedule(user: UserRecord, id: string): Promise<RoomResponse> {
    const item = await this.schedule(user, id);
    if (item.createdBy !== user.id) throw new HttpError(403, 'forbidden', 'Начать может тот, кто запланировал');
    if (item.roomId) {
      const existing = await this.repo.findRoomById(item.roomId);
      if (existing && existing.status === 'active') return this.joinRecord(user, existing);
    }
    const created = await this.createRoom(user, {
      sourceType: 'external_service',
      service: 'other',
      externalTitle: item.title,
      circleId: item.circleId,
      permissions: DEFAULT_PERMISSIONS,
    });
    await this.repo.attachScheduleRoom(item.id, created.state.roomId);
    return created;
  }

  async track(user: UserRecord, name: string, props: Record<string, string | number | boolean | null> = {}): Promise<void> {
    if (!isAnalyticsEvent(name) || !CLIENT_ANALYTICS.has(name)) return;
    this.analytics.enqueue({ name, userId: user.id, props });
  }

  async upload(user: UserRecord, code: string, fileName: string, contentType: string) {
    if (!entitlementsFor(user.plan).fileUpload) throw new HttpError(402, 'pro_required', 'Загрузка файлов — в Sinc Pro');
    const state = await this.stateForMember(user, code);
    return this.storage.createUploadUrl({ roomId: state.roomId, fileName: fileName.slice(0, 180), contentType: contentType.slice(0, 120) });
  }

  voice(): never {
    throw new HttpError(501, 'voice_unavailable', 'Голосовые комнаты подключим через LiveKit. В этом MVP их нет.');
  }

  async handleSocket(user: UserRecord, event: ClientEvent): Promise<SocketEffect> {
    switch (event.type) {
      case 'time.ping':
        return { toRoom: [], toSender: [{ type: 'time.pong', clientSentAt: event.clientSentAt, serverTimestamp: Date.now() }] };
      case 'room.join':
        return this.socketJoin(user, event.roomId);
      case 'room.leave':
        return this.socketLeave(user, event.roomId);
      case 'playback.play':
      case 'playback.pause':
      case 'playback.seek':
      case 'playback.rate':
        return this.socketPlayback(user, event);
      case 'playback.sync':
        return this.socketSync(user, event.clientPositionSec);
      case 'participant.status':
        return this.socketStatus(user, event.status);
      case 'external.confirm_opened':
        return this.socketStatus(user, 'opened_external_app');
      case 'chat.message':
        return this.socketChat(user, event.text);
      case 'reaction':
        return this.socketReaction(user, event.emoji);
      case 'watchlist.add': {
        const items = await this.addWatch(user, event);
        return this.roomOrSender(user, { type: 'watchlist.update', items });
      }
      case 'vote.create':
        return this.roomOrSender(user, { type: 'vote.update', vote: await this.createVote(user, event) });
      case 'vote.cast':
        return this.roomOrSender(user, { type: 'vote.update', vote: await this.castVote(user, event.optionId) });
      default:
        return { toRoom: [], toSender: [] };
    }
  }

  private async socketJoin(user: UserRecord, roomIdOrCode: string): Promise<SocketEffect> {
    const record = /^\d{6}$/.test(roomIdOrCode) ? await this.requireActiveRoom(roomIdOrCode) : await this.repo.findRoomById(roomIdOrCode);
    if (!record || record.status === 'deleted') throw new HttpError(404, 'not_found', 'Комната не найдена');
    const bundle = await this.joinRecord(user, record);
    this.presence.set(user.id, bundle.state.roomId);
    return {
      joinRoomId: bundle.state.roomId,
      roomId: bundle.state.roomId,
      toRoom: [
        { type: 'room.state', state: bundle.state },
        { type: 'participant.update', participants: bundle.state.participants },
      ],
      toSender: [],
    };
  }

  private async socketLeave(user: UserRecord, roomIdOrCode: string): Promise<SocketEffect> {
    const roomId = this.presence.get(user.id) ?? ((await this.resolveRoom(roomIdOrCode))?.id ?? '');
    if (!roomId) return { toRoom: [], toSender: [] };
    const state = await this.hub.getById(roomId);
    this.presence.delete(user.id);
    if (!state) return { toRoom: [], toSender: [] };
    const next = this.patchParticipant(state, user.id, { status: 'disconnected', connectionQuality: 'poor' });
    await this.hub.save(next);
    return { roomId, toRoom: [{ type: 'participant.update', participants: next.participants }], toSender: [] };
  }

  private async socketPlayback(user: UserRecord, event: Extract<ClientEvent, { type: 'playback.play' | 'playback.pause' | 'playback.seek' | 'playback.rate' }>): Promise<SocketEffect> {
    const state = await this.presentState(user.id);
    const input =
      event.type === 'playback.rate'
        ? { type: 'rate' as const, positionSec: state.positionSec, rate: event.rate }
        : { type: event.type.replace('playback.', '') as 'play' | 'pause' | 'seek', positionSec: event.positionSec };
    const result = reducePlayback(state, input, user.id, Date.now());
    if (!result.ok) throw new HttpError(403, result.code, result.message);
    const status = result.command.action === 'pause' ? 'paused' : 'ready';
    const next = this.patchParticipant(result.state, user.id, { status });
    await this.hub.save(next);
    await this.repo.addPlaybackEvent({
      id: randomUUID(),
      roomId: next.roomId,
      userId: user.id,
      eventType: result.command.action,
      positionSec: next.positionSec,
      createdAt: new Date().toISOString(),
    });
    this.notePlayback(next.roomId, next.isPlaying, next.hostUserId);
    return {
      roomId: next.roomId,
      toRoom: [
        { type: 'room.state', state: next },
        { type: 'playback.command', command: result.command },
        { type: 'participant.update', participants: next.participants },
      ],
      toSender: [],
    };
  }

  private async socketSync(user: UserRecord, clientPositionSec: number): Promise<SocketEffect> {
    const state = await this.presentState(user.id);
    this.notePlayback(state.roomId, state.isPlaying, state.hostUserId);
    if (state.sourceType !== 'native' || !Number.isFinite(clientPositionSec)) return { toRoom: [], toSender: [] };
    const expected = expectedPositionSec(state, Date.now());
    const status = Math.abs(clientPositionSec - expected) > 2 ? 'drifted' : state.isPlaying ? 'ready' : 'paused';
    const next = this.patchParticipant(state, user.id, { status });
    await this.hub.save(next);
    return { roomId: next.roomId, toRoom: [{ type: 'participant.update', participants: next.participants }], toSender: [] };
  }

  private async socketStatus(user: UserRecord, status: Participant['status']): Promise<SocketEffect> {
    if (!PARTICIPANT_STATUSES.includes(status)) throw new HttpError(400, 'invalid_input', 'Неизвестный статус');
    const state = await this.presentState(user.id);
    const next = this.patchParticipant(state, user.id, { status });
    await this.hub.save(next);
    return { roomId: next.roomId, toRoom: [{ type: 'participant.update', participants: next.participants }], toSender: [] };
  }

  private async socketChat(user: UserRecord, text: string): Promise<SocketEffect> {
    const state = await this.presentState(user.id);
    if (!state.permissions.chatEnabled) throw new HttpError(403, 'chat_off', 'В этой комнате чат выключен');
    await this.assertNotBlocked(user.id, state);
    if (!this.allowChat(user.id)) throw new HttpError(429, 'rate_limited', 'Слишком часто. Подождите пару секунд');
    const messages = await this.repo.listMessages(state.roomId);
    const recent = messages.filter((item) => item.userId === user.id).slice(-10).map((item) => item.text);
    const inspected = inspectMessage(text, recent);
    if (!inspected.ok) throw new HttpError(400, 'rejected', inspected.reason);
    const message: ChatMessage = { id: randomUUID(), roomId: state.roomId, userId: user.id, name: user.name, text: inspected.text, createdAt: new Date().toISOString() };
    await this.repo.addMessage(message);
    return { roomId: state.roomId, toRoom: [{ type: 'chat.message', message }], toSender: [] };
  }

  private async socketReaction(user: UserRecord, emoji: string): Promise<SocketEffect> {
    const state = await this.presentState(user.id);
    if (!state.permissions.reactionsEnabled) throw new HttpError(403, 'reactions_off', 'Реакции выключены');
    if (!(ALLOWED_REACTIONS as readonly string[]).includes(emoji)) throw new HttpError(400, 'invalid_input', 'Такой реакции нет');
    const reaction: Reaction = { id: randomUUID(), roomId: state.roomId, userId: user.id, emoji, createdAt: new Date().toISOString() };
    await this.repo.addReaction(reaction);
    return { roomId: state.roomId, toRoom: [{ type: 'reaction', reaction }], toSender: [] };
  }

  private roomOrSender(user: UserRecord, event: ServerEvent): SocketEffect {
    const roomId = this.presence.get(user.id);
    return roomId ? { roomId, toRoom: [event], toSender: [] } : { toRoom: [], toSender: [event] };
  }

  private async presentState(userId: string): Promise<RoomPlaybackState> {
    const roomId = this.presence.get(userId);
    if (!roomId) throw new HttpError(400, 'no_room', 'Сначала войдите в комнату');
    const state = await this.hub.getById(roomId);
    if (!state) throw new HttpError(404, 'not_found', 'Комната не найдена');
    return state;
  }

  private async joinRecord(user: UserRecord, record: RoomRecord): Promise<RoomResponse> {
    if (record.status !== 'active') throw new HttpError(410, 'room_closed', 'Комната уже закрыта');
    if (Date.parse(record.expiresAt) < Date.now()) {
      await this.repo.setRoomStatus(record.id, 'ended');
      throw new HttpError(410, 'room_expired', 'Код комнаты истёк');
    }
    if (await this.repo.isBlocked(user.id, record.hostUserId)) throw new HttpError(403, 'blocked', 'В эту комнату нельзя войти');
    const participants = await this.repo.listParticipants(record.id);
    if (!participants.some((person) => person.userId === user.id)) {
      const host = await this.repo.findUserById(record.hostUserId);
      const limit = entitlementsFor(host?.plan ?? 'free').maxParticipants;
      if (participants.length >= limit) throw new HttpError(403, 'room_full', `В комнате уже ${limit} человек. Большие залы — в Sinc Pro.`);
      const role = user.email.endsWith('@guests.sinc.app') ? 'guest' : 'participant';
      const person = this.participant(record.id, user, role, new Date().toISOString());
      await this.repo.addParticipant(person);
      participants.push(person);
      if (participants.length === 2) this.analytics.enqueue({ name: 'friend_joined', userId: record.hostUserId, props: { code: record.code } });
      if (record.circleId) {
        const circle = await this.repo.findCircle(record.circleId);
        if (circle?.kind === 'group' && !circle.members.some((member) => member.userId === user.id)) {
          await this.repo.addCircleMember(circle.id, { id: randomUUID(), userId: user.id, name: user.name, avatarUrl: user.avatarUrl, role: 'member', joinedAt: person.joinedAt });
        }
      }
    } else {
      await this.repo.touchParticipant(record.id, user.id, new Date().toISOString());
    }
    let state = await this.ensureLive(record, participants);
    state = this.patchParticipant(state, user.id, { status: 'ready', connectionQuality: 'good' });
    await this.hub.save(state);
    return { state, messages: await this.repo.listMessages(record.id) };
  }

  private async ensureLive(record: RoomRecord, participants: ParticipantRecord[]): Promise<RoomPlaybackState> {
    const live = await this.hub.getById(record.id);
    if (!live) return hydrateRoom(record, participants, await this.repo.lastPlaybackEvent(record.id));
    const known = new Set(live.participants.map((person) => person.userId));
    const extras = participants.filter((person) => !known.has(person.userId)).map(toLiveParticipant);
    return extras.length > 0 ? { ...live, participants: [...live.participants, ...extras] } : live;
  }

  private async requireActiveRoom(code: string): Promise<RoomRecord> {
    const record = await this.repo.findRoomByCode(code);
    if (!record || record.status === 'deleted') throw new HttpError(404, 'not_found', 'Комната с таким кодом не найдена');
    return record;
  }

  private async resolveRoom(roomIdOrCode: string): Promise<RoomRecord | null> {
    return /^\d{6}$/.test(roomIdOrCode) ? this.repo.findRoomByCode(roomIdOrCode) : this.repo.findRoomById(roomIdOrCode);
  }

  private async stateForMember(user: UserRecord, code: string): Promise<RoomPlaybackState> {
    const bundle = await this.getRoom(user, code);
    return bundle.state;
  }

  private async assertMember(userId: string, circleId: string): Promise<CircleSummary> {
    const circle = await this.repo.findCircle(circleId);
    if (!circle || !circle.members.some((member) => member.userId === userId)) throw new HttpError(403, 'forbidden', 'Вы не в этом Circle');
    return circle;
  }

  private async assertCanSeeSchedule(user: UserRecord, item: ScheduledWatch): Promise<void> {
    if (item.createdBy === user.id || item.rsvps.some((rsvp) => rsvp.userId === user.id)) return;
    if (item.circleId) {
      const circle = await this.repo.findCircle(item.circleId);
      if (circle?.members.some((member) => member.userId === user.id)) return;
    }
    throw new HttpError(403, 'forbidden', 'Это чужой просмотр');
  }

  private async assertNotBlocked(userId: string, state: RoomPlaybackState): Promise<void> {
    for (const person of state.participants) {
      if (person.userId !== userId && (await this.repo.isBlocked(userId, person.userId))) {
        throw new HttpError(403, 'blocked', 'Сообщение не отправлено');
      }
    }
  }

  private async personalCircle(user: UserRecord): Promise<CircleSummary> {
    const existing = (await this.repo.listCircles(user.id)).find((circle) => circle.kind === 'personal');
    if (existing) return existing;
    return this.makeCircle(user, 'Мой список', 'personal');
  }

  private async makeCircle(user: UserRecord, name: string, kind: 'personal' | 'group'): Promise<CircleSummary> {
    const trimmed = name.trim().slice(0, 60);
    if (trimmed.length < 2) throw new HttpError(400, 'invalid_input', 'Название слишком короткое');
    const now = new Date().toISOString();
    const circle: CircleSummary = {
      id: randomUUID(),
      name: trimmed,
      ownerUserId: user.id,
      kind,
      createdAt: now,
      members: [{ userId: user.id, name: user.name, avatarUrl: user.avatarUrl, role: 'owner', joinedAt: now }],
    };
    await this.repo.createCircle(circle);
    return circle;
  }

  private async createUser(input: { email: string; name: string; passwordHash?: string }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const user: UserRecord = { id: randomUUID(), email: input.email, name: input.name, plan: 'free', passwordHash: input.passwordHash, createdAt: now };
    await this.repo.createUser(user);
    await this.makeCircle(user, 'Мой список', 'personal');
    return user;
  }

  private async scheduleReminders(userId: string, title: string, startsAt: string): Promise<void> {
    const start = Date.parse(startsAt);
    const points = [
      { at: start - 30 * 60 * 1000, body: `«${title}» начнётся через 30 минут` },
      { at: start - 5 * 60 * 1000, body: `«${title}» начнётся через 5 минут` },
    ];
    for (const point of points) {
      if (point.at <= Date.now()) continue;
      await this.repo.addReminder({ id: randomUUID(), userId, sendAt: new Date(point.at).toISOString(), title: 'Sinc', body: point.body });
    }
  }

  private participant(roomId: string, user: UserRecord, role: ParticipantRecord['role'], at: string): ParticipantRecord {
    return { id: randomUUID(), roomId, userId: user.id, name: user.name, avatarUrl: user.avatarUrl, role, joinedAt: at, lastSeenAt: at };
  }

  private patchParticipant(state: RoomPlaybackState, userId: string, patch: Partial<Participant>): RoomPlaybackState {
    const now = new Date().toISOString();
    void this.repo.touchParticipant(state.roomId, userId, now);
    return {
      ...state,
      participants: state.participants.map((person) => (person.userId === userId ? { ...person, ...patch, lastSeenAt: now } : person)),
    };
  }

  private allowChat(userId: string): boolean {
    const now = Date.now();
    const recent = (this.chatTimes.get(userId) ?? []).filter((time) => now - time < 5_000);
    if (recent.length >= 5) {
      this.chatTimes.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.chatTimes.set(userId, recent);
    return true;
  }

  private notePlayback(roomId: string, isPlaying: boolean, userId: string): void {
    const meta = this.playbackMeta.get(roomId) ?? { accumulatedSec: 0, playingSince: null, started: false, ten: false };
    const now = Date.now();
    if (isPlaying) {
      if (!meta.started) {
        meta.started = true;
        this.analytics.enqueue({ name: 'watch_started', userId, props: { roomId } });
      }
      if (meta.playingSince == null) meta.playingSince = now;
    } else if (meta.playingSince != null) {
      meta.accumulatedSec += (now - meta.playingSince) / 1000;
      meta.playingSince = null;
    }
    const live = meta.playingSince ? (now - meta.playingSince) / 1000 : 0;
    if (!meta.ten && meta.accumulatedSec + live >= 600) {
      meta.ten = true;
      this.analytics.enqueue({ name: 'watch_10_min', userId, props: { roomId } });
    }
    this.playbackMeta.set(roomId, meta);
  }

  private auth(user: UserRecord) {
    return { token: signJwt({ sub: user.id, email: user.email }, this.jwtSecret), user: toPublic(user) };
  }
}

function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email.endsWith('@guests.sinc.app') ? '' : user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    plan: user.plan,
    createdAt: user.createdAt,
  };
}

function toSummary(record: RoomRecord): RoomSummary {
  return {
    code: record.code,
    title: roomTitle(record),
    sourceType: record.sourceType,
    service: record.service,
    status: record.status,
    createdAt: record.createdAt,
  };
}
