import { Migration } from '@mikro-orm/migrations';

export class Migration20260905233847 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "garment" alter column "color" type text using ("color"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "garment" alter column "color" type varchar(255) using ("color"::varchar(255));`);
  }

}
