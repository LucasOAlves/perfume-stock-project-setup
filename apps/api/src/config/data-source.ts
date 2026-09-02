import "reflect-metadata";
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

// synchronize is intentionally always false — migrations are the only source of schema
// truth (docs/architecture/system-design.md, .agents/backend-expert.md TypeORM rules).
export const AppDataSource = new DataSource({
  type: "postgres",
  url: env.databaseUrl,
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
  migrations: ["src/migrations/*.ts"]
});
