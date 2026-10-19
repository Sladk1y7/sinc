import Redis from 'ioredis';

export function connectRedis(url: string): Redis | null {
  if (!url) return null;
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
  redis.on('error', (error) => {
    console.warn('[redis]', error.message);
  });
  return redis;
}
