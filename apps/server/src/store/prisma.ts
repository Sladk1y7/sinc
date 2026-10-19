import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_PERMISSIONS, type CircleSummary, type ScheduledWatch, type ServiceId, type SourceType, type Vote, type WatchlistItem } from '@sinc/shared';
import type { AnalyticsRecord, ParticipantRecord, PlaybackRecord, ReminderRecord, Repository, RoomRecord, UserRecord } from './types';

const db = new PrismaClient();

export class PrismaRepository implements Repository {
  constructor(private prisma = db) {}

  async createUser(input: UserRecord): Promise<void> {
    await this.prisma.user.create({ data: this.userData(input) });
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.userFrom(row) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.userFrom(row) : null;
  }

  async updateUser(id: string, patch: Partial<Pick<UserRecord, 'name' | 'plan' | 'avatarUrl'>>): Promise<UserRecord> {
    const row = await this.prisma.user.update({
      where: { id },
      data: { name: patch.name, plan: patch.plan, avatarUrl: patch.avatarUrl },
    });
    return this.userFrom(row);
  }

  async createCircle(input: CircleSummary): Promise<void> {
    await this.prisma.circle.create({
      data: {
        id: input.id,
        name: input.name,
        ownerUserId: input.ownerUserId,
        kind: input.kind,
        createdAt: new Date(input.createdAt),
        members: {
          create: input.members.map((member) => ({
            id: randomUUID(),
            userId: member.userId,
            role: member.role,
            joinedAt: new Date(member.joinedAt),
          })),
        },
      },
    });
  }

