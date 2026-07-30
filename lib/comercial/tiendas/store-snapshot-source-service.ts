/**
 * lib/comercial/tiendas/store-snapshot-source-service.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1: source-service DELGADO del assembler.
 *
 * SOLO LEE. Cero transformación de negocio, cero decisión, cero cache
 * (la cache del pipeline llega en F2, única y con invalidación). Sus fuentes:
 *
 *   - ProductInventoryLevel ⋈ ProductEntity/Variant — inventario de tiendas
 *     y bodegas principales (textil kaNl=10, importación kaNl=33), separadas
 *     vía warehouse-master (fuente canónica de identidad de bodegas).
 *   - resolveActiveStores (gobernanza) — única verdad de tienda activa.
 *   - getStorePolicyByStoreId (políticas persistidas) — verbatim.
 *   - ProductAssetLink/GeneratedAsset — imagen hero (no crítica).
 *
 * PROHIBIDO importar store-distribution-service (obs. 3 del F0): este
 * servicio nace precisamente para reemplazar esa vía de suministro.
 *
 * Única transformación permitida: proyectar filas crudas al contrato
 * SnapshotInventoryRow (incluye el clamp disponible = max(0, qty − reserved),
 * mismo comportamiento del mundo actual, documentado) y aplicar la
 * normalización PURA de store-snapshot-source-filters ANTES del assembler:
 * dedup PIL (suma + updatedAt más reciente) y LEY OPERATIVA (el snapshot
 * operativo excluye referencias con disponibilidad <= 0). Ambas son de solo
 * lectura: ningún registro histórico se elimina ni se modifica. Todo lo
 * demás — consolidación, estructuras, reglas — es ley del assembler.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  getStoreWarehousePks,
  getCommercialTextilePks,
  getCommercialAvailableImportPks,
} from "@/lib/inventory/warehouse-master";
import { resolveActiveStores } from "./store-governance-service";
import { getStorePolicyByStoreId } from "./store-policy-service";
import { resolveVariantSizeColor } from "./variant-attribute-resolver";
import { dedupePilRows, filterOperationalRows } from "./store-snapshot-source-filters";
import type {
  SnapshotSourceRows,
  SnapshotInventoryRow,
  SnapshotPolicyRule,
} from "./store-snapshot-assembler";

interface RawLevel {
  warehouseId: string;
  quantity: number;
  reservedQty: number;
  externalRef: string | null;
  updatedAt: Date | null;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    grupoSag: string | null;
    subgrupoSag: string | null;
    productLine: string | null;
    handlingUnit: string | null;
    createdAtSag: Date | null;
  } | null;
  variant?: { sku: string | null; name: string | null; attributes: unknown } | null;
}

async function loadHeroImagesByProductId(orgId: string): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const heroLinks: Array<{ productId: string; assetId: string }> = await db.productAssetLink.findMany({
      where: { organizationId: orgId, role: "hero" },
      select: { productId: true, assetId: true },
    });
    if (heroLinks.length === 0) return imageMap;
    const assets: Array<{ id: string; assetUrl: string | null }> = await db.generatedAsset.findMany({
      where: { id: { in: heroLinks.map(l => l.assetId) }, assetUrl: { not: null } },
      select: { id: true, assetUrl: true },
    });
    const assetById = new Map(assets.filter(a => a.assetUrl).map(a => [a.id, a.assetUrl as string]));
    for (const link of heroLinks) {
      const url = assetById.get(link.assetId);
      if (url && !imageMap.has(link.productId)) imageMap.set(link.productId, url);
    }
  } catch {
    // Imagen no crítica — degradación silenciosa idéntica al mundo actual.
  }
  return imageMap;
}

/**
 * Lee todas las fuentes y entrega las filas crudas para el assembler.
 * Una lectura = una corrida; sin cache (Invariante 8 del contrato F0:
 * ningún snapshot se construye desde otro snapshot).
 */
