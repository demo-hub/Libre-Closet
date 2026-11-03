/**
 * How SQLite migrations run, shared by the app and the MikroORM CLI.
 *
 * Each migration gets its own transaction, not one for the whole batch
 * (MikroORM's default `allOrNothing`). Inside a transaction SQLite ignores
 * `pragma foreign_keys`, so a migration that rebuilds a table other tables
 * reference with `on delete cascade` would empty them. Such a migration
 * returns false from `isTransactional()` and runs outside one, which only
 * works when no batch transaction is open around it.
 */
export const sqliteMigrationRun = {
  transactional: true,
  allOrNothing: false,
};
