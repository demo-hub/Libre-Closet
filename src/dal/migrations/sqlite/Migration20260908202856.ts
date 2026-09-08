import { Migration } from '@mikro-orm/migrations';

export class Migration20260908202856 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table \`garment\` add column \`source_url\` text null;`);
  }

}
