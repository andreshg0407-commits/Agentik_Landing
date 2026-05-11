/**
 * _auto-reconcile-probe.ts
 *
 * Runs autoReconcileFromSAG with dryRun=true and prints the result.
 * NEVER writes to DB.
 *
 * Usage:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_auto-reconcile-probe')"
 *   # with customer filter:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_auto-reconcile-probe')" -- --customer-id cmnjaig7h0kdy7yy5x1ig4w4x
 *   # with invoice filter:
 *   node --env-file=.env -e "require('tsx/cjs'); require('./scripts/_auto-reconcile-probe')" -- --invoice-id <rxId>
 *
 * Flags:
 *   --org          org slug   (default: castillitos)
 *   --customer-id  CustomerProfile.id
 *   --invoice-id   CustomerReceivable.id
 *   --limit        max invoices (default 100)
 */

import { prisma }       from "@/lib/prisma";
import { autoReconcileFromSAG, formatAutoReconcileResult } from "@/lib/finance/auto-reconcile";

function argAfter(flag: string): string | null {
  const args = process.argv;
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const ORG_SLUG    = argAfter("--org")         ?? "castillitos";
const CUSTOMER_ID = argAfter("--customer-id") ?? null;
const INVOICE_ID  = argAfter("--invoice-id")  ?? null;
const LIMIT       = parseInt(argAfter("--limit") ?? "100", 10);

async function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  AUTO-RECONCILE — DRY RUN PROBE (no DB writes)  ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const org = await (prisma as any).organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  }) as { id: string; name: string } | null;

  if (!org) { console.error(`Org not found: ${ORG_SLUG}`); process.exit(1); }
  console.log(`Org: ${org.name}  (${org.id})`);
  if (CUSTOMER_ID) console.log(`Customer: ${CUSTOMER_ID}`);
  if (INVOICE_ID)  console.log(`Invoice:  ${INVOICE_ID}`);
  console.log(`Limit: ${LIMIT}\n`);

  const result = await autoReconcileFromSAG({
    organizationId: org.id,
    customerId:     CUSTOMER_ID ?? undefined,
    invoiceId:      INVOICE_ID  ?? undefined,
    dryRun:         true,
    limit:          LIMIT,
  });

  console.log(formatAutoReconcileResult(result));
  console.log("\nProbe complete — dryRun=true, zero writes.\n");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
