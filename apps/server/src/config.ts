export interface Config {
  port: number;
  host: string;
  jwtSecret: string;
  databaseUrl: string;
  redisUrl: string;
  persistence: 'memory' | 'postgres';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwtSecret = env.JWT_SECRET?.trim() || 'dev-only-change-me-please';
  if (env.NODE_ENV === 'production' && jwtSecret.length < 24) {
    throw new Error('В проде нужен длинный JWT_SECRET');
  }
  const databaseUrl = env.DATABASE_URL?.trim() || '';
  return {
    port: Number(env.PORT || 4000),
    host: env.HOST?.trim() || '0.0.0.0',
    jwtSecret,
    databaseUrl,
    redisUrl: env.REDIS_URL?.trim() || '',
    persistence: databaseUrl ? 'postgres' : 'memory',
  };
}
