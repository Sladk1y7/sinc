import { ALLOWED_REACTIONS, type ChatMessage } from '@sinc/shared';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { AppText, Sheet } from '@/design-system/ui';
import { colors } from '@/design-system/tokens';

export function ChatSheet({
  messages,
  spoiler,
  mine,
  host,
  onClose,
  onSend,
  onReact,
  onDelete,
  onReport,
}: {
  messages: ChatMessage[];
  spoiler: boolean;
  mine: string;
  host: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
  onDelete: (messageId: string) => void;
  onReport: (messageId: string) => void;
}) {
  const [text, setText] = useState('');
  const [shown, setShown] = useState(!spoiler);
  return (
    <Sheet title="Комната" onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ALLOWED_REACTIONS.map((emoji) => (
          <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Реакция ${emoji}`} onPress={() => onReact(emoji)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <AppText style={{ fontSize: 26 }}>{emoji}</AppText>
          </Pressable>
        ))}
      </View>
      {spoiler && !shown ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Показать сообщения, возможны спойлеры" onPress={() => setShown(true)} style={{ minHeight: 56, justifyContent: 'center' }}>
          <AppText>Спойлеры скрыты. Показать чат</AppText>
        </Pressable>
      ) : (
        <ScrollView style={{ maxHeight: 240 }}>
          {messages.length === 0 ? <AppText tone="muted">Пока тихо. Можно написать первым.</AppText> : null}
          {messages.map((message) => (
            <View key={message.id} style={{ paddingVertical: 8 }}>
              <AppText tone="muted" style={{ fontSize: 12 }}>{message.name}</AppText>
              <AppText style={{ fontSize: 16, lineHeight: 22 }}>{message.text}</AppText>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                {message.userId !== mine ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Пожаловаться на сообщение" onPress={() => onReport(message.id)}>
                    <AppText tone="muted" style={{ fontSize: 13 }}>Пожаловаться</AppText>
                  </Pressable>
                ) : null}
                {message.userId === mine || host ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Удалить сообщение" onPress={() => onDelete(message.id)}>
                    <AppText tone="danger" style={{ fontSize: 13 }}>Удалить</AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Сообщение"
          maxLength={500}
          style={{ flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: colors.card, color: colors.ink, paddingHorizontal: 14, fontSize: 16 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить"
          onPress={() => {
            const next = text.trim();
            if (!next) return;
            onSend(next);
            setText('');
          }}
          style={{ minHeight: 52, paddingHorizontal: 14, justifyContent: 'center' }}
        >
          <AppText tone="accent">Ок</AppText>
        </Pressable>
      </View>
    </Sheet>
  );
}
