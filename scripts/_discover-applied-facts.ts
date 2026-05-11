/**
 * _discover-applied-facts.ts
 *
 * Phase A — appliedFacts RAW DISCOVERY
 *
 * Audits CollectionRecord.appliedFacts across real production data.
 * Queries rawJson for unmapped SAG fields (Documento_pagado, etc.)
 * Measures parse success rate, format distribution, confidence.
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx tsx scripts/_discover-applied-facts.ts
 *   ORG_SLUG=castillitos npx tsx scripts/_discover-applied-facts.ts --verbose
 */

import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";
const VERBOSE  = process.argv.includes("--verbose");

// ── Helpers ───────────────────────────────────────────────────────────────────

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  PHASE A — appliedFacts RAW DISCOVERY                         "));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  // ── Resolve orgId ──────────────────────────────────────────────────────────
  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Overall counts
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 1: Overall CollectionRecord counts ────────────────────"));

  const [totalCount, withFactsCount, byCodeRows] = await Promise.all([
    (prisma as any).collectionRecord.count({ where: { organizationId: orgId } }),
    (prisma as any).collectionRecord.count({
      where: { organizationId: orgId, appliedFacts: { not: null } },
    }),
    (prisma as any).collectionRecord.groupBy({
      by: ["comprobanteCode"],
      where: { organizationId: orgId },
      _count: true,
      orderBy: { _count: { comprobanteCode: "desc" } },
    }),
  ]);

  const withFactsCountInt = toNum(withFactsCount);
  const totalCountInt     = toNum(totalCount);

  console.log(`Total CollectionRecord rows  : ${B(String(totalCountInt))}`);
  console.log(`Rows with appliedFacts != NULL: ${B(String(withFactsCountInt))} (${pct(withFactsCountInt, totalCountInt)})`);
  console.log(`Rows with appliedFacts = NULL : ${B(String(totalCountInt - withFactsCountInt))} (${pct(totalCountInt - withFactsCountInt, totalCountInt)})\n`);

  console.log("By comprobanteCode:");
  for (const row of byCodeRows) {
    const cnt = toNum(row._count);
    console.log(`  ${(row.comprobanteCode ?? "NULL").padEnd(6)} → ${String(cnt).padStart(6)} rows`);
  }
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — appliedFacts format analysis (sample 200 non-null rows)
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 2: appliedFacts format analysis (non-null sample) ────"));

  const nonNullSample = await (prisma as any).collectionRecord.findMany({
    where: { organizationId: orgId, appliedFacts: { not: null } },
    select: {
      id: true,
      comprobanteCode: true,
      amount: true,
      collectionDate: true,
      appliedFacts: true,
    },
    take: 200,
    orderBy: { collectionDate: "desc" },
  });

  const formatStats = {
    arrayOfObjects:   0,
    emptyArray:       0,
    singleObject:     0,
    stringBlob:       0,
    nullOrUndefined:  0,
    malformed:        0,
    unexpectedShape:  0,
  };

  const codeWithFacts: Record<string, number> = {};
  const invoiceRefPresent: number[] = []; // indices where invoiceNumber is present
  const amountPresent:     number[] = []; // indices where amount is present
  let multiInvoiceCount = 0;
  let zeroAmountFacts   = 0;

  const sampleExamples: Array<{ code: string; raw: unknown }> = [];

  for (let i = 0; i < nonNullSample.length; i++) {
    const row = nonNullSample[i];
    const raw = row.appliedFacts;
    const code = row.comprobanteCode ?? "NULL";
    codeWithFacts[code] = (codeWithFacts[code] ?? 0) + 1;

    if (raw == null) {
      formatStats.nullOrUndefined++;
      continue;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        formatStats.emptyArray++;
      } else if (raw.length === 1) {
        formatStats.arrayOfObjects++;
        const item = raw[0] as any;
        if (typeof item?.invoiceNumber === "string" || typeof item?.invoiceNumber === "number") {
          invoiceRefPresent.push(i);
        }
        if (typeof item?.amount === "number" || typeof item?.amount === "string") {
          amountPresent.push(i);
        }
        if ((item?.amount ?? 0) === 0 || item?.amount == null) zeroAmountFacts++;
        if (sampleExamples.length < 10) sampleExamples.push({ code, raw });
      } else {
        formatStats.arrayOfObjects++;
        multiInvoiceCount++;
        if (sampleExamples.length < 10) sampleExamples.push({ code, raw });
      }
    } else if (typeof raw === "object") {
      formatStats.singleObject++;
      if (sampleExamples.length < 10) sampleExamples.push({ code, raw });
    } else if (typeof raw === "string") {
      formatStats.stringBlob++;
      if (sampleExamples.length < 10) sampleExamples.push({ code, raw });
    } else {
      formatStats.malformed++;
    }
  }

  const sampleTotal = nonNullSample.length;
  console.log(`Sample size (non-null): ${B(String(sampleTotal))}\n`);
  console.log("Format distribution:");
  console.log(`  Array of objects (single): ${formatStats.arrayOfObjects.toString().padStart(5)} (${pct(formatStats.arrayOfObjects, sampleTotal)})`);
  console.log(`  Empty array []           : ${formatStats.emptyArray.toString().padStart(5)} (${pct(formatStats.emptyArray, sampleTotal)})`);
  console.log(`  Raw object (not array)   : ${formatStats.singleObject.toString().padStart(5)} (${pct(formatStats.singleObject, sampleTotal)})`);
  console.log(`  String blob              : ${formatStats.stringBlob.toString().padStart(5)} (${pct(formatStats.stringBlob, sampleTotal)})`);
  console.log(`  Null/undefined (leaked)  : ${formatStats.nullOrUndefined.toString().padStart(5)} (${pct(formatStats.nullOrUndefined, sampleTotal)})`);
  console.log(`  Malformed/other          : ${formatStats.malformed.toString().padStart(5)} (${pct(formatStats.malformed, sampleTotal)})\n`);

  console.log(`  → invoiceNumber present  : ${invoiceRefPresent.length} / ${sampleTotal}`);
  console.log(`  → amount present         : ${amountPresent.length} / ${sampleTotal}`);
  console.log(`  → multi-invoice arrays   : ${multiInvoiceCount}`);
  console.log(`  → zero-amount facts      : ${zeroAmountFacts}\n`);

  console.log("By comprobanteCode (non-null facts):");
  for (const [code, cnt] of Object.entries(codeWithFacts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(6)} → ${cnt}`);
  }
  console.log();

  if (VERBOSE && sampleExamples.length > 0) {
    console.log(B("── Sample appliedFacts values (first 10) ──────────────────────────"));
    for (const ex of sampleExamples) {
      console.log(`  [${ex.code}] ${JSON.stringify(ex.raw)}`);
    }
    console.log();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — rawJson field audit (Documento_pagado + other SAG fields)
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 3: rawJson field inventory (Documento_pagado discovery) "));

  // Sample 100 rows regardless of appliedFacts — check rawJson keys
  const rawJsonSample = await (prisma as any).collectionRecord.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      comprobanteCode: true,
      rawJson: true,
    },
    take: 100,
    orderBy: { collectionDate: "desc" },
  });

  const fieldCounts: Record<string, number> = {};
  let rawJsonPresent = 0;

  for (const row of rawJsonSample) {
    const rj = row.rawJson as any;
    if (!rj || typeof rj !== "object") continue;

    // rawJson contains { raw: SAGRow, code, erpMovId } from mapper
    const sagRow = rj.raw ?? rj;
    if (!sagRow || typeof sagRow !== "object") continue;
    rawJsonPresent++;

    for (const key of Object.keys(sagRow)) {
      fieldCounts[key] = (fieldCounts[key] ?? 0) + 1;
    }
  }

  console.log(`Sample: ${rawJsonSample.length} rows — rawJson populated: ${rawJsonPresent}\n`);

  // Interesting reconciliation-related fields
  const reconFields = [
    "Documento_pagado", "documento_pagado", "DOCUMENTO_PAGADO",
    "Numero_Factura", "numero_factura", "Factura", "factura",
    "Numero_Documento", "numero_documento",
    "Valor_Pagado", "valor_pagado",
    "Saldo", "saldo", "SaldoActual", "saldo_actual",
    "Codigo_Fuente_Comprobante", "codigo_fuente_comprobante",
    "Ka_Nl_Tercero", "ka_nl_tercero",
    "Nit_Tercero", "nit_tercero",
    "Nombre_Tercero", "nombre_tercero",
    "Fecha_Documento", "fecha_documento",
    "Ka_Nl_Movimiento", "ka_nl_movimiento",
    "Estado", "estado", "Status", "status",
  ];

  console.log("Reconciliation-relevant field presence in rawJson.raw:");
  for (const field of reconFields) {
    const cnt = fieldCounts[field] ?? 0;
    if (cnt > 0) {
      const marker = field.toLowerCase().includes("documento_pagado") || field.toLowerCase().includes("numero_factura")
        ? G(`  ${field.padEnd(40)} : ${cnt}/${rawJsonPresent}`)
        : `  ${field.padEnd(40)} : ${cnt}/${rawJsonPresent}`;
      console.log(marker);
    }
  }

  // Show all keys found (sorted by frequency)
  if (VERBOSE) {
    console.log("\nAll rawJson.raw keys found (sorted by frequency):");
    const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted) {
      console.log(`  ${k.padEnd(40)} : ${v}`);
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Documento_pagado value samples (if field exists)
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 4: Documento_pagado value samples ──────────────────────"));

  const docPagadoVariants = ["Documento_pagado", "documento_pagado", "DOCUMENTO_PAGADO"];
  const docPagadoSamples: Array<{
    code: string; docPagado: unknown; amount: number; factura: unknown
  }> = [];

  for (const row of rawJsonSample) {
    const rj = row.rawJson as any;
    if (!rj || typeof rj !== "object") continue;
    const sagRow = rj.raw ?? rj;
    if (!sagRow || typeof sagRow !== "object") continue;

    for (const variant of docPagadoVariants) {
      const val = sagRow[variant];
      if (val != null && val !== "" && val !== 0) {
        const facturaVal =
          sagRow["Numero_Factura"] ?? sagRow["numero_factura"] ??
          sagRow["Factura"] ?? sagRow["factura"];
        docPagadoSamples.push({
          code:      row.comprobanteCode ?? "NULL",
          docPagado: val,
          amount:    toNum(sagRow["Valor_Pagado"] ?? sagRow["valor_pagado"] ?? 0),
          factura:   facturaVal,
        });
        break;
      }
    }
    if (docPagadoSamples.length >= 20) break;
  }

  if (docPagadoSamples.length === 0) {
    console.log(Y("  Documento_pagado NOT found in any rawJson.raw sample."));
    console.log(Y("  → appliedFacts is the only invoice association signal."));
    console.log(Y("  → Parser must rely entirely on appliedFacts array or fuzzy matching.\n"));
  } else {
    console.log(`Found ${docPagadoSamples.length} rows with Documento_pagado:\n`);
    for (const s of docPagadoSamples.slice(0, 10)) {
      console.log(`  [${s.code}] Documento_pagado=${JSON.stringify(s.docPagado)}  Valor_Pagado=${s.amount}  Factura=${JSON.stringify(s.factura)}`);
    }
    console.log();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — invoiceNumber value samples (from appliedFacts)
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 5: invoiceNumber value samples (from appliedFacts) ────"));

  const invoiceSamples = await (prisma as any).collectionRecord.findMany({
    where: { organizationId: orgId, appliedFacts: { not: null } },
    select: {
      id: true,
      comprobanteCode: true,
      amount: true,
      collectionDate: true,
      appliedFacts: true,
      customerName: true,
    },
    take: 50,
    orderBy: { collectionDate: "desc" },
  });

  const invoiceNumberPatterns: Record<string, number> = {
    numeric:     0,
    alphanumeric: 0,
    zero:        0,
    empty:       0,
    absent:      0,
  };

  const invoiceNumberSamples: string[] = [];

  for (const row of invoiceSamples) {
    const facts = row.appliedFacts;
    if (!Array.isArray(facts) || facts.length === 0) {
      invoiceNumberPatterns.absent++;
      continue;
    }
    for (const fact of facts as any[]) {
      const inv = fact?.invoiceNumber;
      if (inv == null || inv === "") {
        invoiceNumberPatterns.empty++;
      } else if (String(inv) === "0") {
        invoiceNumberPatterns.zero++;
        invoiceNumberSamples.push(`"${inv}" [${row.comprobanteCode}]`);
      } else if (/^\d+$/.test(String(inv))) {
        invoiceNumberPatterns.numeric++;
        if (invoiceNumberSamples.length < 15) invoiceNumberSamples.push(`"${inv}" [${row.comprobanteCode}]`);
      } else {
        invoiceNumberPatterns.alphanumeric++;
        if (invoiceNumberSamples.length < 15) invoiceNumberSamples.push(`"${inv}" [${row.comprobanteCode}]`);
      }
    }
  }

  console.log("invoiceNumber patterns:");
  for (const [pattern, cnt] of Object.entries(invoiceNumberPatterns)) {
    console.log(`  ${pattern.padEnd(20)}: ${cnt}`);
  }
  if (invoiceNumberSamples.length > 0) {
    console.log("\nSample values:");
    for (const s of invoiceNumberSamples.slice(0, 15)) {
      console.log(`  ${s}`);
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — Cross-check: invoiceNumber vs CustomerReceivable.documentNumber
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 6: Cross-check appliedFacts.invoiceNumber vs CustomerReceivable "));

  // Get distinct non-zero invoice numbers from appliedFacts
  const recentWithFacts = await (prisma as any).collectionRecord.findMany({
    where: { organizationId: orgId, appliedFacts: { not: null } },
    select: { appliedFacts: true, comprobanteCode: true, amount: true },
    take: 500,
  });

  const extractedInvoiceNums = new Set<string>();
  for (const row of recentWithFacts) {
    const facts = row.appliedFacts;
    if (!Array.isArray(facts)) continue;
    for (const f of facts as any[]) {
      const inv = f?.invoiceNumber;
      if (inv != null && String(inv) !== "0" && String(inv).trim() !== "") {
        extractedInvoiceNums.add(String(inv).trim());
      }
    }
  }

  console.log(`Distinct non-zero invoice refs extracted from appliedFacts: ${B(String(extractedInvoiceNums.size))}`);

  if (extractedInvoiceNums.size > 0) {
    const invArray = Array.from(extractedInvoiceNums).slice(0, 200);

    // Check against CustomerReceivable.documentNumber
    const receivableMatches = await (prisma as any).customerReceivable.count({
      where: {
        organizationId: orgId,
        documentNumber: { in: invArray },
      },
    });

    // Check against CustomerReceivable.sagDocumentId
    const sagDocMatches = await (prisma as any).customerReceivable.count({
      where: {
        organizationId: orgId,
        sagDocumentId: { in: invArray },
      },
    });

    const totalReceivables = await (prisma as any).customerReceivable.count({
      where: { organizationId: orgId },
    });

    console.log(`Total CustomerReceivable rows                    : ${totalReceivables}`);
    console.log(`Matched via documentNumber                       : ${G(String(receivableMatches))} / ${invArray.length} refs checked`);
    console.log(`Matched via sagDocumentId                        : ${G(String(sagDocMatches))} / ${invArray.length} refs checked`);
    console.log(`→ Match rate (documentNumber)                    : ${pct(receivableMatches, invArray.length)}`);
    console.log(`→ Match rate (sagDocumentId)                     : ${pct(sagDocMatches, invArray.length)}`);
  }
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — Temporal distribution
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 7: Temporal distribution ──────────────────────────────"));

  const byYear = await (prisma as any).$queryRaw`
    SELECT
      EXTRACT(YEAR FROM "collectionDate")::int AS yr,
      COUNT(*)::int                             AS total,
      COUNT(CASE WHEN "appliedFacts" IS NOT NULL THEN 1 END)::int AS with_facts
    FROM "CollectionRecord"
    WHERE "organizationId" = ${orgId}
    GROUP BY yr
    ORDER BY yr DESC
  `;

  console.log("Year  | Total   | With facts | Coverage");
  console.log("------+---------+------------+---------");
  for (const row of byYear as any[]) {
    const total = toNum(row.total);
    const wf    = toNum(row.with_facts);
    console.log(
      `${String(row.yr).padEnd(5)} | ${String(total).padStart(7)} | ${String(wf).padStart(10)} | ${pct(wf, total)}`
    );
  }
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8 — SUMMARY & PARSER RECOMMENDATIONS
  // ══════════════════════════════════════════════════════════════════════════
  console.log(B("── SECTION 8: SUMMARY & PARSER RECOMMENDATIONS ───────────────────"));

  const pctWithFacts = withFactsCountInt / Math.max(totalCountInt, 1);

  console.log(`appliedFacts population rate: ${pct(withFactsCountInt, totalCountInt)}`);

  if (pctWithFacts < 0.05) {
    console.log(R("  FINDING: appliedFacts is sparsely populated (<5% of rows)."));
    console.log(Y("  → Parser needed but fuzzy matching will be the primary reconciliation path."));
    console.log(Y("  → High priority: check rawJson for Documento_pagado to supplement."));
  } else if (pctWithFacts < 0.50) {
    console.log(Y("  FINDING: appliedFacts is moderately populated."));
    console.log(Y("  → Parser will cover some rows; fuzzy match needed for the rest."));
  } else {
    console.log(G("  FINDING: appliedFacts is well populated (>50% of rows)."));
    console.log(G("  → Parser-first approach is viable."));
  }

  console.log(`\nInvoice reference quality:`);
  if (extractedInvoiceNums.size === 0) {
    console.log(R("  No valid invoice references found in appliedFacts."));
    console.log(Y("  → If Documento_pagado is absent too, reconciliation must be fully fuzzy."));
  } else {
    console.log(G(`  ${extractedInvoiceNums.size} distinct invoice refs extracted.`));
  }

  console.log("\n" + B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DISCOVERY COMPLETE — see output above for APPLIED_FACTS_DISCOVERY.md"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
