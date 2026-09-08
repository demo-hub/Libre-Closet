import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToOne,
  PrimaryKey,
  Property,
  type Ref,
} from '@mikro-orm/core';
import { File } from './file.entity';
import { Outfit } from './outfit.entity';
import { ShareableId } from './shareableId.entity';
import { User } from './user.entity';

@Entity()
export class Garment extends ShareableId {
  @PrimaryKey()
  public id!: number;

  @Property({ nullable: true })
  public name?: string;

  @Property()
  public category!: string;

  // Comma-joined color names.
  @Property({ nullable: true, columnType: 'text' })
  public color?: string;

  @Property({ nullable: true })
  public brand?: string;

  @Property({ nullable: true })
  public size?: string;

  @Property({ type: Date, nullable: true })
  public dateAquired?: Date;

  // text, not varchar: imported descriptions overflow 255 characters.
  @Property({ nullable: true, columnType: 'text' })
  public notes?: string;

  @Property({ default: false })
  public archived = false;
  @Property({ nullable: true, columnType: 'text' })
  public washingDetails?: string;

  // text, not varchar: product URLs routinely exceed 255 characters.
  @Property({ nullable: true, columnType: 'text' })
  public sourceUrl?: string;

  @OneToOne({
    entity: () => File,
    nullable: true,
  })
  public photo?: Ref<File>;

  @ManyToOne({
    entity: () => User,
    deleteRule: 'cascade',
    ref: true,
    nullable: true,
  })
  public owner?: Ref<User>;

  @ManyToMany(() => Outfit, (outfit) => outfit.garments)
  public outfits = new Collection<Outfit>(this);
}
