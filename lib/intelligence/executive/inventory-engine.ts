/**
 * inventory-engine.ts
 *
 * Centralizes all inventory intelligence: agotados, stock critico,
 * coverage, variant counts.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { InventoryData, AgotadoRow, StockCriticoRow } from "./executive-types";

export async function runInventoryEngine(orgId: string): Promise<InventoryData> {
  const [agotados, stockCritico, variantCounts, lastSync] = await Promise.all([
    buildAgotados(orgId),
    buildStockCritico(orgId),
    buildVariantCounts(orgId),
    getLastSync(orgId),
  ]);

  return {
    agotados,
    stockCritico,
    totalVariantes: variantCounts.total,
    variantesAgotadas: variantCounts.agotadas,
    variantesDisponibles: variantCounts.disponibles,
    cobertura: variantCounts.total > 0
      ? Math.round((variantCounts.disponibles / variantCounts.total) * 100)
      : 0,
    lastSync,
  };
}

// ── Agotados ──────────────────────────────────────────────────────────────────

async function buildAgotados(orgId: string): Promise<AgotadoRow[]> {
  const zeroStock = await prisma.productInventoryLevel.findMany({
    where: { organizationId: orgId, quantity: { lte: 0 } },
    select: { variantId: true, productId: true },
  });

  if (zeroStock.length === 0) return [];

  const productVariantCounts = new Map<string, number>();
  for (const z of zeroStock) {
    productVariantCounts.set(z.productId, (productVariantCounts.get(z.productId) ?? 0) + 1);
  }

  const productIds = [...productVariantCounts.keys()].slice(0, 50);
  const products = await prisma.productEntity.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true, _count: { select: { variants: true } } },
  });

  const skus = products.map(p => p.sku).filter(Boolean) as string[];
  const affectedLines = skus.length > 0
    ? await (prisma as any).cRMQuoteLine.groupBy({
        by: ["reference"],
        where: { organizationId: orgId, reference: { in: skus } },
        _count: { _all: true },
      }).catch(() => [])
    : [];

  const pedidosByRef = new Map<string, number>();
  for (const al of affectedLines) {
    pedidosByRef.set(al.reference, al._count._all);
  }

  return products
    .map(p => ({
      reference: p.sku ?? "",
      productName: p.name,
      variantesAgotadas: productVariantCounts.get(p.id) ?? 0,
      totalVariantes: p._count.variants,
      pedidosAfectados: pedidosByRef.get(p.sku ?? "") ?? 0,
    }))
    .sort((a, b) => b.pedidosAfectados - a.pedidosAfectados || b.variantesAgotadas - a.variantesAgotadas)
    .slice(0, 20);
}

// ── Stock Critico ─────────────────────────────────────────────────────────────

async function buildStockCritico(orgId: string): Promise<StockCriticoRow[]> {
  const critical = await prisma.productInventoryLevel.findMany({
    where: {
      organizationId: orgId,
      quantity: { gt: 0, lte: 10 },
      variantId: { not: null },
    },
    include: {
      variant: { select: { sku: true, attributes: true } },
      product: { select: { sku: true, name: true } },
    },
    orderBy: { quantity: "asc" },
    take: 30,
  });

  return critical.map(c => {
    const attrs = (c.variant?.attributes ?? {}) as Record<string, string>;
    return {
      reference: c.product?.sku ?? "",
      color: attrs.color ?? attrs.Color ?? "",
      size: attrs.talla ?? attrs.size ?? attrs.Talla ?? "",
      disponible: c.quantity,
      productName: c.product?.name ?? "",
    };
  });
}

// ── Variant Counts ────────────────────────────────────────────────────────────

async function buildVariantCounts(orgId: string): Promise<{
  total: number;
  agotadas: number;
  disponibles: number;
}> {
  const [total, agotadas] = await Promise.all([
    prisma.productInventoryLevel.count({ where: { organizationId: orgId } }),
    prisma.productInventoryLevel.count({ where: { organizationId: orgId, quantity: { lte: 0 } } }),
  ]);

  return { total, agotadas, disponibles: total - agotadas };
}

// ── Last Sync ─────────────────────────────────────────────────────────────────

async function getLastSync(orgId: string): Promise<string | null> {
  const run = await prisma.connectorRun.findFirst({
    where: { organizationId: orgId, source: "sag_pya", status: "SUCCESS" },
    select: { finishedAt: true },
    orderBy: { finishedAt: "desc" },
  });

  return run?.finishedAt?.toISOString() ?? null;
}
