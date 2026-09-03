import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { UserEntity } from "../../src/modules/identity/entities/user.entity";
import { OtpChallengeEntity } from "../../src/modules/identity/entities/otp-challenge.entity";
import { SessionEntity } from "../../src/modules/identity/entities/session.entity";
import { SalesNetworkEntity } from "../../src/modules/networks/entities/sales-network.entity";
import { MembershipEntity } from "../../src/modules/networks/entities/membership.entity";
import { MembershipCapabilityEntity } from "../../src/modules/networks/entities/membership-capability.entity";
import { InviteEntity } from "../../src/modules/networks/entities/invite.entity";
import { ProductEntity } from "../../src/modules/catalog/entities/product.entity";
import { StockMovementEntity } from "../../src/modules/inventory/entities/stock-movement.entity";
import { ReservationEntity } from "../../src/modules/reservations/entities/reservation.entity";
import type { OtpSender } from "../../src/modules/identity/otp-sender";
import { NoopCatalogProvider } from "../../src/modules/catalog/catalog-provider";

// Test-only OTP sender that captures the last code per phone instead of sending it,
// so tests can drive the real HTTP request/verify flow end to end.
export class CapturingOtpSender implements OtpSender {
  private codesByPhone = new Map<string, string>();

  async send(phone: string, code: string): Promise<void> {
    this.codesByPhone.set(phone, code);
  }

  codeFor(phone: string): string {
    const code = this.codesByPhone.get(phone);
    if (!code) throw new Error(`No OTP captured for ${phone}`);
    return code;
  }
}

// Requires a real PostgreSQL reachable at TEST_DATABASE_URL (or DATABASE_URL), migrated.
// `npm run db:up && npm run migration:run -w apps/api` before running this suite.
// See docs/architecture/system-design.md "Testing Strategy" — reservation/tenant-isolation
// correctness is deliberately tested against real Postgres, not mocks.
export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: "postgres",
    url: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
    synchronize: false,
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
    ]
  });
  await dataSource.initialize();
  return dataSource;
}

export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  dataSource: DataSource;
  otpSender: CapturingOtpSender;
}> {
  const dataSource = await createTestDataSource();
  const otpSender = new CapturingOtpSender();
  // Explicit Noop provider — tests must never depend on network access to a real
  // third-party API, regardless of what CATALOG_PROVIDER is set to locally.
  const app = await buildApp(dataSource, { otpSender, catalogProvider: new NoopCatalogProvider(), logger: false });
  return { app, dataSource, otpSender };
}

export interface SignedUpUser {
  cookies: string;
  csrfToken: string;
  userId: string;
}

// Drives the real phone+OTP HTTP flow (request -> verify) so integration tests exercise
// the same code path production traffic does, per docs/architecture/security-model.md.
export async function signUp(
  app: FastifyInstance,
  otpSender: CapturingOtpSender,
  phone: string,
  displayName: string
): Promise<SignedUpUser> {
  await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone } });
  const code = otpSender.codeFor(phone);

  const verifyResponse = await app.inject({
    method: "POST",
    url: "/auth/otp/verify",
    payload: { phone, code, displayName }
  });

  const setCookies = verifyResponse.cookies;
  const sessionCookie = setCookies.find((c) => c.name === "session_id");
  const csrfCookie = setCookies.find((c) => c.name === "csrf_token");
  if (!sessionCookie || !csrfCookie) {
    throw new Error("Sign up did not return session cookies");
  }

  return {
    cookies: `session_id=${sessionCookie.value}; csrf_token=${csrfCookie.value}`,
    csrfToken: csrfCookie.value,
    userId: (verifyResponse.json() as { user: { id: string } }).user.id
  };
}

// Truncate in FK-safe order between tests to keep them independent.
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    TRUNCATE TABLE
      "stock_movements", "reservations", "products", "invites", "membership_capabilities",
      "memberships", "sales_networks", "sessions", "otp_challenges", "users"
    RESTART IDENTITY CASCADE
  `);
}
