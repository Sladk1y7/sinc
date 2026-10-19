export type SourceType = 'native' | 'external_service';
export type SyncMode = 'automatic' | 'manual_aligned';
export type Plan = 'free' | 'pro';
export type ServiceId = 'kinopoisk' | 'okko' | 'ivi' | 'other';
export type DrmProvider = 'widevine' | 'fairplay' | 'clearkey' | 'none';

export type ParticipantStatus =
  | 'ready'
  | 'buffering'
  | 'drifted'
  | 'paused'
  | 'disconnected'
  | 'opened_external_app';

export type ParticipantRole = 'host' | 'co_host' | 'participant' | 'guest';
export type ConnectionQuality = 'good' | 'medium' | 'poor';

export interface RoomPermissions {
  everyoneCanPause: boolean;
  everyoneCanSeek: boolean;
  everyoneCanInvite: boolean;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  spoilerMode: boolean;
}

export const DEFAULT_PERMISSIONS: RoomPermissions = {
  everyoneCanPause: true,
  everyoneCanSeek: false,
  everyoneCanInvite: true,
  chatEnabled: true,
  reactionsEnabled: true,
  spoilerMode: false,
};

export interface Participant {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  connectionQuality: ConnectionQuality;
  lastSeenAt: string;
}

export interface RoomPlaybackState {
  roomId: string;
  code: string;
  sourceType: SourceType;
  syncMode: SyncMode;
  sourceUrl?: string;
  drm?: {
    provider: DrmProvider;
    licenseUrl?: string;
  };
  service?: ServiceId;
  externalTitle?: string;
  externalDeepLink?: string;
  externalWebUrl?: string;
  positionSec: number;
  isPlaying: boolean;
  playbackRate: number;
  serverTimestamp: number;
  hostUserId: string;
  participants: Participant[];
  permissions: RoomPermissions;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: Plan;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
}

export interface Reaction {
  id: string;
  roomId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export const ALLOWED_REACTIONS = ['❤️', '😂', '🔥', '👏', '😭', '😱', '👍', '✨'] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export interface WatchlistItem {
  id: string;
  circleId: string;
  addedByUserId: string;
  title: string;
  service?: ServiceId | 'file';
  externalUrl?: string;
  posterUrl?: string;
  createdAt: string;
}

export interface CircleMember {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface CircleSummary {
  id: string;
  name: string;
  ownerUserId: string;
  kind: 'personal' | 'group';
  createdAt: string;
  members: CircleMember[];
}

export interface VoteOption {
  id: string;
  voteId: string;
  label: string;
  voterIds: string[];
  createdAt: string;
}

export interface Vote {
  id: string;
  circleId: string;
  question: string;
  endsAt: string;
  createdAt: string;
  options: VoteOption[];
}

export interface ScheduledWatch {
  id: string;
  circleId?: string;
  roomId?: string;
  title: string;
  startsAt: string;
  timezone: string;
  posterUrl?: string;
  createdBy: string;
  createdAt: string;
  rsvps: { userId: string; name: string; response: 'yes' | 'no' }[];
}

export interface RoomSummary {
  code: string;
  title: string;
  sourceType: SourceType;
  service?: ServiceId;
  status: string;
  createdAt: string;
}

export const PARTICIPANT_STATUSES: ParticipantStatus[] = [
  'ready',
  'buffering',
  'drifted',
  'paused',
  'disconnected',
  'opened_external_app',
];

export function roomTitle(state: Pick<RoomPlaybackState, 'externalTitle' | 'sourceType' | 'service'>): string {
  if (state.externalTitle?.trim()) return state.externalTitle.trim();
  if (state.sourceType === 'native') return 'Свой файл или ссылка';
  return 'Совместный просмотр';
}
