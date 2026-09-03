import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { InventoryService } from "./inventory.service";
import { MANUALLY_RECORDABLE_MOVEMENT_TYPES } from "./entities/stock-movement.entity";

const productParamsSchema = z.object({ networkId: z.string().uuid(), productId: z.string().uuid() });
const reservationParamsSchema = z.object({ networkId: z.string().uuid(), reservationId: z.string().uuid() });

const recordMovementSchema = z.object({
  type: z.enum(MANUALLY_RECORDABLE_MOVEMENT_TYPES),
  quantityDelta: z
    .number()
    .int()
    .refine((n) => n !== 0, "Quantity change cannot be zero"),
  reason: z.string().min(1).max(500)
});

const fulfillReservationSchema = z.object({ reason: z.string().min(1).max(500) });

export function registerInventoryRoutes(app: FastifyInstance, inventoryService: InventoryService): void {
  app.post("/networks/:networkId/products/:productId/movements", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const input = recordMovementSchema.parse(request.body);
    const { product, movement } = await inventoryService.recordMovement(user.id, networkId, productId, input);
    reply.code(201).send({
      product: {
        id: product.id,
        onHandQuantity: product.onHandQuantity,
        reservedQuantity: product.reservedQuantity,
        availableQuantity: product.onHandQuantity - product.reservedQuantity
      },
      movement
    });
  });

  app.get("/networks/:networkId/products/:productId/movements", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const movements = await inventoryService.listMovements(user.id, networkId, productId);
    reply.send({ movements });
  });

  app.post("/networks/:networkId/reservations/:reservationId/fulfill", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, reservationId } = reservationParamsSchema.parse(request.params);
    const { reason } = fulfillReservationSchema.parse(request.body);
    const { product, movement } = await inventoryService.fulfillReservation(user.id, networkId, reservationId, reason);
    reply.send({
      product: {
        id: product.id,
        onHandQuantity: product.onHandQuantity,
        reservedQuantity: product.reservedQuantity,
        availableQuantity: product.onHandQuantity - product.reservedQuantity
      },
      movement
    });
  });
}
