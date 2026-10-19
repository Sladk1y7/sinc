import { entitlementsFor } from '@sinc/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/api/client';
import { queryClient } from '@/api/query';
import { AppText, Button, Card, Screen, ToggleRow } from '@/design-system/ui';
import { useSession } from '@/features/session/store';

const ROWS: { label: string; free: string; pro: string }[] = [
  { label: 'Комната', free: 'до 4 человек', pro: 'до 50 человек' },
  { label: 'Видео', free: 'свои MP4 и HLS-ссылки', pro: 'загрузка файлов' },
  { label: 'Общение', free: 'чат и реакции', pro: 'темы и свои реакции' },
  { label: 'Сервисы', free: 'External Watch', pro: 'Circle, планы, история' },
  { label: 'Синхронизация', free: 'базовая', pro: 'приоритетная' },
];

export default function ProfileScreen() {
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const dnd = useSession((state) => state.dnd);
  const setDnd = useSession((state) => state.setDnd);
  const setPlan = useSession((state) => state.setPlan);
  const signOut = useSession((state) => state.signOut);
  const [busy, setBusy] = useState(false);
  const plan = user?.plan ?? 'free';
  const entitlements = entitlementsFor(plan);

  const trial = async (next: 'free' | 'pro') => {
    if (!token) return;
    setBusy(true);
    const result = await api.trial(token, next);
    setPlan(result.user.plan);
    setBusy(false);
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>{user?.name ?? 'Профиль'}</AppText>
        <AppText tone="muted">{user?.email || 'Гостевой профиль'}</AppText>
        <Card>
          <AppText tone="accent">{plan === 'pro' ? 'Sinc Pro' : 'Бесплатно'}</AppText>
          <AppText style={{ marginTop: 8 }}>До {entitlements.maxParticipants} человек в комнате</AppText>
          <AppText tone="muted" style={{ marginTop: 6 }}>Платежи не подключены. Переключатель ниже только показывает, как план меняет доступ.</AppText>
        </Card>
        {ROWS.map((row) => (
          <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <AppText style={{ flex: 1 }}>{row.label}</AppText>
            <AppText tone={plan === 'free' ? 'ink' : 'muted'} style={{ flex: 1 }}>{row.free}</AppText>
            <AppText tone={plan === 'pro' ? 'accent' : 'muted'} style={{ flex: 1 }}>{row.pro}</AppText>
          </View>
        ))}
        {user ? <Button label={plan === 'pro' ? 'Вернуться на бесплатный' : 'Попробовать Sinc Pro'} onPress={() => void trial(plan === 'pro' ? 'free' : 'pro')} loading={busy} /> : <Button label="Войти" onPress={() => router.push('/auth')} />}
        <ToggleRow label="Не беспокоить" hint="Скрыть чат и реакции в комнате" value={dnd} onChange={(value) => void setDnd(value)} />
        <AppText tone="muted">Размер текста берётся из системных настроек. Кнопки крупные, у play есть виброотклик.</AppText>
        <AppText tone="muted">Голосовая комната появится через LiveKit. Сейчас это заглушка на сервере.</AppText>
        {user ? <Button label="Выйти" tone="ghost" onPress={() => { void signOut().then(() => queryClient.clear()); }} /> : null}
      </View>
    </Screen>
  );
}
