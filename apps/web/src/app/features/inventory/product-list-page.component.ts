import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import type { Product } from '../../core/models';

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './product-list-page.component.html',
  styleUrl: './product-list-page.component.css'
})
export class ProductListPageComponent implements OnInit {
  networkId = '';
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly isOwner = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly inviteCode = signal<string | null>(null);
  readonly invitingLoading = signal(false);
  readonly reservingProductId = signal<string | null>(null);
  readonly reserveConfirmation = signal<{ productId: string; message: string } | null>(null);

  searchTerm = '';
  reserveQuantities: Record<string, number> = {};
  private searchDebounce?: ReturnType<typeof setTimeout>;
  private confirmationTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    this.networkId = this.route.snapshot.paramMap.get('networkId') ?? '';
    await Promise.all([this.loadProducts(), this.loadOwnership()]);
  }

  private async loadOwnership(): Promise<void> {
    try {
      const { networks } = await this.api.listNetworks();
      const current = networks.find((n) => n.id === this.networkId);
      this.isOwner.set(Boolean(current?.isOwner));
    } catch {
      this.isOwner.set(false);
    }
  }

  private async loadProducts(): Promise<void> {
    this.loading.set(true);
    try {
      const { products } = await this.api.listProducts(this.networkId, this.searchTerm || undefined);
      this.products.set(products);
      for (const product of products) {
        this.reserveQuantities[product.id] ??= 1;
      }
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar o estoque.'));
    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => void this.loadProducts(), 300);
  }

  async generateInvite(): Promise<void> {
    this.invitingLoading.set(true);
    this.errorMessage.set(null);
    try {
      const { invite } = await this.api.createInvite(this.networkId);
      this.inviteCode.set(invite.code);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível gerar o convite.'));
    } finally {
      this.invitingLoading.set(false);
    }
  }

  async reserveProduct(product: Product): Promise<void> {
    const quantity = Number(this.reserveQuantities[product.id]) || 1;
    if (quantity < 1 || quantity > product.availableQuantity) {
      this.errorMessage.set('Quantidade inválida para reserva.');
      return;
    }

    this.reservingProductId.set(product.id);
    this.errorMessage.set(null);
    try {
      await this.api.createReservation(this.networkId, product.id, quantity);
      this.reserveQuantities[product.id] = 1;
      clearTimeout(this.confirmationTimeout);
      this.reserveConfirmation.set({ productId: product.id, message: `${quantity} unidade(s) reservada(s).` });
      this.confirmationTimeout = setTimeout(() => this.reserveConfirmation.set(null), 4000);
      await this.loadProducts();
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível reservar — o estoque pode ter mudado.'));
      await this.loadProducts(); // re-sync availability after a conflict
    } finally {
      this.reservingProductId.set(null);
    }
  }

  availabilityLabel(product: Product): string {
    if (!product.isActive) return 'Inativo';
    if (product.availableQuantity <= 0) return 'Indisponível';
    if (product.availableQuantity <= 2) return `Últimas ${product.availableQuantity} unid.`;
    return `${product.availableQuantity} disponíveis`;
  }

  availabilityClass(product: Product): string {
    if (!product.isActive || product.availableQuantity <= 0) return 'unavailable';
    if (product.availableQuantity <= 2) return 'low';
    return 'available';
  }
}
