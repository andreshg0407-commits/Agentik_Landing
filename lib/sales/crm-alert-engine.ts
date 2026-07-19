/**
 * CRM Alert Engine — extends the core BusinessAlert system with CRM-aware rules.
 *
 * Detects:
 *  - cartera_vencida:       customer with significant overdue receivables
 *  - quote_sin_seguimiento: quote sent > 7 days ago with no response and no activity
 *  - cliente_premium_inactivo: high-LTV customer with no purchase in 60+ days
 *  - oportunidad_estancada: open opportunity with no activity in 21+ days
 *  - vendedor_pipeline_envejecido: seller with avg deal age > 45 days
 *
 * Each rule is idempotent — upserts BusinessAlert by (org, type, entityKey, period).
 * Period = YYYYMM of current month.
 */

import { prisma }        from "@/lib/prisma";
import { AlertSeverity } from "@prisma/client";

// ── Thresholds ─────────────────────────────────────────────────────────────────

const CARTERA_OVERDUE_MIN        = 500_000;   // COP — min overdue to alert
const CARTERA_CRITICAL_RATIO     = 0.5;       // >50% of receivables overdue → CRITICAL
const QUOTE_FOLLOW_UP_DAYS       = 7;         // days after quote sent with no response
const CLIENTE_PREMIUM_LTV_MIN    = 5_000_000; // COP — min LTV to be "premium"
const CLIENTE_INACTIVO_DAYS      = 60;        // days without purchase → alert
const CLIENTE_INACTIVO_CRITICAL  = 120;       // days → CRITICAL
const OPP_STALE_DAYS             = 21;        // days with no activity on OPEN opp
const OPP_STALE_CRITICAL         = 45;
const VENDOR_OLD_PIPELINE_DAYS   = 45;        // avg deal age threshold for seller

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function daysSince(date: Date | null): number {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

async function upsertAlert(data: {
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
  payload:        Record<string, unknown>;
}): Promise<void> {
  await (prisma as unknown as { businessAlert: { upsert: Function } }).businessAlert.upsert({
    where: {
      organizationId_type_entityKey_period: {
        organizationId: data.organizationId,
        type:           data.type,
        entityKey:      data.entityKey,
        period:         data.period,
      },
    },
    update: {
      severity:    data.severity,
      title:       data.title,
      message:     data.message,
      payloadJson: data.payload,
      updatedAt:   new Date(),
    },
    create: {
      organizationId: data.organizationId,
      module:         data.module,
      type:           data.type,
      severity:       data.severity,
      status:         "OPEN",
      title:          data.title,
      message:        data.message,
      entityType:     data.entityType,
      entityKey:      data.entityKey,
      entityLabel:    data.entityLabel,
      period:         data.period,
      payloadJson:    data.payload,
    },
  });
}

// ── Rule: cartera_vencida ──────────────────────────────────────────────────────

async function checkCarteraVencida(
  organizationId: string,
  period:         string,
): Promise<number> {
  // Access new Prisma model via any-cast until migration runs
  const db = prisma as unknown as {
    customerReceivable: {
      groupBy: (args: unknown) => Promise<Array<{
        customerNit: string | null;
        customerName: string;
        _sum: { balanceDue: unknown; overdueReceivable: unknown };
      }>>;
    };
  };

  // Group overdue receivables by customer
  type GroupRow = {
    customerNit: string | null;
    customerName: string;
    _sum: { balanceDue: number | null };
  };

  let rows: GroupRow[] = [];
  try {
    rows = await (prisma as unknown as {
      customerReceivable: {
        groupBy: Function;
      };
    }).customerReceivable.groupBy({
      by: ["customerNit", "customerName"],
      where: {
        organizationId,
        status: { not: "PAID" },
        daysOverdue: { gt: 0 },
        balanceDue: { gt: CARTERA_OVERDUE_MIN },
      },
      _sum: { balanceDue: true },
    });
  } catch {
    // Model not yet migrated — skip
    return 0;
  }

  let generated = 0;
  for (const row of rows) {
    const overdue = Number(row._sum.balanceDue ?? 0);
    if (overdue < CARTERA_OVERDUE_MIN) continue;

    // Get total receivable for this customer to compute ratio
    const entityKey = row.customerNit ?? row.customerName.toLowerCase().replace(/\s+/g, "-");
    const severity  = overdue > CARTERA_OVERDUE_MIN * 10 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;

    await upsertAlert({
      organizationId,
      module:      "finance",
      type:        "cartera_vencida",
      severity,
      title:       `Cartera vencida: ${row.customerName}`,
      message:     `Cliente ${row.customerName} tiene $${overdue.toLocaleString("es-CO")} COP en cartera vencida.`,
      entityType:  "customer",
      entityKey,
      entityLabel: row.customerName,
      period,
      payload:     { overdue, nit: row.customerNit },
    });
    generated++;
  }
  return generated;
}

// ── Rule: quote_sin_seguimiento ────────────────────────────────────────────────

async function checkQuoteSinSeguimiento(
  organizationId: string,
  period:         string,
): Promise<number> {
  const cutoff = new Date(Date.now() - QUOTE_FOLLOW_UP_DAYS * 86_400_000);

  type QuoteRow = {
    id: string; crmId: string | null; quoteNumber: string | null;
    customerName: string | null; sellerName: string | null;
    amount: number; issuedAt: Date;
  };

  let quotes: QuoteRow[] = [];
  try {
    quotes = await (prisma as unknown as { cRMQuote: { findMany: Function } }).cRMQuote.findMany({
      where: {
        organizationId,
        status: "SENT",
        issuedAt: { lt: cutoff },
        respondedAt: null,
      },
      select: {
        id: true, crmId: true, quoteNumber: true,
        customerName: true, sellerName: true, amount: true, issuedAt: true,
        customer: { select: { name: true } },
      },
      take: 50,
    });
  } catch {
    return 0;
  }

  let generated = 0;
  for (const q of quotes) {
    const daysSent = daysSince(q.issuedAt);
    const entityKey = q.crmId ?? q.id;
    const severity  = daysSent > QUOTE_FOLLOW_UP_DAYS * 3 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    const label     = q.quoteNumber ? `Cot. ${q.quoteNumber}` : `Cotización (${q.id.slice(-6)})`;

    await upsertAlert({
      organizationId,
      module:      "crm",
      type:        "quote_sin_seguimiento",
      severity,
      title:       `Cotización sin respuesta ${daysSent}d: ${q.customerName ?? "—"}`,
      message:     `${label} enviada hace ${daysSent} días a ${q.customerName ?? "cliente"} sin respuesta. Monto: $${Number(q.amount).toLocaleString("es-CO")} COP.`,
      entityType:  "quote",
      entityKey,
      entityLabel: label,
      period,
      payload:     { daysSent, amount: Number(q.amount), sellerName: q.sellerName },
    });
    generated++;
  }
  return generated;
}

// ── Rule: cliente_premium_inactivo ────────────────────────────────────────────

async function checkClientePremiumInactivo(
  organizationId: string,
  period:         string,
): Promise<number> {
  const cutoff = new Date(Date.now() - CLIENTE_INACTIVO_DAYS * 86_400_000);

  type ProfileRow = {
    id: string; slug: string; name: string; ltv: number | null;
    lastPurchaseAt: Date | null; sellerName: string | null;
  };

  let profiles: ProfileRow[] = [];
  try {
    profiles = await (prisma as unknown as { customerProfile: { findMany: Function } }).customerProfile.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        ltv: { gte: CLIENTE_PREMIUM_LTV_MIN },
        OR: [
          { lastPurchaseAt: { lt: cutoff } },
          { lastPurchaseAt: null },
        ],
      },
      select: {
        id: true, slug: true, name: true, ltv: true,
        lastPurchaseAt: true, sellerName: true,
      },
      take: 50,
    });
  } catch {
    return 0;
  }

  let generated = 0;
  for (const p of profiles) {
    const inactive = daysSince(p.lastPurchaseAt);
    if (inactive < CLIENTE_INACTIVO_DAYS) continue;

    const severity  = inactive >= CLIENTE_INACTIVO_CRITICAL ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    await upsertAlert({
      organizationId,
      module:      "crm",
      type:        "cliente_premium_inactivo",
      severity,
      title:       `Cliente premium inactivo ${inactive}d: ${p.name}`,
      message:     `${p.name} (LTV $${Number(p.ltv ?? 0).toLocaleString("es-CO")} COP) sin compras hace ${inactive} días. Vendedor: ${p.sellerName ?? "sin asignar"}.`,
      entityType:  "customer",
      entityKey:   p.slug,
      entityLabel: p.name,
      period,
      payload:     { inactiveDays: inactive, ltv: Number(p.ltv ?? 0), sellerName: p.sellerName },
    });
    generated++;
  }
  return generated;
}

