import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

// Product carries its own current stock directly — there is no separate "Stock Item"
// entity in this MVP (see docs/product/product-spec.md "Simplification").
// available_quantity = on_hand_quantity - reserved_quantity is always computed, never stored.
// reserved_quantity stays 0 until reservations ship in Slice 3; the column and constraints
// exist now so the invariant is enforced from day one instead of being retrofitted.
@Entity({ name: "products" })
@Check("chk_products_on_hand_non_negative", `"on_hand_quantity" >= 0`)
@Check("chk_products_reserved_non_negative", `"reserved_quantity" >= 0`)
@Check("chk_products_reserved_lte_on_hand", `"reserved_quantity" <= "on_hand_quantity"`)
export class ProductEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_products_network_id")
  @Column({ type: "uuid", name: "network_id" })
  networkId!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "varchar", length: 80, nullable: true })
  brand!: string | null;

  @Column({ type: "varchar", length: 60, nullable: true })
  sku!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  barcode!: string | null;

  @Column({ type: "varchar", length: 60, nullable: true })
  category!: string | null;

  @Column({ type: "varchar", length: 500, name: "image_url", nullable: true })
  imageUrl!: string | null;

  @Column({ type: "boolean", name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "int", name: "on_hand_quantity", default: 0 })
  onHandQuantity!: number;

  @Column({ type: "int", name: "reserved_quantity", default: 0 })
  reservedQuantity!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
