import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import type { Reservation } from '../../core/models';

@Component({
  selector: 'app-my-reservations-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <a class="back-link" [routerLink]="['/networks', networkId, 'products']">← Voltar ao estoque</a>
    <h1>Minhas reservas</h1>

    @if (errorMessage()) {
      <div class="error-banner">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <p>Carregando…</p>
    } @else if (reservations().length === 0) {
      <div class="empty-state">
        <p>Você ainda não fez nenhuma reserva.</p>
      </div>
    } @else {
      @for (reservation of reservations(); track reservation.id) {
        <div class="card reservation-row">
          <div>
            <strong>{{ reservation.quantity }} unidade(s)</strong>
            <span class="status" [class]="'status-' + reservation.status">{{ statusLabel(reservation.status) }}</span>
          </div>
          @if (reservation.status === 'active') {
            <button
              type="button"
              class="btn-secondary cancel-btn"
              [disabled]="cancellingId() === reservation.id"
              (click)="cancel(reservation)"
            >
              {{ cancellingId() === reservation.id ? 'Cancelando…' : 'Cancelar' }}
            </button>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .back-link {
        display: inline-block;
        margin-bottom: 0.75rem;
        color: var(--color-primary);
        text-decoration: none;
        font-size: 0.9rem;
      }
      .reservation-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .status {
        display: block;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      .status-active {
        color: var(--color-success);
      }
      .status-cancelled,
      .status-expired {
        color: var(--color-muted);
      }
      .status-fulfilled {
        color: var(--color-primary);
      }
      .cancel-btn {
        width: auto;
      }
    `
  ]
})
export class MyReservationsPageComponent implements OnInit {
  networkId = '';
  readonly reservations = signal<Reservation[]>([]);
  readonly loading = signal(true);
  readonly cancellingId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    this.networkId = this.route.snapshot.paramMap.get('networkId') ?? '';
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const { reservations } = await this.api.listMyReservations(this.networkId);
      this.reservations.set(reservations);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar suas reservas.'));
    } finally {
      this.loading.set(false);
    }
  }

  async cancel(reservation: Reservation): Promise<void> {
    this.cancellingId.set(reservation.id);
    this.errorMessage.set(null);
    try {
      await this.api.cancelReservation(this.networkId, reservation.id);
      await this.load();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível cancelar a reserva.'));
    } finally {
      this.cancellingId.set(null);
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'active':
        return 'Ativa';
      case 'cancelled':
        return 'Cancelada';
      case 'expired':
        return 'Expirada';
      case 'fulfilled':
        return 'Confirmada (vendida)';
      default:
        return status;
    }
  }
}