  async listCircles(userId: string): Promise<CircleSummary[]> {
    const rows = await this.prisma.circle.findMany({
      where: { members: { some: { userId } } },
      include: circleInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.circleFrom(row));
  }

  async findCircle(id: string): Promise<CircleSummary | null> {
    const row = await this.prisma.circle.findUnique({ where: { id }, include: circleInclude });
    return row ? this.circleFrom(row) : null;
  }

  async addCircleMember(circleId: string, member: CircleSummary['members'][number] & { id: string }): Promise<void> {
    await this.prisma.circleMember.create({
      data: { id: member.id, circleId, userId: member.userId, role: member.role, joinedAt: new Date(member.joinedAt) },
    });
  }

  async createRoom(input: RoomRecord): Promise<void> {
    await this.prisma.room.create({
      data: {
        id: input.id,
        code: input.code,
        hostUserId: input.hostUserId,
        sourceType: input.sourceType,
        syncMode: input.syncMode,
        sourceUrl: input.sourceUrl,
        service: input.service,
        externalTitle: input.externalTitle,
        externalDeepLink: input.externalDeepLink,
        externalWebUrl: input.externalWebUrl,
        status: input.status,
        circleId: input.circleId,
        permissionsJson: JSON.stringify(input.permissions),
        createdAt: new Date(input.createdAt),
        expiresAt: new Date(input.expiresAt),
      },
    });
  }

  async findRoomByCode(code: string): Promise<RoomRecord | null> {
    const row = await this.prisma.room.findUnique({ where: { code } });
    return row ? this.roomFrom(row) : null;
  }

  async findRoomById(id: string): Promise<RoomRecord | null> {
    const row = await this.prisma.room.findUnique({ where: { id } });
    return row ? this.roomFrom(row) : null;
  }

  async listRecentRooms(userId: string): Promise<RoomRecord[]> {
    const rows = await this.prisma.room.findMany({
      where: { status: { not: 'deleted' }, participants: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    return rows.map((row) => this.roomFrom(row));
  }

  async setRoomStatus(id: string, status: RoomRecord['status']): Promise<void> {
    await this.prisma.room.update({ where: { id }, data: { status } });
  }

  async addParticipant(input: ParticipantRecord): Promise<void> {
    await this.prisma.roomParticipant.create({
      data: {
        id: input.id,
        roomId: input.roomId,
        userId: input.userId,
        role: input.role,
        joinedAt: new Date(input.joinedAt),
        lastSeenAt: new Date(input.lastSeenAt),
      },
    });
  }

  async listParticipants(roomId: string): Promise<ParticipantRecord[]> {
    const rows = await this.prisma.roomParticipant.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl ?? undefined,
      role: asRole(row.role),
      joinedAt: row.joinedAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    }));
  }

  async touchParticipant(roomId: string, userId: string, at: string): Promise<void> {
    await this.prisma.roomParticipant.updateMany({ where: { roomId, userId }, data: { lastSeenAt: new Date(at) } });
  }

  async addPlaybackEvent(input: { id: string; roomId: string; userId: string; eventType: string; positionSec: number; createdAt: string }): Promise<void> {
    await this.prisma.playbackEvent.create({
      data: { id: input.id, roomId: input.roomId, userId: input.userId, eventType: input.eventType, positionSec: input.positionSec, createdAt: new Date(input.createdAt) },
    });
  }

  async lastPlaybackEvent(roomId: string): Promise<PlaybackRecord | null> {
    const row = await this.prisma.playbackEvent.findFirst({ where: { roomId }, orderBy: { createdAt: 'desc' } });
    return row ? { eventType: row.eventType, positionSec: row.positionSec, createdAt: row.createdAt.toISOString() } : null;
  }

  async addMessage(input: { id: string; roomId: string; userId: string; text: string; createdAt: string }): Promise<void> {
    await this.prisma.message.create({
      data: { id: input.id, roomId: input.roomId, userId: input.userId, text: input.text, createdAt: new Date(input.createdAt) },
    });
  }

  async listMessages(roomId: string): Promise<{ id: string; roomId: string; userId: string; name: string; text: string; createdAt: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.reverse().map((row) => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      name: row.user.name,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    await this.prisma.message.deleteMany({ where: { id: messageId, roomId } });
  }

  async addReaction(input: { id: string; roomId: string; userId: string; emoji: string; createdAt: string }): Promise<void> {
    await this.prisma.reaction.create({
      data: { id: input.id, roomId: input.roomId, userId: input.userId, emoji: input.emoji, createdAt: new Date(input.createdAt) },
    });
  }

  async addWatchItem(input: WatchlistItem): Promise<void> {
    await this.prisma.watchlistItem.create({
      data: {
        id: input.id,
        circleId: input.circleId,
        addedByUserId: input.addedByUserId,
        title: input.title,
        service: input.service,
        externalUrl: input.externalUrl,
        posterUrl: input.posterUrl,
        createdAt: new Date(input.createdAt),
      },
    });
  }

  async listWatchItems(circleId: string): Promise<WatchlistItem[]> {
    const rows = await this.prisma.watchlistItem.findMany({ where: { circleId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.watchFrom(row));
  }

  async listWatchItemsForUser(userId: string): Promise<WatchlistItem[]> {
    const rows = await this.prisma.watchlistItem.findMany({
      where: { circle: { members: { some: { userId } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.watchFrom(row));
  }

  async createSchedule(input: ScheduledWatch): Promise<void> {
    await this.prisma.scheduledWatch.create({
      data: {
        id: input.id,
        circleId: input.circleId,
        roomId: input.roomId,
        title: input.title,
        startsAt: new Date(input.startsAt),
        timezone: input.timezone,
        posterUrl: input.posterUrl,
        createdBy: input.createdBy,
        createdAt: new Date(input.createdAt),
        rsvps: {
          create: input.rsvps.map((rsvp) => ({ id: randomUUID(), userId: rsvp.userId, response: rsvp.response })),
        },
      },
    });
  }

  async listUpcoming(userId: string): Promise<ScheduledWatch[]> {
    const rows = await this.prisma.scheduledWatch.findMany({
      where: {
        startsAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        OR: [{ createdBy: userId }, { rsvps: { some: { userId } } }, { circle: { members: { some: { userId } } } }],
      },
      include: scheduleInclude,
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    return rows.map((row) => this.scheduleFrom(row));
  }

  async findSchedule(id: string): Promise<ScheduledWatch | null> {
    const row = await this.prisma.scheduledWatch.findUnique({ where: { id }, include: scheduleInclude });
    return row ? this.scheduleFrom(row) : null;
  }

  async setRsvp(input: { id: string; scheduledWatchId: string; userId: string; response: 'yes' | 'no'; createdAt: string }): Promise<ScheduledWatch> {
    await this.prisma.scheduledWatchRsvp.upsert({
      where: { scheduledWatchId_userId: { scheduledWatchId: input.scheduledWatchId, userId: input.userId } },
      create: { id: input.id, scheduledWatchId: input.scheduledWatchId, userId: input.userId, response: input.response, createdAt: new Date(input.createdAt) },
      update: { response: input.response },
    });
    const schedule = await this.findSchedule(input.scheduledWatchId);
    if (!schedule) throw new Error('schedule missing');
    return schedule;
  }

  async attachScheduleRoom(scheduleId: string, roomId: string): Promise<void> {
    await this.prisma.scheduledWatch.update({ where: { id: scheduleId }, data: { roomId } });
  }

  async createVote(input: Vote): Promise<void> {
    await this.prisma.vote.create({
      data: {
        id: input.id,
        circleId: input.circleId,
        question: input.question,
        endsAt: new Date(input.endsAt),
        createdAt: new Date(input.createdAt),
        options: { create: input.options.map((option) => ({ id: option.id, label: option.label, createdAt: new Date(option.createdAt) })) },
      },
    });
  }

  async listVotes(circleId: string): Promise<Vote[]> {
    const rows = await this.prisma.vote.findMany({ where: { circleId }, include: voteInclude, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.voteFrom(row));
  }

  async findVoteByOption(optionId: string): Promise<Vote | null> {
    const option = await this.prisma.voteOption.findUnique({ where: { id: optionId }, include: { vote: { include: voteInclude } } });
    return option ? this.voteFrom(option.vote) : null;
  }

  async saveVote(vote: Vote): Promise<void> {
    await this.prisma.voteAnswer.deleteMany({ where: { option: { voteId: vote.id } } });
    const answers = vote.options.flatMap((option) =>
      option.voterIds.map((userId) => ({ id: randomUUID(), voteOptionId: option.id, userId, createdAt: new Date() })),
    );
    if (answers.length > 0) await this.prisma.voteAnswer.createMany({ data: answers });
  }

  async addReport(input: { id: string; reporterId: string; targetType: string; targetId: string; reason: string; createdAt: string }): Promise<void> {
    await this.prisma.report.create({
      data: { id: input.id, reporterId: input.reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, createdAt: new Date(input.createdAt) },
    });
  }

  async blockUser(input: { id: string; userId: string; blockedId: string; createdAt: string }): Promise<void> {
    await this.prisma.userBlock.upsert({
      where: { userId_blockedId: { userId: input.userId, blockedId: input.blockedId } },
      create: { id: input.id, userId: input.userId, blockedId: input.blockedId, createdAt: new Date(input.createdAt) },
      update: {},
    });
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findFirst({ where: { OR: [{ userId: a, blockedId: b }, { userId: b, blockedId: a }] } });
    return Boolean(row);
  }

  async addAnalytics(input: AnalyticsRecord): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: { id: input.id, userId: input.userId, name: input.name, props: input.props as Prisma.InputJsonValue, createdAt: new Date(input.createdAt) },
    });
  }

  async addReminder(input: ReminderRecord): Promise<void> {
    await this.prisma.pushReminder.create({
      data: { id: input.id, userId: input.userId, sendAt: new Date(input.sendAt), title: input.title, body: input.body },
    });
  }

  async dueReminders(nowIso: string): Promise<ReminderRecord[]> {
    const rows = await this.prisma.pushReminder.findMany({ where: { sentAt: null, sendAt: { lte: new Date(nowIso) } }, take: 50 });
    return rows.map((row) => ({ id: row.id, userId: row.userId, sendAt: row.sendAt.toISOString(), title: row.title, body: row.body, sentAt: row.sentAt?.toISOString() }));
  }

  async markReminderSent(id: string): Promise<void> {
    await this.prisma.pushReminder.update({ where: { id }, data: { sentAt: new Date() } });
  }

  private userData(input: UserRecord) {
    return {
      id: input.id,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      plan: input.plan,
      passwordHash: input.passwordHash,
      createdAt: new Date(input.createdAt),
    };
  }

  private userFrom(row: { id: string; email: string; name: string; avatarUrl: string | null; plan: string; passwordHash: string | null; createdAt: Date }): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl ?? undefined,
      plan: row.plan === 'pro' ? 'pro' : 'free',
      passwordHash: row.passwordHash ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private roomFrom(row: {
    id: string;
    code: string;
    hostUserId: string;
    sourceType: string;
    syncMode: string;
    sourceUrl: string | null;
    service: string | null;
    externalTitle: string | null;
    externalDeepLink: string | null;
    externalWebUrl: string | null;
    status: string;
    circleId: string | null;
    permissionsJson: string;
    createdAt: Date;
    expiresAt: Date;
  }): RoomRecord {
    return {
      id: row.id,
      code: row.code,
      hostUserId: row.hostUserId,
      sourceType: asSource(row.sourceType),
      syncMode: row.syncMode === 'manual_aligned' ? 'manual_aligned' : 'automatic',
      sourceUrl: row.sourceUrl ?? undefined,
      service: asService(row.service),
      externalTitle: row.externalTitle ?? undefined,
      externalDeepLink: row.externalDeepLink ?? undefined,
      externalWebUrl: row.externalWebUrl ?? undefined,
      status: row.status === 'deleted' || row.status === 'ended' ? row.status : 'active',
      circleId: row.circleId ?? undefined,
      permissions: readPermissions(row.permissionsJson),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  private circleFrom(row: {
    id: string;
    name: string;
    ownerUserId: string;
    kind: string;
    createdAt: Date;
    members: { userId: string; role: string; joinedAt: Date; user: { name: string; avatarUrl: string | null } }[];
  }): CircleSummary {
    return {
      id: row.id,
      name: row.name,
      ownerUserId: row.ownerUserId,
      kind: row.kind === 'personal' ? 'personal' : 'group',
      createdAt: row.createdAt.toISOString(),
      members: row.members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        avatarUrl: member.user.avatarUrl ?? undefined,
        role: member.role === 'owner' ? 'owner' : 'member',
        joinedAt: member.joinedAt.toISOString(),
      })),
    };
  }

  private watchFrom(row: { id: string; circleId: string; addedByUserId: string; title: string; service: string | null; externalUrl: string | null; posterUrl: string | null; createdAt: Date }): WatchlistItem {
    return {
      id: row.id,
      circleId: row.circleId,
      addedByUserId: row.addedByUserId,
      title: row.title,
      service: asWatchService(row.service),
      externalUrl: row.externalUrl ?? undefined,
      posterUrl: row.posterUrl ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private scheduleFrom(row: {
    id: string;
    circleId: string | null;
    roomId: string | null;
    title: string;
    startsAt: Date;
    timezone: string;
    posterUrl: string | null;
    createdBy: string;
    createdAt: Date;
    rsvps: { userId: string; response: string; user: { name: string } }[];
  }): ScheduledWatch {
    return {
      id: row.id,
      circleId: row.circleId ?? undefined,
      roomId: row.roomId ?? undefined,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      timezone: row.timezone,
      posterUrl: row.posterUrl ?? undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      rsvps: row.rsvps.map((rsvp) => ({ userId: rsvp.userId, name: rsvp.user.name, response: rsvp.response === 'no' ? 'no' : 'yes' })),
    };
  }

  private voteFrom(row: {
    id: string;
    circleId: string;
    question: string;
    endsAt: Date;
    createdAt: Date;
    options: { id: string; label: string; createdAt: Date; answers: { userId: string }[] }[];
  }): Vote {
    return {
      id: row.id,
      circleId: row.circleId,
      question: row.question,
      endsAt: row.endsAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      options: row.options.map((option) => ({
        id: option.id,
        voteId: row.id,
        label: option.label,
        voterIds: option.answers.map((answer) => answer.userId),
        createdAt: option.createdAt.toISOString(),
      })),
    };
  }
}

const circleInclude = { members: { include: { user: true }, orderBy: { joinedAt: 'asc' as const } } };
const scheduleInclude = { rsvps: { include: { user: true } } };
const voteInclude = { options: { include: { answers: true }, orderBy: { createdAt: 'asc' as const } } };

function readPermissions(raw: string) {
  try {
    return { ...DEFAULT_PERMISSIONS, ...(JSON.parse(raw) as Partial<typeof DEFAULT_PERMISSIONS>) };
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
}

function asSource(value: string): SourceType {
  return value === 'external_service' ? 'external_service' : 'native';
}

function asService(value: string | null): ServiceId | undefined {
  if (value === 'kinopoisk' || value === 'okko' || value === 'ivi' || value === 'other') return value;
  return undefined;
}

function asWatchService(value: string | null): WatchlistItem['service'] {
  if (value === 'file') return 'file';
  return asService(value);
}

function asRole(value: string): ParticipantRecord['role'] {
  if (value === 'host' || value === 'co_host' || value === 'participant' || value === 'guest') return value;
  return 'participant';
}
