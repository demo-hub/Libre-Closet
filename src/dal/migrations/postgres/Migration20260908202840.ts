import { Migration } from '@mikro-orm/migrations';

export class Migration20260908202840 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "garment" add column "source_url" text null;`);
    this.addSql(`alter table "garment" alter column "notes" type text using ("notes"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "garment" drop column "source_url";`);

    this.addSql(`alter table "garment" alter column "notes" type varchar(255) using ("notes"::varchar(255));`);
  }

}
