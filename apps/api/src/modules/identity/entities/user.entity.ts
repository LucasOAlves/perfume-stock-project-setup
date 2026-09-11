import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: "users" })
@Unique("uq_users_email", ["email"])
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Personal data — never log in full (see security model). Stored lowercase/trimmed —
  // see IdentityService.normalizeEmail — so "Ana@X.com" and "ana@x.com" are one account.
  @Column({ type: "varchar", length: 254 })
  email!: string;

  @Column({ type: "varchar", length: 120, name: "display_name" })
  displayName!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
