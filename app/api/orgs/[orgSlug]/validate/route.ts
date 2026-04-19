/**
 * GET /api/orgs/[orgSlug]/validate
 *
 * Read-only data audit report for the Real Integration Validation Sprint.
 * Queries every relevant model and returns a structured report showing:
 *
 *  • record counts per model
 *  • ERP↔CRM customer linking quality (Phase 3)
 *  • unmatched CRM opportunities (customerTaxId present but no CustomerProfile link)
 *  • field completeness percentages
 *  • at-risk / stale deals (Phase 4)
 *  • scoring coverage (Phase 4)
 *  • last connector runs per source
 *  • sample records for manual inspection
 *
 * Safe to call repeatedly — zero writes.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";

export const runtime = "nodejs";

// ── Prisma as-any cast for models not yet in generated client ─────────────────

type DB = {
  customerProfile: {
    count:    (a: unknown) => Promise<number>;
    findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
    groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
  };
  customerReceivable: {
    count:    (a: unknown) => Promise<number>;
    groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
  };
  cRMOpportunity: {
    count:    (a: unknown) => Promise<number>;
    findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
    groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
  };
  cRMActivity: {
    count:    (a: unknown) => Promise<number>;
  };
  cRMQuote: {
    count:    (a: unknown) => Promise<number>;
    groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
  };
};

function db(): DB {
  return prisma as unknown as DB;
}

/** Safe count — returns 0 if model doesn't exist yet. */
async function safeCount(
  fn: () => Promise<number>,
): Promise<number> {
  try { return await fn(); } catch { return 0; }
}

