import { Redirect, router } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { AppText, Button, Screen, Wordmark } from '@/design-system/ui';
import { useSession } from '@/features/session/store';

export default function Onboarding() {
  const onboarded = useSession((state) => state.onboarded);
  const user = useSession((state) => state.user);
  const setOnboarded = useSession((state) => state.setOnboarded);
  const nextRoute = useRef('/(tabs)/home');

  if (onboarded) {
    const next = nextRoute.current;
    if (!user) return <Redirect href={{ pathname: '/auth', params: { next } }} />;
    return <Redirect href={next as '/(tabs)/home'} />;
  }

  const go = (next: string) => {
    nextRoute.current = next;
    void setOnboarded();
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 28 }}>
        <Wordmark />
        <View style={{ gap: 14 }}>
          <AppText style={{ fontSize: 36, lineHeight: 42, fontWeight: '700' }}>Смотрим вместе. Даже если вы в разных городах.</AppText>
          <AppText tone="muted" style={{ fontSize: 18, lineHeight: 26 }}>Один фильм. Отдельные телефоны. Общие эмоции.</AppText>
        </View>
        <View style={{ gap: 12 }}>
          <Button label="Создать просмотр" onPress={() => void go('/room/create')} />
          <Button label="Присоединиться по коду" tone="ghost" onPress={() => void go('/(tabs)/home')} />
          <AppText tone="muted" style={{ fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            Работает с вашими файлами и официальными приложениями Кинопоиска, Okko и других сервисов.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}
