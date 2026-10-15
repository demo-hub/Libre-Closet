import { request } from '@playwright/test';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { seed } from './screenshots/seed';

/** Starts dist/ on a throwaway database, seeds it, then tells lhci (lighthouserc.js) it may begin. */

const port = process.env.LIGHTHOUSE_PORT ?? '3200';
const baseURL = `http://localhost:${port}`;
const dataPath = mkdtempSync(join(tmpdir(), 'lc-lighthouse-'));

let stderr = '';
let failed = false;
const server = spawn(process.execPath, ['dist/main.js'], {
  // Not stdout: Nest's own "successfully started" line would let lhci in before the seed.
  stdio: ['ignore', 'ignore', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    DATA_PATH: dataPath,
    DATABASE_TYPE: 'sqlite',
    DATABASE_SCHEMA: join(dataPath, 'sqlite3.db'),
    FILE_STORAGE_TYPE: 'local',
    AUTH_ENABLED: 'false',
    PWA_ENABLED: 'false',
    AI_PROVIDER: 'none',
    THROTTLE_LIMIT: '100000',
  },
});
server.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
server.on('exit', (code, signal) => {
  rmSync(dataPath, { recursive: true, force: true });
  const stopped = signal === 'SIGTERM' && !failed;
  if (!stopped) console.error(stderr);
  process.exit(stopped ? 0 : code || 1);
});
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

async function main() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(baseURL)).ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`${baseURL} did not answer`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const context = await request.newContext({ baseURL });
  await seed(context);
  await context.dispose();
  console.log(`Seeded wardrobe on ${baseURL}`);
}

main().catch((error: unknown) => {
  console.error(error);
  failed = true;
  stop();
});
