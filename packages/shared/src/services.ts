import type { RoomPlaybackState, ServiceId } from './models';

export interface StreamingService {
  id: ServiceId;
  label: string;
  homeUrl: string;
}

export const SERVICES: StreamingService[] = [
  { id: 'kinopoisk', label: 'Кинопоиск', homeUrl: 'https://www.kinopoisk.ru' },
  { id: 'okko', label: 'Okko', homeUrl: 'https://okko.tv' },
  { id: 'ivi', label: 'IVI', homeUrl: 'https://www.ivi.ru' },
  { id: 'other', label: 'Другой сервис', homeUrl: '' },
];

/** Open Blender Foundation movie. Used only as a sync demo, never as a substitute for a paid catalogue. */
export const DEMO_OPEN_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
export const DEMO_OPEN_VIDEO_TITLE = 'Big Buck Bunny';

export const LEGAL_EXTERNAL_NOTICE =
  'Sinc не воспроизводит контент сервиса. Откройте фильм в официальном приложении — мы синхронизируем ваше совместное время и обсуждение.';

export function externalOpenUrl(
  state: Pick<RoomPlaybackState, 'externalDeepLink' | 'externalWebUrl' | 'service'>,
): string | null {
  if (state.externalDeepLink) return state.externalDeepLink;
  if (state.externalWebUrl) return state.externalWebUrl;
  return SERVICES.find((service) => service.id === state.service)?.homeUrl || null;
}

export function serviceLabel(service: ServiceId | undefined): string {
  return SERVICES.find((item) => item.id === service)?.label ?? 'Сервис';
}
