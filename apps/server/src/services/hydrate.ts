import { DEFAULT_PERMISSIONS, type Participant, type RoomPlaybackState } from '@sinc/shared';
import type { ParticipantRecord, PlaybackRecord, RoomRecord } from '../store/types';

export function hydrateRoom(record: RoomRecord, participants: ParticipantRecord[], last: PlaybackRecord | null): RoomPlaybackState {
  return {
    roomId: record.id,
    code: record.code,
    sourceType: record.sourceType,
    syncMode: record.syncMode,
    sourceUrl: record.sourceUrl,
    service: record.service,
    externalTitle: record.externalTitle,
    externalDeepLink: record.externalDeepLink,
    externalWebUrl: record.externalWebUrl,
    positionSec: last?.positionSec ?? 0,
    isPlaying: false,
    playbackRate: 1,
    serverTimestamp: Date.now(),
    hostUserId: record.hostUserId,
    participants: participants.map(toLiveParticipant),
    permissions: { ...DEFAULT_PERMISSIONS, ...record.permissions },
  };
}

export function toLiveParticipant(record: ParticipantRecord): Participant {
  return {
    userId: record.userId,
    name: record.name,
    avatarUrl: record.avatarUrl,
    role: record.role,
    status: 'ready',
    connectionQuality: 'good',
    lastSeenAt: record.lastSeenAt,
  };
}
