/**
 * _probe-sag-invoice-associated-docs.ts
 *
 * Read-only audit: surfaces which CollectionRecord rows in DB have appliedFacts
 * that reference open CustomerReceivable invoice numbers.
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_probe-sag-invoice-associated-docs')"
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_probe-sag-invoice-associated-docs')" -- --customer-id cmnjaig7h0kdy7yy5x1ig4w4x
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_probe-sag-invoice-associated-docs')" -- --invoice-number FE-1234
 *
 * Flags (all optional):
 *   --org            org slug  (default: castillitos)
 *   --customer-id    CustomerProfile.id
 *   --invoice-number invoice number filter
 *
 * Output: console only — NEVER writes to DB.
 */

import { prisma } from "@/lib/prisma";
import { Prisma, JsonNullValueFilter } from "@prisma/client";

// ── CLI args ──────────────────────────────────────────────────────────────────

function argAfter(flag: string): string | null {
  const args = process.argv;
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const ORG_SLUG      = argAfter("--org")            ?? "castillitos";
const CUSTOMER_ID   = argAfter("--customer-id")    ?? null;
const INV_NUMBER    = argAfter("--invoice-number")  ?? null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function classifyCode(code: string): "PAGO" | "ND" | "AJUSTE" {
  const u = code.toUpperCase();
  if (u === "AN") return "AJUSTE";                         // Anulación
  if (u.startsWith("ND") || u === "N") return "ND";       // Nota descuento
  return "PAGO";                                           // R1 R2 RS RC RG RA SI etc.
}

function classifyRef(ref: string | null | undefined): "ND" | "AJUSTE" | null {
  if (!ref) return null;
  const u = ref.toUpperCase();
  if (u.includes("ND") || u.includes("DESCUENTO") || u.includes("NOTA DEBITO") || u.includes("NOTA DE")) return "ND";
  if (u.includes("AJUSTE") || u.includes("CORREC") || u.includes("ANULA")) return "AJUSTE";
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  PROBE — SAG Invoice Associated Documents (read-only)        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // 1. Resolve org
  const org = await (prisma as any).organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  }) as { id: string; name: string } | null;
  if (!org) { console.error(`Org not found: ${ORG_SLUG}`); process.exit(1); }
  console.log(`Org: ${org.name} (${org.id})`);
  if (CUSTOMER_ID) console.log(`Customer filter: ${CUSTOMER_ID}`);
  if (INV_NUMBER)  console.log(`Invoice filter: ${INV_NUMBER}`);
  console.log("");

  // 2. Load open CustomerReceivable docs
  const rxWhere: Record<string, unknown> = {
    organizationId: org.id,
    status: { in: ["OPEN", "OVERDUE", "PARTIAL"] },
  };
  if (CUSTOMER_ID) rxWhere.customerId  = CUSTOMER_ID;
  if (INV_NUMBER)  rxWhere.invoiceNumber = INV_NUMBER;

  const receivables = await (prisma as any).customerReceivable.findMany({
    where:   rxWhere,
    orderBy: { dueDate: "asc" },
    take:    100,
    select: {
      id: true, invoiceNumber: true, originalAmount: true,
      balanceDue: true, status: true, dueDate: true, customerId: true, customerName: true,
    },
  }) as Array<{
    id: string; invoiceNumber: string | null; originalAmount: unknown;
    balanceDue: unknown; status: string; dueDate: Date;
    customerId: string | null; customerName: string;
  }>;

  console.log(`━━━ Open receivables found: ${receivables.length} ━━━\n`);
  if (receivables.length === 0) {
    console.log("No open receivables — nothing to probe.");
    return;
  }

  // 3. Collect all invoice numbers for bulk query
  const invoiceNumbers = receivables
    .map(r => r.invoiceNumber)
    .filter((n): n is string => n !== null && n !== "");

  console.log(`Invoice numbers to probe: ${invoiceNumbers.length}`);
  console.log(invoiceNumbers.slice(0, 10).join(", ") + (invoiceNumbers.length > 10 ? " ..." : ""));
  console.log("");

  // 4. Find CollectionRecord rows with appliedFacts referencing these invoices
  //    Use JSONB containment: appliedFacts @> '[{"invoiceNumber":"X"}]'
  //    Run one query per invoice to get clear matches (100 max = safe)
  const matchMap = new Map<string, Array<{
    crId: string; code: string; docNumber: string | null; collectionDate: Date;
    amount: number; appliedFacts: unknown; documentType: "PAGO" | "ND" | "AJUSTE";
    alreadyApplied: boolean; paymentRecordId: string | null;
  }>>();

  let totalCRRows = 0;

  for (const invNum of invoiceNumbers) {
    const crRows = await prisma.$queryRaw<Array<{
      id: string; comprobanteCode: string; documentNumber: string | null;
      collectionDate: Date; amount: unknown; appliedFacts: unknown;
      appliedStatus: string; paymentRecordId: string | null;
    }>>(Prisma.sql`
      SELECT
        id, "comprobanteCode", "documentNumber",
        "collectionDate", amount, "appliedFacts",
        "appliedStatus", "paymentRecordId"
      FROM "CollectionRecord"
      WHERE "organizationId" = ${org.id}
        AND "appliedFacts" IS NOT NULL
        AND "appliedFacts" @> ${JSON.stringify([{ invoiceNumber: invNum }])}::jsonb
      ORDER BY "collectionDate" ASC
    `);

    if (crRows.length > 0) {
      totalCRRows += crRows.length;
      matchMap.set(invNum, crRows.map(cr => {
        const codeType = classifyCode(cr.comprobanteCode);
        const refType  = classifyRef(cr.documentNumber);
        const docType  = refType ?? codeType;
        return {
          crId:            cr.id,
          code:            cr.comprobanteCode,
          docNumber:       cr.documentNumber ?? null,
          collectionDate:  cr.collectionDate,
          amount:          typeof (cr.amount as any)?.toNumber === "function"
                             ? (cr.amount as any).toNumber()
                             : Number(cr.amount ?? 0),
          appliedFacts:    cr.appliedFacts,
          documentType:    docType,
          alreadyApplied:  cr.appliedStatus === "APPLIED" || !!cr.paymentRecordId,
          paymentRecordId: cr.paymentRecordId,
        };
      }));
    }
  }

  // 5. Also look at CollectionRecord for this customer with no appliedFacts — orphans
  const orphanWhere: Record<string, unknown> = { organizationId: org.id };
  if (CUSTOMER_ID) {
    // Need to join via sagTerceroId / customerNit — get profile first
    const profile = await (prisma as any).customerProfile.findFirst({
      where:  { id: CUSTOMER_ID, organizationId: org.id },
      select: { sagTerceroId: true, nit: true, nitNormalized: true },
    }) as { sagTerceroId: number | null; nit: string | null; nitNormalized: string | null } | null;
    if (profile) {
      const nits = [
        profile.sagTerceroId != null ? String(profile.sagTerceroId) : null,
        profile.nit,
        profile.nitNormalized,
      ].filter(Boolean);
      if (nits.length > 0) {
        (orphanWhere as any).customerNit = { in: nits };
      }
    }
  }

  const orphans = await (prisma as any).collectionRecord.findMany({
    where: { ...orphanWhere, appliedFacts: { equals: Prisma.JsonNull } },
    take:  20,
    select: {
      id: true, comprobanteCode: true, documentNumber: true,
      collectionDate: true, amount: true, appliedStatus: true, customerNit: true,
    },
  }) as Array<{
    id: string; comprobanteCode: string; documentNumber: string | null;
    collectionDate: Date; amount: unknown; appliedStatus: string; customerNit: string | null;
  }>;

  // 6. Print results per invoice
  console.log("━━━ Per-invoice associated document breakdown ━━━\n");

  let fullyLinked    = 0;
  let partiallyLinked = 0;
  let noLink         = 0;

  for (const rx of receivables) {
    const inv   = rx.invoiceNumber ?? "(no number)";
    const orig  = typeof (rx.originalAmount as any)?.toNumber === "function"
                    ? (rx.originalAmount as any).toNumber()
                    : Number(rx.originalAmount ?? 0);
    const bal   = typeof (rx.balanceDue as any)?.toNumber === "function"
                    ? (rx.balanceDue as any).toNumber()
                    : Number(rx.balanceDue ?? 0);
    const matches = matchMap.get(inv ?? "") ?? [];

    const appliedTotal = matches.reduce((s, m) => s + m.amount, 0);
    const remaining    = orig - appliedTotal;
    const recoStatus   = matches.length === 0 ? "SIN_SOPORTE"
                         : remaining < -0.01   ? "EXCESO"
                         : remaining < 0.01    ? "CONCILIADA"
                         : "PARCIAL";

    if (recoStatus === "CONCILIADA") fullyLinked++;
    else if (recoStatus === "PARCIAL") partiallyLinked++;
    else noLink++;

    const icon = recoStatus === "CONCILIADA" ? "✅"
                 : recoStatus === "PARCIAL"   ? "🟡"
                 : recoStatus === "EXCESO"     ? "🔴"
                 : "⬜";

    console.log(`${icon}  Factura: ${inv}  |  ${rx.customerName}`);
    console.log(`    Original: ${fmtCOP(orig)}  |  Saldo DB: ${fmtCOP(bal)}  |  Estado: ${rx.status}`);
    console.log(`    Docs SAG encontrados: ${matches.length}  |  Total aplicado: ${fmtCOP(appliedTotal)}  |  → ${recoStatus}`);

    if (matches.length > 0) {
      for (const m of matches) {
        const applied = m.alreadyApplied ? " [YA APLICADO]" : "";
        console.log(`    ├─ ${m.code}  ${m.docNumber ?? "—"}  ${m.collectionDate.toISOString().slice(0, 10)}  ${fmtCOP(m.amount)}  → ${m.documentType}${applied}`);
        if (m.paymentRecordId) {
          console.log(`    │  └─ PaymentRecord: ${m.paymentRecordId}`);
        }
      }
    }
    console.log("");
  }

  // 7. Summary
  console.log("━━━ Summary ━━━");
  console.log(`Invoices scanned:         ${receivables.length}`);
  console.log(`CollectionRecord matches: ${totalCRRows}`);
  console.log(`  ✅ CONCILIADA:          ${fullyLinked}`);
  console.log(`  🟡 PARCIAL:             ${partiallyLinked}`);
  console.log(`  ⬜ SIN SOPORTE:         ${noLink}`);
  console.log("");

  // 8. Orphan collections (no appliedFacts)
  if (orphans.length > 0) {
    console.log(`━━━ Cobros sin appliedFacts (primer ${orphans.length}) ━━━`);
    for (const o of orphans) {
      const amt = typeof (o.amount as any)?.toNumber === "function"
        ? (o.amount as any).toNumber() : Number(o.amount ?? 0);
      console.log(`  ${o.comprobanteCode}  ${o.documentNumber ?? "—"}  ${o.collectionDate.toISOString().slice(0, 10)}  ${fmtCOP(amt)}  NIT: ${o.customerNit ?? "—"}  [${o.appliedStatus}]`);
    }
    console.log("");
  }

  // 9. Code distribution
  const allCRs = await (prisma as any).collectionRecord.groupBy({
    by:     ["comprobanteCode"],
    where:  { organizationId: org.id },
    _count: { _all: true },
    _sum:   { amount: true },
    orderBy: { _count: { comprobanteCode: "desc" } },
  }) as Array<{ comprobanteCode: string; _count: { _all: number }; _sum: { amount: unknown } }>;

  if (allCRs.length > 0) {
    console.log("━━━ CollectionRecord distribution by comprobanteCode (org-wide) ━━━");
    for (const row of allCRs) {
      const total = typeof (row._sum.amount as any)?.toNumber === "function"
        ? (row._sum.amount as any).toNumber()
        : Number(row._sum.amount ?? 0);
      const dtype = classifyCode(row.comprobanteCode);
      console.log(`  ${row.comprobanteCode.padEnd(4)}  cnt=${String(row._count._all).padStart(5)}  total=${fmtCOP(total).padStart(20)}  → ${dtype}`);
    }
    console.log("");
  }

  console.log("Probe complete — no writes performed.\n");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
