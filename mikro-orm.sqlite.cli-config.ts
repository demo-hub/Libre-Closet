import { BetterSqliteDriver } from '@mikro-orm/better-sqlite';
import { Options } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { sqliteMigrationRun } from './src/dal/sqlite-migration-run';

export default {
  name: 'sqlite',
  driver: BetterSqliteDriver,
  extensions: [Migrator],
  dbName: './data/sqlite3.db',
  entities: ['./src/dal/entity/**/*.*.*'],
  entitiesTs: ['./dist/dal/entity/**/*.*.*'],
  migrations: {
    path: './dist/dal/migrations/sqlite',
    pathTs: './src/dal/migrations/sqlite',
    ...sqliteMigrationRun,
  },
  debug: true,
} as Options;
