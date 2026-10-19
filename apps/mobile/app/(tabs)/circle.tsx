import { entitlementsFor } from '@sinc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, Card, EmptyState, Field, Screen } from '@/design-system/ui';
import { useSession } from '@/features/session/store';

export default function CircleTab() {
  const token = useSession((state) => state.token);
  const user = useSession((state) => state.user);
  const setPlan = useSession((state) => state.setPlan);
  const queryClient = useQueryClient();
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => api.circles(token ?? ''), enabled: Boolean(token) });
  const [name, setName] = useState('Киноклуб');
  const [error, setError] = useState<string | null>(null);
  const [showPro, setShowPro] = useState(false);
  const allowed = user ? entitlementsFor(user.plan).circles : false;

  const create = async () => {
    if (!token) return router.push('/auth');
    if (!allowed) {
      setShowPro(true);
      return;
    }
    try {
      const circle = await api.createCircle(token, name);
      await queryClient.invalidateQueries({ queryKey: ['circles'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      router.push(`/circle/${circle.id}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать Circle');
    }
  };

  const trial = async () => {
    if (!token) return;
    const result = await api.trial(token, 'pro');
    setPlan(result.user.plan);
    setShowPro(false);
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>Circle</AppText>
        <AppText tone="muted">Постоянная компания: общий список, вечера и голосование, что смотрим.</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        {showPro ? <Banner text="Circle входит в Sinc Pro. Пробный доступ без оплаты можно включить в профиле или здесь." /> : null}
        <Field label="Название" value={name} onChangeText={setName} maxLength={60} />
        <Button label="Создать Circle" onPress={() => void create()} />
        {showPro ? <Button label="Включить пробный Pro" tone="violet" onPress={() => void trial()} /> : null}
        {circles.data?.length ? circles.data.map((circle) => (
          <Pressable key={circle.id} accessibilityRole="button" accessibilityLabel={circle.name} onPress={() => router.push(`/circle/${circle.id}`)}>
            <Card>
              <AppText style={{ fontSize: 20, fontWeight: '600' }}>{circle.name}</AppText>
              <AppText tone="muted" style={{ marginTop: 4 }}>{circle.members.map((member) => member.name).join(', ')}</AppText>
            </Card>
          </Pressable>
        )) : <EmptyState title="Киноклуб с Аней и Максом" body="Пока это только место для названия. Пригласите друзей по почте, когда они появятся в Sinc." />}
      </View>
    </Screen>
  );
}
