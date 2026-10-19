import type { ChatMessage, PlaybackCommand, Reaction, RoomPlaybackState, ServerEvent } from '@sinc/shared';
import { create } from 'zustand';

interface RoomState {
  state: RoomPlaybackState | null;
  messages: ChatMessage[];
  reactions: Reaction[];
  connection: 'idle' | 'online' | 'reconnecting';
  offsetMs: number;
  syncing: boolean;
  error: string | null;
  hint: string | null;
  quality: 'good' | 'medium' | 'poor';
  reset: () => void;
  hydrate: (state: RoomPlaybackState, messages: ChatMessage[]) => void;
  apply: (event: ServerEvent) => void;
  setConnection: (connection: RoomState['connection']) => void;
  setOffset: (offsetMs: number) => void;
  setSyncing: (syncing: boolean) => void;
  setError: (error: string | null) => void;
  setQuality: (quality: RoomState['quality']) => void;
  setHint: (hint: string | null) => void;
}

const empty = {
  state: null,
  messages: [],
  reactions: [],
  connection: 'idle' as const,
  offsetMs: 0,
  syncing: false,
  error: null,
  hint: null,
  quality: 'good' as const,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...empty,
  reset: () => set(empty),
  hydrate: (state, messages) => set({ state, messages, error: null }),
  setConnection: (connection) => set({ connection }),
  setOffset: (offsetMs) => set({ offsetMs }),
  setSyncing: (syncing) => set({ syncing }),
  setError: (error) => set({ error }),
  setQuality: (quality) => set({ quality }),
  setHint: (hint) => set({ hint }),
  apply: (event) => set((current) => {
    if (event.type === 'room.state') return { state: event.state };
    if (event.type === 'participant.update' && current.state) return { state: { ...current.state, participants: event.participants } };
    if (event.type === 'playback.command') return { hint: event.command.label ?? current.hint };
    if (event.type === 'chat.message') {
      if (current.messages.some((item) => item.id === event.message.id)) return {};
      return { messages: [...current.messages, event.message].slice(-50) };
    }
    if (event.type === 'chat.deleted') return { messages: current.messages.filter((item) => item.id !== event.messageId) };
    if (event.type === 'reaction') return { reactions: [...current.reactions, event.reaction].slice(-12) };
    if (event.type === 'error') return { error: event.message };
    return {};
  }),
}));

export type { PlaybackCommand };
