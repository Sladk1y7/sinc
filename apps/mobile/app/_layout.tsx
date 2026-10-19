import '@/global.css';
import { queryClient } from '@/api/query';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/features/session/store';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
  document.documentElement.style.backgroundColor = '#0B0B12';
}

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hydrate = useSession((state) => state.hydrate);
  const hydrated = useSession((state) => state.hydrated);

  useEffect(() => {
    void hydrate().finally(() => SplashScreen.hideAsync());
  }, [hydrate]);

  if (!hydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }} />
    </QueryClientProvider>
  );
}
