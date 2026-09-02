import type { MigrationInterface, QueryRunner } from "typeorm";

// Slice 3 — reservations with concurrency correctness. See docs/plans/mvp.md,
// docs/product/domain-model.md (Reservation State Machine), and
// docs/decisions/ADR-002-reservation-concurrency.md (why the app layer takes
// SELECT ... FOR UPDATE on the product row rather than relying on this table's
// constraints alone).
export class AddReservations1700000002000 implements MigrationInterface {
  name = "AddReservations1700000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "network_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "created_by_membership_id" uuid NOT NULL,
        "quantity" int NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "expires_at" timestamptz NOT NULL,
        "idempotency_key" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_reservations_network" FOREIGN KEY ("network_id") REFERENCES "sales_networks"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_reservations_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_reservations_membership" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_reservations_quantity_positive" CHECK ("quantity" > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_reservations_network_id" ON "reservations" ("network_id")`);
    await queryRunner.query(`CREATE INDEX "idx_reservations_product_id" ON "reservations" ("product_id")`);
    // Partial unique index: only enforced when an idempotency key was actually supplied,
    // and scoped per-membership so two different sellers can reuse the same client-side key.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_reservations_idempotency"
      ON "reservations" ("created_by_membership_id", "idempotency_key")
      WHERE "idempotency_key" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_movements"
      ADD CONSTRAINT "fk_stock_movements_reservation"
      FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "stock_movements" DROP CONSTRAINT "fk_stock_movements_reservation"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
  }
}
