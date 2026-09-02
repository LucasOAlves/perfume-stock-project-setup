import "reflect-metadata";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { DataSource } from "typeorm";
import { env } from "./config/env";
import { AppError, ValidationError } from "./shared/errors";
import { installPortugueseZodErrorMap } from "./shared/zod-pt-br";

installPortugueseZodErrorMap();
import { authPlugin } from "./shared/auth-plugin";
import { IdentityService } from "./modules/identity/identity.service";
import { ConsoleOtpSender, type OtpSender } from "./modules/identity/otp-sender";
import { registerIdentityRoutes } from "./modules/identity/identity.routes";
import { NetworksService } from "./modules/networks/networks.service";
import { registerNetworksRoutes } from "./modules/networks/networks.routes";
import { CatalogService } from "./modules/catalog/catalog.service";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes";
import { NoopCatalogProvider, OpenBeautyFactsCatalogProvider, type CatalogProvider } from "./modules/catalog/catalog-provider";
import { InventoryService } from "./modules/inventory/inventory.service";
import { registerInventoryRoutes } from "./modules/inventory/inventory.routes";
import { ReservationsService } from "./modules/reservations/reservations.service";
import { registerReservationsRoutes } from "./modules/reservations/reservations.routes";

export interface BuildAppOptions {
  otpSender?: OtpSender;
  catalogProvider?: CatalogProvider;
  logger?: boolean;
}

function defaultCatalogProvider(): CatalogProvider {
  return env.catalogProvider === "openbeautyfacts" ? new OpenBeautyFactsCatalogProvider() : new NoopCatalogProvider();
}

export async function buildApp(dataSource: DataSource, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, trustProxy: true });

  await app.register(cookie);
  // Dev-only allowlist (Angular dev server). Tighten to the real web origin in production config.
  await app.register(cors, {
    origin: env.isProduction ? false : ["http://localhost:4200"],
    credentials: true
  });

  const otpSender = options.otpSender ?? new ConsoleOtpSender();
  const identityService = new IdentityService(dataSource, otpSender);
  const networksService = new NetworksService(dataSource);
  const catalogService = new CatalogService(dataSource, options.catalogProvider ?? defaultCatalogProvider());
  const inventoryService = new InventoryService(dataSource);
  const reservationsService = new ReservationsService(dataSource);

  await app.register(authPlugin, { identityService, isProduction: env.isProduction });

  registerIdentityRoutes(app, identityService);
  registerNetworksRoutes(app, networksService);
  registerCatalogRoutes(app, catalogService);
  registerInventoryRoutes(app, inventoryService);
  registerReservationsRoutes(app, reservationsService);

  app.get("/health", async () => ({ ok: true }));

  // Central error mapping — never let a raw error (stack trace, ORM/query text) reach
  // the client. See docs/architecture/security-model.md.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const validation = new ValidationError(error.issues.map((i) => i.message).join("; "));
      reply.code(validation.statusCode).send({ error: { code: validation.code, message: validation.message } });
      return;
    }
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    request.log.error(error);
    reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Algo deu errado" } });
  });

  return app;
}
