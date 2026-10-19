import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './tokens';

type Tone = 'ink' | 'muted' | 'accent' | 'success' | 'warning' | 'danger';

const toneColor: Record<Tone, string> = {
  ink: colors.ink,
  muted: colors.muted,
  accent: colors.accent,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

const toneClass: Record<Tone, string> = {
  ink: 'text-ink',
  muted: 'text-muted',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function AppText({ tone = 'ink', className, style, ...props }: TextProps & { tone?: Tone; className?: string }) {
  return <Text {...props} className={`${toneClass[tone]} ${className ?? ''}`} style={[{ color: toneColor[tone] }, style]} />;
}

export function Screen({ children, scroll = false, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  const content = (
    <View style={[{ flex: scroll ? undefined : 1 }, padded ? { paddingHorizontal: 20 } : null]}>{children}</View>
  );
  return (
    <View
      className="flex-1 bg-bg"
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, minHeight: Platform.OS === 'web' ? '100vh' : '100%' }}
    >
      <Glow />
      {scroll ? (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  );
}

export function Glow() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -80, left: 0, right: 0, height: 280 }}>
      <LinearGradient
        colors={['rgba(255,122,89,0.28)', 'rgba(139,92,246,0.16)', 'rgba(11,11,18,0)']}
        style={{ flex: 1 }}
      />
    </View>
  );
}

export function Wordmark() {
  return (
    <View className="flex-row items-center gap-3" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.8, shadowRadius: 12 }} />
      <AppText className="text-3xl font-semibold tracking-[8px]" style={{ fontSize: 32, fontWeight: '600', letterSpacing: 8 }}>
        sinc
      </AppText>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'accent',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'violet' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const background = disabled ? '#2A2A38' : tone === 'accent' ? colors.accent : tone === 'violet' ? colors.violet : colors.card;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      className="items-center justify-center rounded-full px-6"
      style={{ backgroundColor: background, minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
    >
      <AppText className="text-base font-semibold" style={{ fontSize: 16, fontWeight: '600' }}>
        {loading ? 'Секунду…' : label}
      </AppText>
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-2" style={{ gap: 8 }}>
      <AppText tone="muted" className="text-sm" style={{ fontSize: 14 }}>
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        className="rounded-3xl bg-card px-4 text-base text-ink"
        {...props}
        style={[{ backgroundColor: colors.card, color: colors.ink, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, minHeight: 56 }, style]}
      />
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      className="flex-row items-center justify-between rounded-3xl bg-card px-4 py-4"
      style={{ backgroundColor: colors.card, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <AppText style={{ fontSize: 16 }}>{label}</AppText>
        {hint ? <AppText tone="muted" style={{ fontSize: 13, marginTop: 4 }}>{hint}</AppText> : null}
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: value ? colors.accent : '#2A2A38', justifyContent: 'center', paddingHorizontal: 4 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignSelf: value ? 'flex-end' : 'flex-start' }} />
      </View>
    </Pressable>
  );
}

export function Banner({ text, tone = 'warning' }: { text: string; tone?: 'warning' | 'danger' | 'success' }) {
  const color = toneColor[tone];
  return (
    <View accessibilityRole="text" style={{ backgroundColor: 'rgba(21,21,31,0.88)', borderColor: color, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
      <AppText tone={tone} style={{ fontSize: 14 }}>{text}</AppText>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <AppText className="text-lg font-semibold" style={{ fontSize: 20, fontWeight: '600' }}>{title}</AppText>
      {children}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View className="overflow-hidden rounded-[28px] bg-card px-5 py-6" style={{ backgroundColor: colors.card, borderRadius: 28, padding: 20, overflow: 'hidden' }}>
      <LinearGradient colors={['#FF7A59', '#8B5CF6', 'rgba(139,92,246,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3 }} />
      <AppText style={{ fontSize: 18, fontWeight: '600' }}>{title}</AppText>
      <AppText tone="muted" style={{ marginTop: 6, fontSize: 15, lineHeight: 22 }}>{body}</AppText>
    </View>
  );
}

export function Card({ children, style }: ViewProps & { children: ReactNode }) {
  return (
    <View className="rounded-[28px] bg-card p-4" style={[{ backgroundColor: colors.card, borderRadius: 28, padding: 16 }, style]}>
      {children}
    </View>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color = status === 'disconnected' ? colors.danger : status === 'buffering' || status === 'drifted' || status === 'paused' ? colors.warning : colors.success;
  return <View accessibilityLabel={status} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

export function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 4);
  return (
    <View style={{ flexDirection: 'row', paddingLeft: 6 }}>
      {shown.map((name, index) => (
        <View
          key={`${name}-${index}`}
          accessibilityLabel={name}
          style={{ width: 36, height: 36, borderRadius: 18, marginLeft: -8, backgroundColor: index % 2 ? colors.violet : colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg }}
        >
          <AppText style={{ fontWeight: '700' }}>{name.slice(0, 1).toUpperCase()}</AppText>
        </View>
      ))}
    </View>
  );
}

export function PlayButton({ playing, onPress, pulse = false, disabled = false }: { playing: boolean; onPress: () => void; pulse?: boolean; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse) {
      scale.setValue(1);
      return;
    }
    const driver = Platform.OS !== 'web';
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 700, useNativeDriver: driver }),
      Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: driver }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Пауза' : 'Воспроизвести'}
        accessibilityState={{ disabled, selected: playing }}
        disabled={disabled}
        onPress={onPress}
        style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1, shadowColor: colors.accent, shadowOpacity: 0.55, shadowRadius: 18, elevation: 8 }}
      >
        <AppText style={{ fontSize: 28, fontWeight: '700' }}>{playing ? 'II' : '▶'}</AppText>
      </Pressable>
    </Animated.View>
  );
}

export function SeekBar({ progress, duration, disabled, onSeek }: { progress: number; duration: number; disabled?: boolean; onSeek: (seconds: number) => void }) {
  const width = useRef(1);
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Позиция просмотра"
      accessibilityValue={{ min: 0, max: Math.floor(duration || 0), now: Math.floor(progress || 0) }}
      accessibilityActions={[{ name: 'increment', label: 'Вперёд на 10 секунд' }, { name: 'decrement', label: 'Назад на 10 секунд' }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        if (event.nativeEvent.actionName === 'increment') onSeek(progress + 10);
        if (event.nativeEvent.actionName === 'decrement') onSeek(Math.max(0, progress - 10));
      }}
      disabled={disabled}
      onLayout={(event) => { width.current = event.nativeEvent.layout.width; }}
      onPress={(event) => {
        if (disabled || duration <= 0) return;
        const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width.current));
        onSeek(ratio * duration);
      }}
      style={{ height: 36, justifyContent: 'center' }}
    >
      <View style={{ height: 4, borderRadius: 4, backgroundColor: 'rgba(245,243,255,0.15)', overflow: 'hidden' }}>
        <LinearGradient colors={['#FBBF24', '#FF7A59', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct}%`, height: 4 }} />
      </View>
    </Pressable>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Закрыть панель" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, gap: 14, maxHeight: '70%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText style={{ fontSize: 18, fontWeight: '600' }}>{title}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <AppText tone="muted">Закрыть</AppText>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

export function LegalNote({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 14 }}>
      <AppText tone="muted" style={{ fontSize: 13, lineHeight: 19 }}>{text}</AppText>
    </View>
  );
}
