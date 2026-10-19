import { expectedPositionSec, planSyncCorrection, serverNowMs, type ClientEvent, type RoomPlaybackState } from '@sinc/shared';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { AppState, Platform, View } from 'react-native';
import { AppText } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { useRoomStore } from '@/features/rooms/store';

export interface WatchPlayerRef {
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  position: () => number;
  duration: () => number;
}

export const NativePlayer = forwardRef<WatchPlayerRef, {
  sourceUrl: string | null;
  state: RoomPlaybackState;
  offsetMs: number;
  onCommand: (event: ClientEvent) => void;
}>(function NativePlayer({ sourceUrl, state, offsetMs, onCommand }, ref) {
  const applying = useRef(false);
  const offsetRef = useRef(offsetMs);
  const stateRef = useRef(state);
  const lastSync = useRef(0);
  offsetRef.current = offsetMs;
  stateRef.current = state;

  const player = useVideoPlayer(sourceUrl, (instance) => {
    instance.timeUpdateEventInterval = 0.5;
    instance.preservesPitch = true;
  });

  useImperativeHandle(ref, () => ({
    seek: (seconds: number) => {
      applying.current = true;
      player.currentTime = seconds;
      setTimeout(() => { applying.current = false; }, 400);
    },
    play: () => player.play(),
    pause: () => player.pause(),
    position: () => player.currentTime ?? 0,
    duration: () => player.duration ?? 0,
  }), [player]);

  useEffect(() => {
    if (!state.isPlaying) return;
    let cancelled = false;
    void activateKeepAwakeAsync('sinc')
      .then(() => {
        if (cancelled) return deactivateKeepAwake('sinc');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void deactivateKeepAwake('sinc').catch(() => undefined);
    };
  }, [state.isPlaying]);

  useEffect(() => {
    const now = serverNowMs(offsetMs);
    const expected = expectedPositionSec(state, now);
    if (state.isPlaying && !player.playing && player.status === 'readyToPlay') {
      applying.current = true;
      player.currentTime = expected;
      player.play();
      player.playbackRate = state.playbackRate;
      setTimeout(() => { applying.current = false; }, 400);
      return;
    }
    if (!state.isPlaying && player.playing) {
      applying.current = true;
      player.pause();
      player.currentTime = state.positionSec;
      setTimeout(() => { applying.current = false; }, 400);
      return;
    }
    const correction = planSyncCorrection({
      expectedSec: expected,
      actualSec: player.currentTime ?? 0,
      baseRate: state.playbackRate,
      isPlaying: state.isPlaying,
    });
    if (correction.action === 'seek') {
      applying.current = true;
      player.currentTime = correction.positionSec;
      if (state.isPlaying && !player.playing && player.status === 'readyToPlay') player.play();
      useRoomStore.getState().setSyncing(true);
      setTimeout(() => { applying.current = false; useRoomStore.getState().setSyncing(false); }, 500);
    } else {
      player.playbackRate = correction.rate;
    }
  }, [player, state.serverTimestamp, state.isPlaying, state.positionSec, state.playbackRate, offsetMs]);

  useEffect(() => {
    const subscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const room = stateRef.current;
      if (applying.current || room.sourceType !== 'native') return;
      const expected = expectedPositionSec(room, serverNowMs(offsetRef.current));
      const correction = planSyncCorrection({
        expectedSec: expected,
        actualSec: currentTime,
        baseRate: room.playbackRate,
        isPlaying: room.isPlaying,
      });
      if (correction.action === 'seek') {
        applying.current = true;
        player.currentTime = correction.positionSec;
        if (room.isPlaying && !player.playing && player.status === 'readyToPlay') player.play();
        useRoomStore.getState().setSyncing(true);
        setTimeout(() => { applying.current = false; useRoomStore.getState().setSyncing(false); }, 500);
      } else if (correction.action === 'nudge') {
        player.playbackRate = correction.rate;
        useRoomStore.getState().setSyncing(true);
      } else if (Math.abs((player.playbackRate ?? 1) - correction.rate) > 0.01) {
        player.playbackRate = correction.rate;
        useRoomStore.getState().setSyncing(false);
      }
      const now = Date.now();
      if (now - lastSync.current > 2000) {
        lastSync.current = now;
        onCommand({ type: 'playback.sync', clientPositionSec: currentTime });
      }
    });
    const status = player.addListener('statusChange', ({ status }) => {
      if (status === 'loading') onCommand({ type: 'participant.status', status: 'buffering' });
      if (status === 'readyToPlay') {
        onCommand({ type: 'participant.status', status: 'ready' });
        if (stateRef.current.isPlaying && !player.playing) player.play();
      }
    });
    return () => {
      subscription.remove();
      status.remove();
    };
  }, [onCommand, player]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const away = Platform.OS === 'web' ? next === 'background' : next === 'background' || next === 'inactive';
      if (away) player.pause();
      if (next === 'active' && stateRef.current.isPlaying) {
        const expected = expectedPositionSec(stateRef.current, serverNowMs(offsetRef.current));
        applying.current = true;
        player.currentTime = expected;
        player.play();
        setTimeout(() => { applying.current = false; }, 400);
        void Haptics.selectionAsync();
      }
    });
    return () => sub.remove();
  }, [player]);

  if (!sourceUrl) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <AppText style={{ fontSize: 22, fontWeight: '600', textAlign: 'center' }}>Видео ещё не у всех</AppText>
        <AppText tone="muted" style={{ marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
          Локальный файл остаётся на телефоне ведущего. Для общей комнаты нужна прямая ссылка MP4 или HLS.
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: 'relative', backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={Platform.OS === 'web' ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' } : { flex: 1 }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
});
