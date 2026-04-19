/**
 * source-alerts.ts
 *
 * SAG Source-Aware Layer — Action Bridge
 *
 * Generates BusinessAlert entries for source-related anomalies:
 *
 *   ABRIR_ALERTA_OPERATIVA:
 *     - F2/F1 mismatch: remisión ratio too high → executive KPI distortion risk
 *     - High-confidence duplicate detected (same business event in both sources)
 *
 *   CREAR_ACCION_COBRANZA:
 *     - Orphan remisión aged ≥ HIGH threshold (15 days) without matching invoice
 *     - Customer has multiple aged orphan F2 records → escalate to collection team
 *
 *   ESCALAR_A_GERENCIA:
 *     - F2 share of total revenue > critical threshold (40%)
 *     - CRITICAL orphan remisión (≥30 days) with high value
 *
 * Deduplication: @@unique([organizationId, type, entityKey, period])
 * Safe to re-run — upserts existing alerts with refreshed numbers.
 *
 * Called after import batch via generateSalesAlerts in alert-engine.ts,
 * or on-demand via API route.
 */

import { prisma }       from "@/lib/prisma";
import { AlertSeverity } from "@prisma/client";
import { getLatestPeriod } from "./reports";
import { getPersistedOrphans, getOrphanSummary } from "./source-dedup";
import { getSourceSplitOverview } from "@/lib/finance/fpa-queries";
import { assessRemisionRisk } from "@/lib/sag/source-inference";

// ── Thresholds ────────────────────────────────────────────────────────────────

/** F2 share > this % → WARNING alert for revenue executives. */
const F2_SHARE_WARNING_PCT   = 25;
/** F2 share > this % → CRITICAL alert. */
const F2_SHARE_CRITICAL_PCT  = 40;
/** Orphan remisión age (days) → triggers CREAR_ACCION_COBRANZA. */
const ORPHAN_COBRANZA_DAYS   = 15;
/** Orphan remisión age (days) → triggers ESCALAR_A_GERENCIA. */
const ORPHAN_ESCALAR_DAYS    = 30;
/** Minimum orphan F2 amount (COP) to generate a collection alert. */
const MIN_ORPHAN_AMOUNT      = 1_000_000; // $1M COP

// ── Internal alert input type ────────────────────────────────────────────────

