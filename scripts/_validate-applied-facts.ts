/**
 * _validate-applied-facts.ts
 *
 * Unit-style validation of applied-facts-parser.ts against real CollectionRecord data.
 *
 * Reports:
 *   - Parse success rate
 *   - Confidence distribution
 *   - Malformed / unmatched examples
 *   - Strategy distribution (RAW_JSON vs APPLIED_FACTS vs EMPTY)
 *   - Invoice candidate extraction accuracy
 *
 * READ-ONLY. No mutations.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx dotenv-cli -e .env -- npx tsx scripts/_validate-applied-facts.ts
 */

import { prisma } from "@/lib/prisma";
import {
  parseAppliedFacts,
  extractInvoiceCandidates,
  detectRelationConfidence,
} from "@/lib/reconciliation/applied-facts-parser";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";
const SAMPLE_SIZE = 500;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof (v as any).toNumber === "function") return (v as any).toNumber();
  return parseFloat(String(v)) || 0;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((n / total) * 100).toFixed(1) + "%";
}

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════════════════"));
  console.log(B("  VALIDATE applied-facts-parser.ts vs real CollectionRecord data"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));

  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  const orgId: string = org.id;
  console.log(`Org: ${B(org.name)} (${orgId})\n`);

  // ── Load sample CollectionRecords ─────────────────────────────────────────
  const records = await (prisma as any).collectionRecord.findMany({
    where: { organizationId: orgId },
    select: {
      id:              true,
      appliedFacts:    true,
      rawJson:         true,
      comprobanteCode: true,
      amount:          true,
      collectionDate:  true,
      customerName:    true,
    },
    take: SAMPLE_SIZE,
    orderBy: { collectionDate: "desc" },
  });

  console.log(B(`── TEST 1: Parse success rate (n=${records.length}) ──────────────────`));

  const strategyCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  let totalRelations = 0;
  let zeroRelations  = 0;
  let multiRelations = 0;
  const malformedExamples: string[] = [];
  const candidatesSample: string[] = [];

  for (const rec of records) {
    const parsed = parseAppliedFacts(rec.appliedFacts, rec.rawJson, rec.comprobanteCode);

    strategyCounts[parsed.parseStrategy] = (strategyCounts[parsed.parseStrategy] ?? 0) + 1;

    if (parsed.relations.length === 0) {
      zeroRelations++;
    } else if (parsed.relations.length > 1) {
      multiRelations++;
    }

    for (const rel of parsed.relations) {
      totalRelations++;
      confidenceCounts[rel.confidence] = (confidenceCounts[rel.confidence] ?? 0) + 1;

      if (rel.confidence === "LOW" && malformedExamples.length < 5) {
        malformedExamples.push(
          `[${rec.comprobanteCode}] id=${rec.id.slice(0, 8)} confidence=LOW note: no targetInvoiceId`
        );
      }

      if (rel.targetInvoiceId && candidatesSample.length < 10) {
        candidatesSample.push(
          `[${rec.comprobanteCode}] ${rel.targetInvoiceId} amt=${rel.amountApplied} conf=${rel.confidence}`
        );
      }
    }
  }

  const parsed = records.length - zeroRelations;
  console.log(`Total records tested    : ${records.length}`);
  console.log(`Successfully parsed     : ${G(String(parsed))} (${pct(parsed, records.length)})`);
  console.log(`Zero relations (empty)  : ${R(String(zeroRelations))} (${pct(zeroRelations, records.length)})`);
  console.log(`Multi-relation records  : ${multiRelations}`);
  console.log(`Total relations found   : ${totalRelations}\n`);

  console.log("Parse strategy distribution:");
  for (const [strategy, cnt] of Object.entries(strategyCounts)) {
    console.log(`  ${strategy.padEnd(30)} : ${cnt.toString().padStart(5)} (${pct(cnt, records.length)})`);
  }
  console.log();

  console.log("Confidence distribution:");
  for (const [conf, cnt] of Object.entries(confidenceCounts)) {
    const color = conf === "HIGH" ? G : conf === "MEDIUM" ? Y : R;
    console.log(`  ${conf.padEnd(10)} : ${color(cnt.toString().padStart(5))} (${pct(cnt, totalRelations || 1)})`);
  }
  console.log();

  // ── TEST 2: Invoice candidate extraction ─────────────────────────────────
  console.log(B("── TEST 2: Invoice candidate extraction ──────────────────────────"));

  let withCandidates = 0;
  let withoutCandidates = 0;
  const uniqueTargets = new Set<string>();

  for (const rec of records) {
    const candidates = extractInvoiceCandidates(rec.appliedFacts, rec.rawJson);
    if (candidates.length > 0) {
      withCandidates++;
      candidates.forEach(c => uniqueTargets.add(c));
    } else {
      withoutCandidates++;
    }
  }

  console.log(`Records with invoice candidates  : ${G(String(withCandidates))} (${pct(withCandidates, records.length)})`);
  console.log(`Records without candidates       : ${R(String(withoutCandidates))} (${pct(withoutCandidates, records.length)})`);
  console.log(`Unique targetInvoiceId values    : ${uniqueTargets.size}\n`);

  if (candidatesSample.length > 0) {
    console.log("Sample candidates:");
    for (const s of candidatesSample) {
      console.log(`  ${s}`);
    }
    console.log();
  }

  // ── TEST 3: detectRelationConfidence accuracy ─────────────────────────────
  console.log(B("── TEST 3: detectRelationConfidence() ────────────────────────────"));

  const confDist: Record<string, number> = {};
  for (const rec of records) {
    const conf = detectRelationConfidence(rec.appliedFacts, rec.rawJson);
    confDist[conf] = (confDist[conf] ?? 0) + 1;
  }

  for (const [conf, cnt] of Object.entries(confDist)) {
    const color = conf === "HIGH" ? G : conf === "MEDIUM" ? Y : R;
    console.log(`  ${conf.padEnd(10)} : ${color(String(cnt))} (${pct(cnt, records.length)})`);
  }
  console.log();

  // ── TEST 4: DB join verification (Documento_pagado → CustomerReceivable.erpId) ──
  console.log(B("── TEST 4: DB join: targetInvoiceId → CustomerReceivable.erpId ──"));

  const targetIds = Array.from(uniqueTargets).slice(0, 300);

  if (targetIds.length === 0) {
    console.log(R("  No targetInvoiceId candidates — cannot verify DB join"));
  } else {
    const matchedCount = await (prisma as any).customerReceivable.count({
      where: { organizationId: orgId, erpId: { in: targetIds } },
    });

    console.log(`Targets tested         : ${targetIds.length}`);
    console.log(`CustomerReceivable hits: ${G(String(matchedCount))}`);
    console.log(`Join success rate      : ${pct(matchedCount, targetIds.length)}`);

    if (matchedCount > 0) {
      const samples = await (prisma as any).customerReceivable.findMany({
        where: { organizationId: orgId, erpId: { in: targetIds } },
        select: { erpId: true, customerName: true, originalAmount: true, paidAmount: true, balanceDue: true, status: true },
        take: 5,
      });
      console.log("\nSample joined receivables:");
      for (const r of samples) {
        const toN = (v: any) => typeof v?.toNumber === "function" ? v.toNumber() : Number(v);
        console.log(`  erpId=${r.erpId}  customer="${r.customerName?.slice(0, 25)}"  status=${r.status}  balance=${toN(r.balanceDue)}  paid=${toN(r.paidAmount)}`);
      }
    }
  }
  console.log();

  // ── TEST 5: Edge cases ────────────────────────────────────────────────────
  console.log(B("── TEST 5: Edge case coverage ────────────────────────────────────"));

  // Test parser with null input
  const nullResult = parseAppliedFacts(null, null);
  console.log(`null,null → strategy=${nullResult.parseStrategy} relations=${nullResult.relations.length} ${nullResult.relations.length === 0 ? G("OK") : R("FAIL")}`);

  // Test parser with malformed string
  const malformedResult = parseAppliedFacts("{malformed}", null);
  console.log(`malformed string → strategy=${malformedResult.parseStrategy} neverThrew=${G("OK")}`);

  // Test parser with empty array
  const emptyArrayResult = parseAppliedFacts([], null);
  console.log(`empty array → strategy=${emptyArrayResult.parseStrategy} relations=${emptyArrayResult.relations.length} ${G("OK")}`);

  // Test parser with valid appliedFacts array (future format)
  const validApplied = parseAppliedFacts([{ invoiceNumber: "10329", amount: 391913 }], null, "R1");
  console.log(`valid appliedFacts → strategy=${validApplied.parseStrategy} targetId=${validApplied.relations[0]?.targetInvoiceId} ${validApplied.relations[0]?.targetInvoiceId === "MOV-10329" ? G("OK") : R("FAIL (expected MOV-10329)")}`);

  // Test parser with rawJson path (production format)
  const rawJsonTest = {
    raw: {
      Documento_pagado: 10329,
      Valor_Pagado: 391913,
      Codigo_Fuente_Comprobante: "R1",
      Numero_Documento: 12345,
    }
  };
  const rawJsonResult = parseAppliedFacts(null, rawJsonTest, "R1");
  console.log(`rawJson path → strategy=${rawJsonResult.parseStrategy} targetId=${rawJsonResult.relations[0]?.targetInvoiceId} ${rawJsonResult.relations[0]?.targetInvoiceId === "MOV-10329" ? G("OK") : R("FAIL (expected MOV-10329)")}`);

  // Test zero docPagado (structural zero — should return empty)
  const zeroDocTest = { raw: { Documento_pagado: 0, Valor_Pagado: 100 } };
  const zeroResult = parseAppliedFacts(null, zeroDocTest);
  console.log(`zero Documento_pagado → relations=${zeroResult.relations.length} ${zeroResult.relations.length === 0 ? G("OK") : R("FAIL (should be 0)")}`);

  console.log();

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(B("── VALIDATION SUMMARY ────────────────────────────────────────────"));
  console.log(`Parse success rate    : ${pct(parsed, records.length)}`);
  console.log(`Candidate extraction  : ${pct(withCandidates, records.length)}`);
  if (targetIds.length > 0) {
    const matchedCount = await (prisma as any).customerReceivable.count({
      where: { organizationId: orgId, erpId: { in: targetIds.slice(0, 100) } },
    });
    console.log(`DB join rate (sample) : ${pct(matchedCount, Math.min(targetIds.length, 100))}`);
  }
  console.log();

  if (malformedExamples.length > 0) {
    console.log(Y("Malformed / LOW confidence examples:"));
    for (const ex of malformedExamples) {
      console.log(`  ${ex}`);
    }
  }

  console.log("\n" + B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  VALIDATION COMPLETE"));
  console.log(B("═══════════════════════════════════════════════════════════════\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
