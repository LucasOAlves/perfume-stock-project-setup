import { DataSource, EntityManager, In, LessThanOrEqual } from "typeorm";
import { ProductEntity } from "../catalog/entities/product.entity";
import { RESERVATION_STATUS_LABELS, ReservationEntity } from "./entities/reservation.entity";
import { requireCapability, resolveMembership } from "../../shared/membership-guard";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";

const DEFAULT_RESERVATION_TTL_MS = 24 * 60 * 60 * 1000; // see docs/product/product-spec.md open question

// Any active reservation past its expiry is swept back into availability the next time
// someone actually interacts with that product — no background job in the MVP (see
// docs/plans/mvp.md Slice 3 and docs/learnings/slice-3-implementation.md). This is safe
// to call without its own row lock because it only ever runs inside a transaction that
// has already taken SELECT ... FOR UPDATE on the product row (ADR-002), which serializes
// every reservation/movement mutation for that product against this sweep.
// Exported for InventoryService.fulfillReservation, the one place outside this module
// that also needs to lock a product row and reconcile reservations against it before
// mutating on_hand_quantity (see docs/learnings/slice-3-implementation.md).
export async function sweepExpiredReservations(manager: EntityManager, product: ProductEntity): Promise<void> {
  const reservations = manager.getRepository(ReservationEntity);
  const expired = await reservations.find({
    where: { productId: product.id, status: "active", expiresAt: LessThanOrEqual(new Date()) }
  });
  if (expired.length === 0) return;

  const releasedQuantity = expired.reduce((sum, r) => sum + r.quantity, 0);
  await reservations.update({ id: In(expired.map((r) => r.id)) }, { status: "expired" });
  product.reservedQuantity -= releasedQuantity;
}

export interface ReservationDto {
  id: string;
  productId: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
}

function toDto(reservation: ReservationEntity): ReservationDto {
  return {
    id: reservation.id,
    productId: reservation.productId,
    quantity: reservation.quantity,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString()
  };
}

export class ReservationsService {
  constructor(private readonly dataSource: DataSource) {}

  // The concurrency-critical path: two sellers racing the last unit both attempt
  // SELECT ... FOR UPDATE on the same product row; the second waits, then re-checks
  // availability against the post-lock state before committing — see ADR-002.
  async createReservation(
    userId: string,
    networkId: string,
    productId: string,
    quantity: number,
    idempotencyKey: string
  ): Promise<ReservationDto> {
    const { membership } = await requireCapability(this.dataSource, userId, networkId, "reservation.create");

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError("A quantidade deve ser um número inteiro positivo");
    }
    if (!idempotencyKey?.trim()) {
      throw new ValidationError("Cabeçalho Idempotency-Key é obrigatório");
    }

    const existing = await this.dataSource
      .getRepository(ReservationEntity)
      .findOne({ where: { createdByMembershipId: membership.id, idempotencyKey } });
    if (existing) {
      return toDto(existing); // replay of a request we already handled — see security-model.md
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

      await sweepExpiredReservations(manager, product);

      const available = product.onHandQuantity - product.reservedQuantity;
      if (quantity > available) {
        throw new ConflictError(`Apenas ${available} unidade(s) disponível(is)`);
      }

      product.reservedQuantity += quantity;
      await products.save(product);

      const reservations = manager.getRepository(ReservationEntity);
      const reservation = reservations.create({
        networkId,
        productId,
        createdByMembershipId: membership.id,
        quantity,
        status: "active",
        expiresAt: new Date(Date.now() + DEFAULT_RESERVATION_TTL_MS),
        idempotencyKey
      });
      await reservations.save(reservation);

      return toDto(reservation);
    });
  }

  // Cancelling an already-cancelled reservation succeeds as a no-op (idempotent by
  // construction, no separate idempotency key needed for cancel) — cancelling one that's
  // already fulfilled or expired is a real conflict and is reported as one.
  async cancelReservation(userId: string, networkId: string, reservationId: string): Promise<ReservationDto> {
    const { membership } = await resolveMembership(this.dataSource, userId, networkId);

    return this.dataSource.transaction(async (manager) => {
      const reservations = manager.getRepository(ReservationEntity);
      const reservation = await reservations.findOne({ where: { id: reservationId, networkId } });
      if (!reservation) {
        throw new NotFoundError("Reserva não encontrada");
      }

      const isOwnReservation = reservation.createdByMembershipId === membership.id;
      const requiredCapability = isOwnReservation ? "reservation.cancel.own" : "reservation.cancel.any";
      await requireCapability(this.dataSource, userId, networkId, requiredCapability);

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
      if (fresh.status === "cancelled") {
        return toDto(fresh); // idempotent replay
      }
      if (fresh.status !== "active") {
        throw new ConflictError(
          `A reserva já está ${RESERVATION_STATUS_LABELS[fresh.status]} e não pode ser cancelada`
        );
      }

      fresh.status = "cancelled";
      await reservations.save(fresh);

      product.reservedQuantity -= fresh.quantity;
      await products.save(product);

      return toDto(fresh);
    });
  }

  async listMine(userId: string, networkId: string): Promise<ReservationDto[]> {
    const { membership } = await resolveMembership(this.dataSource, userId, networkId);
    const rows = await this.dataSource
      .getRepository(ReservationEntity)
      .find({ where: { networkId, createdByMembershipId: membership.id }, order: { createdAt: "DESC" } });
    return rows.map(toDto);
  }

  async listActiveForProduct(userId: string, networkId: string, productId: string): Promise<ReservationDto[]> {
    await requireCapability(this.dataSource, userId, networkId, "reservation.cancel.any");
    const rows = await this.dataSource
      .getRepository(ReservationEntity)
      .find({ where: { networkId, productId, status: "active" }, order: { createdAt: "ASC" } });
    return rows.map(toDto);
  }
}
