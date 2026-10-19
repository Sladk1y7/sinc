import { greetingFor, type RoomSummary, type ScheduledWatch } from '@sinc/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { api } from '@/api/client';
import { AppText, AvatarStack, Button, Card, EmptyState, Screen, Section } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/features/session/store';

export default function HomeScreen() {
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const [code, setCode] = useState('');
  const home = useQuery({ queryKey: ['home', user?.id], queryFn: () => api.home(token ?? ''), enabled: Boolean(token) });
  const hour = new Date().getHours();

  return (
    <Screen scroll>
      <View style={{ gap: 22, paddingTop: 12 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700', lineHeight: 38 }}>{user ? greetingFor(user.name, hour) : greetingFor('друг', hour)}</AppText>
        <Button label="Создать просмотр" onPress={() => router.push(user ? '/room/create' : '/auth')} />
        <View style={{ gap: 8 }}>
          <AppText tone="muted">Код комнаты</AppText>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="······"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Код комнаты, 6 цифр"
            style={{ minHeight: 72, borderRadius: 24, backgroundColor: colors.card, color: colors.ink, textAlign: 'center', fontSize: 32, letterSpacing: 8, fontWeight: '600' }}
          />
          <Button label="Присоединиться" tone="violet" disabled={code.length !== 6} onPress={() => router.push(user ? `/room/${code}` : '/auth')} />
        </View>
        <Section title="Ближайшие просмотры">
          {home.data?.upcoming.length ? home.data.upcoming.map((item) => <Upcoming key={item.id} item={item} />) : <EmptyState title="Вечер ещё свободен" body="Запланируйте «Дюну» на пятницу — и все получат напоминание." />}
        </Section>
        <Section title="Недавние комнаты">
          {home.data?.recentRooms.length ? home.data.recentRooms.map((item) => <Recent key={item.code} item={item} />) : <EmptyState title="Здесь будет история" body="После первого совместного вечера комната сохранится тут." />}
        </Section>
        <Section title="Мои Circle">
          {home.data?.circles.length ? home.data.circles.map((circle) => (
            <Pressable key={circle.id} accessibilityRole="button" accessibilityLabel={circle.name} onPress={() => router.push(`/circle/${circle.id}`)}>
              <Card>
                <AppText style={{ fontSize: 18, fontWeight: '600' }}>{circle.name}</AppText>
                <View style={{ marginTop: 10 }}><AvatarStack names={circle.members.map((member) => member.name)} /></View>
              </Card>
            </Pressable>
          )) : <EmptyState title="Киноклуб ещё не собрался" body="Circle — постоянная компания. Создайте её во вкладке Circle, это часть Sinc Pro." />}
        </Section>
      </View>
    </Screen>
  );
}

function Upcoming({ item }: { item: ScheduledWatch }) {
  const when = new Date(item.startsAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(`/schedule/${item.id}`)}>
      <Card>
        <AppText tone="accent">{when.toLocaleString('ru-RU', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</AppText>
        <AppText style={{ fontSize: 20, fontWeight: '600', marginTop: 4 }}>{item.title}</AppText>
        <View style={{ marginTop: 10 }}><AvatarStack names={item.rsvps.map((rsvp) => rsvp.name)} /></View>
      </Card>
    </Pressable>
  );
}

function Recent({ item }: { item: RoomSummary }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(`/room/${item.code}`)}>
      <Card>
        <AppText style={{ fontSize: 18 }}>{item.title}</AppText>
        <AppText tone="muted" style={{ marginTop: 4 }}>Код {item.code}</AppText>
      </Card>
    </Pressable>
  );
}
