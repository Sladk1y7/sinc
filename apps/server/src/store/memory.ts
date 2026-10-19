import type { ChatMessage, CircleSummary, Reaction, ScheduledWatch, Vote, WatchlistItem } from '@sinc/shared';
import type {
  AnalyticsRecord,
  ParticipantRecord,
  PlaybackRecord,
  ReminderRecord,
  Repository,
  RoomRecord,
  UserRecord,
} from './types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryRepository implements Repository {
  private users = new Map<string, UserRecord>();
  private circles = new Map<string, CircleSummary>();
  private memberIds = new Map<string, string>();
  private rooms = new Map<string, RoomRecord>();
  private participants = new Map<string, ParticipantRecord[]>();
  private playback: { id: string; roomId: string; userId: string; eventType: string; positionSec: number; createdAt: string }[] = [];
  private messages = new Map<string, ChatMessage[]>();
  private reactions = new Map<string, Reaction[]>();
  private watchItems: WatchlistItem[] = [];
  private schedules = new Map<string, ScheduledWatch>();
  private votes = new Map<string, Vote>();
  private reports: { id: string; reporterId: string; targetType: string; targetId: string; reason: string; createdAt: string }[] = [];
  private blocks = new Set<string>();
  private analytics: AnalyticsRecord[] = [];
  private reminders = new Map<string, ReminderRecord>();

  async createUser(input: UserRecord): Promise<void> {
    this.users.set(input.id, clone(input));
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = [...this.users.values()].find((item) => item.email === email);
    return user ? clone(user) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async updateUser(id: string, patch: Partial<Pick<UserRecord, 'name' | 'plan' | 'avatarUrl'>>): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw new Error('user missing');
    Object.assign(user, patch);
    return clone(user);
  }

  async createCircle(input: CircleSummary): Promise<void> {
    this.circles.set(input.id, clone(input));
  }

  async listCircles(userId: string): Promise<CircleSummary[]> {
    return [...this.circles.values()].filter((circle) => circle.members.some((member) => member.userId === userId)).map(clone);
  }

  async findCircle(id: string): Promise<CircleSummary | null> {
    const circle = this.circles.get(id);
    return circle ? clone(circle) : null;
  }

  async addCircleMember(circleId: string, member: CircleSummary['members'][number] & { id: string }): Promise<void> {
    const circle = this.circles.get(circleId);
    if (!circle) return;
    this.memberIds.set(`${circleId}:${member.userId}`, member.id);
    if (!circle.members.some((item) => item.userId === member.userId)) {
      circle.members.push({ userId: member.userId, name: member.name, avatarUrl: member.avatarUrl, role: member.role, joinedAt: member.joinedAt });
    }
  }

  async createRoom(input: RoomRecord): Promise<void> {
    this.rooms.set(input.id, clone(input));
    this.participants.set(input.id, []);
  }

  async findRoomByCode(code: string): Promise<RoomRecord | null> {
    const room = [...this.rooms.values()].find((item) => item.code === code);
    return room ? clone(room) : null;
  }

  async findRoomById(id: string): Promise<RoomRecord | null> {
    const room = this.rooms.get(id);
    return room ? clone(room) : null;
  }

  async listRecentRooms(userId: string): Promise<RoomRecord[]> {
    return [...this.rooms.values()]
      .filter((room) => room.status !== 'deleted' && (this.participants.get(room.id) ?? []).some((person) => person.userId === userId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map(clone);
  }

  async setRoomStatus(id: string, status: RoomRecord['status']): Promise<void> {
    const room = this.rooms.get(id);
    if (room) room.status = status;
  }

  async addParticipant(input: ParticipantRecord): Promise<void> {
    const list = this.participants.get(input.roomId) ?? [];
    list.push(clone(input));
    this.participants.set(input.roomId, list);
  }

  async listParticipants(roomId: string): Promise<ParticipantRecord[]> {
    return (this.participants.get(roomId) ?? []).map(clone);
  }

  async touchParticipant(roomId: string, userId: string, at: string): Promise<void> {
    const person = (this.participants.get(roomId) ?? []).find((item) => item.userId === userId);
    if (person) person.lastSeenAt = at;
  }

  async addPlaybackEvent(input: { id: string; roomId: string; userId: string; eventType: string; positionSec: number; createdAt: string }): Promise<void> {
    this.playback.push(input);
  }

  async lastPlaybackEvent(roomId: string): Promise<PlaybackRecord | null> {
    const rows = this.playback.filter((item) => item.roomId === roomId);
    const last = rows[rows.length - 1];
    return last ? { eventType: last.eventType, positionSec: last.positionSec, createdAt: last.createdAt } : null;
  }

  async addMessage(input: ChatMessage): Promise<void> {
    const list = this.messages.get(input.roomId) ?? [];
    list.push(clone(input));
    this.messages.set(input.roomId, list.slice(-200));
  }

  async listMessages(roomId: string): Promise<ChatMessage[]> {
    return (this.messages.get(roomId) ?? []).slice(-50).map(clone);
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const list = this.messages.get(roomId) ?? [];
    this.messages.set(roomId, list.filter((item) => item.id !== messageId));
  }

  async addReaction(input: Reaction): Promise<void> {
    const list = this.reactions.get(input.roomId) ?? [];
    list.push(clone(input));
    this.reactions.set(input.roomId, list.slice(-40));
  }

  async addWatchItem(input: WatchlistItem): Promise<void> {
    this.watchItems.push(clone(input));
  }

  async listWatchItems(circleId: string): Promise<WatchlistItem[]> {
    return this.watchItems.filter((item) => item.circleId === circleId).map(clone);
  }

  async listWatchItemsForUser(userId: string): Promise<WatchlistItem[]> {
    const circleIds = new Set((await this.listCircles(userId)).map((circle) => circle.id));
    return this.watchItems.filter((item) => circleIds.has(item.circleId)).map(clone);
  }

  async createSchedule(input: ScheduledWatch): Promise<void> {
    this.schedules.set(input.id, clone(input));
  }

  async listUpcoming(userId: string): Promise<ScheduledWatch[]> {
    const from = Date.now() - 6 * 60 * 60 * 1000;
    const circles = await this.listCircles(userId);
    const circleIds = new Set(circles.map((circle) => circle.id));
    return [...this.schedules.values()]
      .filter((item) => {
        if (Date.parse(item.startsAt) < from) return false;
        return item.createdBy === userId || (item.circleId && circleIds.has(item.circleId)) || item.rsvps.some((rsvp) => rsvp.userId === userId);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 20)
      .map(clone);
  }

  async findSchedule(id: string): Promise<ScheduledWatch | null> {
    const item = this.schedules.get(id);
    return item ? clone(item) : null;
  }

  async setRsvp(input: { id: string; scheduledWatchId: string; userId: string; name: string; response: 'yes' | 'no'; createdAt: string }): Promise<ScheduledWatch> {
    const item = this.schedules.get(input.scheduledWatchId);
    if (!item) throw new Error('schedule missing');
    item.rsvps = item.rsvps.filter((rsvp) => rsvp.userId !== input.userId);
    item.rsvps.push({ userId: input.userId, name: input.name, response: input.response });
    return clone(item);
  }

  async attachScheduleRoom(scheduleId: string, roomId: string): Promise<void> {
    const item = this.schedules.get(scheduleId);
    if (item) item.roomId = roomId;
  }

  async createVote(input: Vote): Promise<void> {
    this.votes.set(input.id, clone(input));
  }

  async listVotes(circleId: string): Promise<Vote[]> {
    return [...this.votes.values()].filter((vote) => vote.circleId === circleId).map(clone);
  }

  async findVoteByOption(optionId: string): Promise<Vote | null> {
    const vote = [...this.votes.values()].find((item) => item.options.some((option) => option.id === optionId));
    return vote ? clone(vote) : null;
  }

  async saveVote(vote: Vote): Promise<void> {
    this.votes.set(vote.id, clone(vote));
  }

  async addReport(input: { id: string; reporterId: string; targetType: string; targetId: string; reason: string; createdAt: string }): Promise<void> {
    this.reports.push(input);
  }

  async blockUser(input: { id: string; userId: string; blockedId: string; createdAt: string }): Promise<void> {
    this.blocks.add(`${input.userId}:${input.blockedId}`);
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    return this.blocks.has(`${a}:${b}`) || this.blocks.has(`${b}:${a}`);
  }

  async addAnalytics(input: AnalyticsRecord): Promise<void> {
    this.analytics.push(input);
  }

  async addReminder(input: ReminderRecord): Promise<void> {
    this.reminders.set(input.id, clone(input));
  }

  async dueReminders(nowIso: string): Promise<ReminderRecord[]> {
    return [...this.reminders.values()].filter((item) => !item.sentAt && item.sendAt <= nowIso).map(clone);
  }

  async markReminderSent(id: string): Promise<void> {
    const item = this.reminders.get(id);
    if (item) item.sentAt = new Date().toISOString();
  }
}
