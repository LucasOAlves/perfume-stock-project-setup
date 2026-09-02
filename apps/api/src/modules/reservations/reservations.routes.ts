import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ReservationsService } from "./reservations.service";
import { ValidationError } from "../../shared/errors";

const productParamsSchema = z.object({ networkId: z.string().uuid(), productId: z.string().uuid() });
const networkParamsSchema = z.object({ networkId: z.string().uuid() });
const reservationParamsSchema = z.object({ networkId: z.string().uuid(), reservationId: z.string().uuid() });
const createReservationSchema = z.object({ quantity: z.number().int().positive() });

function requireIdempotencyKey(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.trim()) {
    throw new ValidationError("Cabeçalho Idempotency-Key é obrigatório");
  }
  return value.trim();
}

export function registerReservationsRoutes(app: FastifyInstance, reservationsService: ReservationsService): void {
  app.post("/networks/:networkId/products/:productId/reservations", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const { quantity } = createReservationSchema.parse(request.body);
    const idempotencyKey = requireIdempotencyKey(request.headers["idempotency-key"]);

    const reservation = await reservationsService.createReservation(user.id, networkId, productId, quantity, idempotencyKey);
    reply.code(201).send({ reservation });
  });

  app.post("/networks/:networkId/reservations/:reservationId/cancel", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, reservationId } = reservationParamsSchema.parse(request.params);
    const reservation = await reservationsService.cancelReservation(user.id, networkId, reservationId);
    reply.send({ reservation });
  });

  app.get("/networks/:networkId/reservations/mine", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const reservations = await reservationsService.listMine(user.id, networkId);
    reply.send({ reservations });
  });

  app.get("/networks/:networkId/products/:productId/reservations", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const reservations = await reservationsService.listActiveForProduct(user.id, networkId, productId);
    reply.send({ reservations });
  });
}
