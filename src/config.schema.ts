import { Logger } from '@nestjs/common';
import Joi from 'joi';
import * as path from 'path';
import { resolveInstanceSecrets } from './instance-secrets';

/** The environment the app accepts, with its defaults. */
export const configSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('production'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('Boilerplate'),
  AUTH_ENABLED: Joi.boolean().default(false),
  DISABLE_REGISTRATION: Joi.boolean().default(false),
  PWA_ENABLED: Joi.boolean().default(false),
  IMPORT_URL_ENABLED: Joi.boolean().default(true),
  IMPORT_URL_RATE_LIMIT: Joi.number().integer().min(1).default(10),
  AI_PROVIDER: Joi.string()
    .valid('none', 'anthropic', 'openai', 'ollama')
    .default('none'),
  AI_API_KEY: Joi.string().allow('').default(''),
  // Required for a local server: which vision model is installed cannot
  // be guessed, and a wrong one fails at the first press rather than at
  // boot, which reads like a bug in the app.
  AI_MODEL: Joi.string()
    .allow('')
    .default('')
    .when('AI_PROVIDER', {
      is: Joi.valid('openai', 'ollama'),
      then: Joi.string().min(1).required(),
    }),
  AI_BASE_URL: Joi.string().allow('').default(''),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  // Development and testing: also lifts loopback and the port allowlist.
  IMPORT_ALLOW_PRIVATE_NETWORKS: Joi.boolean().default(false),
  IMPORT_FETCH_TIMEOUT_MS: Joi.number().default(10000),
  // Unset (or '') means this instance's own, resolved below once
  // DATA_PATH is known.
  ACCESS_TOKEN_SECRET: Joi.string().allow('').optional(),
  PUBLIC_VAPID_KEY: Joi.string().allow('').optional(),
  PRIVATE_VAPID_KEY: Joi.string().allow('').optional(),
  // Unset (or '') means the address each request came in on, port included.
  SITE_URL: Joi.string()
    .trim()
    .uri({ scheme: ['https', 'http'] })
    .replace(/\/+$/, '')
    .allow('')
    .optional(),
  ICON_NAME: Joi.string().default('icons/icon-512.png'),
  SOURCE_URL: Joi.string()
    .uri({ scheme: ['https', 'http'] })
    .default('https://github.com/demo-hub/Libre-Closet'),
  IMAGE_NAME: Joi.string().default('ghcr.io/demo-hub/libre-closet'),
  // allow(''): a compose file passes an unset variable through as an empty string.
  // trim(): a value of spaces would show an empty "Run by".
  OPERATOR_NAME: Joi.string().trim().allow('').default(''),
  OPERATOR_CONTACT: Joi.string().trim().allow('').default(''),
  THROTTLE_LIMIT: Joi.number().default(600),
  DATA_PATH: Joi.string().default(path.join(process.cwd(), 'data')),
  DATABASE_TYPE: Joi.string().valid('sqlite', 'postgres').default('sqlite'),
  DATABASE_SCHEMA: Joi.string()
    .when('DATABASE_TYPE', {
      is: 'sqlite',
      then: Joi.string().default((parent) =>
        path.join(parent.DATA_PATH, 'sqlite3.db'),
      ),
    })
    .when('DATABASE_TYPE', {
      is: 'postgres',
      then: Joi.string().required(),
    }),
  DATABASE_HOST: Joi.string().when('DATABASE_TYPE', {
    is: 'postgres',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  DATABASE_PORT: Joi.number().when('DATABASE_TYPE', {
    is: 'postgres',
    then: Joi.number().required(),
    otherwise: Joi.optional(),
  }),
  DATABASE_USER: Joi.string().when('DATABASE_TYPE', {
    is: 'postgres',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  DATABASE_PASS: Joi.string().when('DATABASE_TYPE', {
    is: 'postgres',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  DATABASE_SSL: Joi.boolean().when('DATABASE_TYPE', {
    is: 'postgres',
    then: Joi.boolean().default(false),
    otherwise: Joi.optional(),
  }),
  FILE_STORAGE_TYPE: Joi.string().valid('local', 'object').default('local'),
  OBJECT_STORAGE_BUCKET_NAME: Joi.string().when('FILE_STORAGE_TYPE', {
    is: 'object',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  OBJECT_STORAGE_ACCESS_KEY_ID: Joi.string().when('FILE_STORAGE_TYPE', {
    is: 'object',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: Joi.string().when('FILE_STORAGE_TYPE', {
    is: 'object',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  OBJECT_STORAGE_ENDPOINT: Joi.string().when('FILE_STORAGE_TYPE', {
    is: 'object',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  OBJECT_STORAGE_REGION: Joi.string().when('FILE_STORAGE_TYPE', {
    is: 'object',
    then: Joi.string().default('us-east-1'),
    otherwise: Joi.optional(),
  }),
}).custom(
  // After every key's default, so DATA_PATH is resolved.
  (config: Parameters<typeof resolveInstanceSecrets>[0]) => ({
    ...config,
    ...resolveInstanceSecrets(config, new Logger('InstanceSecrets')),
  }),
);
