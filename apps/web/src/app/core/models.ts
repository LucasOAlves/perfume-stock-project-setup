export interface CurrentUser {
  id: string;
  displayName: string;
}

export interface SalesNetwork {
  id: string;
  name: string;
  isOwner: boolean;
  createdAt: string;
}

export interface Product {
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

export type StockMovementType =
  'RESTOCK' | 'ADJUSTMENT_LOSS' | 'ADJUSTMENT_CORRECTION' | 'RETURN' | 'SALE_FROM_RESERVATION';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantityDelta: number;
  reason: string;
  createdAt: string;
}

export type ReservationStatus = 'active' | 'fulfilled' | 'cancelled' | 'expired';

export interface Reservation {
  id: string;
  productId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Member {
  id: string;
  displayName: string;
  isOwner: boolean;
  createdAt: string;
}

// Mirrors apps/api/src/modules/networks/entities/capability.ts — deliberately does NOT
// include member.manage / permission.manage, which are owner-exclusive and never
// grantable (ADR-003). Keep this list in sync with the backend's CAPABILITIES constant.
export const GRANTABLE_CAPABILITIES = [
  'inventory.read',
  'reservation.create',
  'reservation.cancel.own',
  'reservation.cancel.any',
  'inventory.adjust',
  'product.manage',
  'audit.read'
] as const;
export type Capability = (typeof GRANTABLE_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'inventory.read': 'Ver estoque',
  'reservation.create': 'Criar reservas',
  'reservation.cancel.own': 'Cancelar as próprias reservas',
  'reservation.cancel.any': 'Cancelar reservas de qualquer pessoa',
  'inventory.adjust': 'Alterar quantidade em estoque',
  'product.manage': 'Criar e editar produtos',
  'audit.read': 'Ver histórico de movimentações'
};

// Fixed list instead of free text: a typed category field prevents the classic data-
// quality problem of near-duplicate categories from typos ("Perfumaria" vs "perfumaria"
// vs "Perfumeria") fragmenting what should be one group. Grounded in the categories real
// Brazilian direct-sales cosmetics catalogs (Natura, Avon, O Boticário, Eudora) actually
// use. "Outro" is the deliberate escape hatch — see product-form-page's category field —
// so a genuinely uncommon product is never blocked, just not auto-grouped with anything.
// The `category` column itself stays a free string server-side (no migration): this is a
// UI-level constraint, not a DB enum, so relaxing it later needs no schema change.
export const PRODUCT_CATEGORIES = [
  'Perfumaria',
  'Maquiagem',
  'Cuidados com a pele',
  'Cabelos',
  'Corpo e banho',
  'Higiene pessoal',
  'Infantil',
  'Presentes e kits',
  'Outro'
] as const;

export interface ApiErrorBody {
  error: { code: string; message: string };
}
