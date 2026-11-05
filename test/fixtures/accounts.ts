import { tmpdir } from 'os';
import { join } from 'path';

// Where scripts/e2e/accounts-server.mjs runs the app.
export const ACCOUNTS_PORT = 3300;
export const ACCOUNTS_URL = `http://localhost:${ACCOUNTS_PORT}`;
export const ACCOUNTS_DATA_PATH = join(tmpdir(), 'lc-e2e-accounts');

/**
 * `test.use` for a spec that needs accounts on. That server has the PWA on too,
 * and a service worker's requests never reach `page.route`.
 */
export const onAccountsServer = {
  baseURL: ACCOUNTS_URL,
  serviceWorkers: 'block',
} as const;