/** Safe query — returns [] if model doesn't exist yet. */
async function safeQuery<T>(
  fn: () => Promise<T[]>,
): Promise<T[]> {
  try { return await fn(); } catch { return []; }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const orgId = organization.id;

    // ── 1. Record counts ──────────────────────────────────────────────────────

    const [
      totalCustomers,
      erpLinked,
      crmLinked,
      bothLinked,
      withNit,
      withEmail,
      withSeller,
      scoredCustomers,
      totalReceivables,
      totalOpportunities,
      openOpportunities,
      wonOpportunities,
      lostOpportunities,
      oppsWithCustomer,
      oppsWithSeller,
      totalActivities,
      activitiesWithOpp,
      totalQuotes,
    ] = await Promise.all([
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, erpSyncedAt: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, crmSyncedAt: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, erpSyncedAt: { not: null }, crmSyncedAt: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, nit: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, email: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, sellerName: { not: null } } })),
      safeCount(() => db().customerProfile.count({ where: { organizationId: orgId, scoredAt: { not: null } } })),

      safeCount(() => db().customerReceivable.count({ where: { organizationId: orgId } })),

      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId } })),
      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId, status: "OPEN" } })),
      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId, status: "WON" } })),
      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId, status: "LOST" } })),
      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId, customerId: { not: null } } })),
      safeCount(() => db().cRMOpportunity.count({ where: { organizationId: orgId, sellerSlug: { not: null } } })),

      safeCount(() => db().cRMActivity.count({ where: { organizationId: orgId } })),
      safeCount(() => db().cRMActivity.count({ where: { organizationId: orgId, opportunityId: { not: null } } })),

      safeCount(() => db().cRMQuote.count({ where: { organizationId: orgId } })),
    ]);

    // ── 2. Receivable breakdown ───────────────────────────────────────────────

    const receivableByStatus = await safeQuery(() =>
      db().customerReceivable.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { id: true },
      }) as Promise<Record<string, unknown>[]>
    );

    // ── 3. Unmatched opportunities (have customerTaxId but no customerId) ─────

    const unmatchedOpps = await safeQuery(() =>
      db().cRMOpportunity.findMany({
        where: {
          organizationId: orgId,
          customerId: null,
          OR: [
            { customerTaxId: { not: null } },
            { customerName:  { not: null } },
          ],
        },
        select: {
          id: true, crmId: true, title: true, stage: true, status: true,
          amount: true, customerName: true, customerTaxId: true,
          sellerName: true, openedAt: true,
        },
        orderBy: { amount: "desc" },
        take: 10,
      }) as Promise<Record<string, unknown>[]>
    );

    // ── 4. Sample linked customers (both ERP and CRM) ─────────────────────────

    const linkedSample = await safeQuery(() =>
      db().customerProfile.findMany({
        where: {
          organizationId: orgId,
          erpSyncedAt: { not: null },
          crmSyncedAt: { not: null },
        },
        select: {
          id: true, nit: true, name: true, slug: true,
          ltv: true, riskScore: true, churnRisk: true,
          healthScore: true, scoredAt: true,
          erpSyncedAt: true, crmSyncedAt: true,
        },
        orderBy: { ltv: "desc" },
        take: 5,
      }) as Promise<Record<string, unknown>[]>
    );

    // ── 5. Stale open opportunities (no activity ≥ 21 days) ──────────────────

    const staleOpps = await safeQuery(() => {
      const cutoff = new Date(Date.now() - 21 * 86_400_000);
      return db().cRMOpportunity.findMany({
        where: {
          organizationId: orgId,
          status: "OPEN",
          OR: [
            { lastActivityAt: { lt: cutoff } },
            { lastActivityAt: null, openedAt: { lt: cutoff } },
          ],
        },
        select: {
          id: true, crmId: true, title: true, stage: true, amount: true,
          sellerName: true, lastActivityAt: true, openedAt: true,
          customerName: true, customerId: true,
        },
        orderBy: { amount: "desc" },
        take: 10,
      }) as Promise<Record<string, unknown>[]>;
    });

    // ── 6. Customers with overdue receivables ─────────────────────────────────

    const overdueCustomers = await safeQuery(() =>
      db().customerProfile.findMany({
        where: {
          organizationId: orgId,
          overdueReceivable: { gt: 0 },
        },
        select: {
          id: true, nit: true, name: true,
          totalReceivable: true, overdueReceivable: true, maxDpd: true,
          riskScore: true,
        },
        orderBy: { overdueReceivable: "desc" },
        take: 5,
      }) as Promise<Record<string, unknown>[]>
    );

    // ── 7. Scoring coverage ───────────────────────────────────────────────────

    const highChurnSample = await safeQuery(() =>
      db().customerProfile.findMany({
        where: {
          organizationId: orgId,
          churnRisk: { not: null },
        },
        select: {
          id: true, name: true, churnRisk: true, riskScore: true,
          healthScore: true, nextBestAction: true, scoredAt: true,
        },
        orderBy: { riskScore: "desc" },
        take: 5,
      }) as Promise<Record<string, unknown>[]>
    );

    // ── 8. Last connector runs ────────────────────────────────────────────────

    const recentRuns = await prisma.connectorRun.findMany({
      where: { organizationId: orgId },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true, source: true, module: true, status: true,
        rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true,
        cursorBefore: true, cursorAfter: true,
        startedAt: true, finishedAt: true, error: true,
      },
    });

    // ── 9. Compute percentages ────────────────────────────────────────────────

    function pct(n: number, total: number): number {
      if (total === 0) return 0;
      return Math.round((n / total) * 100);
    }

    // ── 10. Build report ──────────────────────────────────────────────────────

    const report = {
      generatedAt: new Date().toISOString(),
      orgSlug: params.orgSlug,

      // ── Phase 1 & 2: Record counts ──────────────────────────────────────────
      counts: {
        customerProfiles:   totalCustomers,
        customerReceivables: totalReceivables,
        crmOpportunities:   totalOpportunities,
        crmActivities:      totalActivities,
        crmQuotes:          totalQuotes,
      },

      // ── Phase 1: ERP validation ─────────────────────────────────────────────
      erp: {
        erpLinkedCustomers:  erpLinked,
        withNit:             withNit,
        withNitPct:          pct(withNit, totalCustomers),
        receivablesByStatus: receivableByStatus.map(r => ({
          status: r["status"],
          count:  r["_count"] as Record<string, number>,
        })),
        customersWithOverdue: overdueCustomers.length,
        overdueCustomerSample: overdueCustomers,
      },

      // ── Phase 2: CRM validation ─────────────────────────────────────────────
      crm: {
        opportunitiesByStatus: {
          open:  openOpportunities,
          won:   wonOpportunities,
          lost:  lostOpportunities,
          other: totalOpportunities - openOpportunities - wonOpportunities - lostOpportunities,
        },
        oppsWithCustomerLink:     oppsWithCustomer,
        oppsWithCustomerLinkPct:  pct(oppsWithCustomer, totalOpportunities),
        oppsWithSellerLink:       oppsWithSeller,
        oppsWithSellerLinkPct:    pct(oppsWithSeller, totalOpportunities),
        activitiesWithOppLink:    activitiesWithOpp,
        activitiesWithOppLinkPct: pct(activitiesWithOpp, totalActivities),
        staleOpportunities:       staleOpps.length,
        staleOpportunitySample:   staleOpps,
      },

      // ── Phase 3: Customer matching ──────────────────────────────────────────
      matching: {
        totalCustomers,
        erpOnly:     erpLinked - bothLinked,
        crmOnly:     crmLinked - bothLinked,
        bothLinked,
        unlinked:    totalCustomers - erpLinked - crmLinked + bothLinked,
        erpLinkPct:  pct(erpLinked,  totalCustomers),
        crmLinkPct:  pct(crmLinked,  totalCustomers),
        bothLinkPct: pct(bothLinked, totalCustomers),
        fieldQuality: {
          withNit:     pct(withNit,    totalCustomers),
          withEmail:   pct(withEmail,  totalCustomers),
          withSeller:  pct(withSeller, totalCustomers),
        },
        unmatchedOpportunities: unmatchedOpps.length,
        unmatchedOpportunitySample: unmatchedOpps,
        linkedCustomerSample: linkedSample,
        // Blockers
        blockers: buildMatchingBlockers(unmatchedOpps, bothLinked, totalCustomers, crmLinked),
      },

      // ── Phase 4: Scoring validation ─────────────────────────────────────────
      scoring: {
        scoredCustomers,
        scoredPct:       pct(scoredCustomers, totalCustomers),
        notScoredYet:    totalCustomers - scoredCustomers,
        highChurnSample,
        readiness: scoredCustomers > 0
          ? "ACTIVE — scoring is running"
          : (totalCustomers > 0
              ? "PENDING — customers exist but scoring has not run yet. POST /api/orgs/{slug}/customer-360/score"
              : "NO_DATA — no customer profiles found"),
      },

      // ── Connector run history ────────────────────────────────────────────────
      connectorRuns: recentRuns,

      // ── Action items ─────────────────────────────────────────────────────────
      actionItems: buildActionItems({
        totalCustomers, erpLinked, crmLinked, bothLinked, withNit,
        unmatchedOpps, scoredCustomers, totalOpportunities,
        totalReceivables, totalActivities, staleOpps,
      }),
    };

    return NextResponse.json(report, { status: 200 });

  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    console.error("[validate/GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMatchingBlockers(
  unmatchedOpps: Record<string, unknown>[],
  bothLinked:    number,
  totalCustomers: number,
  crmLinked:     number,
): string[] {
  const blockers: string[] = [];

  if (unmatchedOpps.length > 0) {
    blockers.push(
      `${unmatchedOpps.length} oportunidades CRM sin enlace a cliente — ` +
      `verificar que NIT en CRM coincide con NIT en ERP (ej: "900.123.456-7" → "900123456").`
    );
  }
  if (bothLinked === 0 && crmLinked > 0 && totalCustomers > 0) {
    blockers.push(
      `Ningún cliente tiene datos de ERP y CRM enlazados — ` +
      `la sincronización del conector sag_pya_soap (customers) debe ejecutarse primero.`
    );
  }
  if (totalCustomers === 0) {
    blockers.push(
      `No hay perfiles de cliente — ejecutar sincronización de sag_pya_soap/customers ` +
      `o importar un CSV de ventas para generar perfiles automáticamente.`
    );
  }

  return blockers;
}

