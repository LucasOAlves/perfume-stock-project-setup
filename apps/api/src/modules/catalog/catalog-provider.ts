// External, volatile boundary behind an interface per ADR-001. See
// docs/research/product-catalog-sources.md: no official API exists for the target
// Brazilian direct-sales brands (Natura, Avon, O Boticario, Eudora) - this can only ever
// be an optional, human-reviewed enrichment for product CREATION, never an unattended
// write path. A lookup result is a suggestion the Owner must review and confirm through
// the normal product-creation form; nothing here ever writes to the database directly.
export interface CatalogSuggestion {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

export interface CatalogProvider {
  lookup(barcode: string): Promise<CatalogSuggestion | null>;
}

// Default when no provider is configured - manual entry always works regardless
// (docs/product/product-spec.md non-goals).
export class NoopCatalogProvider implements CatalogProvider {
  async lookup(): Promise<CatalogSuggestion | null> {
    return null;
  }
}

// Open Beauty Facts: a real, documented free API of crowdsourced product data (ODbL
// database license). See docs/research/product-catalog-sources.md - coverage of these
// specific Brazilian direct-sales SKUs is unverified and likely sparse; this is
// deliberately treated as a "might help, never trusted blindly" source, not a backbone.
// Their usage policy asks for a descriptive User-Agent and discourages bulk scraping -
// this only ever does one lookup per explicit user action, never a batch/background job.
export class OpenBeautyFactsCatalogProvider implements CatalogProvider {
  private static readonly BASE_URL = "https://world.openbeautyfacts.org/api/v2/product";
  private static readonly USER_AGENT = "SharedStock/0.1 (MVP catalog enrichment; see docs/decisions)";

  async lookup(barcode: string): Promise<CatalogSuggestion | null> {
    try {
      const response = await fetch(`${OpenBeautyFactsCatalogProvider.BASE_URL}/${encodeURIComponent(barcode)}.json`, {
        headers: { "User-Agent": OpenBeautyFactsCatalogProvider.USER_AGENT },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return null;

      const body = (await response.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; image_front_url?: string };
      };
      if (body.status !== 1 || !body.product) return null;

      return {
        name: sanitizeText(body.product.product_name),
        brand: sanitizeText(body.product.brands),
        imageUrl: sanitizeImageUrl(body.product.image_front_url)
      };
    } catch {
      // Provider outage/timeout must never block manual product creation - see
      // docs/architecture/security-model.md "External Integrations".
      return null;
    }
  }
}

// Matching control characters is the intended behavior here (see comment below), not the
// footgun no-control-regex normally flags.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

// Untrusted external input: cap length, strip control characters, never pass through
// unbounded/raw HTML (security-model.md "External Integrations" treats provider
// responses as untrusted).
function sanitizeText(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(CONTROL_CHARS_PATTERN, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 160);
}

// Only ever suggest an https:// image URL - never javascript:/data: or anything else a
// provider payload could smuggle in.
function sanitizeImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}
