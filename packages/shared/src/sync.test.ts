import { describe, expect, it } from 'vitest';
import { entitlementsFor } from './entitlements';
import { createRoomCode, formatTimecode, greetingFor } from './format';
import { inspectMessage } from './moderation';
import { DEFAULT_PERMISSIONS, type RoomPlaybackState } from './models';
import {
  estimateServerOffsetMs,
  expectedPositionSec,
  flushCommands,
  parseRoomSnapshot,
  planSyncCorrection,
  pushCommand,
  reconnectDelayMs,
  reducePlayback,
} from './sync';
import { assessNativeSource, validateNativeSourceUrl } from './urls';

const hostId = 'host-1';
const guestId = 'guest-1';

function room(patch: Partial<RoomPlaybackState> = {}): RoomPlaybackState {
  return {
    roomId: 'room-1',
    code: '000111',
    sourceType: 'native',
    syncMode: 'automatic',
    positionSec: 10,
    isPlaying: false,
    playbackRate: 1,
    serverTimestamp: 1_000,
    hostUserId: hostId,
    participants: [
      {
        userId: hostId,
        name: 'Аня',
        role: 'host',
        status: 'ready',
        connectionQuality: 'good',
        lastSeenAt: '2026-10-19T12:00:00.000Z',
      },
      {
        userId: guestId,
        name: 'Макс',
        role: 'participant',
        status: 'ready',
        connectionQuality: 'good',
        lastSeenAt: '2026-10-19T12:00:00.000Z',
      },
    ],
    permissions: { ...DEFAULT_PERMISSIONS, everyoneCanSeek: false },
    ...patch,
  };
}

describe('expectedPositionSec', () => {
  it('adds elapsed time while playing', () => {
    expect(expectedPositionSec({ positionSec: 10, serverTimestamp: 1_000, playbackRate: 1, isPlaying: true }, 4_000)).toBe(13);
    expect(expectedPositionSec({ positionSec: 10, serverTimestamp: 1_000, playbackRate: 2, isPlaying: true }, 3_000)).toBe(14);
  });

  it('freezes while paused and during a future countdown timestamp', () => {
    expect(expectedPositionSec({ positionSec: 10, serverTimestamp: 1_000, playbackRate: 1, isPlaying: false }, 9_000)).toBe(10);
    expect(expectedPositionSec({ positionSec: 12, serverTimestamp: 5_000, playbackRate: 1, isPlaying: true }, 4_000)).toBe(12);
  });
});

describe('drift correction', () => {
  it('seeks when drift is greater than 0.6s', () => {
    expect(planSyncCorrection({ expectedSec: 10, actualSec: 10.8, baseRate: 1, isPlaying: true })).toEqual({
      action: 'seek',
      positionSec: 10,
    });
  });

  it('nudges playbackRate inside 0.97–1.03 when drift is smaller', () => {
    const ahead = planSyncCorrection({ expectedSec: 10, actualSec: 10.3, baseRate: 1, isPlaying: true });
    const behind = planSyncCorrection({ expectedSec: 10, actualSec: 9.7, baseRate: 1, isPlaying: true });
    expect(ahead.action).toBe('nudge');
    expect(behind.action).toBe('nudge');
    if (ahead.action === 'nudge' && behind.action === 'nudge') {
      expect(ahead.rate).toBeGreaterThanOrEqual(0.97);
      expect(ahead.rate).toBeLessThanOrEqual(1.03);
      expect(ahead.rate).toBeLessThan(1);
      expect(behind.rate).toBeGreaterThan(1);
      expect(behind.rate).toBeLessThanOrEqual(1.03);
    }
  });

  it('holds the base rate for a tiny drift and while paused', () => {
    expect(planSyncCorrection({ expectedSec: 10, actualSec: 10.05, baseRate: 1, isPlaying: true })).toEqual({
      action: 'hold',
      rate: 1,
    });
    expect(planSyncCorrection({ expectedSec: 20, actualSec: 10, baseRate: 1, isPlaying: false }).action).toBe('hold');
  });
});

