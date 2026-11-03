import { Migration } from '@mikro-orm/migrations';

export class Migration20261103180000 extends Migration {

  override async up(): Promise<void> {
    // Deleting a reset code deleted its user; now it only unlinks it.
    this.addSql(`alter table "user" drop constraint "user_password_reset_id_foreign";`);
    this.addSql(`alter table "user" add constraint "user_password_reset_id_foreign" foreign key ("password_reset_id") references "password_reset" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop constraint "user_password_reset_id_foreign";`);
    this.addSql(`alter table "user" add constraint "user_password_reset_id_foreign" foreign key ("password_reset_id") references "password_reset" ("id") on update cascade on delete cascade;`);
  }

}
