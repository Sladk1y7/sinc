import { useLocalSearchParams } from 'expo-router';
import { RoomScreen } from '@/features/rooms/room-screen';
import { RoomSession } from '@/features/rooms/session';

export default function RoomRoute() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? '';
  return (
    <RoomSession code={code}>
      <RoomScreen />
    </RoomSession>
  );
}