describe('server clock, reconnect and restore', () => {
  it('estimates offset from round-trip midpoint', () => {
    expect(
      estimateServerOffsetMs([{ clientSentAt: 1_000, serverTimestamp: 5_000, clientReceivedAt: 1_200 }]),
    ).toBe(3_900);
  });

  it('grows reconnect delay exponentially and caps it', () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(1_000);
    expect(reconnectDelayMs(1, () => 0)).toBe(2_000);
    expect(reconnectDelayMs(2, () => 0)).toBe(4_000);
    expect(reconnectDelayMs(3, () => 0)).toBe(8_000);
    expect(reconnectDelayMs(4, () => 0)).toBe(15_000);
    expect(reconnectDelayMs(8, () => 0.5)).toBe(15_125);
  });

  it('keeps the command queue ordered and drops the oldest past the cap', () => {
    let queue = [] as ReturnType<typeof pushCommand>;
    for (let index = 0; index < 25; index += 1) {
      queue = pushCommand(queue, { type: 'playback.sync', clientPositionSec: index });
    }
    expect(queue).toHaveLength(20);
    expect(queue[0]?.event).toMatchObject({ clientPositionSec: 5 });
    expect(queue[19]?.event).toMatchObject({ clientPositionSec: 24 });

    const pending = [
      { id: '1', event: { type: 'playback.pause' as const, positionSec: 1 } },
      { id: '2', event: { type: 'playback.pause' as const, positionSec: 2 } },
      { id: '3', event: { type: 'playback.pause' as const, positionSec: 3 } },
    ];
    const sent: number[] = [];
    const rest = flushCommands(pending, (event) => {
      if (event.type === 'playback.pause' && event.positionSec === 2) return false;
      if (event.type === 'playback.pause') sent.push(event.positionSec);
      return true;
    });
    expect(sent).toEqual([1]);
    expect(rest.map((item) => item.id)).toEqual(['2', '3']);
  });

  it('restores a fresh snapshot and rejects expired or broken ones', () => {
    const snapshot = { savedAt: 1_000, code: '000111', state: room() };
    expect(parseRoomSnapshot(JSON.stringify(snapshot), 2_000)?.code).toBe('000111');
    expect(parseRoomSnapshot(JSON.stringify(snapshot), 1_000 + 7 * 60 * 60 * 1000)).toBeNull();
    expect(parseRoomSnapshot('{', 2_000)).toBeNull();
    expect(parseRoomSnapshot(null, 2_000)).toBeNull();
  });
});

describe('playback commands', () => {
  it('turns external play into a 3 second countdown', () => {
    const result = reducePlayback(room({ sourceType: 'external_service', syncMode: 'manual_aligned' }), { type: 'play', positionSec: 12 }, hostId, 10_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.action).toBe('countdown_play');
    expect(result.command.countdownSec).toBe(3);
    expect(result.state.serverTimestamp).toBe(13_000);
    expect(expectedPositionSec(result.state, 11_000)).toBe(12);
    expect(expectedPositionSec(result.state, 14_000)).toBe(13);
  });

  it('turns external seek into a manual instruction', () => {
    const result = reducePlayback(
      room({ sourceType: 'external_service', syncMode: 'manual_aligned' }),
      { type: 'seek', positionSec: 4_350 },
      hostId,
      10_000,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.action).toBe('seek_manual');
    expect(result.command.label).toBe('Перемотайте на 01:12:30');
  });

  it('respects pause and seek permissions', () => {
    const denied = reducePlayback(room(), { type: 'seek', positionSec: 30 }, guestId, 10_000);
    expect(denied.ok).toBe(false);
    const allowed = reducePlayback(room(), { type: 'pause', positionSec: 15 }, guestId, 10_000);
    expect(allowed.ok).toBe(true);
  });
});

describe('guards', () => {
  it('formats timecode, greeting and room code', () => {
    expect(formatTimecode(4_350)).toBe('01:12:30');
    expect(formatTimecode(0)).toBe('00:00:00');
    expect(greetingFor('Аня', 21)).toBe('Добрый вечер, Аня');
    expect(createRoomCode(() => 42)).toBe('000042');
  });

  it('rejects DRM and catalogue pages as native sources', () => {
    expect(assessNativeSource({ drm: { provider: 'fairplay' } }).ok).toBe(false);
    expect(validateNativeSourceUrl('https://www.kinopoisk.ru/film/1').ok).toBe(false);
    expect(validateNativeSourceUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateNativeSourceUrl('https://cdn.example.com/movie.m3u8').ok).toBe(true);
  });

  it('filters abuse and describes plans', () => {
    expect(inspectMessage('привет', []).ok).toBe(true);
    expect(inspectMessage('это пиздец', []).ok).toBe(false);
    expect(inspectMessage('ещё раз', ['ещё раз', 'ещё раз']).ok).toBe(false);
    expect(entitlementsFor('free').maxParticipants).toBe(4);
    expect(entitlementsFor('pro').maxParticipants).toBe(50);
    expect(entitlementsFor('free').fileUpload).toBe(false);
    expect(entitlementsFor('pro').circles).toBe(true);
  });
});
