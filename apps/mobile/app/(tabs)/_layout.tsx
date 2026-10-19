import { colors } from '@/design-system/tokens';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

function TabMark({ color, focused }: { color: string; focused: boolean }) {
  return <View style={{ width: focused ? 16 : 8, height: 4, borderRadius: 4, backgroundColor: color, marginBottom: 4 }} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.card, height: 64, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => <TabMark color={typeof color === 'string' ? color : colors.accent} focused={focused} />,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist' }} />
      <Tabs.Screen name="circle" options={{ title: 'Circle' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
    </Tabs>
  );
}
