import type { Vote, WatchlistItem } from '@sinc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, Card, Field, Screen } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/features/session/store';
import { goBack } from '@/shared/navigation';

export default function CircleScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const token = useSession((state) => state.token);
  const userId = useSession((state) => state.user?.id);
  const queryClient = useQueryClient();
  const circle = useQuery({ queryKey: ['circle', id], queryFn: () => api.circle(token ?? '', id), enabled: Boolean(token && id) });
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('Что смотрим?');
  const [options, setOptions] = useState('Дюна\nПрошлой ночью в Сохо');
  const [error, setError] = useState<string | null>(null);
  const data = circle.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['circle', id] });

  const addMember = async () => {
    if (!token) return;
    try {
      await api.addMember(token, id, email.trim());
      setEmail('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось пригласить');
    }
  };

  const vote = async () => {
    if (!token) return;
    const labels = options.split('\n').map((item) => item.trim()).filter(Boolean);
    try {
      await api.createVote(token, id, { question, options: labels, endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
      await refresh();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Голосование не создалось');
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={goBack}><AppText tone="muted">Назад</AppText></Pressable>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>{data?.circle.name ?? 'Circle'}</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        <AppText tone="muted">{data?.circle.members.map((member) => member.name).join(', ')}</AppText>
        <Field label="Почта друга" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Button label="Добавить в Circle" tone="ghost" onPress={() => void addMember()} />
        <Button label="Быстрый просмотр" onPress={() => router.push({ pathname: '/room/create', params: { circleId: id } })} />
        <Button label="Запланировать вечер" tone="violet" onPress={() => router.push({ pathname: '/schedule/create', params: { circleId: id } })} />
        <AppText style={{ fontSize: 20, fontWeight: '600' }}>Общий список</AppText>
        {data?.watchlist.map((item) => <WatchRow key={item.id} item={item} votes={data.votes} members={data.circle.members.length} />)}
        {data && data.watchlist.length === 0 ? <AppText tone="muted">Пока пусто. Добавляйте фильмы во вкладке Watchlist и привязывайте голосование к тем же названиям.</AppText> : null}
        <AppText style={{ fontSize: 20, fontWeight: '600' }}>Что смотрим</AppText>
        <Field label="Вопрос" value={question} onChangeText={setQuestion} />
        <Field label="Варианты, каждый с новой строки" value={options} onChangeText={setOptions} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
        <Button label="Запустить голосование" tone="ghost" onPress={() => void vote()} />
        {data?.votes.map((voteItem) => <VoteCard key={voteItem.id} vote={voteItem} mine={userId} token={token} onCast={async (optionId) => { if (!token) return; await api.castVote(token, optionId); await refresh(); }} />)}
        <AppText style={{ fontSize: 20, fontWeight: '600' }}>История</AppText>
        {data?.history.length ? data.history.map((item) => <AppText key={item.code}>{item.title}</AppText>) : <AppText tone="muted">Совместные комнаты этого Circle появятся здесь.</AppText>}
      </View>
    </Screen>
  );
}

function WatchRow({ item, votes, members }: { item: WatchlistItem; votes: Vote[]; members: number }) {
  const match = votes.flatMap((vote) => vote.options).find((option) => option.label.trim().toLowerCase() === item.title.trim().toLowerCase());
  return (
    <Card>
      <AppText>{item.title}</AppText>
      <AppText tone="muted">{item.service ?? 'без метки'}</AppText>
      {match ? <AppText tone="accent" style={{ marginTop: 6 }}>Этот фильм хотят {match.voterIds.length} из {members}</AppText> : null}
    </Card>
  );
}

function VoteCard({ vote, mine, token, onCast }: { vote: Vote; mine?: string; token: string | null; onCast: (optionId: string) => Promise<void> }) {
  return (
    <Card>
      <AppText style={{ fontWeight: '600' }}>{vote.question}</AppText>
      {vote.options.map((option) => {
        const selected = mine ? option.voterIds.includes(mine) : false;
        return (
          <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={option.label} disabled={!token} onPress={() => void onCast(option.id)} style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}>
            <AppText tone={selected ? 'accent' : 'ink'}>{option.label} · {option.voterIds.length}</AppText>
          </Pressable>
        );
      })}
    </Card>
  );
}
