import type { ClientEvent, PlaybackCommand } from './events';
import { formatTimecode } from './format';
import type { ParticipantRole, RoomPlaybackState } from './models';

export const DRIFT_SEEK_THRESHOLD_SEC = 0.6;
export const DRIFT_NUDGE_THRESHOLD_SEC = 0.12;
export const NUDGE_MIN = 0.97;
export const NUDGE_MAX = 1.03;
export const MAX_POSITION_SEC = 60 * 60 * 48;

export interface ClockSample {
  clientSentAt: number;
  serverTimestamp: number;
  clientReceivedAt: number;
}

export interface StoredRoomSnapshot {
  savedAt: number;
  code: string;
  state: RoomPlaybackState;
}

export interface PendingCommand {
  id: string;
  event: ClientEvent;
}

export type SyncCorrection =
  | { action: 'seek'; positionSec: number }
  | { action: 'nudge'; rate: number }
  | { action: 'hold'; rate: number };

type PlaybackInput =
  | { type: 'play' | 'pause' | 'seek'; positionSec: number }
  | { type: 'rate'; positionSec: number; rate: number };

export type ReduceResult =
  | { ok: true; state: RoomPlaybackState; command: PlaybackCommand }
  | { ok: false; code: string; message: string };

/**
 * Expected position on the server clock.
 * While paused, or during the external countdown (serverTimestamp still in the future),
 * the position stays put. The published formula applies only while playback is running.
 */
export function expectedPositionSec(
  state: Pick<RoomPlaybackState, 'positionSec' | 'serverTimestamp' | 'playbackRate' | 'isPlaying'>,
  nowMs: number,
): number {
  if (!state.isPlaying) return state.positionSec;
  const elapsedSec = (nowMs - state.serverTimestamp) / 1000;
  if (elapsedSec <= 0) return state.positionSec;
  return state.positionSec + elapsedSec * state.playbackRate;
}

export function serverNowMs(offsetMs: number, localNow = Date.now()): number {
  return localNow + offsetMs;
}

export function estimateServerOffsetMs(samples: ClockSample[]): number {
  if (samples.length === 0) return 0;
  const offsets = samples.map((sample) => {
    const rtt = Math.max(0, sample.clientReceivedAt - sample.clientSentAt);
    const clientMidpoint = sample.clientSentAt + rtt / 2;
    return sample.serverTimestamp - clientMidpoint;
  });
  return offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
}

export function planSyncCorrection(input: {
  expectedSec: number;
  actualSec: number;
  baseRate: number;
  isPlaying: boolean;
  seekThresholdSec?: number;
}): SyncCorrection {
  const baseRate = clampPlaybackRate(input.baseRate);
  if (!input.isPlaying || !Number.isFinite(input.expectedSec) || !Number.isFinite(input.actualSec)) {
    return { action: 'hold', rate: baseRate };
  }
  const drift = input.actualSec - input.expectedSec;
  const distance = Math.abs(drift);
  const seekThreshold = input.seekThresholdSec ?? DRIFT_SEEK_THRESHOLD_SEC;
  if (distance > seekThreshold) {
    return { action: 'seek', positionSec: input.expectedSec };
  }
  if (distance > DRIFT_NUDGE_THRESHOLD_SEC) {
    const factor = clamp(1 - drift * 0.08, NUDGE_MIN, NUDGE_MAX);
    return { action: 'nudge', rate: round3(baseRate * factor) };
  }
  return { action: 'hold', rate: baseRate };
}

export function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return clamp(rate, 0.5, 2);
}

export function clampPosition(positionSec: number): number {
  if (!Number.isFinite(positionSec) || positionSec < 0) return 0;
  return Math.min(positionSec, MAX_POSITION_SEC);
}

export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const base = Math.min(1000 * 2 ** safeAttempt, 15_000);
  return base + Math.floor(Math.max(0, Math.min(0.999, random())) * 250);
}

