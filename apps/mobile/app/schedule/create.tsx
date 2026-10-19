import { entitlementsFor } from '@sinc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, Field, Screen } from '@/design-system/ui';
import { useSession } from '@/features/session/store';

export default function CreateScheduleScreen() {
  const params = useLocalSearchParams<{ circleId?: string }>();
  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const setPlan = useSession((state) => state.setPlan);
  const queryClient = useQueryClient();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [title, setTitle] = useState('Дюна');
  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [time, setTime] = useState('21:00');
  const [error, setError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const allowed = user ? entitlementsFor(user.plan).scheduling : false;

  const create = async () => {
    if (!token) return router.push('/auth');
    if (!allowed) {
      setError('Планирование входит в Sinc Pro. Включите пробный план в профиле.');
      return;
    }
    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      setError('Дата в формате ГГГГ-ММ-ДД, время ЧЧ:ММ');
      return;
    }
    try {
      const schedule = await api.createSchedule(token, { title, startsAt: startsAt.toISOString(), timezone, circleId: typeof params.circleId === 'string' ? params.circleId : undefined });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      router.replace(`/schedule/${schedule.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось запланировать');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>Вечер в календаре</AppText>
        <AppText tone="muted">Напомним за 30 и за 5 минут. Часовой пояс: {timezone}</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        <Field label="Что смотрим" value={title} onChangeText={setTitle} maxLength={120} />
        <Field label="Дата" value={date} onChangeText={setDate} autoCapitalize="none" accessibilityLabel="Дата в формате год-месяц-день" />
        <Field label="Время" value={time} onChangeText={setTime} autoCapitalize="none" accessibilityLabel="Время в формате часы и минуты" />
        {!allowed && token ? <Button label="Включить пробный Pro" tone="violet" onPress={() => void api.trial(token, 'pro').then((result) => setPlan(result.user.plan))} /> : null}
        <Button label="Запланировать" onPress={() => void create()} />
      </View>
    </Screen>
  );
}
