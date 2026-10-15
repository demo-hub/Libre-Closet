// The app on :3300 with accounts and the PWA on, for the specs the main
// suite's server (accounts and PWA off) cannot reach. A throwaway database at
// a fixed path, so a spec can check what was stored (test/push.spec.ts names
// the same port and path).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACCOUNTS_PORT = 3300;
const ACCOUNTS_DATA_PATH = join(tmpdir(), 'lc-e2e-accounts');

// The main server's command builds dist/ first, and the build empties it, so
// start only once that server answers.
async function waitForBuild() {
  for (;;) {
    try {
      await fetch('http://localhost:3000/');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

await waitForBuild();
rmSync(ACCOUNTS_DATA_PATH, { recursive: true, force: true });
mkdirSync(ACCOUNTS_DATA_PATH, { recursive: true });
const server = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATA_PATH: ACCOUNTS_DATA_PATH,
    DATABASE_TYPE: 'sqlite',
    DATABASE_SCHEMA: join(ACCOUNTS_DATA_PATH, 'sqlite3.db'),
    FILE_STORAGE_TYPE: 'local',
    PORT: String(ACCOUNTS_PORT),
    AUTH_ENABLED: 'true',
    PWA_ENABLED: 'true',
    AI_PROVIDER: 'none',
  },
});
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code, signal) => {
  rmSync(ACCOUNTS_DATA_PATH, { recursive: true, force: true });
  process.exit(code ?? (signal === 'SIGTERM' ? 0 : 1));
});
