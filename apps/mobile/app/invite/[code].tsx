import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { AppText, Banner, Button, Screen } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';
import { track, useSession } from '@/features/session/store';
import { goBack } from '@/shared/navigation';

export default function InviteScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? '';
  const token = useSession((state) => state.token);
  const userId = useSession((state) => state.user?.id);
  const room = useQuery({ queryKey: ['room-meta', code], queryFn: () => api.room(token ?? '', code), enabled: Boolean(token && code) });
  const hostId = room.data?.state.hostUserId;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = `https://sinc.app/r/${code}`;
  const deep = `sinc://room/${code}`;

  const share = async () => {
    await Share.share({ message: `Смотрим вместе в Sinc. Код: ${code}\n${link}` });
    void track('invite_shared', { code });
  };

  return (
    <Screen scroll>
      <View style={{ gap: 18, paddingTop: 12, alignItems: 'center' }}>
        <AppText tone="muted" onPress={goBack} accessibilityRole="button">Назад</AppText>
        <AppText style={{ fontSize: 18 }}>Код комнаты</AppText>
        <AppText accessibilityLabel={`Код ${code.split('').join(' ')}`} style={{ fontSize: 56, fontWeight: '700', letterSpacing: 6 }}>{code}</AppText>
        <View style={{ backgroundColor: colors.ink, padding: 16, borderRadius: 28 }}>
          <QRCode value={link} size={220} backgroundColor={colors.ink} color={colors.bg} />
        </View>
        {copied ? <Banner text="Код скопирован" tone="success" /> : null}
        {error ? <Banner text={error} tone="danger" /> : null}
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button label="Поделиться ссылкой" onPress={() => void share()} />
          <Button label="Скопировать код" tone="ghost" onPress={() => { void Clipboard.setStringAsync(code); setCopied(true); void track('invite_shared', { code }); }} />
        </View>
        <AppText tone="muted" style={{ textAlign: 'center' }}>{deep}</AppText>
        <AppText tone="muted" style={{ textAlign: 'center' }}>{link}</AppText>
        {hostId && hostId === userId ? (
          <Button label="Закрыть комнату" tone="ghost" onPress={() => {
            if (!token) return;
            void api.deleteRoom(token, code).then(() => router.replace('/(tabs)/home')).catch((reason: unknown) => setError(reason instanceof ApiError ? reason.message : 'Не удалось закрыть'));
          }} />
        ) : null}
      </View>
    </Screen>
  );
}
