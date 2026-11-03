import { Migration } from '@mikro-orm/migrations';

type Row = Record<string, unknown>;

/**
 * Deleting a reset code deleted its user: user.password_reset_id was
 * "on delete cascade". SQLite cannot change a foreign key in place, so `user`
 * is rebuilt with "on delete set null".
 *
 * user_device, file, garment, outfit, outfit_calendar and wardrobe_share
 * reference `user` with "on delete cascade", so dropping it with foreign keys
 * on would empty them. SQLite ignores `pragma foreign_keys` inside a
 * transaction, so this migration runs outside the migrator's, turns the
 * pragma off, and opens its own (sqlite.org/lang_altertable.html, section 7).
 * That needs `allOrNothing: false` (src/dal/sqlite-migration-run.ts).
 */
export class Migration20261103180000 extends Migration {

  override isTransactional(): boolean {
    return false;
  }

  override async up(): Promise<void> {
    const [{ foreign_keys: wasOn }] = await this.rows('pragma foreign_keys');
    await this.execute('pragma foreign_keys = off');
    try {
      await this.execute('begin');
      try {
        await this.rebuildUser();
        await this.execute('commit');
      } catch (err) {
        // A failed commit may have ended the transaction already; the cause matters more.
        await this.execute('rollback').catch(() => undefined);
        throw err;
      }
    } finally {
      await this.execute(`pragma foreign_keys = ${wasOn ? 'on' : 'off'}`);
    }
  }

  private async rebuildUser(): Promise<void> {
    const users = await this.userCount();
    // Rows that already break a key are not this migration's to fail on.
    const violations = (await this.rows('pragma foreign_key_check')).length;
    // The rebuild would reset it to max(id), and a deleted user's id must not
    // be handed out again: session tokens carry it.
    const [sequence] = await this.rows(`select \`seq\` from \`sqlite_sequence\` where \`name\` = 'user'`);

    await this.execute(`create table \`user__temp_alter\` (\`id\` integer not null primary key autoincrement, \`shareable_id\` text not null, \`flagged\` integer null, \`banned\` integer null, \`first_name\` text null, \`last_name\` text null, \`email\` text null, \`password\` text not null, \`password_reset_id\` integer null, constraint \`user_password_reset_id_foreign\` foreign key(\`password_reset_id\`) references \`password_reset\`(\`id\`) on delete set null on update cascade);`);
    await this.execute(`insert into \`user__temp_alter\` (\`id\`, \`shareable_id\`, \`flagged\`, \`banned\`, \`first_name\`, \`last_name\`, \`email\`, \`password\`, \`password_reset_id\`) select \`id\`, \`shareable_id\`, \`flagged\`, \`banned\`, \`first_name\`, \`last_name\`, \`email\`, \`password\`, \`password_reset_id\` from \`user\`;`);
    await this.execute(`drop table \`user\`;`);
    await this.execute(`alter table \`user__temp_alter\` rename to \`user\`;`);
    await this.execute(`create unique index \`user_email_unique\` on \`user\` (\`email\`);`);
    await this.execute(`create unique index \`user_password_reset_id_unique\` on \`user\` (\`password_reset_id\`);`);
    if (sequence) {
      await this.execute(`delete from \`sqlite_sequence\` where \`name\` = 'user';`);
      await this.execute(`insert into \`sqlite_sequence\` (\`name\`, \`seq\`) values ('user', ${Number(sequence.seq)});`);
    }

    if ((await this.userCount()) !== users) {
      throw new Error('Rebuilding user changed its row count');
    }
    if ((await this.rows('pragma foreign_key_check')).length > violations) {
      throw new Error('Rebuilding user broke a foreign key');
    }
  }

  private async userCount(): Promise<number> {
    const [{ n }] = await this.rows('select count(*) as `n` from `user`');
    return Number(n);
  }

  private rows(sql: string): Promise<Row[]> {
    return this.execute(sql) as Promise<Row[]>;
  }

}
