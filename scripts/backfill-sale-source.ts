/**
 * scripts/backfill-sale-source.ts
 *
 * SAG Source-Aware Layer — Backfill Script (Sprint 2 — extended)
 *
 * Backfills three fields for all existing SaleRecord rows:
 *   - sagSourceType       (OFICIAL | REMISION)
 *   - sourceDocumentStage (FACTURADO | REMITIDO | DESPACHADO | PENDIENTE)
 *   - sourceInferredFrom  ("family" | "code_pattern" | "legacy" | ...)
 *
 * Safe to run multiple times (idempotent) — only updates rows where the
 * inferred values differ from current stored values.
 *
 * Run:
 *   npx tsx scripts/backfill-sale-source.ts
 *
 * NOTE: The raw SQL migration (prisma/migrations/20260405000000_sale_source_type/
 * and 20260405000001_sale_source_inferred_from/) already performs this backfill
 * at the DB level and should be preferred. Use this script as a fallback for
 * environments where raw SQL cannot be run directly, or to re-backfill after
 * inference rule updates.
 */

import { PrismaClient } from "@prisma/client";
import { inferSourceType } from "../lib/sag/source-inference";

const prisma = new PrismaClient();

async function main() {
  console.log("[backfill-sale-source] Starting (Sprint 2 — with sourceInferredFrom)...");

  const BATCH_SIZE = 500;
  let cursor: string | undefined;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    // Load a batch — use `as any` because sagSourceType / sourceDocumentStage /
    // sourceInferredFrom are new fields not yet in the generated Prisma client.
    // Run `prisma generate` to remove these casts.
    const rows = await (prisma.saleRecord as any).findMany({
      select: {
        id:                  true,
        sagDocumentFamily:   true,
        sagSourceType:       true,
        sourceDocumentStage: true,
        sourceInferredFrom:  true,
        comprobanteCode:     true,
        comprobante:         true,
      },
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    }) as Array<{
      id:                  string;
      sagDocumentFamily:   string;
      sagSourceType:       string;
      sourceDocumentStage: string;
      sourceInferredFrom:  string;
      comprobanteCode:     string | null;
      comprobante:         string | null;
    }>;

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    type Update = {
      id:                  string;
      sagSourceType:       "OFICIAL" | "REMISION";
      sourceDocumentStage: "FACTURADO" | "REMITIDO" | "DESPACHADO" | "PENDIENTE";
      sourceInferredFrom:  string;
    };

    const updates: Update[] = [];

    for (const row of rows) {
      const inferred = inferSourceType({
        sagDocumentFamily: row.sagDocumentFamily as any,
        comprobanteCode:   row.comprobanteCode,
        comprobante:       row.comprobante,
      });

      // For legacy rows (sourceInferredFrom = "legacy" or "default"), the
      // inferred signal is the best we can do without the original CSV.
      // Only skip if all three values already match.
      const targetInferredFrom = inferred.inferredFrom;
      if (
        row.sagSourceType       === inferred.sagSourceType      &&
        row.sourceDocumentStage === inferred.sourceDocumentStage &&
        row.sourceInferredFrom  === targetInferredFrom
      ) {
        totalSkipped++;
        continue;
      }

      updates.push({
        id:                  row.id,
        sagSourceType:       inferred.sagSourceType,
        sourceDocumentStage: inferred.sourceDocumentStage,
        sourceInferredFrom:  targetInferredFrom,
      });
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          (prisma.saleRecord as any).update({
            where: { id: u.id },
            data: {
              sagSourceType:       u.sagSourceType,
              sourceDocumentStage: u.sourceDocumentStage,
              sourceInferredFrom:  u.sourceInferredFrom,
            },
          })
        )
      );
      totalUpdated += updates.length;
      console.log(`[backfill-sale-source] Updated ${totalUpdated} rows so far...`);
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[backfill-sale-source] Done. Updated: ${totalUpdated}, Already correct: ${totalSkipped}`);
}

main()
  .catch((err) => {
    console.error("[backfill-sale-source] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
