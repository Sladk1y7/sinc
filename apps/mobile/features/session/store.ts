import type { PublicUser } from '@sinc/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api } from '@/api/client';

const KEY = 'sinc.session.v1';

interface SessionState {
  hydrated: boolean;
  onboarded: boolean;
  token: string | null;
  user: PublicUser | null;
  dnd: boolean;
  lastOpenAt: string | null;
  pendingLocalUri: string | null;
  pendingLocalName: string | null;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: PublicUser) => Promise<void>;
  setOnboarded: () => Promise<void>;
  setDnd: (value: boolean) => Promise<void>;
  setPlan: (plan: PublicUser['plan']) => void;
  setPendingFile: (uri: string | null, name: string | null) => void;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  hydrated: false,
  onboarded: false,
  token: null,
  user: null,
  dnd: false,
  lastOpenAt: null,
  pendingLocalUri: null,
  pendingLocalName: null,
  hydrate: async () => {
    let previousOpen: string | null = null;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SessionState>;
        previousOpen = saved.lastOpenAt ?? null;
        set({
          onboarded: Boolean(saved.onboarded),
          token: saved.token ?? null,
          user: saved.user ?? null,
          dnd: Boolean(saved.dnd),
          lastOpenAt: new Date().toISOString(),
          pendingLocalUri: saved.pendingLocalUri ?? null,
          pendingLocalName: saved.pendingLocalName ?? null,
        });
        await persist(get());
      }
    } catch {
      // A broken local profile should not block the first screen.
    } finally {
      set({ hydrated: true });
    }
    if (get().token) {
      void track('app_opened');
      if (previousOpen && Date.now() - Date.parse(previousOpen) >= 7 * 24 * 60 * 60 * 1000) void track('returned_7_days');
    }
  },
  setSession: async (token, user) => {
    const hadToken = Boolean(get().token);
    set({ token, user });
    await persist(get());
    if (!hadToken) void track('app_opened');
  },
  setOnboarded: async () => {
    set({ onboarded: true });
    await persist(get());
  },
  setDnd: async (dnd) => {
    set({ dnd });
    await persist(get());
  },
  setPlan: (plan) => {
    const user = get().user;
    if (!user) return;
    set({ user: { ...user, plan } });
    void persist(get());
  },
  setPendingFile: (pendingLocalUri, pendingLocalName) => {
    set({ pendingLocalUri, pendingLocalName });
    void persist(get());
  },
  signOut: async () => {
    set({ token: null, user: null, pendingLocalUri: null, pendingLocalName: null });
    await persist(get());
  },
}));

async function persist(state: SessionState) {
  const nextOpen = new Date().toISOString();
  await AsyncStorage.setItem(KEY, JSON.stringify({
    onboarded: state.onboarded,
    token: state.token,
    user: state.user,
    dnd: state.dnd,
    lastOpenAt: nextOpen,
    pendingLocalUri: state.pendingLocalUri,
    pendingLocalName: state.pendingLocalName,
  }));
}

export async function track(name: string, props?: Record<string, string | number | boolean | null>) {
  const token = useSession.getState().token;
  if (!token) return;
  try {
    await api.track(token, name, props);
    const raw = await AsyncStorage.getItem('sinc.analytics.v1');
    if (!raw) return;
    const queued = JSON.parse(raw) as { name: string; props?: Record<string, string | number | boolean | null> }[];
    await AsyncStorage.removeItem('sinc.analytics.v1');
    for (const event of queued) await api.track(token, event.name, event.props);
  } catch {
    const raw = await AsyncStorage.getItem('sinc.analytics.v1');
    const queued = raw ? (JSON.parse(raw) as unknown[]) : [];
    queued.push({ name, props });
    await AsyncStorage.setItem('sinc.analytics.v1', JSON.stringify(queued.slice(-100)));
  }
}
