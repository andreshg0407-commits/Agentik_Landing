/**
 * scripts/validate-cd-line-global-exclusion.ts
 *
 * AGENTIK-COMMERCIAL-CD-LINE-GLOBAL-EXCLUSION-01 — DB validation gate.
 *
 * Dimensiona el perímetro que protege la regla global CD-*:
 *   1. Cuántas referencias CD-* existen en el maestro de productos.
 *   2. Cuántas tienen stock hoy (y en qué bodegas — tiendas vs principal).
 *   3. Cuántas están en estado dormido/baja actividad (candidatas a bóveda
 *      que la regla retiene).
 *   4. Cuántas aparecen asignadas en maletas comerciales.
 *
 * La regla en sí se certifica con las pruebas puras
 * (lib/comercial/__tests__/commercial-exclusions.test.ts); este script
 * muestra cuánto inventario real queda protegido.
 *
 * Run: npx tsx --env-file=.env scripts/validate-cd-line-global-exclusion.ts
 */

import { prisma } from "../lib/prisma";
import { isSpecialCollectionReference } from "../lib/comercial/commercial-exclusions";

async function main() {
  const db = prisma as any;

  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ CD-LINE-GLOBAL-EXCLUSION-01 — validación (${org.slug}) ═══\n`);

  // ── 1. CD-* en el maestro ────────────────────────────────────────────────────

  const products = await db.productEntity.findMany({
    where: { organizationId: org.id, status: { not: "archived" } },
    select: {
      id: true, externalId: true, sku: true, name: true,
      grupoSag: true, subgrupoSag: true, lastSaleSag: true, lastModifiedSag: true,
    },
  });

  const cdProducts = products.filter((p: any) =>
    isSpecialCollectionReference(p.sku ?? p.externalId ?? ""),
  );

  console.log(`Referencias en maestro (no archivadas): ${products.length}`);
  console.log(`Referencias CD-* (colección especial):  ${cdProducts.length}\n`);

  if (cdProducts.length === 0) {
    console.log("⚠ No hay referencias CD-* en el maestro. La regla queda armada sin perímetro actual.\n");
  }

  // ── 2. Stock actual de CD-* por bodega ──────────────────────────────────────

  const cdIds = cdProducts.map((p: any) => p.id);
  const levels = cdIds.length > 0 ? await db.productInventoryLevel.findMany({
    where: { organizationId: org.id, productId: { in: cdIds }, quantity: { gt: 0 } },
    select: { productId: true, warehouseId: true, quantity: true },
  }) : [];

  const byWarehouse = new Map<string, { refs: Set<string>; units: number }>();
  for (const lvl of levels) {
    const wh = String(lvl.warehouseId ?? "?");
    if (!byWarehouse.has(wh)) byWarehouse.set(wh, { refs: new Set(), units: 0 });
    const e = byWarehouse.get(wh)!;
    e.refs.add(lvl.productId);
    e.units += Number(lvl.quantity ?? 0);
  }

  // Store warehouse PKs (CANONICAL_STORE_IDENTITY): 31=Centro, 11=San Diego, 32=Gran Plaza, 39=Caldas
  const STORE_PKS = new Set(["31", "11", "32", "39"]);
  const STORE_NAMES: Record<string, string> = { "31": "Centro", "11": "San Diego", "32": "Gran Plaza", "39": "Caldas" };

  console.log("Stock CD-* con unidades > 0 por bodega:");
  let inStores = 0;
  for (const [wh, e] of [...byWarehouse.entries()].sort((a, b) => b[1].units - a[1].units)) {
    const label = STORE_PKS.has(wh) ? `TIENDA ${STORE_NAMES[wh]}` : `bodega ${wh}`;
    if (STORE_PKS.has(wh)) inStores += e.refs.size;
    console.log(`   ${label.padEnd(22)} ${String(e.refs.size).padStart(4)} refs  ${String(e.units).padStart(6)} und`);
  }
  console.log(`\n→ CD-* con stock en TIENDAS (protegidas de descuento/baja rotación/markdown): ${inStores} refs`);

  // ── 3. CD-* dormidas (candidatas a bóveda que la regla retiene) ─────────────

  const now = Date.now();
  const dormantCd = cdProducts.filter((p: any) => {
    const last = p.lastSaleSag ?? p.lastModifiedSag;
    if (!last) return true; // sin datos de actividad → no-ACTIVE
    const days = Math.floor((now - new Date(last).getTime()) / 86_400_000);
    return days > 180; // LOW_ACTIVITY o peor
  });
  console.log(`→ CD-* con >180 días sin actividad (retenidas fuera de la bóveda): ${dormantCd.length} refs`);

  // ── 4. CD-* en maletas comerciales ──────────────────────────────────────────

  const bagItems = cdIds.length > 0 ? await db.vendorBagItem.count({
    where: { bag: { organizationId: org.id }, productId: { in: cdIds } },
  }).catch(() => null) : 0;
  console.log(`→ Asignaciones de CD-* en maletas (protegidas de dead stock): ${bagItems ?? "n/d"}\n`);

  // ── 5. Muestra ───────────────────────────────────────────────────────────────

  console.log("Muestra CD-* (máx 10):");
  for (const p of cdProducts.slice(0, 10)) {
    console.log(`   ${(p.sku ?? p.externalId ?? "").padEnd(16)} ${String(p.name ?? "").slice(0, 40)}`);
  }

  console.log("\n═══ Fin de validación ═══\n");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
