// The app on :3100 with a throwaway database, so visual tests never see a real wardrobe.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataPath = mkdtempSync(join(tmpdir(), 'lc-visual-'));
const server = spawn(process.execPath, ['dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATA_PATH: dataPath,
    PORT: '3100',
    APP_NAME: 'Libre Closet',
    AUTH_ENABLED: 'false',
    PWA_ENABLED: 'false',
    AI_PROVIDER: 'none',
    TZ: 'UTC',
  },
});
const stop = () => server.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
server.on('exit', (code) => {
  rmSync(dataPath, { recursive: true, force: true });
  process.exit(code ?? 0);
});
