/**
 * scripts/_diag-cobros-raw.ts
 *
 * Audit de campos SAG para cobros con amount=0 en SaleRecord.
 * Objetivo: encontrar qué campo del rawJson contiene el monto real.
 *
 * Usage: ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_diag-cobros-raw.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

// Códigos a auditar: cobros con amount=0 conocido
const CODES = ["R1", "R2", "RS", "RC", "RG", "RA", "SI"];

// Candidatos a monto real según convención SAG PYA
const CANDIDATE_FIELDS = [
  "sc_valor_total",
  "sc_valor_documento",
  "sc_valor_aplicado",
  "sc_valor_recibo",
  "sc_valor_abono",
  "sc_total",
  "sc_valor_neto",
  "sc_base_iva",
  "sc_iva",
  "sc_valor_pagado",
  "sc_cobros",
  "sc_saldo",
  "ka_sc_valor_total",
  "ka_sc_valor_documento",
  "ka_sc_valor_aplicado",
  "ka_sc_valor_recibo",
  "ka_sc_valor_abono",
  "ka_sc_saldo",
  "ka_sc_cobros",
  "ka_co_valor",
  "ka_co_total",
];

function toFloat(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

async function main() {
  const org = await prisma.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error(`ORG NOT FOUND: ${ORG_SLUG}`); process.exit(1); }
  console.log(`\nORG: ${org.id} — ${org.name}`);
  console.log(`Auditando códigos: ${CODES.join(", ")}\n`);

  for (const code of CODES) {
    console.log("═".repeat(72));
    console.log(`CÓDIGO: ${code}`);
    console.log("═".repeat(72));

    // Get 5 rows with real saleDate (recent), preferring non-null saleDate
    type Row = { id: string; amount: string | null; saleDate: Date | null; rawJson: unknown };
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT id,
             CAST("amount" AS TEXT) AS amount,
             "saleDate",
             "rawJson"
      FROM "SaleRecord"
      WHERE "organizationId" = ${org.id}
        AND "comprobanteCode" = ${code}
      ORDER BY "saleDate" DESC NULLS LAST
      LIMIT 5
    `);

    if (rows.length === 0) {
      console.log(`  [sin registros para ${code}]\n`);
      continue;
    }

    console.log(`  ${rows.length} fila(s) encontradas\n`);

    for (const [i, row] of rows.entries()) {
      const raw = row.rawJson as Record<string, unknown> | null;
      console.log(`  ── Fila ${i + 1} ─────────────────────────────────────────────`);
      console.log(`     id=${row.id}  amount_stored=${row.amount ?? "NULL"}  saleDate=${row.saleDate?.toISOString().slice(0, 10) ?? "NULL"}`);

      if (!raw) {
        console.log("     rawJson: NULL\n");
        continue;
      }

      // ── Campos candidatos con valor ──────────────────────────────────────
      const hits: Array<{ field: string; value: unknown; asFloat: number | null }> = [];
      for (const field of CANDIDATE_FIELDS) {
        if (field in raw) {
          hits.push({ field, value: raw[field], asFloat: toFloat(raw[field]) });
        }
      }

      if (hits.length > 0) {
        console.log("     CANDIDATOS encontrados:");
        for (const h of hits) {
          const fv = h.asFloat != null ? `  → ${h.asFloat.toLocaleString("es-CO")}` : "";
          console.log(`       ${h.field.padEnd(30)} = ${JSON.stringify(h.value)}${fv}`);
        }
      } else {
        console.log("     CANDIDATOS: ninguno de la lista encontrado en rawJson");
      }

      // ── Todos los campos numéricos del rawJson ───────────────────────────
      const numericFields: Array<{ field: string; value: unknown; asFloat: number }> = [];
      for (const [k, v] of Object.entries(raw)) {
        const f = toFloat(v);
        if (f != null && f !== 0) {
          numericFields.push({ field: k, value: v, asFloat: f });
        }
      }

      if (numericFields.length > 0) {
        console.log("     CAMPOS NUMÉRICOS NO-CERO en rawJson:");
        for (const n of numericFields.sort((a, b) => Math.abs(b.asFloat) - Math.abs(a.asFloat))) {
          console.log(`       ${n.field.padEnd(30)} = ${JSON.stringify(n.value)}  → ${n.asFloat.toLocaleString("es-CO")}`);
        }
      } else {
        console.log("     CAMPOS NUMÉRICOS NO-CERO: ninguno encontrado");
      }

      // ── Claves del rawJson (para inventario completo) ────────────────────
      const allKeys = Object.keys(raw);
      console.log(`     TODAS LAS CLAVES (${allKeys.length}): ${allKeys.join(", ")}`);
      console.log();
    }

    // ── Resumen: ¿hay algún campo con valor > 0 consistente? ────────────
    console.log(`  RESUMEN ESTADÍSTICO para ${code}:`);
    for (const field of CANDIDATE_FIELDS) {
      const agg = await prisma.$queryRaw<Array<{ cnt: string; total: string; max_v: string }>>(Prisma.sql`
        SELECT
          CAST(COUNT(*) FILTER (WHERE ("rawJson"->>${field})::numeric IS NOT NULL AND ("rawJson"->>${field})::numeric != 0) AS TEXT) AS cnt,
          CAST(SUM(("rawJson"->>${field})::numeric) AS TEXT) AS total,
          CAST(MAX(ABS(("rawJson"->>${field})::numeric)) AS TEXT) AS max_v
        FROM "SaleRecord"
        WHERE "organizationId" = ${org.id}
          AND "comprobanteCode" = ${code}
          AND ("rawJson"->>${field}) IS NOT NULL
      `).catch(() => null);

      if (agg && agg[0] && Number(agg[0].cnt) > 0) {
        console.log(`    ${field.padEnd(30)}  non-zero=${agg[0].cnt.padStart(6)}  sum=${(agg[0].total ?? "?").padStart(18)}  max=${agg[0].max_v ?? "?"}`);
      }
    }
    console.log();
  }

  console.log("\n");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
