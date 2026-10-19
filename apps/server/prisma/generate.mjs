import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://sinc:sinc@localhost:5432/sinc';
}

const result = spawnSync('npx prisma generate', {
  cwd: serverRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
