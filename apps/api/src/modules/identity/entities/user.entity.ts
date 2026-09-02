import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: "users" })
@Unique("uq_users_phone", ["phone"])
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // E.164 format, e.g. +5511999998888. Personal data — never log in full (see security model).
  @Column({ type: "varchar", length: 20 })
  phone!: string;

  @Column({ type: "varchar", length: 120, name: "display_name" })
  displayName!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