export function pushCommand(queue: PendingCommand[], event: ClientEvent, cap = 20): PendingCommand[] {
  const next = [...queue, { id: `${Date.now()}-${queue.length}-${event.type}`, event }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function flushCommands(queue: PendingCommand[], send: (event: ClientEvent) => boolean): PendingCommand[] {
  const rest: PendingCommand[] = [];
  let blocked = false;
  for (const item of queue) {
    if (blocked || !send(item.event)) {
      blocked = true;
      rest.push(item);
    }
  }
  return rest;
}

export function parseRoomSnapshot(raw: string | null, now: number, maxAgeMs = 6 * 60 * 60 * 1000): StoredRoomSnapshot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<StoredRoomSnapshot>;
    if (!data || typeof data.savedAt !== 'number' || typeof data.code !== 'string' || !data.state) return null;
    if (now < data.savedAt || now - data.savedAt > maxAgeMs) return null;
    return data as StoredRoomSnapshot;
  } catch {
    return null;
  }
}

export function connectionQualityFromRtt(rttMs: number): 'good' | 'medium' | 'poor' {
  if (rttMs < 180) return 'good';
  if (rttMs < 450) return 'medium';
  return 'poor';
}

export function canControlPlayback(
  state: RoomPlaybackState,
  userId: string,
  action: 'play' | 'pause' | 'seek' | 'rate',
): boolean {
  const participant = state.participants.find((item) => item.userId === userId);
  if (!participant) return false;
  if (isHostRole(participant.role)) return true;
  if (action === 'play' || action === 'pause') return state.permissions.everyoneCanPause;
  if (action === 'seek') return state.permissions.everyoneCanSeek;
  return false;
}

export function reducePlayback(state: RoomPlaybackState, input: PlaybackInput, actorUserId: string, nowMs: number): ReduceResult {
  const action = input.type === 'play' ? 'play' : input.type;
  if (!canControlPlayback(state, actorUserId, action)) {
    return { ok: false, code: 'forbidden', message: 'Сейчас плеером управляет ведущий' };
  }

  if (input.type === 'rate') {
    const playbackRate = clampPlaybackRate(input.rate);
    const positionSec = state.isPlaying ? clampPosition(expectedPositionSec(state, nowMs)) : state.positionSec;
    const next: RoomPlaybackState = { ...state, playbackRate, positionSec, serverTimestamp: nowMs };
    return {
      ok: true,
      state: next,
      command: commandOf(next, 'rate', actorUserId),
    };
  }

  const positionSec = clampPosition(input.positionSec);

  if (input.type === 'play' && state.sourceType === 'external_service') {
    const startsAt = nowMs + 3000;
    const next: RoomPlaybackState = {
      ...state,
      isPlaying: true,
      positionSec,
      playbackRate: state.playbackRate || 1,
      serverTimestamp: startsAt,
    };
    return {
      ok: true,
      state: next,
      command: {
        ...commandOf(next, 'countdown_play', actorUserId),
        countdownSec: 3,
        label: 'Все нажимают Play сейчас',
      },
    };
  }

  if (input.type === 'seek' && state.sourceType === 'external_service') {
    const next: RoomPlaybackState = { ...state, positionSec, serverTimestamp: nowMs };
    return {
      ok: true,
      state: next,
      command: {
        ...commandOf(next, 'seek_manual', actorUserId),
        label: `Перемотайте на ${formatTimecode(positionSec)}`,
      },
    };
  }

  if (input.type === 'pause') {
    const next: RoomPlaybackState = { ...state, isPlaying: false, positionSec, serverTimestamp: nowMs };
    return { ok: true, state: next, command: commandOf(next, 'pause', actorUserId) };
  }

  if (input.type === 'seek') {
    const next: RoomPlaybackState = { ...state, positionSec, serverTimestamp: nowMs };
    return { ok: true, state: next, command: commandOf(next, 'seek', actorUserId) };
  }

  const next: RoomPlaybackState = { ...state, isPlaying: true, positionSec, serverTimestamp: nowMs };
  return { ok: true, state: next, command: commandOf(next, 'play', actorUserId) };
}

function commandOf(
  state: RoomPlaybackState,
  action: PlaybackCommand['action'],
  actorUserId: string,
): PlaybackCommand {
  return {
    action,
    positionSec: state.positionSec,
    playbackRate: state.playbackRate,
    serverTimestamp: state.serverTimestamp,
    actorUserId,
  };
}

function isHostRole(role: ParticipantRole): boolean {
  return role === 'host' || role === 'co_host';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
