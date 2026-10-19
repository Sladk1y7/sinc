import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { AppText, Banner, Button, Field, Screen } from '@/design-system/ui';
import { useSession } from '@/features/session/store';
import { api } from '@/api/client';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ next?: string }>();
  const setSession = useSession((state) => state.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'guest' | 'login'>('guest');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finish = async (token: string, user: Parameters<typeof setSession>[1]) => {
    await setSession(token, user);
    const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/(tabs)/home';
    router.replace(next as '/(tabs)/home');
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = mode === 'guest' ? await api.guest(name) : password.length >= 8 && email ? await api.login({ email, password }).catch(async () => api.register({ email, name: name || email.split('@')[0] || 'Друг', password })) : null;
      if (!result) {
        setError('Для почты нужен пароль от 8 символов');
        return;
      }
      await finish(result.token, result.user);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ gap: 16, paddingTop: 24 }}>
        <AppText style={{ fontSize: 32, fontWeight: '700' }}>Как к вам обращаться?</AppText>
        <AppText tone="muted">Имя видно друзьям в комнате. Почта пригодится, чтобы вернуться.</AppText>
        {error ? <Banner text={error} tone="danger" /> : null}
        <Field label="Имя" value={name} onChangeText={setName} maxLength={40} autoComplete="name" />
        {mode === 'login' ? (
          <>
            <Field label="Почта" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          </>
        ) : null}
        <Button label={mode === 'guest' ? 'Продолжить' : 'Войти или создать'} onPress={() => void submit()} loading={loading} disabled={name.trim().length < 1 && mode === 'guest'} />
        <Button label={mode === 'guest' ? 'У меня есть почта' : 'Продолжить без почты'} tone="ghost" onPress={() => setMode(mode === 'guest' ? 'login' : 'guest')} />
      </View>
    </Screen>
  );
}
