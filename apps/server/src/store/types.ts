import type {
  ChatMessage,
  CircleSummary,
  Plan,
  Reaction,
  RoomPermissions,
  ScheduledWatch,
  ServiceId,
  SourceType,
  SyncMode,
  Vote,
  WatchlistItem,
} from '@sinc/shared';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: Plan;
  passwordHash?: string;
  createdAt: string;
}

export interface RoomRecord {
  id: string;
  code: string;
  hostUserId: string;
  sourceType: SourceType;
  syncMode: SyncMode;
  sourceUrl?: string;
  service?: ServiceId;
  externalTitle?: string;
  externalDeepLink?: string;
  externalWebUrl?: string;
  status: 'active' | 'ended' | 'deleted';
  circleId?: string;
  permissions: RoomPermissions;
  createdAt: string;
  expiresAt: string;
}

export interface ParticipantRecord {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  role: 'host' | 'co_host' | 'participant' | 'guest';
  joinedAt: string;
  lastSeenAt: string;
}

export interface PlaybackRecord {
  eventType: string;
  positionSec: number;
  createdAt: string;
}

export interface ReminderRecord {
  id: string;
  userId: string;
  sendAt: string;
  title: string;
  body: string;
  sentAt?: string;
}

export interface AnalyticsRecord {
  id: string;
  userId?: string;
  name: string;
  props: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface Repository {
  createUser(input: UserRecord): Promise<void>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateUser(id: string, patch: Partial<Pick<UserRecord, 'name' | 'plan' | 'avatarUrl'>>): Promise<UserRecord>;

  createCircle(input: CircleSummary): Promise<void>;
  listCircles(userId: string): Promise<CircleSummary[]>;
  findCircle(id: string): Promise<CircleSummary | null>;
  addCircleMember(circleId: string, member: CircleSummary['members'][number] & { id: string }): Promise<void>;

  createRoom(input: RoomRecord): Promise<void>;
  findRoomByCode(code: string): Promise<RoomRecord | null>;
  findRoomById(id: string): Promise<RoomRecord | null>;
  listRecentRooms(userId: string): Promise<RoomRecord[]>;
  setRoomStatus(id: string, status: RoomRecord['status']): Promise<void>;

  addParticipant(input: ParticipantRecord): Promise<void>;
  listParticipants(roomId: string): Promise<ParticipantRecord[]>;
  touchParticipant(roomId: string, userId: string, at: string): Promise<void>;

  addPlaybackEvent(input: { id: string; roomId: string; userId: string; eventType: string; positionSec: number; createdAt: string }): Promise<void>;
  lastPlaybackEvent(roomId: string): Promise<PlaybackRecord | null>;

  addMessage(input: ChatMessage): Promise<void>;
  listMessages(roomId: string): Promise<ChatMessage[]>;
  deleteMessage(roomId: string, messageId: string): Promise<void>;
  addReaction(input: Reaction): Promise<void>;

  addWatchItem(input: WatchlistItem): Promise<void>;
  listWatchItems(circleId: string): Promise<WatchlistItem[]>;
  listWatchItemsForUser(userId: string): Promise<WatchlistItem[]>;

  createSchedule(input: ScheduledWatch): Promise<void>;
  listUpcoming(userId: string): Promise<ScheduledWatch[]>;
  findSchedule(id: string): Promise<ScheduledWatch | null>;
  setRsvp(input: { id: string; scheduledWatchId: string; userId: string; name: string; response: 'yes' | 'no'; createdAt: string }): Promise<ScheduledWatch>;
  attachScheduleRoom(scheduleId: string, roomId: string): Promise<void>;

  createVote(input: Vote): Promise<void>;
  listVotes(circleId: string): Promise<Vote[]>;
  findVoteByOption(optionId: string): Promise<Vote | null>;
  saveVote(vote: Vote): Promise<void>;

  addReport(input: { id: string; reporterId: string; targetType: string; targetId: string; reason: string; createdAt: string }): Promise<void>;
  blockUser(input: { id: string; userId: string; blockedId: string; createdAt: string }): Promise<void>;
  isBlocked(a: string, b: string): Promise<boolean>;

  addAnalytics(input: AnalyticsRecord): Promise<void>;
  addReminder(input: ReminderRecord): Promise<void>;
  dueReminders(nowIso: string): Promise<ReminderRecord[]>;
  markReminderSent(id: string): Promise<void>;
}
