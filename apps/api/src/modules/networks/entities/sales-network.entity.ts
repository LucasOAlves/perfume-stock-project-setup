import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "sales_networks" })
export class SalesNetworkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "uuid", name: "created_by_user_id" })
  createdByUserId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
