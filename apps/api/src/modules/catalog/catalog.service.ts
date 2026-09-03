import { DataSource, ILike } from "typeorm";
import { ProductEntity } from "./entities/product.entity";
import type { CatalogProvider, CatalogSuggestion } from "./catalog-provider";
import { requireCapability, resolveMembership } from "../../shared/membership-guard";
import { NotFoundError, ValidationError } from "../../shared/errors";

export interface CreateProductInput {
  name: string;
  brand?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  initialOnHandQuantity?: number;
}

export interface UpdateProductInput {
  name?: string;
  brand?: string | null;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

// available_quantity is always computed, never stored — see docs/product/domain-model.md.
export interface ProductWithAvailability {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  imageUrl: string | null;
  isActive: boolean;
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

const MAX_CATEGORY_LENGTH = 60;
// Matching control characters is the intended behavior here, not the footgun
// no-control-regex normally flags.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

// Trims, collapses internal whitespace, strips control characters, and caps length —
// applied to every category value before it's compared or stored, whether it came from
// the frontend's fixed list (docs/product/product-spec.md — GRANTABLE... no, see
// apps/web/src/app/core/models.ts PRODUCT_CATEGORIES) or the free-text "Outro" fallback.
// Deliberately does NOT change casing — see resolveCategory() below for why.
function sanitizeCategoryText(raw: string): string {
  return raw.replace(CONTROL_CHARS_PATTERN, "").trim().replace(/\s+/g, " ").slice(0, MAX_CATEGORY_LENGTH);
}

function toDto(product: ProductEntity): ProductWithAvailability {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    sku: product.sku,
    barcode: product.barcode,
    category: product.category,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    onHandQuantity: product.onHandQuantity,
    reservedQuantity: product.reservedQuantity,
    availableQuantity: product.onHandQuantity - product.reservedQuantity
  };
}

export class CatalogService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalogProvider: CatalogProvider
  ) {}

  // Slice 5 (conditional) — a pure suggestion for the product-creation form, gated by
  // product.manage since it's only useful as part of creating/editing a product. Never
  // writes anything; the Owner must review and submit the normal create/update call
  // themselves. See docs/decisions/ADR-005-catalog-provider.md.
  async lookupBarcode(userId: string, networkId: string, barcode: string): Promise<CatalogSuggestion | null> {
    await requireCapability(this.dataSource, userId, networkId, "product.manage");

    const trimmed = barcode?.trim();
    if (!trimmed) {
      throw new ValidationError("Código de barras é obrigatório");
    }
    return this.catalogProvider.lookup(trimmed);
  }

  // Never trust that the client sent one of the frontend's fixed options verbatim (a
  // direct API call, an older client build, or the free-text "Outro" fallback can all
  // send arbitrary text) — this is the server-side source of truth for category values,
  // independent of whatever list the frontend currently offers.
  //
  // Deliberately does NOT re-case the input (e.g. no forced Title Case): the frontend's
  // fixed list already has a specific casing ("Cuidados com a pele", not "Cuidados Com A
  // Pele"), and inventing a different casing rule here would fight that instead of
  // matching it. Instead: sanitize for whitespace/control-chars only, then look for an
  // existing category already used in this network that matches case-insensitively —
  // if found, reuse its exact stored string so "Cabelos" and "cabelos " end up as the
  // same literal value in the database, not two near-duplicate categories. If this is
  // genuinely the first time this category appears in the network, store the sanitized
  // (but casing-preserved) value as the new canonical form.
  private async resolveCategory(networkId: string, rawCategory: string | null | undefined): Promise<string | null> {
    if (rawCategory === undefined || rawCategory === null) return null;

    const sanitized = sanitizeCategoryText(rawCategory);
    if (!sanitized) return null;

    const products = this.dataSource.getRepository(ProductEntity);
    const existing = await products
      .createQueryBuilder("product")
      .where("product.network_id = :networkId", { networkId })
      .andWhere("LOWER(product.category) = LOWER(:category)", { category: sanitized })
      .getOne();

    return existing?.category ?? sanitized;
  }

  async createProduct(userId: string, networkId: string, input: CreateProductInput): Promise<ProductWithAvailability> {
    await requireCapability(this.dataSource, userId, networkId, "product.manage");

    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Nome do produto é obrigatório");
    }
    const initialQuantity = input.initialOnHandQuantity ?? 0;
    if (!Number.isInteger(initialQuantity) || initialQuantity < 0) {
      throw new ValidationError("A quantidade inicial deve ser um número inteiro não negativo");
    }

    const category = await this.resolveCategory(networkId, input.category);

    const products = this.dataSource.getRepository(ProductEntity);
    const product = products.create({
      networkId,
      name,
      brand: input.brand?.trim() || null,
      sku: input.sku?.trim() || null,
      barcode: input.barcode?.trim() || null,
      category,
      imageUrl: input.imageUrl?.trim() || null,
      isActive: true,
      onHandQuantity: initialQuantity,
      reservedQuantity: 0
    });
    await products.save(product);
    return toDto(product);
  }

  async updateProduct(
    userId: string,
    networkId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<ProductWithAvailability> {
    await requireCapability(this.dataSource, userId, networkId, "product.manage");

    const products = this.dataSource.getRepository(ProductEntity);
    const product = await products.findOne({ where: { id: productId, networkId } });
    if (!product) {
      throw new NotFoundError("Produto não encontrado");
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) throw new ValidationError("O nome do produto não pode ficar vazio");
      product.name = trimmed;
    }
    if (input.brand !== undefined) product.brand = input.brand?.trim() || null;
    if (input.sku !== undefined) product.sku = input.sku?.trim() || null;
    if (input.barcode !== undefined) product.barcode = input.barcode?.trim() || null;
    if (input.category !== undefined) product.category = await this.resolveCategory(networkId, input.category);
    if (input.imageUrl !== undefined) product.imageUrl = input.imageUrl?.trim() || null;
    if (input.isActive !== undefined) product.isActive = input.isActive;

    await products.save(product);
    return toDto(product);
  }

  async listProducts(userId: string, networkId: string, search?: string): Promise<ProductWithAvailability[]> {
    await resolveMembership(this.dataSource, userId, networkId); // inventory.read is default for every member

    const products = this.dataSource.getRepository(ProductEntity);
    const where = search?.trim()
      ? [
          { networkId, name: ILike(`%${search.trim()}%`) },
          { networkId, brand: ILike(`%${search.trim()}%`) },
          { networkId, sku: ILike(`%${search.trim()}%`) }
        ]
      : { networkId };

    const rows = await products.find({ where, order: { name: "ASC" } });
    return rows.map(toDto);
  }

  async getProduct(userId: string, networkId: string, productId: string): Promise<ProductWithAvailability> {
    await resolveMembership(this.dataSource, userId, networkId);

    const product = await this.dataSource.getRepository(ProductEntity).findOne({ where: { id: productId, networkId } });
    if (!product) {
      throw new NotFoundError("Produto não encontrado");
    }
    return toDto(product);
  }
}
