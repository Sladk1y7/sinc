import type {
  AuthResponse,
  CircleResponse,
  CircleSummary,
  CreateRoomRequest,
  HomeResponse,
  MeResponse,
  Plan,
  RoomResponse,
  ScheduledWatch,
  WatchlistItem,
} from '@sinc/shared';
import Constants from 'expo-constants';

export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
  if (pageHost === 'localhost' || pageHost === '127.0.0.1') return `http://${pageHost}:4000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return 'http://localhost:4000';
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('offline', 'Нет связи с сервером Sinc', 0);
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new ApiError(payload?.error?.code ?? 'error', payload?.error?.message ?? 'Не получилось выполнить запрос', response.status);
  }
  return payload as T;
}

export const api = {
  register: (body: { email: string; name: string; password: string }) => apiRequest<AuthResponse>('/api/auth/register', { body }),
  login: (body: { email: string; password: string }) => apiRequest<AuthResponse>('/api/auth/login', { body }),
  guest: (name: string) => apiRequest<AuthResponse>('/api/auth/guest', { body: { name } }),
  me: (token: string) => apiRequest<MeResponse>('/api/me', { token }),
  trial: (token: string, plan: Plan) => apiRequest<MeResponse>('/api/me/plan/trial', { token, body: { plan } }),
  home: (token: string) => apiRequest<HomeResponse>('/api/home', { token }),
  createRoom: (token: string, body: CreateRoomRequest) => apiRequest<RoomResponse>('/api/rooms', { token, body }),
  join: (token: string, code: string) => apiRequest<RoomResponse>('/api/rooms/join', { token, body: { code } }),
  room: (token: string, code: string) => apiRequest<RoomResponse>(`/api/rooms/${code}`, { token }),
  deleteRoom: (token: string, code: string) => apiRequest<void>(`/api/rooms/${code}`, { method: 'DELETE', token }),
  deleteMessage: (token: string, code: string, messageId: string) => apiRequest<void>(`/api/rooms/${code}/messages/${messageId}`, { method: 'DELETE', token }),
  report: (token: string, code: string, body: { targetType: 'message' | 'user'; targetId: string; reason: string }) =>
    apiRequest<void>(`/api/rooms/${code}/reports`, { token, body }),
  block: (token: string, userId: string) => apiRequest<void>('/api/blocks', { token, body: { userId } }),
  circles: (token: string) => apiRequest<CircleSummary[]>('/api/circles', { token }),
  createCircle: (token: string, name: string) => apiRequest<CircleSummary>('/api/circles', { token, body: { name } }),
  circle: (token: string, id: string) => apiRequest<CircleResponse>(`/api/circles/${id}`, { token }),
  addMember: (token: string, id: string, email: string) => apiRequest<CircleSummary>(`/api/circles/${id}/members`, { token, body: { email } }),
  watchlist: (token: string) => apiRequest<WatchlistItem[]>('/api/watchlist', { token }),
  addWatch: (token: string, body: { title: string; service?: string; externalUrl?: string; circleId?: string }) =>
    apiRequest<WatchlistItem[]>('/api/watchlist', { token, body }),
  createVote: (token: string, circleId: string, body: { question: string; options: string[]; endsAt: string }) =>
    apiRequest(`/api/circles/${circleId}/votes`, { token, body }),
  castVote: (token: string, optionId: string) => apiRequest(`/api/votes/${optionId}/cast`, { token, body: {} }),
  createSchedule: (token: string, body: { title: string; startsAt: string; timezone: string; circleId?: string }) =>
    apiRequest<ScheduledWatch>('/api/schedules', { token, body }),
  schedule: (token: string, id: string) => apiRequest<ScheduledWatch>(`/api/schedules/${id}`, { token }),
  rsvp: (token: string, id: string, response: 'yes' | 'no') => apiRequest<ScheduledWatch>(`/api/schedules/${id}/rsvp`, { token, body: { response } }),
  startSchedule: (token: string, id: string) => apiRequest<RoomResponse>(`/api/schedules/${id}/start`, { token, body: {} }),
  track: (token: string, name: string, props?: Record<string, string | number | boolean | null>) =>
    apiRequest<void>('/api/analytics', { token, body: { name, props } }),
};
