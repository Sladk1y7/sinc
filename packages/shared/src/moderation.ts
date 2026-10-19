const BANNED = ['хуй', 'пизд', 'еба', 'ебан', 'бля', 'сука', 'fuck', 'shit', 'bitch', 'asshole'];

export function inspectMessage(
  raw: string,
  recentTexts: string[],
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'Пустое сообщение' };
  if (text.length > 500) return { ok: false, reason: 'Сообщение длиннее 500 символов' };
  if (/(.)\1{11,}/u.test(text)) return { ok: false, reason: 'Похоже на спам' };
  const links = text.match(/https?:\/\//gi) ?? [];
  if (links.length > 2) return { ok: false, reason: 'Слишком много ссылок' };
  const normalized = text.toLowerCase().replaceAll('ё', 'е');
  if (BANNED.some((word) => normalized.includes(word))) {
    return { ok: false, reason: 'Сообщение скрыто фильтром' };
  }
  const duplicates = recentTexts.filter((item) => item === text).length;
  if (duplicates >= 2) return { ok: false, reason: 'Такое сообщение уже было' };
  return { ok: true, text };
}
