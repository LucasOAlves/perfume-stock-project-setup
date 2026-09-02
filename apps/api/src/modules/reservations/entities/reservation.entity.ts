import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type ReservationStatus = "active" | "fulfilled" | "cancelled" | "expired";

// Portuguese labels for error messages shown to real users (inventory.service.ts,
// reservations.service.ts). Keep in sync with
// apps/web/src/app/features/inventory/my-reservations-page.component.ts statusLabel().
export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  active: "ativa",
  fulfilled: "confirmada (vendida)",
  cancelled: "cancelada",
  expired: "expirada"
};

// See docs/product/domain-model.md "Reservation State Machine": active -> {cancelled,
// expired, fulfilled}, all terminal. Reservations never touch on_hand_quantity directly
// — only a SALE_FROM_RESERVATION stock movement does that (not yet implemented; MVP
// cancel/expire paths only ever release the hold, never consume stock).
@Entity({ name: "reservations" })
@Check("chk_reservations_quantity_positive", `"quantity" > 0`)
@Index("uq_reservations_idempotency", ["createdByMembershipId", "idempotencyKey"], {
  unique: true,
  where: `"idempotency_key" IS NOT NULL`
})
export class ReservationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_reservations_network_id")
  @Column({ type: "uuid", name: "network_id" })
  networkId!: string;

  @Index("idx_reservations_product_id")
  @Column({ type: "uuid", name: "product_id" })
  productId!: string;

  @Column({ type: "uuid", name: "created_by_membership_id" })
  createdByMembershipId!: string;

  @Column({ type: "int" })
  quantity!: number;

  @Column({ type: "varchar", length: 20, default: "active" })
  status!: ReservationStatus;

  @Column({ type: "timestamptz", name: "expires_at" })
  expiresAt!: Date;

  // Required on create (client-generated) so a retried request under a flaky mobile
  // connection can't create a second reservation — see ADR-002 and security-model.md.
  @Column({ type: "varchar", length: 100, name: "idempotency_key", nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
