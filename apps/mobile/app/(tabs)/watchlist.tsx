import { SERVICES, type WatchlistItem } from '@sinc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, EmptyState, Field, Screen } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/features/session/store';

export default function WatchlistScreen() {
  const token = useSession((state) => state.token);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['watchlist'], queryFn: () => api.watchlist(token ?? ''), enabled: Boolean(token) });
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => api.circles(token ?? ''), enabled: Boolean(token) });
  const [title, setTitle] = useState('');
  const [service, setService] = useState('kinopoisk');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!token || !title.trim()) return;
    try {
      await api.addWatch(token, { title: title.trim(), service });
      setTitle('');
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось добавить');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>Watchlist</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        <Field label="Фильм или сериал" value={title} onChangeText={setTitle} maxLength={120} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[...SERVICES, { id: 'file', label: 'Свой файл' }].map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: service === item.id }} onPress={() => setService(item.id)} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: service === item.id ? colors.violet : colors.card }}>
              <AppText>{item.label}</AppText>
            </Pressable>
          ))}
        </View>
        <Button label="Добавить в мой список" onPress={() => void add()} disabled={!token} />
        {list.data?.length ? list.data.map((item) => <Item key={item.id} item={item} />) : <EmptyState title="Список пуст" body="Добавьте название вручную или ссылкой. Общее голосование живёт в Circle." />}
        {circles.data?.length ? <AppText tone="muted">Пересечения «хотят N из M» считаются в голосовании Circle, когда варианты совпадают с названиями.</AppText> : null}
      </View>
    </Screen>
  );
}

function serviceName(service: string | undefined): string {
  if (service === 'file') return 'Свой файл';
  return SERVICES.find((item) => item.id === service)?.label ?? 'Без сервиса';
}

function Item({ item }: { item: WatchlistItem }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 24, padding: 16 }}>
      <AppText style={{ fontSize: 18 }}>{item.title}</AppText>
      <AppText tone="muted" style={{ marginTop: 4 }}>{serviceName(item.service)}</AppText>
    </View>
  );
}
