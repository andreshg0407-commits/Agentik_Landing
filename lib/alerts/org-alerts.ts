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
import { getCarteraKpis } from "@/lib/finance/cartera-kpis";

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
  const kpis = await getCarteraKpis(organizationId);

  if (!kpis.hasData) {
    return { generated: 0, resolved: 0 };
  }

  // ── Alert 1: +90 DPD customers ────────────────────────────────────────────
  await upsertAlert(organizationId, "cartera.90dpd", {
    active:   kpis.count90Plus > 0,
    severity: kpis.count90Plus >= 5 ? "CRITICAL" : "WARNING",
    title:    `${kpis.count90Plus} cliente${kpis.count90Plus > 1 ? "s" : ""} con mora superior a 90 días`,
    message:
      `${kpis.count90Plus} cliente${kpis.count90Plus > 1 ? "s tienen" : " tiene"} facturas vencidas ` +
      `hace más de 90 días. ` +
      `Cartera vencida total: ${fmtCOP(kpis.overdueReceivable)}. ` +
      `DPD máximo en la organización: ${kpis.maxDpd} días.`,
    metadata: {
      count90Plus:       kpis.count90Plus,
      maxDpd:            kpis.maxDpd,
      overdueReceivable: kpis.overdueReceivable,
    },
  });

  // ── Alert 2: top debtor ────────────────────────────────────────────────────
  const topDebtorActive =
    kpis.topDebtor != null &&
    kpis.topDebtor.overdueReceivable > TOP_DEBTOR_MIN_COP;

  await upsertAlert(organizationId, "cartera.top_debtor", {
    active:   topDebtorActive,
    severity: (kpis.topDebtor?.overdueReceivable ?? 0) > 50_000_000 ? "CRITICAL" : "WARNING",
    title:    `Mayor deudor: ${kpis.topDebtor?.name ?? "—"} con ${fmtCOP(kpis.topDebtor?.overdueReceivable ?? 0)} vencido`,
    message:
      `${kpis.topDebtor?.name} acumula ${fmtCOP(kpis.topDebtor?.overdueReceivable ?? 0)} en cartera vencida ` +
      `(${kpis.topDebtor?.share.toFixed(1)}% del total de la organización). ` +
      `Mora máxima: ${kpis.topDebtor?.maxDpd ?? 0} días. ` +
      `Iniciar gestión de cobro prioritaria.`,
    metadata: {
      slug:              kpis.topDebtor?.slug,
      name:              kpis.topDebtor?.name,
      overdueReceivable: kpis.topDebtor?.overdueReceivable,
      maxDpd:            kpis.topDebtor?.maxDpd,
      share:             kpis.topDebtor?.share,
    },
  });

  // ── Alert 3: concentration risk ───────────────────────────────────────────
  const concentrationActive =
    kpis.concentrationRisk > CONCENTRATION_THRESHOLD_PCT &&
    kpis.overdueReceivable > TOP_DEBTOR_MIN_COP;

  await upsertAlert(organizationId, "cartera.concentration", {
    active:   concentrationActive,
    severity: kpis.concentrationRisk > 40 ? "CRITICAL" : "WARNING",
    title:    `Riesgo de concentración: ${kpis.topDebtor?.name ?? "—"} representa el ${kpis.concentrationRisk.toFixed(0)}% de la cartera vencida`,
    message:
      `Un solo cliente (${kpis.topDebtor?.name}) concentra el ` +
      `${kpis.concentrationRisk.toFixed(1)}% de toda la cartera vencida de la organización ` +
      `(${fmtCOP(kpis.topDebtor?.overdueReceivable ?? 0)} de ${fmtCOP(kpis.overdueReceivable)} total). ` +
      `Riesgo de cartera concentrada — diversificar política de cobro y crédito.`,
    metadata: {
      topDebtorSlug:     kpis.topDebtor?.slug,
      topDebtorName:     kpis.topDebtor?.name,
      concentrationRisk: kpis.concentrationRisk,
      overdueReceivable: kpis.overdueReceivable,
    },
  });

  // Count generated (active) vs resolved (inactive)
  const active3   = [kpis.count90Plus > 0, topDebtorActive, concentrationActive].filter(Boolean).length;
  const resolved3 = 3 - active3;

  return { generated: active3, resolved: resolved3 };
}
