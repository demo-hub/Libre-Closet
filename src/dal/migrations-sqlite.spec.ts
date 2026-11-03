import { BetterSqliteDriver } from '@mikro-orm/better-sqlite';
import { MikroORM } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { File } from './entity/file.entity';
import { Garment } from './entity/garment.entity';
import { OutfitCalendar } from './entity/outfit-calendar.entity';
import { Outfit } from './entity/outfit.entity';
import { PasswordReset } from './entity/passwordReset.entity';
import { User } from './entity/user.entity';
import { UserDevice } from './entity/userDevice.entity';
import { WardrobeShare } from './entity/wardrobe-share.entity';
import { sqliteMigrationRun } from './sqlite-migration-run';

/** Every table that references `user`, and the join table under them. */
const TABLES = [
  'user',
  'user_device',
  'file',
  'garment',
  'outfit',
  'outfit_garments',
  'outfit_calendar',
  'wardrobe_share',
  'password_reset',
];

/**
 * Upgrades a SQLite database from 1.2.0, the way the app does on boot, and
 * checks that 1.4.0's rebuild of `user` keeps every row that references it.
 */
describe('SQLite migrations', () => {
  let dir: string;
  let orm: MikroORM;

  const rows = (sql: string) =>
    orm.em.getConnection().execute<Record<string, unknown>[]>(sql);
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        TABLES.map(async (t) => {
          const [{ n }] = await rows(`select count(*) as n from \`${t}\``);
          return [t, Number(n)];
        }),
      ),
    );

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'lc-migrations-'));
    orm = await MikroORM.init({
      driver: BetterSqliteDriver,
      dbName: path.join(dir, 'sqlite3.db'),
      entities: [
        File,
        Garment,
        Outfit,
        OutfitCalendar,
        PasswordReset,
        User,
        UserDevice,
        WardrobeShare,
      ],
      extensions: [Migrator],
      migrations: {
        path: path.join(__dirname, 'migrations/sqlite'),
        pattern: /^Migration\d+\.ts$/,
        snapshot: false,
        ...sqliteMigrationRun,
      },
      allowGlobalContext: true,
      debug: false,
      logger: () => undefined,
    });
  });

  afterEach(async () => {
    await orm.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps every row through the upgrade, and a deleted reset code keeps its user', async () => {
    // 1.2.0's last migration, so 1.3.0's and 1.4.0's are both pending.
    await orm.migrator.up({ to: 'Migration20261015150000' });

    for (const id of [1, 2, 3]) {
      await rows(
        `insert into user (id, shareable_id, email, password) values (${id}, 's${id}', 'u${id}@example.com', 'x')`,
      );
    }
    // A deleted user's id must stay retired: session tokens carry it.
    await rows('delete from user where id = 3');
    await rows(
      `insert into password_reset (id, pin, created_at) values (1, '123456', '2026-11-03')`,
    );
    await rows('update user set password_reset_id = 1 where id = 1');
    await rows(
      `insert into file (id, shareable_id, file_name, created_on, created_by_id) values (1, 'f1', 'a.webp', '2026-11-03', 1)`,
    );
    await rows(
      `insert into garment (id, shareable_id, category, color, photo_id, owner_id) values (1, 'g1', 'tops', 'Red, red', 1, 1)`,
    );
    await rows(
      `insert into outfit (id, shareable_id, name, owner_id) values (1, 'o1', 'Monday', 1)`,
    );
    await rows(
      'insert into outfit_garments (outfit_id, garment_id) values (1, 1)',
    );
    await rows(
      `insert into outfit_calendar (date, outfit_id, owner_id) values ('2026-11-03', 1, 1)`,
    );
    await rows(
      `insert into wardrobe_share (grantor_id, grantee_id, permission, created_at) values (1, 2, 'VIEW', '2026-11-03')`,
    );
    await rows(
      `insert into user_device (user_agent, push_endpoint, user_id) values ('ua', 'https://push.example/1', 1)`,
    );
    const before = await counts();
    const [{ foreign_keys: keysBefore }] = await rows('pragma foreign_keys');

    await orm.migrator.up();

    expect(await orm.migrator.getPendingMigrations()).toEqual([]);
    expect(await counts()).toEqual(before);
    expect(await rows('pragma foreign_key_check')).toEqual([]);
    expect(await rows('pragma foreign_keys')).toEqual([
      { foreign_keys: keysBefore },
    ]);
    expect(
      await rows(`select seq from sqlite_sequence where name = 'user'`),
    ).toEqual([{ seq: 3 }]);

    await rows('pragma foreign_keys = on');
    await rows('delete from password_reset');
    expect(
      await rows('select id, password_reset_id from user order by id'),
    ).toEqual([
      { id: 1, password_reset_id: null },
      { id: 2, password_reset_id: null },
    ]);
    expect((await counts()).garment).toBe(1);
  });

  it('leaves user and the pragma as they were when the rebuild fails', async () => {
    await orm.migrator.up({ to: 'Migration20261103120000' });
    await rows(
      `insert into user (id, shareable_id, email, password) values (1, 's1', 'u1@example.com', 'x')`,
    );
    await rows(
      `insert into garment (shareable_id, category, owner_id) values ('g1', 'tops', 1)`,
    );
    const [{ foreign_keys: keysBefore }] = await rows('pragma foreign_keys');
    // Makes the rebuild's first step fail, after the pragma is off and the transaction open.
    await rows('create table `user__temp_alter` (`id` integer)');

    await expect(orm.migrator.up()).rejects.toThrow(/user__temp_alter/);

    expect(await orm.migrator.getPendingMigrations()).toHaveLength(1);
    expect(await rows('pragma foreign_keys')).toEqual([
      { foreign_keys: keysBefore },
    ]);
    expect(await rows('select id from user')).toEqual([{ id: 1 }]);
    expect((await counts()).garment).toBe(1);
  });
});
