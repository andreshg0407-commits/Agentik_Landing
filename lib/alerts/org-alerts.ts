/**
 * lib/alerts/org-alerts.ts
 *
 * Auto-generated cartera risk alerts.
 *
 * generateCarteraAlerts(orgId) creates or refreshes up to 3 Alert records:
 *
 *   cartera.90dpd         — org has customers with maxDpd > 90 days
 *   cartera.top_debtor    — top debtor by overdueReceivable
 *   cartera.concentration — one customer holds > 20% of total overdue
 *
 * Strategy: find the most recent OPEN alert of each type.
 *   - If the signal is no longer active: resolve the open alert.
 *   - If the signal is active and the alert already exists: update the message.
 *   - If the signal is active and no open alert exists: create a new one.
 *
 * Safe to call from server actions, post-sync hooks, or scheduled jobs.
 */

import { prisma } from "@/lib/prisma";
import { isReceivableDataCertified, warmTruthStatusCache } from "@/lib/comercial/frontline/receivable-truth-status";
import { fetchCertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-service";
import type { CertifiedArSnapshot } from "@/lib/comercial/frontline/canonical-ar-types";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const CONCENTRATION_THRESHOLD_PCT = 20; // single debtor > 20% of total overdue
const TOP_DEBTOR_MIN_COP           = 5_000_000; // only alert if > $5M overdue

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

async function upsertAlert(
  organizationId: string,
  type:           string,
  payload: {
    active:   boolean;
    title:    string;
    message:  string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  // Find existing open alert of this type for the org
  const existing = await prisma.alert.findFirst({
    where: { organizationId, type, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!payload.active) {
    // Signal cleared — resolve open alert if any
    if (existing) {
      await prisma.alert.update({
        where: { id: existing.id },
        data:  { status: "RESOLVED", resolvedAt: new Date() },
      });
    }
    return;
  }

  if (existing) {
    // Already open — update message so data stays fresh
    await prisma.alert.update({
      where: { id: existing.id },
      data: {
        title:        payload.title,
        message:      payload.message,
        severity:     payload.severity,
        metadataJson: payload.metadata as object,
        updatedAt:    new Date(),
      },
    });
  } else {
    // Create new alert
    await prisma.alert.create({
      data: {
        organizationId,
        type,
        title:        payload.title,
        message:      payload.message,
        severity:     payload.severity,
        status:       "OPEN",
        sourceType:   "cartera",
        metadataJson: payload.metadata as object,
      },
    });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CarteraAlertSummary {
  generated: number;
  resolved:  number;
}

/**
 * Generate / refresh cartera risk alerts for the given org.
 *
 * @returns summary of created/updated and resolved alert count
 */
export async function generateCarteraAlerts(
  organizationId: string,
): Promise<CarteraAlertSummary> {
  // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: suppress cartera alerts when
  // receivable data is not certified. Warm UUID→slug cache so the
  // truth status registry resolves correctly when called with org UUID.
  await warmTruthStatusCache();
  if (!isReceivableDataCertified(organizationId)) {
    return { generated: 0, resolved: 0 };
  }

  // AGENTIK-RECEIVABLES-AR-TRUTH-01: source from SAG vw_agentik_cartera (CERTIFIED),
  // NOT from Prisma CustomerReceivable (phantom/inflated balances).
  const result = await fetchCertifiedArSnapshot();
  if (!result.ok) {
    // SAG unavailable — do not generate alerts from stale/phantom data
    return { generated: 0, resolved: 0 };
  }
  const snap = result.snapshot;

  // Derive alert KPIs from certified SAG snapshot
  const count90Plus = snap.customers.filter(c => c.maxDiasMora > 90).length;
  const maxDpd = snap.customers.length > 0
    ? Math.max(...snap.customers.map(c => c.maxDiasMora))
    : 0;

  // Top debtor by overdue balance
  const sortedByOverdue = [...snap.customers]
    .filter(c => c.totalVencido > 0)
    .sort((a, b) => b.totalVencido - a.totalVencido);
  const topDebtor = sortedByOverdue[0] ?? null;
  const topDebtorShare = topDebtor && snap.totalOverdueAr > 0
    ? (topDebtor.totalVencido / snap.totalOverdueAr) * 100
    : 0;

  // ── Alert 1: +90 DPD customers ────────────────────────────────────────────
  await upsertAlert(organizationId, "cartera.90dpd", {
    active:   count90Plus > 0,
    severity: count90Plus >= 5 ? "CRITICAL" : "WARNING",
    title:    `${count90Plus} cliente${count90Plus > 1 ? "s" : ""} con mora superior a 90 días`,
    message:
      `${count90Plus} cliente${count90Plus > 1 ? "s tienen" : " tiene"} facturas vencidas ` +
      `hace más de 90 días. ` +
      `Cartera vencida total: ${fmtCOP(snap.totalOverdueAr)} (fuente: SAG certificado). ` +
      `DPD máximo en la organización: ${maxDpd} días.`,
    metadata: {
      count90Plus,
      maxDpd,
      overdueReceivable: snap.totalOverdueAr,
      source:            "vw_agentik_cartera",
    },
  });

  // ── Alert 2: top debtor ────────────────────────────────────────────────────
  const topDebtorActive =
    topDebtor != null &&
    topDebtor.totalVencido > TOP_DEBTOR_MIN_COP;

  await upsertAlert(organizationId, "cartera.top_debtor", {
    active:   topDebtorActive,
    severity: (topDebtor?.totalVencido ?? 0) > 50_000_000 ? "CRITICAL" : "WARNING",
    title:    `Mayor deudor: ${topDebtor?.clienteName ?? "—"} con ${fmtCOP(topDebtor?.totalVencido ?? 0)} vencido`,
    message:
      `${topDebtor?.clienteName} acumula ${fmtCOP(topDebtor?.totalVencido ?? 0)} en cartera vencida ` +
      `(${topDebtorShare.toFixed(1)}% del total de la organización). ` +
      `Mora máxima: ${topDebtor?.maxDiasMora ?? 0} días. ` +
      `Fuente: SAG certificado (vw_agentik_cartera).`,
    metadata: {
      name:              topDebtor?.clienteName,
      overdueReceivable: topDebtor?.totalVencido,
      maxDpd:            topDebtor?.maxDiasMora,
      share:             topDebtorShare,
      source:            "vw_agentik_cartera",
    },
  });

  // ── Alert 3: concentration risk ───────────────────────────────────────────
  const concentrationActive =
    topDebtorShare > CONCENTRATION_THRESHOLD_PCT &&
    snap.totalOverdueAr > TOP_DEBTOR_MIN_COP;

  await upsertAlert(organizationId, "cartera.concentration", {
    active:   concentrationActive,
    severity: topDebtorShare > 40 ? "CRITICAL" : "WARNING",
    title:    `Riesgo de concentración: ${topDebtor?.clienteName ?? "—"} representa el ${topDebtorShare.toFixed(0)}% de la cartera vencida`,
    message:
      `Un solo cliente (${topDebtor?.clienteName}) concentra el ` +
      `${topDebtorShare.toFixed(1)}% de toda la cartera vencida de la organización ` +
      `(${fmtCOP(topDebtor?.totalVencido ?? 0)} de ${fmtCOP(snap.totalOverdueAr)} total). ` +
      `Fuente: SAG certificado. Diversificar política de cobro y crédito.`,
    metadata: {
      topDebtorName:     topDebtor?.clienteName,
      concentrationRisk: topDebtorShare,
      overdueReceivable: snap.totalOverdueAr,
      source:            "vw_agentik_cartera",
    },
  });

  // Count generated (active) vs resolved (inactive)
  const active3   = [count90Plus > 0, topDebtorActive, concentrationActive].filter(Boolean).length;
  const resolved3 = 3 - active3;

  return { generated: active3, resolved: resolved3 };
}
