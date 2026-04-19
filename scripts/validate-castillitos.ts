/**
 * validate-castillitos.ts
 *
 * Real Integration Validation Sprint — Castillitos (PYA + CRM)
 *
 * Reads directly from the database and prints a structured validation report
 * across all four phases:
 *
 *   Phase 1 — PYA / SAG data validation
 *   Phase 2 — CRM data validation
 *   Phase 3 — Customer matching (ERP ↔ CRM)
 *   Phase 4 — Operational scoring validation
 *
 * READ-ONLY — zero writes.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx tsx scripts/validate-castillitos.ts
 *   ORG_SLUG=castillitos npx tsx scripts/validate-castillitos.ts --verbose
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";
const VERBOSE  = process.argv.includes("--verbose");

// ── Colour helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
};

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function err(msg: string)  { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }
function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}${title}${C.reset}`);
  console.log("─".repeat(60));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function money(n: unknown): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-CO")} COP`;
}

function daysSince(d: Date | null | undefined): number {
  if (!d) return 9999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try { return await fn(); } catch { return -1; }
}

type AnyModel = {
  count:    (a: unknown) => Promise<number>;
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  groupBy:  (a: unknown) => Promise<Record<string, unknown>[]>;
};

function model(name: string): AnyModel {
  return (prisma as unknown as Record<string, AnyModel>)[name];
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}=== Agentik — Validación de Integración Real ===${C.reset}`);
  console.log(`Organización: ${C.bold}${ORG_SLUG}${C.reset}`);
  console.log(`Fecha:        ${new Date().toLocaleString("es-CO")}`);

  // ── Load org ────────────────────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    console.log(`\n${C.red}ERROR: Organización "${ORG_SLUG}" no encontrada.${C.reset}`);
    console.log(`Disponibles:`);
    const all = await prisma.organization.findMany({ select: { slug: true, name: true } });
    all.forEach(o => console.log(`  - ${o.slug} (${o.name})`));
    process.exit(1);
  }

  const orgId = org.id;
  console.log(`ID:           ${C.grey}${orgId}${C.reset}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 1 — PYA / SAG Validation
  // ─────────────────────────────────────────────────────────────────────────────

  section("FASE 1 — Validación PYA / SAG (ERP)");

  const [
    totalCustomers, erpLinked, withNit, withEmail, withSeller,
    totalReceivables,
  ] = await Promise.all([
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId } })),
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, erpSyncedAt: { not: null } } })),
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, nit: { not: null } } })),
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, email: { not: null } } })),
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, sellerName: { not: null } } })),
    safeCount(() => model("customerReceivable").count({ where: { organizationId: orgId } })),
  ]);

  // Customer quality
  if (totalCustomers < 0) {
    err("Modelo CustomerProfile no disponible — ejecutar migración Prisma.");
  } else if (totalCustomers === 0) {
    err("Sin perfiles de cliente — ejecutar sag_pya_soap/customers.");
  } else {
    ok(`${totalCustomers} perfiles de cliente`);
    if (erpLinked > 0) ok(`${erpLinked} enlazados a ERP (${pct(erpLinked, totalCustomers)})`);
    else warn("Ningún cliente marcado como erpSyncedAt — sincronización ERP pendiente.");
    info(`Con NIT:     ${withNit} (${pct(withNit, totalCustomers)})`);
    info(`Con email:   ${withEmail} (${pct(withEmail, totalCustomers)})`);
    info(`Con vendedor: ${withSeller} (${pct(withSeller, totalCustomers)})`);

    if (VERBOSE) {
      const sample = await model("customerProfile").findMany({
        where: { organizationId: orgId, erpSyncedAt: { not: null } },
        select: { nit: true, name: true, city: true, sellerName: true, ltv: true, erpSyncedAt: true },
        orderBy: { ltv: "desc" },
        take: 5,
      }).catch(() => []);
      if (sample.length) {
        console.log(`\n  ${C.grey}Muestra de clientes ERP (top 5 por LTV):${C.reset}`);
        sample.forEach((c, i) =>
          console.log(`    ${i + 1}. ${c["name"]}  NIT:${c["nit"] ?? "—"}  ${money(c["ltv"])}  ${c["city"] ?? "—"}  ${c["sellerName"] ?? "—"}`)
        );
      }
    }
  }

  // Receivables
  if (totalReceivables < 0) {
    err("Modelo CustomerReceivable no disponible — ejecutar migración Prisma.");
  } else if (totalReceivables === 0) {
    err("Sin cartera — ejecutar sag_pya_soap/receivables.");
  } else {
    ok(`${totalReceivables} documentos de cartera`);
    try {
      const byStatus = await model("customerReceivable").groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { id: true },
      });
      byStatus.forEach(s =>
        info(`  ${s["status"]}: ${(s["_count"] as Record<string, number>)["id"]}`)
      );
    } catch {
      info("Distribución de estado no disponible.");
    }

    if (VERBOSE) {
      const overdue = await model("customerProfile").findMany({
        where: { organizationId: orgId, overdueReceivable: { gt: 0 } },
        select: { nit: true, name: true, totalReceivable: true, overdueReceivable: true, maxDpd: true },
        orderBy: { overdueReceivable: "desc" },
        take: 5,
      }).catch(() => []);
      if (overdue.length) {
        console.log(`\n  ${C.grey}Top clientes con cartera vencida:${C.reset}`);
        overdue.forEach((c, i) =>
          console.log(`    ${i + 1}. ${c["name"]}  Vencido: ${money(c["overdueReceivable"])}  DPD: ${c["maxDpd"] ?? "—"}`)
        );
      }
    }
  }

  // SAG connector runs
  const sagRuns = await prisma.connectorRun.findMany({
    where: { organizationId: orgId, source: "sag_pya_soap" },
    orderBy: { startedAt: "desc" },
    take: 3,
    select: { module: true, status: true, rowsRead: true, rowsImported: true, startedAt: true, error: true },
  });
  if (sagRuns.length === 0) {
    warn("Sin historial de ejecuciones SAG PYA SOAP — conector no ha sincronizado.");
  } else {
    console.log(`\n  ${C.grey}Últimas ejecuciones SAG (${sagRuns.length}):${C.reset}`);
    sagRuns.forEach(r => {
      const icon = r.status === "SUCCESS" ? C.green + "✓" : (r.status === "PARTIAL" ? C.yellow + "~" : C.red + "✗");
      console.log(`    ${icon}${C.reset} ${r.module} | ${r.status} | leídos: ${r.rowsRead ?? 0} | importados: ${r.rowsImported ?? 0} | ${r.startedAt.toISOString().slice(0, 19)}`);
      if (r.error) console.log(`       Error: ${r.error}`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 2 — CRM Validation
  // ─────────────────────────────────────────────────────────────────────────────

  section("FASE 2 — Validación CRM (Castillitos)");

  const [
    totalOpps, openOpps, wonOpps, lostOpps, oppsWithCustomer, oppsWithSeller,
    totalActivities, activitiesWithOpp,
    totalQuotes,
  ] = await Promise.all([
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId } })),
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId, status: "OPEN" } })),
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId, status: "WON" } })),
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId, status: "LOST" } })),
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId, customerId: { not: null } } })),
    safeCount(() => model("cRMOpportunity").count({ where: { organizationId: orgId, sellerSlug: { not: null } } })),
    safeCount(() => model("cRMActivity").count({ where: { organizationId: orgId } })),
    safeCount(() => model("cRMActivity").count({ where: { organizationId: orgId, opportunityId: { not: null } } })),
    safeCount(() => model("cRMQuote").count({ where: { organizationId: orgId } })),
  ]);

  // Opportunities
  if (totalOpps < 0) {
    err("Modelo CRMOpportunity no disponible — ejecutar migración Prisma.");
  } else if (totalOpps === 0) {
    err("Sin oportunidades CRM — ejecutar castillitos_crm/opportunities.");
  } else {
    ok(`${totalOpps} oportunidades CRM`);
    info(`Abiertas: ${openOpps}  |  Ganadas: ${wonOpps}  |  Perdidas: ${lostOpps}`);
    info(`Con enlace a cliente: ${oppsWithCustomer} (${pct(oppsWithCustomer, totalOpps)})`);
    info(`Con vendedor asignado: ${oppsWithSeller} (${pct(oppsWithSeller, totalOpps)})`);

    // Stage distribution
    try {
      const byStage = await model("cRMOpportunity").groupBy({
        by: ["stage"],
        where: { organizationId: orgId, status: "OPEN" },
        _count: { id: true },
      });
      if (byStage.length) {
        console.log(`\n  ${C.grey}Distribución por etapa (abiertas):${C.reset}`);
        byStage.forEach(s =>
          console.log(`    ${s["stage"]}: ${(s["_count"] as Record<string, number>)["id"]}`)
        );
      }
    } catch { /* skip */ }

    if (VERBOSE) {
      const oppSample = await model("cRMOpportunity").findMany({
        where: { organizationId: orgId, status: "OPEN" },
        select: { crmId: true, title: true, stage: true, amount: true, sellerName: true, lastActivityAt: true, expectedCloseAt: true },
        orderBy: { amount: "desc" },
        take: 5,
      }).catch(() => []);
      if (oppSample.length) {
        console.log(`\n  ${C.grey}Muestra oportunidades abiertas (top 5 por monto):${C.reset}`);
        oppSample.forEach((o, i) => {
          const stale = daysSince(o["lastActivityAt"] as Date);
          console.log(`    ${i + 1}. [${o["stage"]}] ${o["title"]}  ${money(o["amount"])}  ${o["sellerName"] ?? "—"}  sin actividad: ${stale === 9999 ? "nunca" : stale + "d"}`);
        });
      }
    }
  }

  // Activities
  if (totalActivities < 0) {
    err("Modelo CRMActivity no disponible.");
  } else if (totalActivities === 0) {
    warn("Sin actividades CRM — ejecutar castillitos_crm/activities.");
  } else {
    ok(`${totalActivities} actividades CRM`);
    info(`Enlazadas a oportunidad: ${activitiesWithOpp} (${pct(activitiesWithOpp, totalActivities)})`);
  }

  // Quotes
  if (totalQuotes < 0) {
    err("Modelo CRMQuote no disponible.");
  } else if (totalQuotes === 0) {
    warn("Sin cotizaciones CRM — ejecutar castillitos_crm/quotes.");
  } else {
    ok(`${totalQuotes} cotizaciones CRM`);
    try {
      const byStatus = await model("cRMQuote").groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { id: true },
      });
      byStatus.forEach(s =>
        info(`  ${s["status"]}: ${(s["_count"] as Record<string, number>)["id"]}`)
      );
    } catch { /* skip */ }
  }

  // Stale opportunities
  const staleCutoff = new Date(Date.now() - 21 * 86_400_000);
  const staleOpps = await model("cRMOpportunity").findMany({
    where: {
      organizationId: orgId,
      status: "OPEN",
      OR: [
        { lastActivityAt: { lt: staleCutoff } },
        { lastActivityAt: null, openedAt: { lt: staleCutoff } },
      ],
    },
    select: { title: true, stage: true, amount: true, sellerName: true, lastActivityAt: true },
    orderBy: { amount: "desc" },
    take: 5,
  }).catch(() => []);

  if (staleOpps.length > 0) {
    warn(`${staleOpps.length} oportunidades sin actividad hace >21 días:`);
    staleOpps.forEach((o, i) => {
      const stale = daysSince(o["lastActivityAt"] as Date);
      console.log(`    ${i + 1}. ${o["title"]} — ${money(o["amount"])} — ${stale === 9999 ? "sin actividad" : stale + "d"} — ${o["sellerName"] ?? "—"}`);
    });
  }

  // Lost deals with reason
  const lostWithReason = await model("cRMOpportunity").findMany({
    where: { organizationId: orgId, status: "LOST", lossReason: { not: null } },
    select: { title: true, lossReason: true, amount: true },
    take: 3,
  }).catch(() => []);
  if (lostWithReason.length > 0) {
    info(`Razones de pérdida registradas: ${lostWithReason.length}`);
    if (VERBOSE) lostWithReason.forEach(o =>
      console.log(`    ${o["title"]} — ${o["lossReason"]} — ${money(o["amount"])}`)
    );
  }

  // CRM connector runs
  const crmRuns = await prisma.connectorRun.findMany({
    where: { organizationId: orgId, source: "castillitos_crm" },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { module: true, status: true, rowsRead: true, rowsImported: true, startedAt: true, error: true },
  });
  if (crmRuns.length === 0) {
    warn("Sin historial de ejecuciones CRM — conector no ha sincronizado.");
  } else {
    console.log(`\n  ${C.grey}Últimas ejecuciones CRM (${crmRuns.length}):${C.reset}`);
    crmRuns.forEach(r => {
      const icon = r.status === "SUCCESS" ? C.green + "✓" : (r.status === "PARTIAL" ? C.yellow + "~" : C.red + "✗");
      console.log(`    ${icon}${C.reset} ${r.module} | ${r.status} | leídos: ${r.rowsRead ?? 0} | importados: ${r.rowsImported ?? 0} | ${r.startedAt.toISOString().slice(0, 19)}`);
      if (r.error) console.log(`       Error: ${r.error}`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 3 — Customer Matching Validation
  // ─────────────────────────────────────────────────────────────────────────────

  section("FASE 3 — Validación de Coincidencia ERP ↔ CRM");

  const [crmLinked, bothLinked] = await Promise.all([
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, crmSyncedAt: { not: null } } })),
    safeCount(() => model("customerProfile").count({ where: { organizationId: orgId, erpSyncedAt: { not: null }, crmSyncedAt: { not: null } } })),
  ]);

  if (totalCustomers > 0) {
    info(`Total perfiles:  ${totalCustomers}`);
    info(`Solo ERP:        ${Math.max(0, erpLinked - bothLinked)}`);
    info(`Solo CRM:        ${Math.max(0, crmLinked - bothLinked)}`);

    if (bothLinked > 0) {
      ok(`${bothLinked} clientes con datos ERP + CRM enlazados (${pct(bothLinked, totalCustomers)})`);
    } else if (crmLinked === 0) {
      warn("Sin clientes con datos CRM — sincronizar castillitos_crm/opportunities primero.");
    } else {
      err(`Clientes con datos ERP (${erpLinked}) y CRM (${crmLinked}) existen pero NINGUNO está enlazado.`);
      err("Posible causa: NIT en CRM no normalizado. Verificar que este commit de fix está desplegado.");
    }

    // Unmatched opps
    const unmatchedOpps = await model("cRMOpportunity").findMany({
      where: {
        organizationId: orgId,
        customerId: null,
        OR: [{ customerTaxId: { not: null } }, { customerName: { not: null } }],
      },
      select: { title: true, customerName: true, customerTaxId: true, amount: true },
      orderBy: { amount: "desc" },
      take: 5,
    }).catch(() => []);

    if (unmatchedOpps.length > 0) {
      warn(`${unmatchedOpps.length} oportunidades sin enlace a cliente (muestra):`);
      unmatchedOpps.forEach((o, i) =>
        console.log(`    ${i + 1}. "${o["customerName"]}"  NIT: ${o["customerTaxId"] ?? "—"}  ${money(o["amount"])}`)
      );
      warn("Posible causa: NIT en CRM con formato diferente al ERP (ej: con puntos/guión).");
      warn("El fix de normalización en storage.ts resolverá esto en la próxima sincronización CRM.");
    } else if (totalOpps > 0) {
      ok("Todas las oportunidades con NIT tienen enlace a cliente.");
    }

    // Linked customer sample
    if (VERBOSE && bothLinked > 0) {
      const linked = await model("customerProfile").findMany({
        where: { organizationId: orgId, erpSyncedAt: { not: null }, crmSyncedAt: { not: null } },
        select: { nit: true, name: true, ltv: true, riskScore: true, churnRisk: true },
        orderBy: { ltv: "desc" },
        take: 5,
      }).catch(() => []);
      console.log(`\n  ${C.grey}Muestra clientes con datos ERP+CRM:${C.reset}`);
      linked.forEach((c, i) =>
        console.log(`    ${i + 1}. ${c["name"]}  NIT:${c["nit"] ?? "—"}  LTV:${money(c["ltv"])}  riesgo:${c["riskScore"] ?? "—"}`)
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE 4 — Scoring Validation
  // ─────────────────────────────────────────────────────────────────────────────

  section("FASE 4 — Validación de Scoring Operacional");

  const scoredCustomers = await safeCount(() =>
    model("customerProfile").count({ where: { organizationId: orgId, scoredAt: { not: null } } })
  );

  if (scoredCustomers < 0) {
    err("Modelo CustomerProfile no disponible.");
  } else if (scoredCustomers === 0) {
    if (totalCustomers > 0) {
      warn(`${totalCustomers} clientes sin scoring — ejecutar POST /api/orgs/${ORG_SLUG}/customer-360/score`);
    } else {
      err("Sin perfiles de cliente — scoring no puede ejecutarse.");
    }
  } else {
    ok(`${scoredCustomers} clientes con scoring activo (${pct(scoredCustomers, totalCustomers)})`);

    if (VERBOSE) {
      const topRisk = await model("customerProfile").findMany({
        where: { organizationId: orgId, scoredAt: { not: null } },
        select: { name: true, riskScore: true, healthScore: true, churnRisk: true, nextBestAction: true, scoredAt: true },
        orderBy: { riskScore: "desc" },
        take: 5,
      }).catch(() => []);
      if (topRisk.length) {
        console.log(`\n  ${C.grey}Top 5 clientes por riesgo:${C.reset}`);
        topRisk.forEach((c, i) =>
          console.log(`    ${i + 1}. ${c["name"]}  riesgo:${c["riskScore"]}  salud:${c["healthScore"]}  churn:${c["churnRisk"]}`)
        );
      }
    }
  }

  // At-risk deals
  if (staleOpps.length === 0 && totalOpps > 0) {
    ok("Sin oportunidades estancadas detectadas.");
  } else if (staleOpps.length > 0) {
    warn(`${staleOpps.length} deals en riesgo por inactividad — visibles en Embudo Comercial.`);
  }

  // BusinessAlerts generated
  const bizAlerts = await (prisma as unknown as {
    businessAlert?: { count: (a: unknown) => Promise<number> };
  }).businessAlert?.count({ where: { organizationId: orgId } }).catch(() => null) ?? null;

  if (bizAlerts === null) {
    warn("Modelo BusinessAlert no disponible — ejecutar migración Prisma.");
  } else if (bizAlerts === 0) {
    warn(`Sin alertas comerciales generadas — ejecutar sincronización CRM para activar el motor.`);
  } else {
    ok(`${bizAlerts} alertas comerciales activas — visibles en /alertas.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────

  section("RESUMEN — Pendientes antes de uso diario");

  const blockers: string[] = [];
  const actions: string[] = [];

  if (totalCustomers === 0)    blockers.push("Sincronizar sag_pya_soap/customers");
  if (totalReceivables === 0)  blockers.push("Sincronizar sag_pya_soap/receivables");
  if (totalOpps === 0)         blockers.push("Sincronizar castillitos_crm/opportunities");
  if (totalActivities === 0 && totalOpps > 0) blockers.push("Sincronizar castillitos_crm/activities");
  if (bothLinked === 0 && totalCustomers > 0 && totalOpps > 0) {
    blockers.push("Resolver enlace ERP↔CRM (NIT normalización — fix ya aplicado, re-sincronizar CRM)");
  }
  if (scoredCustomers === 0 && totalCustomers > 0) {
    actions.push(`Activar scoring: POST /api/orgs/${ORG_SLUG}/customer-360/score`);
  }
  if ((bizAlerts ?? 0) === 0 && totalOpps > 0) {
    actions.push("Alertas comerciales se generarán automáticamente tras la próxima sincronización CRM");
  }

  if (blockers.length === 0) {
    ok("Sin bloqueadores críticos — datos listos para uso diario.");
  } else {
    blockers.forEach(b => err(`[BLOQUEADOR] ${b}`));
  }
  actions.forEach(a => warn(`[ACCIÓN] ${a}`));

  console.log();
}

main()
  .catch(e => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
