// The suite's main server on :3400, accounts and the PWA off, with a throwaway
// database, so a local run never touches an app on :3000 or what .env names.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAIN_PORT = 3400;
const dataPath = mkdtempSync(join(tmpdir(), 'lc-e2e-main-'));
// CI's "remote" smoke run tests the app against its own Postgres and object store.
const remote = process.env.CI && process.env.DATABASE_TYPE === 'postgres';
const server = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(remote
      ? {}
      : {
          DATABASE_TYPE: 'sqlite',
          DATABASE_SCHEMA: join(dataPath, 'sqlite3.db'),
          FILE_STORAGE_TYPE: 'local',
        }),
    DATA_PATH: dataPath,
    PORT: String(MAIN_PORT),
    AUTH_ENABLED: 'false',
    PWA_ENABLED: 'false',
  },
});
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code, signal) => {
  rmSync(dataPath, { recursive: true, force: true });
  process.exit(code ?? (signal === 'SIGTERM' ? 0 : 1));
});
