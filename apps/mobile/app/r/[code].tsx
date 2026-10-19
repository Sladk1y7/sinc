import { Redirect, useLocalSearchParams } from 'expo-router';

export default function UniversalLink() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? '';
  return <Redirect href={`/room/${code}`} />;
}
