import { Migration } from '@mikro-orm/migrations';
import { normalizeGarmentColors130 } from '../../migration-support/garment-colors-1.3.0';

export class Migration20261103120000 extends Migration {

  // Data only: brings colours saved before 1.3.0 into the form every write now
  // takes (normalizeColorInput, frozen here as it was in 1.3.0), so the colour
  // filter can match whole items.
  // An in-place update; the garment table is not rebuilt.
  override async up(): Promise<void> {
    const knex = this.getKnex();
    const rows = (await this.execute(
      knex.select('id', 'color').from('garment').whereNotNull('color'),
    )) as { id: number; color: string }[];
    for (const { id, color } of rows) {
      const clean = normalizeGarmentColors130(color);
      if (clean !== color) {
        this.addSql(knex('garment').update({ color: clean }).where({ id }));
      }
    }
  }

}
