import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import type { Reservation, StockMovement, StockMovementType } from '../../core/models';

function isForbidden(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 403;
}

// Slice 2: owner-only stock mutation + append-only movement history. Kept as its own
// component (not folded into the product edit form) because it's a different capability
// (inventory.adjust / audit.read vs product.manage) and a different concern — see
// docs/product/domain-model.md "Permission-Sensitive Operations".
@Component({
  selector: 'app-stock-movements-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './stock-movements-panel.component.html',
  styleUrl: './stock-movements-panel.component.css'
})
export class StockMovementsPanelComponent implements OnChanges {
  @Input({ required: true }) networkId!: string;
  @Input({ required: true }) productId!: string;
  @Input() onHandQuantity = 0;
  @Input() reservedQuantity = 0;
  @Input() availableQuantity = 0;
  @Output() quantitiesChanged = new EventEmitter<{
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>();

  readonly movements = signal<StockMovement[]>([]);
  readonly loadingHistory = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly activeReservations = signal<Reservation[]>([]);
  readonly loadingReservations = signal(true);
  readonly reservationsForbidden = signal(false);
  readonly busyReservationId = signal<string | null>(null);
  readonly historyForbidden = signal(false);

  movementType: StockMovementType = 'RESTOCK';
  quantity = 1;
  reason = '';

  constructor(private readonly api: ApiService) {}

  ngOnChanges(): void {
    if (this.networkId && this.productId) {
      void this.loadHistory();
      void this.loadReservations();
    }
  }

  // Background reads use their own forbidden/empty states rather than the shared
  // errorMessage banner — two independent loads sharing one error signal previously
  // meant a 403 on one silently overwrote (or was overwritten by) the other, and either
  // way rendered as a misleading "nothing here" empty state instead of the real reason.
  private async loadReservations(): Promise<void> {
    this.loadingReservations.set(true);
    this.reservationsForbidden.set(false);
    try {
      const { reservations } = await this.api.listActiveReservationsForProduct(this.networkId, this.productId);
      this.activeReservations.set(reservations);
    } catch (err) {
      if (isForbidden(err)) {
        this.reservationsForbidden.set(true);
      } else {
        this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar as reservas.'));
      }
    } finally {
      this.loadingReservations.set(false);
    }
  }

  async fulfill(reservation: Reservation): Promise<void> {
    this.busyReservationId.set(reservation.id);
    this.errorMessage.set(null);
    try {
      const { product } = await this.api.fulfillReservation(
        this.networkId,
        reservation.id,
        'Venda confirmada pelo dono'
      );
      this.quantitiesChanged.emit(product);
      await Promise.all([this.loadReservations(), this.loadHistory()]);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível confirmar a venda.'));
    } finally {
      this.busyReservationId.set(null);
    }
  }

  async cancelReservation(reservation: Reservation): Promise<void> {
    this.busyReservationId.set(reservation.id);
    this.errorMessage.set(null);
    try {
      await this.api.cancelReservation(this.networkId, reservation.id);
      await this.loadReservations();
      this.quantitiesChanged.emit({
        onHandQuantity: this.onHandQuantity,
        reservedQuantity: this.reservedQuantity - reservation.quantity,
        availableQuantity: this.availableQuantity + reservation.quantity
      });
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível cancelar a reserva.'));
    } finally {
      this.busyReservationId.set(null);
    }
  }

  private async loadHistory(): Promise<void> {
    this.loadingHistory.set(true);
    this.historyForbidden.set(false);
    try {
      const { movements } = await this.api.listMovements(this.networkId, this.productId);
      this.movements.set(movements);
    } catch (err) {
      if (isForbidden(err)) {
        this.historyForbidden.set(true);
      } else {
        this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar o histórico.'));
      }
    } finally {
      this.loadingHistory.set(false);
    }
  }

  quantityHint(): string {
    if (this.movementType === 'ADJUSTMENT_CORRECTION') {
      return 'Use um valor negativo para diminuir, positivo para aumentar.';
    }
    if (this.movementType === 'ADJUSTMENT_LOSS') {
      return 'Informe quantas unidades foram perdidas (será registrado como saída).';
    }
    return 'Quantas unidades entraram no estoque.';
  }

  movementLabel(type: StockMovementType): string {
    switch (type) {
      case 'RESTOCK':
        return 'Reposição';
      case 'ADJUSTMENT_LOSS':
        return 'Perda / avaria';
      case 'ADJUSTMENT_CORRECTION':
        return 'Correção';
      case 'RETURN':
        return 'Devolução';
      case 'SALE_FROM_RESERVATION':
        return 'Venda (reserva confirmada)';
    }
  }

  async submitMovement(): Promise<void> {
    if (!this.reason.trim() || !this.quantity) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const magnitude = Math.abs(Number(this.quantity));
      const quantityDelta =
        this.movementType === 'ADJUSTMENT_CORRECTION' ? Number(this.quantity) : this.signedDelta(magnitude);

      const { product } = await this.api.recordMovement(this.networkId, this.productId, {
        type: this.movementType,
        quantityDelta,
        reason: this.reason.trim()
      });

      this.quantitiesChanged.emit(product);
      this.reason = '';
      this.quantity = 1;
      await this.loadHistory();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível registrar a movimentação.'));
    } finally {
      this.saving.set(false);
    }
  }

  private signedDelta(magnitude: number): number {
    return this.movementType === 'ADJUSTMENT_LOSS' ? -magnitude : magnitude;
  }
}
