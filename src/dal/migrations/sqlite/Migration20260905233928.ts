import { Migration } from '@mikro-orm/migrations';

export class Migration20260905233928 extends Migration {

  override async up(): Promise<void> {
    // In-place swap: a table rebuild inside the migration transaction cascade-deletes outfit_garments (the foreign_keys pragma is a no-op in a transaction).
    this.addSql(`alter table \`garment\` add column \`color__tmp\` text null;`);
    this.addSql(`update \`garment\` set \`color__tmp\` = \`color\`;`);
    this.addSql(`alter table \`garment\` drop column \`color\`;`);
    this.addSql(`alter table \`garment\` rename column \`color__tmp\` to \`color\`;`);
  }

}
