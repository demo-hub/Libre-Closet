import { randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import webpush from 'web-push';

/** Kept in DATA_PATH, so it lives on the same volume as the database. */
export const INSTANCE_SECRETS_FILE = 'instance-secrets.json';

/**
 * Values that once shipped as defaults, in the code or in the image's .env,
 * so anyone can sign a session or a push with them. Treated as unset.
 */
const PUBLISHED_ACCESS_TOKEN_SECRETS = ['ChangeMe!'];
const PUBLISHED_VAPID_PUBLIC_KEYS = [
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
];
const PUBLISHED_VAPID_PRIVATE_KEYS = [
  'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
];

interface StoredSecrets {
  accessTokenSecret: string;
  publicVapidKey: string;
  privateVapidKey: string;
}

export interface InstanceSecrets {
  ACCESS_TOKEN_SECRET: string;
  PUBLIC_VAPID_KEY: string;
  PRIVATE_VAPID_KEY: string;
}

export interface SecretsLogger {
  log(message: string): void;
  warn(message: string): void;
}

const isStored = (value: unknown): value is StoredSecrets =>
  typeof value === 'object' &&
  value !== null &&
  ['accessTokenSecret', 'publicVapidKey', 'privateVapidKey'].every(
    (key) =>
      typeof (value as Record<string, unknown>)[key] === 'string' &&
      (value as Record<string, string>)[key].length > 0,
  );

function readStored(file: string): StoredSecrets {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isStored(parsed)) {
    // Never replaced: a new secret would sign everyone out and end every push
    // subscription, and the operator may want what is in it.
    throw new Error(
      `${file} is not a valid instance secrets file. Fix or remove it.`,
    );
  }
  return parsed;
}

function generate(): StoredSecrets {
  const vapid = webpush.generateVAPIDKeys();
  return {
    accessTokenSecret: randomBytes(48).toString('base64url'),
    publicVapidKey: vapid.publicKey,
    privateVapidKey: vapid.privateKey,
  };
}

function loadOrCreate(dataPath: string, logger: SecretsLogger): StoredSecrets {
  const file = join(dataPath, INSTANCE_SECRETS_FILE);
  try {
    const stored = readStored(file);
    logger.log(`Instance secrets loaded from ${file}`);
    return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const created = generate();
  try {
    mkdirSync(dataPath, { recursive: true });
    // wx: never overwrite one written by another instance in the meantime.
    writeFileSync(file, JSON.stringify(created, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    logger.log(`Instance secrets generated and saved to ${file}`);
    return created;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return readStored(file);
    }
    logger.warn(
      `Instance secrets could not be saved to ${file} (${(error as Error).message}). ` +
        'Every restart will sign everyone out and end push subscriptions. ' +
        'Set ACCESS_TOKEN_SECRET, PUBLIC_VAPID_KEY and PRIVATE_VAPID_KEY, or make DATA_PATH writable.',
    );
    return created;
  }
}

/** The environment's secret, or undefined when it is unset or published. */
function ownAccessTokenSecret(
  secret: string | undefined,
  logger: SecretsLogger,
): string | undefined {
  if (secret && PUBLISHED_ACCESS_TOKEN_SECRETS.includes(secret)) {
    logger.warn(
      "ACCESS_TOKEN_SECRET is a published default and is ignored; this instance's own is used instead.",
    );
    return undefined;
  }
  return secret || undefined;
}

/**
 * The environment's VAPID pair, or undefined. A pair or nothing: one key from
 * the environment and one from the file would fail at the first push.
 */
function ownVapidPair(
  {
    PUBLIC_VAPID_KEY: publicKey,
    PRIVATE_VAPID_KEY: privateKey,
  }: { PUBLIC_VAPID_KEY?: string; PRIVATE_VAPID_KEY?: string },
  logger: SecretsLogger,
): { publicKey: string; privateKey: string } | undefined {
  const published =
    (!!publicKey && PUBLISHED_VAPID_PUBLIC_KEYS.includes(publicKey)) ||
    (!!privateKey && PUBLISHED_VAPID_PRIVATE_KEYS.includes(privateKey));
  if (published) {
    logger.warn(
      "The VAPID keys are the published defaults and are ignored; this instance's own are used instead.",
    );
    return undefined;
  }
  if (publicKey && privateKey) return { publicKey, privateKey };
  if (publicKey || privateKey) {
    logger.warn(
      "Only one of PUBLIC_VAPID_KEY and PRIVATE_VAPID_KEY is set, so both are ignored; this instance's own pair is used instead.",
    );
  }
  return undefined;
}

/**
 * The session-signing secret and the web push key pair. A value set in the
 * environment wins; otherwise each comes from DATA_PATH/instance-secrets.json,
 * which the first boot creates. The file is read only when a value is needed.
 * Values are never logged, only where they came from.
 */
export function resolveInstanceSecrets(
  config: {
    DATA_PATH: string;
    ACCESS_TOKEN_SECRET?: string;
    PUBLIC_VAPID_KEY?: string;
    PRIVATE_VAPID_KEY?: string;
  },
  logger: SecretsLogger,
): InstanceSecrets {
  let stored: StoredSecrets | undefined;
  const fromFile = () => (stored ??= loadOrCreate(config.DATA_PATH, logger));

  const accessTokenSecret =
    ownAccessTokenSecret(config.ACCESS_TOKEN_SECRET, logger) ??
    fromFile().accessTokenSecret;
  const vapid = ownVapidPair(config, logger) ?? {
    publicKey: fromFile().publicVapidKey,
    privateKey: fromFile().privateVapidKey,
  };

  return {
    ACCESS_TOKEN_SECRET: accessTokenSecret,
    PUBLIC_VAPID_KEY: vapid.publicKey,
    PRIVATE_VAPID_KEY: vapid.privateKey,
  };
}
