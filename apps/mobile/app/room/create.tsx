import { DEMO_OPEN_VIDEO_TITLE, DEMO_OPEN_VIDEO_URL, SERVICES, type CreateRoomRequest, type ServiceId } from '@sinc/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, Field, Screen, ToggleRow } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/features/session/store';
import { goBack } from '@/shared/navigation';

export default function CreateRoomScreen() {
  const params = useLocalSearchParams<{ circleId?: string }>();
  const circleId = typeof params.circleId === 'string' ? params.circleId : undefined;
  const token = useSession((state) => state.token);
  const setPendingFile = useSession((state) => state.setPendingFile);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'native' | 'external_service'>('native');
  const [sourceUrl, setSourceUrl] = useState('');
  const [localName, setLocalName] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [service, setService] = useState<ServiceId>('kinopoisk');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [everyoneCanPause, setEveryoneCanPause] = useState(true);
  const [everyoneCanSeek, setEveryoneCanSeek] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [spoilerMode, setSpoilerMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) return <Redirect href={{ pathname: '/auth', params: { next: '/room/create' } }} />;

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'application/vnd.apple.mpegurl'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setLocalUri(asset.uri);
    setLocalName(asset.name);
    setSourceUrl('');
  };

  const create = async () => {
    setLoading(true);
    setError(null);
    const body: CreateRoomRequest = mode === 'native'
      ? { sourceType: 'native', sourceUrl: sourceUrl.trim() || undefined, externalTitle: localName ?? (title.trim() || undefined), circleId, permissions: { everyoneCanPause, everyoneCanSeek, everyoneCanInvite: true, chatEnabled, reactionsEnabled, spoilerMode } }
      : { sourceType: 'external_service', service, externalTitle: title.trim() || undefined, externalWebUrl: link.trim().startsWith('http') ? link.trim() : undefined, externalDeepLink: link.trim().startsWith('http') || !link.trim() ? undefined : link.trim(), circleId, permissions: { everyoneCanPause, everyoneCanSeek, everyoneCanInvite: true, chatEnabled, reactionsEnabled, spoilerMode } };
    try {
      const room = await api.createRoom(token, body);
      if (localUri) setPendingFile(localUri, localName);
      else setPendingFile(null, null);
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      router.replace(`/room/${room.state.code}`);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось создать комнату');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={goBack}><AppText tone="muted">Назад</AppText></Pressable>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>Новый просмотр</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ModeCard title="Свой файл или ссылка" active={mode === 'native'} onPress={() => setMode('native')} />
          <ModeCard title="Кинопоиск, Okko и другие" active={mode === 'external_service'} onPress={() => setMode('external_service')} />
        </View>
        {mode === 'native' ? (
          <>
            <Field label="Прямая ссылка MP4 или HLS" value={sourceUrl} onChangeText={setSourceUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://" />
            <Button label="Демо-ролик Big Buck Bunny" tone="ghost" onPress={() => { setSourceUrl(DEMO_OPEN_VIDEO_URL); setTitle(DEMO_OPEN_VIDEO_TITLE); setLocalUri(null); }} />
            <Button label={localName ? localName : 'Выбрать файл на телефоне'} tone="ghost" onPress={() => void pickFile()} />
            <AppText tone="muted">Файл с телефона виден только вам. Друзьям нужна общая https-ссылка. DRM и страницы сервисов Sinc не воспроизводит.</AppText>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SERVICES.map((item) => (
                <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: service === item.id }} accessibilityLabel={item.label} onPress={() => setService(item.id)} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: service === item.id ? colors.accent : colors.card }}>
                  <AppText>{item.label}</AppText>
                </Pressable>
              ))}
            </View>
            <Field label="Название" value={title} onChangeText={setTitle} maxLength={120} placeholder="Дюна" />
            <Field label="Ссылка на фильм в официальном сервисе" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} placeholder="https://" />
            <AppText tone="muted">Sinc только откроет ссылку. Фильм вы включаете сами, своей подпиской.</AppText>
          </>
        )}
        <ToggleRow label="Любой может ставить паузу" value={everyoneCanPause} onChange={setEveryoneCanPause} />
        <ToggleRow label="Любой может перематывать" value={everyoneCanSeek} onChange={setEveryoneCanSeek} />
        <ToggleRow label="Чат" value={chatEnabled} onChange={setChatEnabled} />
        <ToggleRow label="Реакции" value={reactionsEnabled} onChange={setReactionsEnabled} />
        <ToggleRow label="Спойлер-режим" hint="Чат скрыт, пока человек сам его не откроет" value={spoilerMode} onChange={setSpoilerMode} />
        <Button label="Создать комнату" onPress={() => void create()} loading={loading} />
      </View>
    </Screen>
  );
}

function ModeCard({ title, active, onPress }: { title: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={title} onPress={onPress} style={{ flex: 1, minHeight: 92, borderRadius: 24, padding: 14, backgroundColor: active ? colors.accent : colors.card, justifyContent: 'flex-end' }}>
      <AppText style={{ fontWeight: '600' }}>{title}</AppText>
    </Pressable>
  );
}
