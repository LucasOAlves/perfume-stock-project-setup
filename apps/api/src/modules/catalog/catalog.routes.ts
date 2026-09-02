import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { CatalogService } from "./catalog.service";

const networkParamsSchema = z.object({ networkId: z.string().uuid() });
const productParamsSchema = z.object({ networkId: z.string().uuid(), productId: z.string().uuid() });
const listQuerySchema = z.object({ search: z.string().max(160).optional() });
const lookupQuerySchema = z.object({ barcode: z.string().min(1).max(40) });

const createProductSchema = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().max(80).optional(),
  sku: z.string().max(60).optional(),
  barcode: z.string().max(40).optional(),
  category: z.string().max(60).optional(),
  imageUrl: z.string().url().max(500).optional(),
  initialOnHandQuantity: z.number().int().min(0).optional()
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  brand: z.string().max(80).nullable().optional(),
  sku: z.string().max(60).nullable().optional(),
  barcode: z.string().max(40).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  isActive: z.boolean().optional()
});

export function registerCatalogRoutes(app: FastifyInstance, catalogService: CatalogService): void {
  app.post("/networks/:networkId/products", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const input = createProductSchema.parse(request.body);
    const product = await catalogService.createProduct(user.id, networkId, input);
    reply.code(201).send({ product });
  });

  app.patch("/networks/:networkId/products/:productId", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const input = updateProductSchema.parse(request.body);
    const product = await catalogService.updateProduct(user.id, networkId, productId, input);
    reply.send({ product });
  });

  app.get("/networks/:networkId/products", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const { search } = listQuerySchema.parse(request.query);
    const products = await catalogService.listProducts(user.id, networkId, search);
    reply.send({ products });
  });

  app.get("/networks/:networkId/products/:productId", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId, productId } = productParamsSchema.parse(request.params);
    const product = await catalogService.getProduct(user.id, networkId, productId);
    reply.send({ product });
  });

  // Slice 5 (conditional) — a pure lookup, never a write. See catalog.service.ts and
  // docs/decisions/ADR-005-catalog-provider.md.
  app.get("/networks/:networkId/catalog-lookup", async (request, reply) => {
    const user = app.requireAuth(request);
    const { networkId } = networkParamsSchema.parse(request.params);
    const { barcode } = lookupQuerySchema.parse(request.query);
    const suggestion = await catalogService.lookupBarcode(user.id, networkId, barcode);
    reply.send({ suggestion });
  });
}
