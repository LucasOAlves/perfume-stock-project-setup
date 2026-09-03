import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  Capability,
  CurrentUser,
  Member,
  Product,
  Reservation,
  SalesNetwork,
  StockMovement,
  StockMovementType
} from './models';

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

// Hardcoded for MVP local dev; move to Angular environment files once a real
// staging/production API URL exists.
const API_BASE = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly http: HttpClient) {}

  requestOtp(phone: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API_BASE}/auth/otp/request`, { phone }));
  }

  verifyOtp(phone: string, code: string, displayName?: string): Promise<{ user: CurrentUser }> {
    return firstValueFrom(
      this.http.post<{ user: CurrentUser }>(`${API_BASE}/auth/otp/verify`, { phone, code, displayName })
    );
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${API_BASE}/auth/logout`, {}));
  }

  me(): Promise<{ user: CurrentUser }> {
    return firstValueFrom(this.http.get<{ user: CurrentUser }>(`${API_BASE}/auth/me`));
  }

  listNetworks(): Promise<{ networks: SalesNetwork[] }> {
    return firstValueFrom(this.http.get<{ networks: SalesNetwork[] }>(`${API_BASE}/networks`));
  }

  createNetwork(name: string): Promise<{ network: SalesNetwork }> {
    return firstValueFrom(this.http.post<{ network: SalesNetwork }>(`${API_BASE}/networks`, { name }));
  }

  createInvite(networkId: string): Promise<{ invite: { code: string; expiresAt: string } }> {
    return firstValueFrom(
      this.http.post<{ invite: { code: string; expiresAt: string } }>(`${API_BASE}/networks/${networkId}/invites`, {})
    );
  }

  acceptInvite(code: string): Promise<{ network: SalesNetwork }> {
    return firstValueFrom(this.http.post<{ network: SalesNetwork }>(`${API_BASE}/invites/accept`, { code }));
  }

  listMembers(networkId: string): Promise<{ members: Member[] }> {
    return firstValueFrom(this.http.get<{ members: Member[] }>(`${API_BASE}/networks/${networkId}/members`));
  }

  getMemberCapabilities(networkId: string, membershipId: string): Promise<{ capabilities: Capability[] }> {
    return firstValueFrom(
      this.http.get<{ capabilities: Capability[] }>(
        `${API_BASE}/networks/${networkId}/members/${membershipId}/capabilities`
      )
    );
  }

  setMemberCapabilities(
    networkId: string,
    membershipId: string,
    capabilities: Capability[]
  ): Promise<{ capabilities: Capability[] }> {
    return firstValueFrom(
      this.http.put<{ capabilities: Capability[] }>(
        `${API_BASE}/networks/${networkId}/members/${membershipId}/capabilities`,
        { capabilities }
      )
    );
  }

  listProducts(networkId: string, search?: string): Promise<{ products: Product[] }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return firstValueFrom(this.http.get<{ products: Product[] }>(`${API_BASE}/networks/${networkId}/products${query}`));
  }

  // Slice 5 (conditional) — always a suggestion for the create-product form to prefill
  // and the Owner to review; never a write on its own. Returns null when disabled
  // (CATALOG_PROVIDER=none), on any provider failure, or when nothing was found — the
  // caller must treat all three the same way (fall back to manual entry).
  lookupBarcode(
    networkId: string,
    barcode: string
  ): Promise<{ suggestion: { name: string | null; brand: string | null; imageUrl: string | null } | null }> {
    return firstValueFrom(
      this.http.get<{ suggestion: { name: string | null; brand: string | null; imageUrl: string | null } | null }>(
        `${API_BASE}/networks/${networkId}/catalog-lookup`,
        { params: { barcode } }
      )
    );
  }

  createProduct(
    networkId: string,
    input: {
      name: string;
      brand?: string;
      sku?: string;
      barcode?: string;
      category?: string;
      imageUrl?: string;
      initialOnHandQuantity?: number;
    }
  ): Promise<{ product: Product }> {
    return firstValueFrom(this.http.post<{ product: Product }>(`${API_BASE}/networks/${networkId}/products`, input));
  }

  // A fresh Idempotency-Key per call means a genuine double-tap intentionally creates
  // two reservations; it's a guard against an accidental network-level retry re-sending
  // the same logical request, not against a user reserving twice on purpose. See
  // docs/architecture/security-model.md and ADR-002.
  createReservation(networkId: string, productId: string, quantity: number): Promise<{ reservation: Reservation }> {
    return firstValueFrom(
      this.http.post<{ reservation: Reservation }>(
        `${API_BASE}/networks/${networkId}/products/${productId}/reservations`,
        { quantity },
        { headers: { 'idempotency-key': newIdempotencyKey() } }
      )
    );
  }

  cancelReservation(networkId: string, reservationId: string): Promise<{ reservation: Reservation }> {
    return firstValueFrom(
      this.http.post<{ reservation: Reservation }>(
        `${API_BASE}/networks/${networkId}/reservations/${reservationId}/cancel`,
        {}
      )
    );
  }

  fulfillReservation(
    networkId: string,
    reservationId: string,
    reason: string
  ): Promise<{
    product: { onHandQuantity: number; reservedQuantity: number; availableQuantity: number };
    movement: StockMovement;
  }> {
    return firstValueFrom(
      this.http.post<{
        product: { onHandQuantity: number; reservedQuantity: number; availableQuantity: number };
        movement: StockMovement;
      }>(`${API_BASE}/networks/${networkId}/reservations/${reservationId}/fulfill`, { reason })
    );
  }

  listMyReservations(networkId: string): Promise<{ reservations: Reservation[] }> {
    return firstValueFrom(
      this.http.get<{ reservations: Reservation[] }>(`${API_BASE}/networks/${networkId}/reservations/mine`)
    );
  }

  listActiveReservationsForProduct(networkId: string, productId: string): Promise<{ reservations: Reservation[] }> {
    return firstValueFrom(
      this.http.get<{ reservations: Reservation[] }>(
        `${API_BASE}/networks/${networkId}/products/${productId}/reservations`
      )
    );
  }

  recordMovement(
    networkId: string,
    productId: string,
    input: { type: StockMovementType; quantityDelta: number; reason: string }
  ): Promise<{
    product: { onHandQuantity: number; reservedQuantity: number; availableQuantity: number };
    movement: StockMovement;
  }> {
    return firstValueFrom(
      this.http.post<{
        product: { onHandQuantity: number; reservedQuantity: number; availableQuantity: number };
        movement: StockMovement;
      }>(`${API_BASE}/networks/${networkId}/products/${productId}/movements`, input)
    );
  }

  listMovements(networkId: string, productId: string): Promise<{ movements: StockMovement[] }> {
    return firstValueFrom(
      this.http.get<{ movements: StockMovement[] }>(`${API_BASE}/networks/${networkId}/products/${productId}/movements`)
    );
  }

  updateProduct(
    networkId: string,
    productId: string,
    input: Partial<{
      name: string;
      brand: string | null;
      category: string | null;
      imageUrl: string | null;
      isActive: boolean;
    }>
  ): Promise<{ product: Product }> {
    return firstValueFrom(
      this.http.patch<{ product: Product }>(`${API_BASE}/networks/${networkId}/products/${productId}`, input)
    );
  }
}