export async function loadSnapshotSource(orgId: string): Promise<SnapshotSourceRows> {
  const readAt = new Date().toISOString();

  const [governance, heroImages] = await Promise.all([
    resolveActiveStores(orgId),
    loadHeroImagesByProductId(orgId),
  ]);

  const governanceStores = governance.map(g => ({ storeId: g.storeId, displayName: g.displayName }));
  const storeIdByPk = new Map(governance.map(g => [g.warehouseId, g.storeId]));

  // Bodegas: tiendas activas (por gobernanza) + principales (warehouse-master)
  const mainPks = new Set<string>([...getCommercialTextilePks(), ...getCommercialAvailableImportPks()]);
  const storePks = [...getStoreWarehousePks()].filter(pk => storeIdByPk.has(pk));
  const allPks = [...storePks, ...mainPks];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const levels: RawLevel[] = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: { in: allPks } },
    include: {
      product: { select: { id: true, name: true, sku: true, grupoSag: true, subgrupoSag: true, productLine: true, handlingUnit: true, createdAtSag: true } },
      variant: { select: { sku: true, name: true, attributes: true } },
    },
  });

  const inventoryRows: SnapshotInventoryRow[] = levels.map(lv => {
    const resolved = resolveVariantSizeColor(lv.variant);
    const isMain = mainPks.has(lv.warehouseId);
    const referenceCode = (lv.product?.sku ?? lv.externalRef ?? "").toUpperCase();
    return {
      warehouseKind: isMain ? "MAIN" as const : "STORE" as const,
      storeId: isMain ? null : storeIdByPk.get(lv.warehouseId) ?? null,
      warehousePk: lv.warehouseId,
      referenceCode,
      productId: lv.product?.id ?? null,
      productName: lv.product?.name ?? null,
      variantKey: lv.variant?.sku ?? `${resolved.size ?? "?"}|${resolved.color ?? "?"}`,
      // Disponible = qty − reservado, acotado a 0 (comportamiento actual documentado)
      units: Math.max(0, lv.quantity - lv.reservedQty),
      grupoSag: lv.product?.grupoSag ?? null,
      subgrupoSag: lv.product?.subgrupoSag ?? null,
      productLine: lv.product?.productLine ?? null,
      handlingUnit: lv.product?.handlingUnit ?? null,
      createdAtSag: lv.product?.createdAtSag ? lv.product.createdAtSag.toISOString() : null,
      heroImageUrl: lv.product?.id ? heroImages.get(lv.product.id) ?? null : null,
      updatedAt: lv.updatedAt ? lv.updatedAt.toISOString() : null,
    };
  }).filter(row => row.warehouseKind === "MAIN" || row.storeId !== null);
  // Filas de bodegas de tienda NO activas quedan fuera del universo leído
  // (idéntico al mundo actual, que solo consulta PKs operacionales). Las filas
  // de tiendas presentes pero inactivas en gobernanza las cuenta el assembler.

  // 1) Dedup PIL: la sincronización SAG puede generar filas duplicadas para el
  //    mismo (bodega, producto, variante). Ley de la integración de Opus,
  //    extraída a módulo puro certificado: suma de unidades + updatedAt más
  //    reciente. Sin esto el assembler rechaza la fuente (DUPLICATE_VARIANT).
  const deduped = dedupePilRows(inventoryRows);

  // 2) LEY OPERATIVA: el StoreSnapshot operativo excluye referencias con
  //    disponibilidad <= 0. Filtro de SOLO LECTURA aplicado ANTES del
  //    assembler — ningún registro histórico se elimina ni se modifica.
  const operational = filterOperationalRows(deduped.rows);

  const policyRulesByStore = await Promise.all(
    governanceStores.map(async s => {
      const policy = await getStorePolicyByStoreId(orgId, s.storeId);
      const rules: SnapshotPolicyRule[] = (policy?.rules ?? []).map(r => ({
        scope: r.scope,
        line: r.line,
        sizeClass: r.sizeClass,
        minQty: r.minQty,
        idealQty: r.idealQty,
        maxQty: r.maxQty,
        active: r.active,
        validFrom: r.validFrom ?? null,
        validTo: r.validTo ?? null,
      }));
      return { storeId: s.storeId, rules };
    }),
  );

  return { organizationId: orgId, readAt, inventoryRows: [...operational.rows], governanceStores, policyRulesByStore };
}