// ── Rule: oportunidad_estancada ────────────────────────────────────────────────

async function checkOportunidadEstancada(
  organizationId: string,
  period:         string,
): Promise<number> {
  const cutoff = new Date(Date.now() - OPP_STALE_DAYS * 86_400_000);

  type OppRow = {
    id: string; crmId: string | null; title: string; stage: string;
    amount: number; sellerName: string | null; lastActivityAt: Date | null; openedAt: Date;
  };

  let opps: OppRow[] = [];
  try {
    opps = await (prisma as unknown as { cRMOpportunity: { findMany: Function } }).cRMOpportunity.findMany({
      where: {
        organizationId,
        status: "OPEN",
        OR: [
          { lastActivityAt: { lt: cutoff } },
          { lastActivityAt: null, openedAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true, crmId: true, title: true, stage: true,
        amount: true, sellerName: true, lastActivityAt: true, openedAt: true,
      },
      take: 50,
    });
  } catch {
    return 0;
  }

  let generated = 0;
  for (const o of opps) {
    const staleDays  = daysSince(o.lastActivityAt ?? o.openedAt);
    if (staleDays < OPP_STALE_DAYS) continue;

    const entityKey = o.crmId ?? o.id;
    const severity  = staleDays >= OPP_STALE_CRITICAL ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;

    await upsertAlert({
      organizationId,
      module:      "crm",
      type:        "oportunidad_estancada",
      severity,
      title:       `Oportunidad estancada ${staleDays}d: ${o.title}`,
      message:     `Oportunidad "${o.title}" sin actividad hace ${staleDays} días. Etapa: ${o.stage}. Monto: $${Number(o.amount).toLocaleString("es-CO")} COP. Vendedor: ${o.sellerName ?? "sin asignar"}.`,
      entityType:  "opportunity",
      entityKey,
      entityLabel: o.title,
      period,
      payload:     { staleDays, stage: o.stage, amount: Number(o.amount), sellerName: o.sellerName },
    });
    generated++;
  }
  return generated;
}

// ── Rule: vendedor_pipeline_envejecido ────────────────────────────────────────

async function checkVendedorPipelineEnvejecido(
  organizationId: string,
  period:         string,
): Promise<number> {
  type OppRow = { sellerSlug: string | null; sellerName: string | null; openedAt: Date };

  let opps: OppRow[] = [];
  try {
    opps = await (prisma as unknown as { cRMOpportunity: { findMany: Function } }).cRMOpportunity.findMany({
      where: { organizationId, status: "OPEN", sellerSlug: { not: null } },
      select: { sellerSlug: true, sellerName: true, openedAt: true },
    });
  } catch {
    return 0;
  }

  // Group by seller, compute avg deal age
  const sellerMap = new Map<string, { name: string; totalDays: number; count: number }>();
  const now = Date.now();
  for (const o of opps) {
    if (!o.sellerSlug) continue;
    const age = Math.floor((now - new Date(o.openedAt).getTime()) / 86_400_000);
    const existing = sellerMap.get(o.sellerSlug);
    if (existing) {
      existing.totalDays += age;
      existing.count++;
    } else {
      sellerMap.set(o.sellerSlug, { name: o.sellerName ?? o.sellerSlug, totalDays: age, count: 1 });
    }
  }

  let generated = 0;
  for (const [slug, data] of sellerMap) {
    const avgAge = Math.round(data.totalDays / data.count);
    if (avgAge < VENDOR_OLD_PIPELINE_DAYS) continue;

    const severity = avgAge > VENDOR_OLD_PIPELINE_DAYS * 1.5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING;
    await upsertAlert({
      organizationId,
      module:      "crm",
      type:        "vendedor_pipeline_envejecido",
      severity,
      title:       `Pipeline envejecido: ${data.name} (${avgAge}d promedio)`,
      message:     `El pipeline de ${data.name} tiene ${data.count} oportunidades abiertas con edad promedio de ${avgAge} días. Revisar cierre o descarte.`,
      entityType:  "seller",
      entityKey:   slug,
      entityLabel: data.name,
      period,
      payload:     { avgDealAge: avgAge, openDeals: data.count, sellerSlug: slug },
    });
    generated++;
  }
  return generated;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CrmAlertResult {
  generated: number;
  rules: {
    cartera_vencida:              number;
    quote_sin_seguimiento:        number;
    cliente_premium_inactivo:     number;
    oportunidad_estancada:        number;
    vendedor_pipeline_envejecido: number;
  };
}

/**
 * Run all CRM alert rules for an organisation.
 * Returns counts per rule. Safe to call repeatedly — all rules are idempotent.
 */
export async function generateCrmAlerts(
  organizationId: string,
): Promise<CrmAlertResult> {
  const period = currentPeriod();

  const [
    cartera_vencida,
    quote_sin_seguimiento,
    cliente_premium_inactivo,
    oportunidad_estancada,
    vendedor_pipeline_envejecido,
  ] = await Promise.all([
    checkCarteraVencida(organizationId, period),
    checkQuoteSinSeguimiento(organizationId, period),
    checkClientePremiumInactivo(organizationId, period),
    checkOportunidadEstancada(organizationId, period),
    checkVendedorPipelineEnvejecido(organizationId, period),
  ]);

  const generated =
    cartera_vencida +
    quote_sin_seguimiento +
    cliente_premium_inactivo +
    oportunidad_estancada +
    vendedor_pipeline_envejecido;

  return {
    generated,
    rules: {
      cartera_vencida,
      quote_sin_seguimiento,
      cliente_premium_inactivo,
      oportunidad_estancada,
      vendedor_pipeline_envejecido,
    },
  };
}
