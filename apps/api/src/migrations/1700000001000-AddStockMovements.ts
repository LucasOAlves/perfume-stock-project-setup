import type { MigrationInterface, QueryRunner } from "typeorm";

// Slice 2 — owner stock mutation + movement history. See docs/plans/mvp.md and
// docs/product/domain-model.md (StockMovement). Append-only: no update/delete route
// exists at the API layer, and this migration adds no such capability at the DB layer either.
export class AddStockMovements1700000001000 implements MigrationInterface {
  name = "AddStockMovements1700000001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_movements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "network_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "type" varchar(30) NOT NULL,
        "quantity_delta" int NOT NULL,
        "reason" text NOT NULL,
        "created_by_membership_id" uuid NOT NULL,
        "reservation_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_stock_movements" PRIMARY KEY ("id"),
        CONSTRAINT "fk_stock_movements_network" FOREIGN KEY ("network_id") REFERENCES "sales_networks"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_stock_movements_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_stock_movements_membership" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_stock_movements_delta_not_zero" CHECK ("quantity_delta" <> 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_stock_movements_network_id" ON "stock_movements" ("network_id")`);
    await queryRunner.query(`CREATE INDEX "idx_stock_movements_product_id" ON "stock_movements" ("product_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stock_movements"`);
  }
}
