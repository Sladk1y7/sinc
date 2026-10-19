import type {
  ChatMessage,
  CircleSummary,
  Plan,
  PublicUser,
  RoomPlaybackState,
  RoomSummary,
  ScheduledWatch,
  ServiceId,
  Vote,
  WatchlistItem,
} from './models';
import type { RoomPermissions } from './models';
import type { Entitlements } from './entitlements';

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
  entitlements: Entitlements;
}

export interface HomeResponse {
  upcoming: ScheduledWatch[];
  recentRooms: RoomSummary[];
  circles: CircleSummary[];
}

export interface CreateRoomRequest {
  sourceType: 'native' | 'external_service';
  sourceUrl?: string;
  service?: ServiceId;
  externalTitle?: string;
  externalDeepLink?: string;
  externalWebUrl?: string;
  permissions?: Partial<RoomPermissions>;
  circleId?: string;
  drm?: { provider: string; licenseUrl?: string };
}

export interface RoomResponse {
  state: RoomPlaybackState;
  messages: ChatMessage[];
}

export interface CircleResponse {
  circle: CircleSummary;
  watchlist: WatchlistItem[];
  votes: Vote[];
  history: RoomSummary[];
  schedules: ScheduledWatch[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface TrialPlanRequest {
  plan: Plan;
}
