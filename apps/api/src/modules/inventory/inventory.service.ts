import { DataSource } from "typeorm";
import { ProductEntity } from "../catalog/entities/product.entity";
import { STOCK_MOVEMENT_TYPE_LABELS, StockMovementEntity, type StockMovementType } from "./entities/stock-movement.entity";
import { RESERVATION_STATUS_LABELS, ReservationEntity } from "../reservations/entities/reservation.entity";
import { sweepExpiredReservations } from "../reservations/reservations.service";
import { requireCapability } from "../../shared/membership-guard";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";

export interface RecordMovementInput {
  type: StockMovementType;
  quantityDelta: number;
  reason: string;
}

// Positive-only types must never be given a negative delta and vice versa —
// ADJUSTMENT_CORRECTION is the only type allowed either sign (docs/product/domain-model.md).
function validateDeltaSign(type: StockMovementType, quantityDelta: number): void {
  if (quantityDelta === 0) {
    throw new ValidationError("A variação de quantidade não pode ser zero");
  }
  if ((type === "RESTOCK" || type === "RETURN") && quantityDelta < 0) {
    throw new ValidationError(`${STOCK_MOVEMENT_TYPE_LABELS[type]} deve aumentar o estoque (use uma quantidade positiva)`);
  }
  if (type === "ADJUSTMENT_LOSS" && quantityDelta > 0) {
    throw new ValidationError(
      `${STOCK_MOVEMENT_TYPE_LABELS.ADJUSTMENT_LOSS} deve diminuir o estoque (use uma quantidade negativa)`
    );
  }
}

export class InventoryService {
  constructor(private readonly dataSource: DataSource) {}

  // The row lock + invariant re-check here is the same mechanism ADR-002 mandates for
  // reservations — stock movements are the other writer of on_hand_quantity, so they
  // must serialize against the same lock (see docs/decisions/ADR-002-reservation-concurrency.md).
  async recordMovement(
    userId: string,
    networkId: string,
    productId: string,
    input: RecordMovementInput
  ): Promise<{ product: ProductEntity; movement: StockMovementEntity }> {
    const { membership } = await requireCapability(this.dataSource, userId, networkId, "inventory.adjust");

    validateDeltaSign(input.type, input.quantityDelta);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("É obrigatório informar um motivo para toda mudança de estoque");
    }

    return this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(ProductEntity);
      const product = await products.findOne({
        where: { id: productId, networkId },
        lock: { mode: "pessimistic_write" }
      });
      if (!product) {
        throw new NotFoundError("Produto não encontrado");
      }

      const newOnHand = product.onHandQuantity + input.quantityDelta;
      if (newOnHand < 0) {
        throw new ConflictError(
          `Essa mudança deixaria o estoque negativo (atualmente ${product.onHandQuantity} em mãos)`
        );
      }
      if (newOnHand < product.reservedQuantity) {
        throw new ConflictError(
          `${product.reservedQuantity} unidade(s) estão reservadas — cancele as reservas antes de reduzir o estoque abaixo disso`
        );
      }

      product.onHandQuantity = newOnHand;
      await products.save(product);

      const movements = manager.getRepository(StockMovementEntity);
      const movement = movements.create({
        networkId,
        productId,
        type: input.type,
        quantityDelta: input.quantityDelta,
        reason,
        createdByMembershipId: membership.id,
        reservationId: null
      });
      await movements.save(movement);

      return { product, movement };
    });
  }

  // The only path that creates a SALE_FROM_RESERVATION movement: closes the reservation
  // and decreases on-hand stock together, in one transaction, under the same product
  // row lock — see docs/product/domain-model.md invariant 3 and ADR-002.
  async fulfillReservation(
    userId: string,
    networkId: string,
    reservationId: string,
    reason: string
  ): Promise<{ product: ProductEntity; movement: StockMovementEntity }> {
    const { membership } = await requireCapability(this.dataSource, userId, networkId, "inventory.adjust");

    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new ValidationError("É obrigatório informar um motivo para toda mudança de estoque");
    }

    return this.dataSource.transaction(async (manager) => {
      const reservations = manager.getRepository(ReservationEntity);
      const reservation = await reservations.findOne({ where: { id: reservationId, networkId } });
      if (!reservation) {
        throw new NotFoundError("Reserva não encontrada");
      }

      const products = manager.getRepository(ProductEntity);
      const product = await products.findOne({
        where: { id: reservation.productId, networkId },
        lock: { mode: "pessimistic_write" }
      });
      if (!product) {
        throw new NotFoundError("Produto não encontrado");
      }
      await sweepExpiredReservations(manager, product);

      const fresh = await reservations.findOneOrFail({ where: { id: reservationId } });
      if (fresh.status !== "active") {
        throw new ConflictError(`A reserva está ${RESERVATION_STATUS_LABELS[fresh.status]} e não pode ser confirmada`);
      }

      product.onHandQuantity -= fresh.quantity;
      product.reservedQuantity -= fresh.quantity;
      await products.save(product);

      fresh.status = "fulfilled";
      await reservations.save(fresh);

      const movements = manager.getRepository(StockMovementEntity);
      const movement = movements.create({
        networkId,
        productId: product.id,
        type: "SALE_FROM_RESERVATION",
        quantityDelta: -fresh.quantity,
        reason: trimmedReason,
        createdByMembershipId: membership.id,
        reservationId: fresh.id
      });
      await movements.save(movement);

      return { product, movement };
    });
  }

  async listMovements(userId: string, networkId: string, productId: string): Promise<StockMovementEntity[]> {
    await requireCapability(this.dataSource, userId, networkId, "audit.read");

    return this.dataSource
      .getRepository(StockMovementEntity)
      .find({ where: { networkId, productId }, order: { createdAt: "DESC" } });
  }
}
