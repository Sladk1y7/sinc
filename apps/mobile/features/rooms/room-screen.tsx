import {
  canControlPlayback,
  expectedPositionSec,
  externalOpenUrl,
  formatTimecode,
  LEGAL_EXTERNAL_NOTICE,
  roomTitle,
  serverNowMs,
  serviceLabel,
  type ParticipantStatus,
} from '@sinc/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { goBack } from '@/shared/navigation';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '@/api/client';
import { AppText, AvatarStack, Banner, Button, LegalNote, PlayButton, SeekBar, Sheet, StatusDot } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { ChatSheet } from '@/features/chat/chat-sheet';
import { useSession } from '@/features/session/store';
import { NativePlayer, type WatchPlayerRef } from '@/players/native-player';
import { useRoomRealtime } from './session';
import { useRoomStore } from './store';

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  ready: 'Готов',
  buffering: 'Буферизует',
  drifted: 'Отстаёт',
  paused: 'На паузе',
  disconnected: 'Отключился',
  opened_external_app: 'Открыл приложение',
};

export function RoomScreen() {
  const { code, send } = useRoomRealtime();
  const insets = useSafeAreaInsets();
  const user = useSession((state) => state.user);
  const token = useSession((state) => state.token);
  const dnd = useSession((state) => state.dnd);
  const localUri = useSession((state) => state.pendingLocalUri);
  const room = useRoomStore((state) => state.state);
  const messages = useRoomStore((state) => state.messages);
  const reactions = useRoomStore((state) => state.reactions);
  const connection = useRoomStore((state) => state.connection);
  const offsetMs = useRoomStore((state) => state.offsetMs);
  const syncing = useRoomStore((state) => state.syncing);
  const error = useRoomStore((state) => state.error);
  const hint = useRoomStore((state) => state.hint);
  const quality = useRoomStore((state) => state.quality);
  const playerRef = useRef<WatchPlayerRef>(null);
  const [sheet, setSheet] = useState<'chat' | 'seek' | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [seekH, setSeekH] = useState('0');
  const [seekM, setSeekM] = useState('0');
  const [seekS, setSeekS] = useState('0');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!room || room.sourceType !== 'native') return;
    const timer = setInterval(() => {
      setProgress(playerRef.current?.position() ?? 0);
      setDuration(playerRef.current?.duration() ?? 0);
    }, 400);
    return () => clearInterval(timer);
  }, [room]);

  if (!user) return <Centered text="Сначала представьтесь" action="Войти" onPress={() => router.replace('/auth')} />;
  if (error && !room) return <Centered text={error} action="На главную" onPress={() => router.replace('/(tabs)/home')} />;
  if (!room) return <Centered text="Открываем комнату…" />;

  const mine = user.id;
  const isHost = room.hostUserId === mine;
  const sourceUrl = room.sourceUrl ?? (isHost ? localUri : null);
  const canPause = canControlPlayback(room, mine, 'pause');
  const canSeek = canControlPlayback(room, mine, 'seek');
  const expected = expectedPositionSec(room, serverNowMs(offsetMs, now));
  const countdown = room.sourceType === 'external_service' && room.isPlaying ? Math.ceil((room.serverTimestamp - serverNowMs(offsetMs, now)) / 1000) : 0;
  const someoneBuffers = room.participants.some((person) => person.status === 'buffering');
  const banner = connection === 'reconnecting' ? 'Переподключаемся…' : syncing ? 'Подгоняем время…' : someoneBuffers ? 'Участник буферизует' : quality === 'poor' ? 'Слабое соединение' : hint;
  const chatOn = room.permissions.chatEnabled && !dnd;
  const reactionsOn = room.permissions.reactionsEnabled && !dnd;

  const toggle = () => {
    if (!canPause) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (room.sourceType === 'native') {
      const position = playerRef.current?.position() ?? expected;
      if (room.isPlaying) {
        playerRef.current?.pause();
        send({ type: 'playback.pause', positionSec: position });
      } else {
        playerRef.current?.play();
        send({ type: 'playback.play', positionSec: position });
      }
      return;
    }
    send(room.isPlaying ? { type: 'playback.pause', positionSec: expected } : { type: 'playback.play', positionSec: expected });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {room.sourceType === 'native' ? (
        <NativePlayer ref={playerRef} sourceUrl={sourceUrl ?? null} state={room} offsetMs={offsetMs} onCommand={send} />
      ) : (
        <ExternalStage
          title={roomTitle(room)}
          service={serviceLabel(room.service)}
          opened={room.participants.some((person) => person.userId === mine && person.status === 'opened_external_app')}
          onOpen={() => void openExternal(room)}
          onConfirm={() => send({ type: 'external.confirm_opened' })}
        />
      )}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={goBack} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
            <AppText>Назад</AppText>
          </Pressable>
          <AppText accessibilityLabel={`Код комнаты ${room.code}`}>{room.code}</AppText>
          <View accessibilityLabel={quality === 'poor' ? 'Слабое соединение' : 'Соединение стабильно'}>
            <StatusDot status={quality === 'poor' ? 'disconnected' : quality === 'medium' ? 'paused' : 'ready'} />
          </View>
        </View>
        {banner ? <Banner text={banner} tone={connection === 'reconnecting' || quality === 'poor' ? 'warning' : 'success'} /> : null}
        {notice ? <Banner text={notice} /> : null}
      </View>
      {reactionsOn && !reduceMotion ? reactions.slice(-4).map((reaction, index) => <Floater key={reaction.id} emoji={reaction.emoji} left={24 + index * 36} />) : null}
      {countdown > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' }}>
          <AppText style={{ fontSize: 72, fontWeight: '700' }}>{countdown}</AppText>
          <AppText>Все нажимают Play сейчас</AppText>
        </View>
      ) : null}
      <View style={room.sourceType === 'native'
        ? { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: insets.bottom + 16, gap: 14, backgroundColor: 'rgba(11,11,18,0.72)' }
        : { paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AvatarStack names={room.participants.map((person) => person.name)} />
          <AppText tone="muted">{room.participants.length} в комнате</AppText>
        </View>
        <View style={{ gap: 8 }}>
          {room.participants.map((person) => (
            <View key={person.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusDot status={person.status} />
              <AppText style={{ flex: 1 }}>{person.name}</AppText>
              <AppText tone="muted">{STATUS_LABEL[person.status]}</AppText>
              {person.userId !== mine ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Заблокировать ${person.name}`} onPress={() => void block(token, person.userId, setNotice)}>
                  <AppText tone="muted" style={{ fontSize: 13 }}>Блок</AppText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        {room.sourceType === 'native' ? (
          <SeekBar progress={progress} duration={duration} disabled={!canSeek} onSeek={(seconds) => {
            playerRef.current?.seek(seconds);
            send({ type: 'playback.seek', positionSec: seconds });
          }} />
        ) : (
          <AppText accessibilityLabel={`Общий таймер ${formatTimecode(expected)}`} style={{ fontSize: 42, fontWeight: '600', textAlign: 'center' }} maxFontSizeMultiplier={1.4}>
            {formatTimecode(expected)}
          </AppText>
        )}
        <View style={{ alignItems: 'center' }}>
          <PlayButton playing={room.isPlaying} disabled={!canPause} pulse={!room.isPlaying && canPause} onPress={toggle} />
        </View>
        {room.sourceType === 'native' && isHost ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {[1, 1.25, 1.5].map((rate) => (
              <Pressable key={rate} accessibilityRole="button" accessibilityLabel={`Скорость ${rate}`} onPress={() => send({ type: 'playback.rate', rate })} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 16, backgroundColor: room.playbackRate === rate ? colors.accent : colors.card }}>
                <AppText>{rate}×</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {chatOn ? <TextAction label="Чат" onPress={() => setSheet('chat')} /> : <AppText tone="muted">Тихий режим</AppText>}
          {room.sourceType === 'external_service' && canSeek ? <TextAction label="Перемотать" onPress={() => setSheet('seek')} /> : null}
          {room.permissions.everyoneCanInvite || isHost ? <TextAction label="Пригласить" onPress={() => router.push(`/invite/${room.code}`)} /> : null}
          {room.sourceType === 'external_service' ? <TextAction label="Я отстаю" onPress={() => send({ type: 'participant.status', status: 'drifted' })} /> : null}
        </View>
      </View>
      {sheet === 'chat' && chatOn ? (
        <ChatSheet
          messages={messages}
          spoiler={room.permissions.spoilerMode}
          mine={mine}
          host={isHost}
          onClose={() => setSheet(null)}
          onSend={(text) => send({ type: 'chat.message', text })}
          onReact={(emoji) => { if (reactionsOn) send({ type: 'reaction', emoji }); }}
          onDelete={(messageId) => { if (token) void api.deleteMessage(token, room.code, messageId).catch((reason: unknown) => setNotice(reason instanceof ApiError ? reason.message : 'Не удалось удалить')); }}
          onReport={(messageId) => { if (token) void api.report(token, room.code, { targetType: 'message', targetId: messageId, reason: 'Жалоба из комнаты' }).then(() => setNotice('Жалоба отправлена')); }}
        />
      ) : null}
      {sheet === 'seek' ? (
        <Sheet title="Перемотайте вместе" onClose={() => setSheet(null)}>
          <AppText tone="muted">Каждый перемотает у себя в официальном приложении.</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TimeBox label="Часы" value={seekH} onChange={setSeekH} />
            <TimeBox label="Минуты" value={seekM} onChange={setSeekM} />
            <TimeBox label="Секунды" value={seekS} onChange={setSeekS} />
          </View>
          <Button label="Отправить метку" onPress={() => {
            const positionSec = Number(seekH || 0) * 3600 + Number(seekM || 0) * 60 + Number(seekS || 0);
            send({ type: 'playback.seek', positionSec });
            setSheet(null);
          }} />
        </Sheet>
      ) : null}
    </View>
  );
}

function ExternalStage({ title, service, opened, onOpen, onConfirm }: { title: string; service: string; opened: boolean; onOpen: () => void; onConfirm: () => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 88, paddingBottom: 16, gap: 14 }}>
      <LegalNote text={LEGAL_EXTERNAL_NOTICE} />
      <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: colors.card, padding: 20, gap: 8 }}>
        <AppText tone="muted">{service}</AppText>
        <AppText style={{ fontSize: 28, fontWeight: '700' }}>{title}</AppText>
        <AppText tone="muted">Смотрите в официальном приложении. Здесь общий таймер и разговор.</AppText>
      </View>
      <Button label="Открыть в приложении" onPress={onOpen} />
      <Button label={opened ? 'Приложение открыто' : 'Я открыл фильм в официальном приложении'} tone={opened ? 'ghost' : 'violet'} onPress={onConfirm} />
    </ScrollView>
  );
}

function TimeBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <AppText tone="muted">{label}</AppText>
      <TextInput accessibilityLabel={label} keyboardType="number-pad" value={value} onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, 2))} style={{ minHeight: 52, borderRadius: 16, backgroundColor: colors.card, color: colors.ink, textAlign: 'center', fontSize: 20 }} />
    </View>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
      <AppText>{label}</AppText>
    </Pressable>
  );
}

function Floater({ emoji, left }: { emoji: string; left: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 1400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [progress]);
  return (
    <Animated.Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', bottom: 180, left, fontSize: 32, opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) }] }}>
      {emoji}
    </Animated.Text>
  );
}

function Centered({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <AppText style={{ fontSize: 20, textAlign: 'center' }}>{text}</AppText>
      {action && onPress ? <Button label={action} onPress={onPress} /> : null}
    </View>
  );
}

async function openExternal(room: Parameters<typeof externalOpenUrl>[0]) {
  const url = externalOpenUrl(room);
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    await Clipboard.setStringAsync(url);
  }
}

async function block(token: string | null, userId: string, setNotice: (value: string) => void) {
  if (!token) return;
  try {
    await api.block(token, userId);
    setNotice('Человек заблокирован. Новые комнаты его не пустят.');
  } catch (error) {
    setNotice(error instanceof ApiError ? error.message : 'Не удалось заблокировать');
  }
}
