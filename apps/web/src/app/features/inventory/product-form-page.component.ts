import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { extractErrorMessage } from '../../core/error-message';
import { PRODUCT_CATEGORIES } from '../../core/models';
import { StockMovementsPanelComponent } from './stock-movements-panel.component';

const OTHER_CATEGORY = 'Outro';

// Creation and editing share one form. Server-side is the real gate on who may call
// this (product.manage capability) — this page hides itself in the UI, but a rejected
// request here is still expected and handled, not just prevented by hiding a button.
@Component({
  selector: 'app-product-form-page',
  standalone: true,
  imports: [FormsModule, StockMovementsPanelComponent],
  templateUrl: './product-form-page.component.html',
  styleUrl: './product-form-page.component.css'
})
export class ProductFormPageComponent implements OnInit {
  networkId = '';
  productId: string | null = null;
  isEditMode = false;

  readonly saving = signal(false);
  readonly loadingProduct = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lookingUp = signal(false);
  readonly lookupMessage = signal<string | null>(null);

  categories = PRODUCT_CATEGORIES;

  name = '';
  brand = '';
  categorySelection: string = PRODUCT_CATEGORIES[0];
  categoryOther = '';
  barcode = '';
  imageUrl = '';
  imagePreviewFailed = false;
  initialQuantity = 0;
  isActive = true;

  onHandQuantity = 0;
  reservedQuantity = 0;
  availableQuantity = 0;

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.networkId = this.route.snapshot.paramMap.get('networkId') ?? '';
    this.productId = this.route.snapshot.paramMap.get('productId');
    this.isEditMode = Boolean(this.productId);

    if (this.isEditMode) {
      await this.loadExistingProduct();
    }
  }

  private async loadExistingProduct(): Promise<void> {
    this.loadingProduct.set(true);
    try {
      const products = (await this.api.listProducts(this.networkId)).products;
      const product = products.find((p) => p.id === this.productId);
      if (product) {
        this.name = product.name;
        this.brand = product.brand ?? '';
        this.setCategoryFromValue(product.category);
        this.imageUrl = product.imageUrl ?? '';
        this.isActive = product.isActive;
        this.onHandQuantity = product.onHandQuantity;
        this.reservedQuantity = product.reservedQuantity;
        this.availableQuantity = product.availableQuantity;
      }
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível carregar o produto.'));
    } finally {
      this.loadingProduct.set(false);
    }
  }

  // Existing products created before this fixed-category list existed may carry any
  // free-text value (or none) — fall back to "Outro" with that text preserved rather
  // than silently discarding or mismatching it against the fixed options.
  private setCategoryFromValue(category: string | null): void {
    if (category && (PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
      this.categorySelection = category;
      this.categoryOther = '';
    } else {
      this.categorySelection = OTHER_CATEGORY;
      this.categoryOther = category ?? '';
    }
  }

  private get resolvedCategory(): string {
    return this.categorySelection === OTHER_CATEGORY ? this.categoryOther.trim() : this.categorySelection;
  }

  // Slice 5 (conditional) — always a suggestion the Owner reviews before saving; never
  // auto-submits. Absence/failure of the provider is indistinguishable to this UI from
  // "nothing found" — manual entry works exactly the same either way.
  async lookupBarcode(): Promise<void> {
    if (!this.barcode.trim()) return;
    this.lookingUp.set(true);
    this.lookupMessage.set(null);
    try {
      const { suggestion } = await this.api.lookupBarcode(this.networkId, this.barcode.trim());
      if (!suggestion) {
        this.lookupMessage.set('Nada encontrado para este código — preencha manualmente.');
        return;
      }
      if (suggestion.name) this.name = suggestion.name;
      if (suggestion.brand) this.brand = suggestion.brand;
      if (suggestion.imageUrl) this.imageUrl = suggestion.imageUrl;
      this.lookupMessage.set('Sugestão preenchida — confira os campos antes de salvar.');
    } catch (err) {
      this.lookupMessage.set(extractErrorMessage(err, 'Não foi possível buscar — preencha manualmente.'));
    } finally {
      this.lookingUp.set(false);
    }
  }

  async submit(): Promise<void> {
    if (!this.name.trim()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      if (this.isEditMode && this.productId) {
        await this.api.updateProduct(this.networkId, this.productId, {
          name: this.name.trim(),
          brand: this.brand.trim() || null,
          category: this.resolvedCategory || null,
          imageUrl: this.imageUrl.trim() || null,
          isActive: this.isActive
        });
      } else {
        await this.api.createProduct(this.networkId, {
          name: this.name.trim(),
          brand: this.brand.trim() || undefined,
          barcode: this.barcode.trim() || undefined,
          category: this.resolvedCategory || undefined,
          imageUrl: this.imageUrl.trim() || undefined,
          initialOnHandQuantity: Number(this.initialQuantity) || 0
        });
      }
      await this.router.navigate(['/networks', this.networkId, 'products']);
    } catch (err) {
      this.errorMessage.set(extractErrorMessage(err, 'Não foi possível salvar o produto.'));
    } finally {
      this.saving.set(false);
    }
  }

  onQuantitiesChanged(quantities: {
    onHandQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }): void {
    this.onHandQuantity = quantities.onHandQuantity;
    this.reservedQuantity = quantities.reservedQuantity;
    this.availableQuantity = quantities.availableQuantity;
  }
}
