import type { MigrationInterface, QueryRunner } from "typeorm";

// Hand-authored to match the entities in src/modules/**/entities exactly (see
// docs/architecture/system-design.md — migrations are the only source of schema truth).
// Generated with `npm run migration:generate -w apps/api` against a live Postgres
// instance whenever the entities change; review the diff before committing.
export class InitSchema1700000000000 implements MigrationInterface {
  name = "InitSchema1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "display_name" varchar(120) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "otp_challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "request_ip" varchar(45) NOT NULL,
        "code_hash" varchar(200) NOT NULL,
        "attempts" int NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_otp_challenges" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_otp_challenges_email" ON "otp_challenges" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "csrf_secret" varchar(100) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE "sales_networks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sales_networks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "network_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "is_owner" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "uq_memberships_network_user" UNIQUE ("network_id", "user_id"),
        CONSTRAINT "fk_memberships_network" FOREIGN KEY ("network_id") REFERENCES "sales_networks"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_memberships_network_id" ON "memberships" ("network_id")`);
    await queryRunner.query(`CREATE INDEX "idx_memberships_user_id" ON "memberships" ("user_id")`);

    await queryRunner.query(`
      CREATE TABLE "membership_capabilities" (
        "membership_id" uuid NOT NULL,
        "capability" varchar(40) NOT NULL,
        CONSTRAINT "pk_membership_capabilities" PRIMARY KEY ("membership_id", "capability"),
        CONSTRAINT "fk_membership_capabilities_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_membership_capabilities_membership_id" ON "membership_capabilities" ("membership_id")`
    );

    await queryRunner.query(`
      CREATE TABLE "invites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "network_id" uuid NOT NULL,
        "code" varchar(64) NOT NULL,
        "created_by_membership_id" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "used_by_user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invites" PRIMARY KEY ("id"),
        CONSTRAINT "uq_invites_code" UNIQUE ("code"),
        CONSTRAINT "fk_invites_network" FOREIGN KEY ("network_id") REFERENCES "sales_networks"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_invites_created_by" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_invites_network_id" ON "invites" ("network_id")`);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "network_id" uuid NOT NULL,
        "name" varchar(160) NOT NULL,
        "brand" varchar(80),
        "sku" varchar(60),
        "barcode" varchar(40),
        "category" varchar(60),
        "image_url" varchar(500),
        "is_active" boolean NOT NULL DEFAULT true,
        "on_hand_quantity" int NOT NULL DEFAULT 0,
        "reserved_quantity" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_products" PRIMARY KEY ("id"),
        CONSTRAINT "fk_products_network" FOREIGN KEY ("network_id") REFERENCES "sales_networks"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_products_on_hand_non_negative" CHECK ("on_hand_quantity" >= 0),
        CONSTRAINT "chk_products_reserved_non_negative" CHECK ("reserved_quantity" >= 0),
        CONSTRAINT "chk_products_reserved_lte_on_hand" CHECK ("reserved_quantity" <= "on_hand_quantity")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_products_network_id" ON "products" ("network_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "invites"`);
    await queryRunner.query(`DROP TABLE "membership_capabilities"`);
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TABLE "sales_networks"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "otp_challenges"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
