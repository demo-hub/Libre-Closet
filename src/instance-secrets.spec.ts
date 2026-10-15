import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  INSTANCE_SECRETS_FILE,
  resolveInstanceSecrets,
} from './instance-secrets';

const PUBLISHED_PUBLIC =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const PUBLISHED_PRIVATE = 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls';

describe('resolveInstanceSecrets', () => {
  let dataPath: string;
  let logger: { log: jest.Mock; warn: jest.Mock };
  const file = () => join(dataPath, INSTANCE_SECRETS_FILE);
  const resolve = (env: Record<string, string | undefined> = {}) =>
    resolveInstanceSecrets({ DATA_PATH: dataPath, ...env }, logger);
  const logged = () =>
    [...logger.log.mock.calls, ...logger.warn.mock.calls].flat().join('\n');

  beforeEach(() => {
    dataPath = join(mkdtempSync(join(tmpdir(), 'lc-secrets-')), 'data');
    logger = { log: jest.fn(), warn: jest.fn() };
  });

  afterEach(() => {
    rmSync(join(dataPath, '..'), { recursive: true, force: true });
  });

  it('generates its own on first boot, keeps them only for this instance, and reloads them', () => {
    const first = resolve();
    expect(first.ACCESS_TOKEN_SECRET.length).toBeGreaterThanOrEqual(64);
    expect(first.PUBLIC_VAPID_KEY).not.toBe(PUBLISHED_PUBLIC);
    expect(statSync(file()).mode & 0o777).toBe(0o600);

    const again = resolve();
    expect(again).toEqual(first);
    expect(logger.log).toHaveBeenLastCalledWith(
      expect.stringContaining('loaded'),
    );
  });

  it('never logs a value', () => {
    const secrets = resolve({ ACCESS_TOKEN_SECRET: 'ChangeMe!' });
    for (const value of Object.values(secrets)) {
      expect(logged()).not.toContain(value);
    }
  });

  it('uses what the environment sets, without touching the file', () => {
    const env = {
      ACCESS_TOKEN_SECRET: 'from-the-environment',
      PUBLIC_VAPID_KEY: 'public-from-env',
      PRIVATE_VAPID_KEY: 'private-from-env',
    };
    expect(resolve(env)).toEqual(env);
    expect(() => statSync(file())).toThrow();
  });

  const replacedSecrets: [string, Record<string, string>][] = [
    ['an empty secret', { ACCESS_TOKEN_SECRET: '' }],
    ['the old default secret', { ACCESS_TOKEN_SECRET: 'ChangeMe!' }],
  ];
  for (const [name, env] of replacedSecrets) {
    it(`replaces ${name}`, () => {
      const own = resolve().ACCESS_TOKEN_SECRET;
      expect(own).not.toBe(env.ACCESS_TOKEN_SECRET);
      expect(resolve(env).ACCESS_TOKEN_SECRET).toBe(own);
    });
  }

  const replacedPairs: [string, Record<string, string>][] = [
    [
      'the published pair',
      {
        PUBLIC_VAPID_KEY: PUBLISHED_PUBLIC,
        PRIVATE_VAPID_KEY: PUBLISHED_PRIVATE,
      },
    ],
    [
      'a pair with one published key',
      { PUBLIC_VAPID_KEY: 'mine', PRIVATE_VAPID_KEY: PUBLISHED_PRIVATE },
    ],
    ['a lone public key', { PUBLIC_VAPID_KEY: 'mine' }],
    ['empty keys', { PUBLIC_VAPID_KEY: '', PRIVATE_VAPID_KEY: '' }],
  ];
  for (const [name, env] of replacedPairs) {
    it(`replaces ${name} with its own pair, both keys together`, () => {
      const own = resolve();
      const secrets = resolve(env);
      expect(secrets.PUBLIC_VAPID_KEY).toBe(own.PUBLIC_VAPID_KEY);
      expect(secrets.PRIVATE_VAPID_KEY).toBe(own.PRIVATE_VAPID_KEY);
    });
  }

  it('warns about a published default', () => {
    resolve({
      ACCESS_TOKEN_SECRET: 'ChangeMe!',
      PUBLIC_VAPID_KEY: PUBLISHED_PUBLIC,
      PRIVATE_VAPID_KEY: PUBLISHED_PRIVATE,
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('refuses a damaged file rather than replace it', () => {
    resolve();
    writeFileSync(file(), '{"accessTokenSecret": ""}');
    expect(() => resolve()).toThrow(/not a valid instance secrets file/);
    expect(readFileSync(file(), 'utf8')).toBe('{"accessTokenSecret": ""}');
  });

  // Root ignores directory permissions, so this cannot be shown as root.
  const asRoot = process.getuid?.() === 0;
  (asRoot ? it.skip : it)(
    'keeps going with secrets for this run only when DATA_PATH cannot be written',
    () => {
      const readOnly = join(dataPath, '..');
      chmodSync(readOnly, 0o500);
      try {
        const secrets = resolve();
        expect(secrets.ACCESS_TOKEN_SECRET).toBeTruthy();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Every restart will sign everyone out'),
        );
        expect(resolve().ACCESS_TOKEN_SECRET).not.toBe(
          secrets.ACCESS_TOKEN_SECRET,
        );
      } finally {
        chmodSync(readOnly, 0o700);
      }
    },
  );
});
