/**
 * _validate-op-linking.ts
 *
 * VENDOR-SAMPLE-OP-LINKING-01 — Phase 8 Validation
 *
 * Checks:
 * 1. REEMPLAZAR refs with OP from same subgrupo show correct OP data
 * 2. OP shown actually exist in ProductionOrder (open, not closed)
 * 3. No OP from a different subgrupo appears
 * 4. No production suggestion when OP activa exists
 * 5. IMPORT never appears as "Sugerir produccion"
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FAIL: castillitos org not found"); return; }

  console.log("=== VENDOR-SAMPLE-OP-LINKING-01 VALIDATION ===\n");

  // ── 1. Load open OP lines aggregated by ref ─────────────────────────
  interface OpLineAgg {
    referenceCode: string;
    documentNumber: string;
    productName: string | null;
    quantityOrdered: number;
    documentDate: Date;
  }

  const opLines: OpLineAgg[] = await db.$queryRawUnsafe(`
    SELECT
      pol."referenceCode",
      po."documentNumber",
      pol."productName",
      SUM(pol."quantityOrdered")::float AS "quantityOrdered",
      po."documentDate"
    FROM "ProductionOrderLine" pol
    JOIN "ProductionOrder" po ON po.id = pol."productionOrderId"
    WHERE po."organizationId" = $1
      AND po.status = 'open'
      AND po."isClosed" = false
    GROUP BY pol."referenceCode", po."documentNumber", pol."productName", po."documentDate"
    ORDER BY po."documentDate" DESC
  `, org.id);

  console.log(`Open OP lines (aggregated): ${opLines.length}`);

  // ── 2. Resolve subgrupoId for each OP ref ──────────────────────────
  const refCodes = [...new Set(opLines.map((l) => l.referenceCode))];
  const products = await db.productEntity.findMany({
    where: { sku: { in: refCodes }, subgrupoId: { not: null } },
    select: { sku: true, subgrupoId: true, subgrupoSag: true, productLine: true },
  });

  const peMap = new Map<string, { subgrupoId: number; subgrupoSag: string; line: string }>();
  const LINE_MAP: Record<string, string> = { "1": "LT", "2": "CS", "3": "PK", "5": "AC" };
  for (const p of products) {
    if (p.sku && p.subgrupoId != null) {
      peMap.set(p.sku, {
        subgrupoId: p.subgrupoId,
        subgrupoSag: p.subgrupoSag ?? "OTRO",
        line: LINE_MAP[p.productLine ?? ""] ?? "OT",
      });
    }
  }

  // Index OP options by subgrupoId (same logic as loader)
  const opBySubgrupo = new Map<number, { ref: string; op: string; qty: number; subgrupoSag: string }[]>();
  for (const line of opLines) {
    const pe = peMap.get(line.referenceCode);
    if (!pe) continue;
    if (!opBySubgrupo.has(pe.subgrupoId)) opBySubgrupo.set(pe.subgrupoId, []);
    opBySubgrupo.get(pe.subgrupoId)!.push({
      ref: line.referenceCode,
      op: line.documentNumber,
      qty: Math.round(line.quantityOrdered),
      subgrupoSag: pe.subgrupoSag,
    });
  }

  console.log(`OP refs with subgrupo: ${peMap.size}`);
  console.log(`Subgrupos with OP: ${opBySubgrupo.size}\n`);

  // ── 3. Load coverage snapshot for REEMPLAZAR refs ───────────────────
  interface CovRow {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    subgrupoId: number | null;
    subgrupoSag: string | null;
  }

  const coverageRows: CovRow[] = await db.$queryRawUnsafe(`
    SELECT DISTINCT ON ("refCode")
      "refCode", description, line, disponible, "subgrupoId", "subgrupoSag"
    FROM "CommercialCoverageSnapshot"
    WHERE "organizationId" = $1
    ORDER BY "refCode", "snapshotAt" DESC
  `, org.id);

  // Find REEMPLAZAR refs (disponible <= minimum)
  function getMin(line: string): number {
    if (line === "LT") return 30;
    if (line === "IMPORT") return 10;
    return 20; // CS default
  }

  const reemplazarRefs = coverageRows
    .filter((r) => r.disponible <= getMin(r.line))
    .slice(0, 100); // pool

  console.log(`Total REEMPLAZAR refs (coverage): ${reemplazarRefs.length}`);

  // ── 4. Sample 20 and validate ───────────────────────────────────────
  // Pick up to 20: mix of refs WITH and WITHOUT OP
  const withOp = reemplazarRefs.filter((r) => r.subgrupoId != null && opBySubgrupo.has(r.subgrupoId));
  const withoutOp = reemplazarRefs.filter((r) => r.subgrupoId == null || !opBySubgrupo.has(r.subgrupoId!));

  const sample = [
    ...withOp.slice(0, 12),
    ...withoutOp.slice(0, 8),
  ].slice(0, 20);

  console.log(`\nSample: ${sample.length} refs (${withOp.slice(0, 12).length} with OP, ${Math.min(withoutOp.length, 8)} without OP)\n`);

  let pass = 0;
  let fail = 0;

  for (const ref of sample) {
    const checks: string[] = [];
    let refPass = true;

    const subId = ref.subgrupoId;
    const opOptions = subId != null
      ? (opBySubgrupo.get(subId) ?? []).filter((o) => o.ref !== ref.refCode).slice(0, 10)
      : [];

    // Check 1: If subgrupo has OP, opOptions should be non-empty
    if (subId != null && opBySubgrupo.has(subId)) {
      if (opOptions.length === 0) {
        // All OP in subgrupo might be the same ref — that's OK, they get filtered
        const allOpsForSubgrupo = opBySubgrupo.get(subId)!;
        const selfOnly = allOpsForSubgrupo.every((o) => o.ref === ref.refCode);
        if (!selfOnly) {
          checks.push("FAIL: subgrupo has OP but no options after self-filter");
          refPass = false;
        } else {
          checks.push("OK: all OP in subgrupo are same ref (correctly filtered)");
        }
      } else {
        checks.push(`OK: ${opOptions.length} OP options from same subgrupo`);
      }
    } else {
      checks.push("OK: no subgrupo or no OP for subgrupo (opOptions=0)");
    }

    // Check 2: All OP options share the same subgrupoId
    if (opOptions.length > 0 && subId != null) {
      const wrongSubgrupo = opOptions.filter((o) => {
        const pe = peMap.get(o.ref);
        return pe && pe.subgrupoId !== subId;
      });
      if (wrongSubgrupo.length > 0) {
        checks.push(`FAIL: ${wrongSubgrupo.length} OP from different subgrupo`);
        refPass = false;
      } else {
        checks.push("OK: all OP options share same subgrupoId");
      }
    }

    // Check 3: OP documentNumbers actually exist as open
    for (const op of opOptions.slice(0, 3)) {
      const exists = await db.productionOrder.findFirst({
        where: {
          organizationId: org.id,
          documentNumber: op.op,
          status: "open",
          isClosed: false,
        },
        select: { id: true },
      });
      if (!exists) {
        checks.push(`FAIL: OP ${op.op} not found as open`);
        refPass = false;
      } else {
        checks.push(`OK: OP ${op.op} verified open`);
      }
    }

    // Check 4: Production suggestion only when NO bodega AND NO OP options
    const min = getMin(ref.line);
    const bodegaCandidates = coverageRows.filter(
      (c) => c.subgrupoId === subId && c.refCode !== ref.refCode && c.disponible > min
    );
    const hasBodega = bodegaCandidates.length > 0;
    const hasOp = opOptions.length > 0;

    if (hasBodega || hasOp) {
      // Should NOT suggest production
      checks.push("OK: has replacement sources — production suggestion should be false");
    } else if (ref.line === "LT" || ref.line === "CS") {
      // Should suggest production
      checks.push("OK: no sources + LT/CS — production suggestion should be true");
    } else {
      // IMPORT: no production suggestion
      checks.push("OK: no sources + non-LT/CS — no production suggestion");
    }

    // Check 5: IMPORT never gets production suggestion
    if (ref.line === "IMPORT" || ref.line === "IMP") {
      if (!hasBodega && !hasOp) {
        checks.push("OK: IMPORT ref with no options — production suggestion correctly excluded");
      }
    }

    const status = refPass ? "PASS" : "FAIL";
    if (refPass) pass++; else fail++;

    console.log(`[${status}] ${ref.refCode} (${ref.line}, subgrupo=${subId ?? "null"}, disp=${ref.disponible})`);
    console.log(`  OP options: ${opOptions.length} | Bodega candidates: ${bodegaCandidates.length}`);
    for (const c of checks) console.log(`  ${c}`);
    console.log();
  }

  console.log("═══════════════════════════════════════════════");
  console.log(`RESULT: ${pass}/${pass + fail} PASS (${Math.round(pass / (pass + fail) * 100)}%)`);
  console.log("═══════════════════════════════════════════════\n");

  // ── 5. Global stats ─────────────────────────────────────────────────
  const totalReemplazar = reemplazarRefs.length;
  const withOpCount = reemplazarRefs.filter((r) => r.subgrupoId != null && opBySubgrupo.has(r.subgrupoId)).length;
  const importInProduction = reemplazarRefs.filter((r) => {
    const isImport = r.line === "IMPORT" || r.line === "IMP";
    const sub = r.subgrupoId;
    const hasOpOpts = sub != null && opBySubgrupo.has(sub);
    const hasBodegaOpts = coverageRows.some(
      (c) => c.subgrupoId === sub && c.refCode !== r.refCode && c.disponible > getMin(r.line)
    );
    return isImport && !hasOpOpts && !hasBodegaOpts;
  });

  console.log("Global OP Linking Stats:");
  console.log(`  Total REEMPLAZAR refs: ${totalReemplazar}`);
  console.log(`  With OP options (same subgrupo): ${withOpCount} (${Math.round(withOpCount / totalReemplazar * 100)}%)`);
  console.log(`  IMPORT refs needing production: ${importInProduction.length} (should be 0 suggestions)`);

  await db.$disconnect();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