interface AlertInput {
  organizationId: string;
  module:         string;
  type:           string;
  severity:       AlertSeverity;
  title:          string;
  message:        string;
  entityType:     string;
  entityKey:      string;
  entityLabel:    string;
  period:         string;
  payloadJson:    object;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Generate source-aware alerts for an organization.
 * Called fire-and-forget after import, or on-demand from admin routes.
 *
 * @param organizationId
 * @param periodoAoMes   YYYYMM period to evaluate. Defaults to latest.
 */
export async function generateSourceAlerts(
  organizationId: string,
  periodoAoMes?:  string,
): Promise<{ generated: number; period: string }> {
  const period = periodoAoMes ?? await getLatestPeriod(organizationId).catch(() => "");
  if (!period) return { generated: 0, period: "" };

  const alerts: AlertInput[] = [];

  // ── 1. F2 share alert ──────────────────────────────────────────────────────
  try {
    const split = await getSourceSplitOverview(organizationId, period);
    if (split.hasData && split.f2SharePct >= F2_SHARE_WARNING_PCT) {
      const isCritical = split.f2SharePct >= F2_SHARE_CRITICAL_PCT;
      alerts.push({
        organizationId,
        module:       "source_aware",
        type:         "source_f2_share_high",
        severity:     isCritical ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
        title:        isCritical
          ? `Fuente 2 supera el ${F2_SHARE_CRITICAL_PCT}% del total — riesgo ejecutivo`
          : `Fuente 2 representa ${split.f2SharePct.toFixed(0)}% de las ventas — revisar`,
        message:
          `En el período ${period}, el ${split.f2SharePct.toFixed(1)}% de las ventas (${fmtCOP(split.f2Amount)}) ` +
          `corresponde a Fuente 2 (remisiones/despachos) y solo el ${split.f1SharePct.toFixed(1)}% ` +
          `(${fmtCOP(split.f1Amount)}) son facturas oficiales (Fuente 1). ` +
          `Los KPIs ejecutivos de ingresos solo reflejan Fuente 1. Revisar conversión.`,
        entityType:   "organization",
        entityKey:    organizationId,
        entityLabel:  "Organización",
        period,
        payloadJson:  {
          f1Amount: split.f1Amount,
          f2Amount: split.f2Amount,
          f2SharePct: split.f2SharePct,
          conversionRate: split.conversionRate,
          legacyAssumedPct: split.legacyAssumedPct,
        },
      });
    }
  } catch (_) { /* graceful — fpa-queries may fail if no data */ }

  // ── 2. Orphan remision alerts ──────────────────────────────────────────────
  // Uses getOrphanSummary() which reads from SourceMatchRecord (fast indexed reads).
  // Falls back to in-memory dedup if the table has not yet been populated for this period.
  try {
    const orphanSummary = await getOrphanSummary(organizationId, period);
    const orphans       = await getPersistedOrphans(organizationId, period, 0);

    const hasData    = orphanSummary.totalOrphans > 0;
    const orphanCount = orphanSummary.totalOrphans;

    if (hasData && orphanCount > 0) {
      // Group orphans by seller for per-seller alerts
      const bySellerMap = new Map<string, {
        label: string; count: number; amount: number; maxDays: number;
      }>();

      for (const o of orphans) {
        if (o.f2Amount < MIN_ORPHAN_AMOUNT) continue;
        const ex = bySellerMap.get(o.sellerSlug) ?? {
          label: o.sellerSlug, count: 0, amount: 0, maxDays: 0,
        };
        ex.count++;
        ex.amount  += o.f2Amount;
        ex.maxDays = Math.max(ex.maxDays, o.orphanDays);
        bySellerMap.set(o.sellerSlug, ex);
      }

      for (const [sellerSlug, v] of bySellerMap) {
        const risk = assessRemisionRisk(v.maxDays);

        if (v.maxDays >= ORPHAN_ESCALAR_DAYS) {
          // CRITICAL orphan → ESCALAR_A_GERENCIA
          alerts.push({
            organizationId,
            module:       "source_aware",
            type:         "source_orphan_escalar",
            severity:     AlertSeverity.CRITICAL,
            title:        `Remisiones sin factura: ${v.label} — ${v.maxDays} días sin convertir`,
            message:
              `${v.count} remisión${v.count > 1 ? "es" : ""} del vendedor ${v.label} ` +
              `por ${fmtCOP(v.amount)} llevan más de ${v.maxDays} días sin convertirse ` +
              `a factura oficial (Fuente 1). Riesgo CRÍTICO de pérdida de ingresos. ` +
              `Escalar a gerencia para gestión inmediata.`,
            entityType:   "seller",
            entityKey:    sellerSlug,
            entityLabel:  v.label,
            period,
            payloadJson:  { sellerSlug, orphanCount: v.count, orphanAmount: v.amount, maxDays: v.maxDays, risk },
          });
        } else if (v.maxDays >= ORPHAN_COBRANZA_DAYS) {
          // HIGH orphan → CREAR_ACCION_COBRANZA
          alerts.push({
            organizationId,
            module:       "source_aware",
            type:         "source_orphan_cobranza",
            severity:     AlertSeverity.WARNING,
            title:        `Remisiones pendientes de facturar: ${v.label} — acción de cobro`,
            message:
              `${v.count} remisión${v.count > 1 ? "es" : ""} del vendedor ${v.label} ` +
              `por ${fmtCOP(v.amount)} llevan ${v.maxDays} días sin factura oficial. ` +
              `Iniciar seguimiento de cobranza para asegurar la conversión a Fuente 1.`,
            entityType:   "seller",
            entityKey:    sellerSlug,
            entityLabel:  v.label,
            period,
            payloadJson:  { sellerSlug, orphanCount: v.count, orphanAmount: v.amount, maxDays: v.maxDays, risk },
          });
        }
      }

      // Org-level operational alert if there are any orphans worth flagging
      const totalOrphanAmount = orphans
        .filter(o => o.f2Amount >= MIN_ORPHAN_AMOUNT)
        .reduce((s, o) => s + o.f2Amount, 0);

      if (totalOrphanAmount > 0) {
        const riskCounts = orphanSummary.byRisk;
        alerts.push({
          organizationId,
          module:       "source_aware",
          type:         "source_orphan_summary",
          severity:     riskCounts.critical.count > 0
            ? AlertSeverity.CRITICAL
            : riskCounts.high.count > 0 ? AlertSeverity.WARNING : AlertSeverity.INFO,
          title:        `${orphanCount} remisión${orphanCount > 1 ? "es" : ""} sin factura oficial — ${period}`,
          message:
            `${orphanCount} despacho${orphanCount > 1 ? "s" : ""} (Fuente 2) ` +
            `por ${fmtCOP(totalOrphanAmount)} no tienen una factura oficial (Fuente 1) ` +
            `en el período ${period}. ` +
            `Riesgo crítico: ${riskCounts.critical.count} | Alto: ${riskCounts.high.count} | ` +
            `Medio: ${riskCounts.medium.count} | Bajo: ${riskCounts.low.count}.`,
          entityType:   "organization",
          entityKey:    `${organizationId}:orphan`,
          entityLabel:  "Remisiones sin factura",
          period,
          payloadJson:  {
            orphanCount,
            orphanAmount:   totalOrphanAmount,
            conversionRate: orphanSummary.conversionRate,
            orphansByRisk:  {
              critical: riskCounts.critical.count,
              high:     riskCounts.high.count,
              medium:   riskCounts.medium.count,
              low:      riskCounts.low.count,
            },
          },
        });
      }
    }
  } catch (_) { /* graceful */ }

  // ── Upsert all alerts ──────────────────────────────────────────────────────
  let generated = 0;
  for (const a of alerts) {
    try {
      await prisma.businessAlert.upsert({
        where: {
          organizationId_type_entityKey_period: {
            organizationId: a.organizationId,
            type:           a.type,
            entityKey:      a.entityKey,
            period:         a.period,
          },
        },
        create: {
          organizationId: a.organizationId,
          module:         a.module,
          type:           a.type,
          severity:       a.severity,
          status:         "OPEN",
          title:          a.title,
          message:        a.message,
          entityType:     a.entityType,
          entityKey:      a.entityKey,
          entityLabel:    a.entityLabel,
          period:         a.period,
          payloadJson:    a.payloadJson,
        },
        update: {
          severity:    a.severity,
          title:       a.title,
          message:     a.message,
          payloadJson: a.payloadJson,
          status:      "OPEN",
          resolvedAt:  null,
        },
      });
      generated++;
    } catch (_) { /* skip individual failures */ }
  }

  return { generated, period };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}
