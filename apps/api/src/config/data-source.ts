import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSource } from "typeorm";
import { env } from "./env";
import { UserEntity } from "../modules/identity/entities/user.entity";
import { OtpChallengeEntity } from "../modules/identity/entities/otp-challenge.entity";
import { SessionEntity } from "../modules/identity/entities/session.entity";
import { SalesNetworkEntity } from "../modules/networks/entities/sales-network.entity";
import { MembershipEntity } from "../modules/networks/entities/membership.entity";
import { MembershipCapabilityEntity } from "../modules/networks/entities/membership-capability.entity";
import { InviteEntity } from "../modules/networks/entities/invite.entity";
import { ProductEntity } from "../modules/catalog/entities/product.entity";
import { StockMovementEntity } from "../modules/inventory/entities/stock-movement.entity";
import { ReservationEntity } from "../modules/reservations/entities/reservation.entity";

// RDS PostgreSQL 15+ rejects non-TLS connections by default. When DATABASE_SSL_CA_PATH is set
// (the production image ships AWS's RDS CA bundle), the server certificate is verified
// against it; unset keeps local/CI connections plain — see ADR-011.
const ssl = env.databaseSslCaPath
  ? { ca: readFileSync(env.databaseSslCaPath, "utf8"), rejectUnauthorized: true }
  : false;

// synchronize is intentionally always false — migrations are the only source of schema
// truth (docs/architecture/system-design.md, .agents/backend-expert.md TypeORM rules).
export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.databaseUrl,
  ssl,
  synchronize: false,
  logging: false,
  entities: [
    UserEntity,
    OtpChallengeEntity,
    SessionEntity,
    SalesNetworkEntity,
    MembershipEntity,
    MembershipCapabilityEntity,
    InviteEntity,
    ProductEntity,
    StockMovementEntity,
    ReservationEntity
  ],
  // Resolved relative to this file so the same glob works from src/ (ts-node/tsx) and from
  // the compiled dist/ inside the production image.
  migrations: [join(__dirname, "..", "migrations", "*.{ts,js}")]
});
