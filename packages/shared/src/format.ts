export function formatTimecode(totalSec: number): string {
  const safe = Number.isFinite(totalSec) ? Math.max(0, Math.floor(totalSec)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function greetingFor(name: string, hour: number): string {
  const part = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  return `${part}, ${name}`;
}

export function createRoomCode(next: (min: number, max: number) => number): string {
  const value = Math.floor(Math.abs(next(0, 1_000_000))) % 1_000_000;
  return String(value).padStart(6, '0');
}
