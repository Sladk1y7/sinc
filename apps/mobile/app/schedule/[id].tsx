import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { api } from '@/api/client';
import { AppText, Button, Card, Screen, StatusDot } from '@/design-system/ui';
import { useSession } from '@/features/session/store';
import { goBack } from '@/shared/navigation';

export default function ScheduleScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const token = useSession((state) => state.token);
  const userId = useSession((state) => state.user?.id);
  const queryClient = useQueryClient();
  const schedule = useQuery({ queryKey: ['schedule', id], queryFn: () => api.schedule(token ?? '', id), enabled: Boolean(token && id) });
  const item = schedule.data;

  const rsvp = async (response: 'yes' | 'no') => {
    if (!token) return;
    await api.rsvp(token, id, response);
    await queryClient.invalidateQueries({ queryKey: ['schedule', id] });
  };

  const start = async () => {
    if (!token) return;
    const room = await api.startSchedule(token, id);
    router.replace(`/room/${room.state.code}`);
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={goBack}><AppText tone="muted">Назад</AppText></Pressable>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>{item?.title ?? 'Просмотр'}</AppText>
        {item ? <AppText tone="muted">{new Date(item.startsAt).toLocaleString('ru-RU')} · {item.timezone}</AppText> : null}
        <AppText>Напоминания уйдут за 30 и 5 минут тем, кто нажмёт «Присоединюсь».</AppText>
        {item?.rsvps.map((rsvpItem) => (
          <Card key={rsvpItem.userId}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusDot status={rsvpItem.response === 'yes' ? 'ready' : 'paused'} />
              <AppText>{rsvpItem.name}</AppText>
              <AppText tone="muted">{rsvpItem.response === 'yes' ? 'Присоединюсь' : 'Не смогу'}</AppText>
            </View>
          </Card>
        ))}
        <Button label="Присоединюсь" onPress={() => void rsvp('yes')} />
        <Button label="Не смогу" tone="ghost" onPress={() => void rsvp('no')} />
        {item?.createdBy === userId ? <Button label="Начать сейчас" tone="violet" onPress={() => void start()} /> : null}
      </View>
    </Screen>
  );
}
