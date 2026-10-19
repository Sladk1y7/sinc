import type { ChatMessage, Participant, ParticipantStatus, Reaction, RoomPlaybackState, Vote, WatchlistItem } from './models';

export interface PlaybackCommand {
  action: 'play' | 'pause' | 'seek' | 'rate' | 'countdown_play' | 'seek_manual';
  positionSec: number;
  playbackRate: number;
  countdownSec?: number;
  label?: string;
  serverTimestamp: number;
  actorUserId: string;
}

export type ClientEvent =
  | { type: 'room.join'; roomId: string; userId: string }
  | { type: 'room.leave'; roomId: string; userId: string }
  | { type: 'playback.play'; positionSec: number }
  | { type: 'playback.pause'; positionSec: number }
  | { type: 'playback.seek'; positionSec: number }
  | { type: 'playback.rate'; rate: number }
  | { type: 'playback.sync'; clientPositionSec: number }
  | { type: 'participant.status'; status: ParticipantStatus }
  | { type: 'external.confirm_opened' }
  | { type: 'chat.message'; text: string }
  | { type: 'reaction'; emoji: string }
  | { type: 'watchlist.add'; title: string; service?: string; circleId?: string }
  | { type: 'vote.create'; circleId: string; question: string; options: string[]; endsAt: string }
  | { type: 'vote.cast'; optionId: string }
  | { type: 'time.ping'; clientSentAt: number };

export type ServerEvent =
  | { type: 'room.state'; state: RoomPlaybackState }
  | { type: 'participant.update'; participants: Participant[] }
  | { type: 'playback.command'; command: PlaybackCommand }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'chat.deleted'; messageId: string }
  | { type: 'reaction'; reaction: Reaction }
  | { type: 'watchlist.update'; items: WatchlistItem[] }
  | { type: 'vote.update'; vote: Vote }
  | { type: 'time.pong'; clientSentAt: number; serverTimestamp: number }
  | { type: 'error'; code: string; message: string };
