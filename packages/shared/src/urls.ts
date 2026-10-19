import type { DrmProvider } from './models';

const BLOCKED_HOST_PARTS = [
  'kinopoisk.ru',
  'okko.tv',
  'ivi.ru',
  'netflix.com',
  'more.tv',
  'premier.one',
  'start.ru',
  'wink.ru',
  'megogo.net',
  'hdrezka',
  'rezka.',
  'rutracker',
  'nnmclub',
];

const FORBIDDEN_PROTOCOLS = new Set(['javascript:', 'data:', 'file:', 'content:', 'intent:', 'about:', 'blob:']);

export function assessNativeSource(input: {
  sourceUrl?: string;
  drm?: { provider?: DrmProvider | string; licenseUrl?: string };
}): { ok: true; sourceUrl?: string } | { ok: false; message: string } {
  if (input.drm?.provider && input.drm.provider !== 'none') {
    return {
      ok: false,
      message: 'Sinc не воспроизводит DRM-контент. Откройте фильм в официальном приложении.',
    };
  }
  if (!input.sourceUrl?.trim()) return { ok: true };
  return validateNativeSourceUrl(input.sourceUrl);
}

export function validateNativeSourceUrl(raw: string): { ok: true; sourceUrl: string } | { ok: false; message: string } {
  const parsed = parseHttpUrl(raw);
  if (!parsed.ok) return parsed;
  const host = parsed.url.hostname.toLowerCase();
  if (BLOCKED_HOST_PARTS.some((part) => host === part || host.endsWith(`.${part}`) || host.includes(part))) {
    return {
      ok: false,
      message: 'Это адрес сервиса. Выберите режим «Кинопоиск, Okko и другие»: Sinc не воспроизводит их видео.',
    };
  }
  return { ok: true, sourceUrl: parsed.url.toString() };
}

export function validateExternalUrl(raw: string | undefined): { ok: true; url?: string } | { ok: false; message: string } {
  if (!raw?.trim()) return { ok: true };
  const value = raw.trim();
  if (value.length > 2000) return { ok: false, message: 'Ссылка слишком длинная' };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'Некорректная ссылка' };
  }
  if (FORBIDDEN_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, message: 'Такую ссылку открывать нельзя' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && !/^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol)) {
    return { ok: false, message: 'Некорректная ссылка' };
  }
  return { ok: true, url: parsed.toString() };
}

function parseHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value) return { ok: false, message: 'Вставьте ссылку на MP4 или HLS' };
  if (value.length > 2000) return { ok: false, message: 'Ссылка слишком длинная' };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'Некорректная ссылка' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, message: 'Для своего файла нужна прямая ссылка http или https' };
  }
  return { ok: true, url: parsed };
}
