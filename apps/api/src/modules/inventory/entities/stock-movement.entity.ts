import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// SALE_FROM_RESERVATION is the only type that also closes a reservation atomically —
// see docs/product/domain-model.md and docs/plans/mvp.md (Slice 3). It is never created
// directly via the generic movements endpoint — only via InventoryService.fulfillReservation.
export const STOCK_MOVEMENT_TYPES = [
  "RESTOCK",
  "ADJUSTMENT_LOSS",
  "ADJUSTMENT_CORRECTION",
  "RETURN",
  "SALE_FROM_RESERVATION"
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

// The generic "record a movement" endpoint only accepts these — SALE_FROM_RESERVATION
// is excluded because it must be created atomically with a reservation state change,
// never on its own (see inventory.routes.ts / reservations.service.ts).
export const MANUALLY_RECORDABLE_MOVEMENT_TYPES = ["RESTOCK", "ADJUSTMENT_LOSS", "ADJUSTMENT_CORRECTION", "RETURN"] as const;

// Portuguese labels for error messages shown to real users (inventory.service.ts).
// Keep in sync with apps/web/src/app/features/inventory/stock-movements-panel.component.ts movementLabel().
export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  RESTOCK: "Reposição",
  ADJUSTMENT_LOSS: "Perda / avaria",
  ADJUSTMENT_CORRECTION: "Correção",
  RETURN: "Devolução",
  SALE_FROM_RESERVATION: "Venda (reserva confirmada)"
};

// Append-only ledger — no update/delete route exists at the API layer (docs/architecture/system-design.md).
// quantity_delta is signed: positive for RESTOCK/RETURN, negative for ADJUSTMENT_LOSS,
// either sign for ADJUSTMENT_CORRECTION (see inventory.service.ts validation).
@Entity({ name: "stock_movements" })
@Check("chk_stock_movements_delta_not_zero", `"quantity_delta" <> 0`)
export class StockMovementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("idx_stock_movements_network_id")
  @Column({ type: "uuid", name: "network_id" })
  networkId!: string;

  @Index("idx_stock_movements_product_id")
  @Column({ type: "uuid", name: "product_id" })
  productId!: string;

  @Column({ type: "varchar", length: 30 })
  type!: StockMovementType;

  @Column({ type: "int", name: "quantity_delta" })
  quantityDelta!: number;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "uuid", name: "created_by_membership_id" })
  createdByMembershipId!: string;

  @Column({ type: "uuid", name: "reservation_id", nullable: true })
  reservationId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
