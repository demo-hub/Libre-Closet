import { Migration } from '@mikro-orm/migrations';

export class Migration20261015150000 extends Migration {

  override async up(): Promise<void> {
    // Outstanding codes never expired, so none of them can be trusted. Unlink
    // them first: user.password_reset_id is "on delete cascade", so deleting
    // a linked row would delete its user too.
    this.addSql(`update \`user\` set \`password_reset_id\` = null;`);
    this.addSql(`delete from \`password_reset\`;`);
    this.addSql(`alter table \`password_reset\` add column \`created_at\` datetime null;`);
  }

}