function buildActionItems(data: {
  totalCustomers:     number;
  erpLinked:          number;
  crmLinked:          number;
  bothLinked:         number;
  withNit:            number;
  unmatchedOpps:      Record<string, unknown>[];
  scoredCustomers:    number;
  totalOpportunities: number;
  totalReceivables:   number;
  totalActivities:    number;
  staleOpps:          Record<string, unknown>[];
}): Array<{ priority: "HIGH" | "MEDIUM" | "LOW"; item: string }> {
  const items: Array<{ priority: "HIGH" | "MEDIUM" | "LOW"; item: string }> = [];

  if (data.totalCustomers === 0) {
    items.push({ priority: "HIGH", item: "Ejecutar sincronización sag_pya_soap/customers para crear perfiles de cliente." });
  }
  if (data.totalReceivables === 0) {
    items.push({ priority: "HIGH", item: "Ejecutar sincronización sag_pya_soap/receivables para cargar cartera." });
  }
  if (data.totalOpportunities === 0) {
    items.push({ priority: "HIGH", item: "Ejecutar sincronización castillitos_crm/opportunities para cargar el embudo comercial." });
  }
  if (data.unmatchedOpps.length > 0) {
    items.push({ priority: "HIGH", item: `Resolver ${data.unmatchedOpps.length} oportunidades sin enlace: verificar normalización de NIT y ejecutar nueva sincronización CRM.` });
  }
  if (data.totalActivities === 0 && data.totalOpportunities > 0) {
    items.push({ priority: "MEDIUM", item: "Ejecutar sincronización castillitos_crm/activities para actualizar lastActivityAt y alimentar el motor de alertas." });
  }
  if (data.scoredCustomers === 0 && data.totalCustomers > 0) {
    items.push({ priority: "MEDIUM", item: "Ejecutar POST /api/orgs/{slug}/customer-360/score para activar scoring de riesgo." });
  }
  if (data.staleOpps.length > 0) {
    items.push({ priority: "MEDIUM", item: `${data.staleOpps.length} oportunidades sin actividad hace más de 21 días — revisar en Embudo Comercial.` });
  }
  if (data.crmLinked > 0 && data.bothLinked === 0) {
    items.push({ priority: "HIGH", item: "Clientes CRM detectados pero sin enlace a ERP — ejecutar sag_pya_soap/customers primero para crear perfiles base." });
  }
  if (data.bothLinked > 0) {
    items.push({ priority: "LOW", item: `${data.bothLinked} clientes enlazados ERP+CRM — validar manualmente en Cliente 360 que datos sean correctos.` });
  }

  return items;
}
