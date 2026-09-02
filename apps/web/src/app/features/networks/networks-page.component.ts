import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import type { SalesNetwork } from '../../core/models';

@Component({
  selector: 'app-networks-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Minhas redes</h1>

    @if (errorMessage()) {
      <div class="error-banner">{{ errorMessage() }}</div>
    }

    @if (loading()) {
      <p>Carregando…</p>
    } @else if (networks().length === 0) {
      <div class="empty-state">
        <p>Você ainda não faz parte de nenhuma rede de vendas.</p>
      </div>
    } @else {
      @for (network of networks(); track network.id) {
        <a class="card network-card" [routerLink]="['/networks', network.id, 'products']">
          <strong>{{ network.name }}</strong>
          @if (network.isOwner) {
            <span class="tag">Dono</span>
          }
        </a>
      }
    }

    <hr />

    <h2>Criar uma rede</h2>
    <form (ngSubmit)="createNetwork()">
      <div class="field">
        <label for="networkName">Nome da rede</label>
        <input id="networkName" name="networkName" type="text" [(ngModel)]="newNetworkName" required />
      </div>
      <button type="submit" class="btn-primary" [disabled]="creating()">
        {{ creating() ? 'Criando…' : 'Criar rede' }}
      </button>
    </form>

    <hr />

    <h2>Entrar com um convite</h2>
    <form (ngSubmit)="acceptInvite()">
      <div class="field">
        <label for="inviteCode">Código do convite</label>
        <input id="inviteCode" name="inviteCode" type="text" [(ngModel)]="inviteCode" required />
      </div>
      <button type="submit" class="btn-secondary" [disabled]="joining()">
        {{ joining() ? 'Entrando…' : 'Entrar na rede' }}
      </button>
    </form>
  `,
  styles: [
    `
      .network-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        text-decoration: none;
        color: inherit;
      }
      hr {
        border: none;
        border-top: 1px solid var(--color-border);
        margin: 1.5rem 0;
      }
    `
  ]
})
export class NetworksPageComponent implements OnInit {
  readonly networks = signal<SalesNetwork[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly joining = signal(false);
  readonly errorMessage = signal<string | null>(null);

  newNetworkName = '';
  inviteCode = '';

  constructor(private readonly api: ApiService) {}

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const { networks } = await this.api.listNetworks();
      this.networks.set(networks);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar suas redes.'));
    } finally {
      this.loading.set(false);
    }
  }

  async createNetwork(): Promise<void> {
    if (!this.newNetworkName.trim()) return;
    this.creating.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.createNetwork(this.newNetworkName.trim());
      this.newNetworkName = '';
      await this.refresh();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível criar a rede.'));
    } finally {
      this.creating.set(false);
    }
  }

  async acceptInvite(): Promise<void> {
    if (!this.inviteCode.trim()) return;
    this.joining.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.acceptInvite(this.inviteCode.trim());
      this.inviteCode = '';
      await this.refresh();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Convite inválido ou expirado.'));
    } finally {
      this.joining.set(false);
    }
  }
}
