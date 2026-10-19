import {
  connectionQualityFromRtt,
  estimateServerOffsetMs,
  flushCommands,
  parseRoomSnapshot,
  pushCommand,
  reconnectDelayMs,
  type ClientEvent,
  type ClockSample,
} from '@sinc/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, apiBaseUrl, ApiError } from '@/api/client';
import { useSession } from '@/features/session/store';
import { useRoomStore } from './store';

const ROOM_KEY = 'sinc.room.v1';

interface RoomRealtime {
  send: (event: ClientEvent) => void;
  code: string;
}

const RoomContext = createContext<RoomRealtime | null>(null);

export function useRoomRealtime(): RoomRealtime {
  const value = useContext(RoomContext);
  if (!value) throw new Error('Комната ещё не открыта');
  return value;
}

export function RoomSession({ code, children }: { code: string; children: ReactNode }) {
  const token = useSession((state) => state.token);
  const userId = useSession((state) => state.user?.id ?? '');
  const sendRef = useRef<(event: ClientEvent) => void>(() => undefined);

  useEffect(() => {
    const store = useRoomStore.getState();
    store.reset();
    if (!token || !userId) {
      store.setError('Сначала представьтесь');
      return;
    }
    let alive = true;
    let socket: Socket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnecting = false;
    const queue: { current: ReturnType<typeof pushCommand> } = { current: [] };
    const samples: ClockSample[] = [];
    const roomId = { current: '' };

    const send = (event: ClientEvent) => {
      if (socket?.connected) socket.emit('event', event);
      else queue.current = pushCommand(queue.current, event);
    };
    sendRef.current = send;

    const schedule = () => {
      if (!alive || reconnecting) return;
      reconnecting = true;
      useRoomStore.getState().setConnection('reconnecting');
      const delay = reconnectDelayMs(attempt);
      attempt += 1;
      timer = setTimeout(() => {
        reconnecting = false;
        if (alive) connect();
      }, delay);
    };

    const ping = () => {
      const sent = Date.now();
      send({ type: 'time.ping', clientSentAt: sent });
    };

    const connect = () => {
      socket?.close();
      socket = io(apiBaseUrl(), { reconnection: false, transports: ['websocket'], auth: { token } });
      socket.on('connect', () => {
        attempt = 0;
        useRoomStore.getState().setConnection('online');
        queue.current = flushCommands(queue.current, (event) => {
          socket?.emit('event', event);
          return true;
        });
        send({ type: 'room.join', roomId: roomId.current || code, userId });
        ping();
      });
      socket.on('disconnect', schedule);
      socket.on('connect_error', () => {
        socket?.close();
        schedule();
      });
      socket.on('event', (event) => {
        if (event?.type === 'time.pong') {
          const sample = { clientSentAt: event.clientSentAt, serverTimestamp: event.serverTimestamp, clientReceivedAt: Date.now() };
          samples.push(sample);
          if (samples.length > 5) samples.shift();
          useRoomStore.getState().setOffset(estimateServerOffsetMs(samples));
          useRoomStore.getState().setQuality(connectionQualityFromRtt(sample.clientReceivedAt - sample.clientSentAt));
          return;
        }
        if (event?.type === 'room.state' && event.state?.roomId) roomId.current = event.state.roomId;
        useRoomStore.getState().apply(event);
      });
    };

    void (async () => {
      const saved = parseRoomSnapshot(await AsyncStorage.getItem(ROOM_KEY), Date.now());
      if (saved?.code === code) useRoomStore.getState().setHint('Вернулись к просмотру');
      try {
        const bundle = await api.join(token, code);
        if (!alive) return;
        roomId.current = bundle.state.roomId;
        useRoomStore.getState().hydrate(bundle.state, bundle.messages);
        connect();
        pingTimer = setInterval(ping, 8_000);
      } catch (error) {
        if (!alive) return;
        useRoomStore.getState().setError(error instanceof ApiError ? error.message : 'Не удалось войти в комнату');
      }
    })();

    const appState = AppState.addEventListener('change', (next) => {
      const state = useRoomStore.getState().state;
      if ((next === 'background' || next === 'inactive') && state) {
        void AsyncStorage.setItem(ROOM_KEY, JSON.stringify({ savedAt: Date.now(), code: state.code, state }));
      }
      if (next === 'active' && roomId.current) send({ type: 'room.join', roomId: roomId.current, userId });
    });

    return () => {
      alive = false;
      sendRef.current = () => undefined;
      if (timer) clearTimeout(timer);
      if (pingTimer) clearInterval(pingTimer);
      appState.remove();
      socket?.close();
      useRoomStore.getState().reset();
    };
  }, [code, token, userId]);

  const value = useMemo<RoomRealtime>(() => ({ code, send: (event) => sendRef.current(event) }), [code]);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
