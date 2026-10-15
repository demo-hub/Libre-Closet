import {
  Entity,
  OneToOne,
  PrimaryKey,
  Property,
  type Ref,
} from '@mikro-orm/core';
import { User } from './user.entity';

@Entity()
export class PasswordReset {
  @PrimaryKey()
  public id!: number;

  @Property()
  public pin!: string;

  // Nullable so SQLite can add the column in place; a code without one has
  // expired.
  @Property({ nullable: true })
  public createdAt?: Date = new Date();

  @OneToOne({
    entity: () => User,
    nullable: false,
    ref: true,
    mappedBy: 'passwordReset',
  })
  public user!: Ref<User>;
}
