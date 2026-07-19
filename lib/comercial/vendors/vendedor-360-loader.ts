/**
 * vendedor-360-loader.ts
 *
 * VENDEDORES-360-01
 *
 * Loads all available data for a single vendedor from CRM + cartera + maletas.
 * Uses 2-phase parallel queries (same pattern as cliente-360-loader.ts).
 *
 * Sources:
 *   - CRMQuote (primary seller identity + pedidos CRM)
 *   - CustomerProfile (linked clients)
 *   - CustomerReceivable (cartera via customer join)
 *   - CustomerOrderRecord (pedidos SAG via NIT)
 *   - VendorCommercialBag + CommercialCase (maleta)
 *
 * NO fabricated data — "—" displayed for absent values.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/comercial/clientes/city-resolver";
import type {
  Vendedor360Data,
  Vendedor360Identity,
  Vendedor360Client,
  Vendedor360CrmQuote,
  Vendedor360SagOrder,
  Vendedor360CarteraEntry,
  Vendedor360Intelligence,
  Vendedor360Risk,
  Vendedor360Opportunity,
  Vendedor360Recommendation,
} from "./vendedor-360-types";

export type { Vendedor360Data } from "./vendedor-360-types";

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Main Loader ───────────────────────────────────────────────────────────────

export async function loadVendedor360(
  organizationId: string,
  sellerSlug: string,
): Promise<Vendedor360Data | null> {
  const db = prisma as any;
  const t0 = performance.now();

  // ── Phase 1: Load all CRM quotes for this seller ────────────────────────────
  const quotes = await db.cRMQuote.findMany({
    where: { organizationId, sellerSlug },
    select: {
      id: true,
      quoteNumber: true,
      amount: true,
      issuedAt: true,
      sellerName: true,
      rawCrmJson: true,
    },
    orderBy: { issuedAt: "desc" },
  });

  if (quotes.length === 0) {
    // Try by seller name matching the slug
    const allQuotes = await db.cRMQuote.findMany({
      where: { organizationId },
      select: { sellerName: true, sellerSlug: true },
      take: 1,
    });
    // If the org has no quotes at all, or no match, return null
    if (allQuotes.length === 0) return null;

    // Try matching by generated slug
    const matchedQuotes = await db.cRMQuote.findMany({
      where: { organizationId },
      select: {
        id: true,
        quoteNumber: true,
        amount: true,
        issuedAt: true,
        sellerName: true,
        rawCrmJson: true,
      },
      orderBy: { issuedAt: "desc" },
    });

    const filteredQuotes = matchedQuotes.filter(
      (q: any) => q.sellerName && toSlug(q.sellerName) === sellerSlug,
    );
    if (filteredQuotes.length === 0) return null;

    // Re-assign to quotes for the rest of the function
    quotes.length = 0;
    quotes.push(...filteredQuotes);
  }

  const sellerName = (quotes[0] as any).sellerName as string;
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  // ── Build identity ──────────────────────────────────────────────────────────
  const firstAt = quotes[quotes.length - 1]?.issuedAt;
  const lastAt = quotes[0]?.issuedAt;
  const lastMs = lastAt ? new Date(lastAt).getTime() : null;
  const daysSince = lastMs ? Math.round((now - lastMs) / (24 * 60 * 60 * 1000)) : null;

  const customerBillingIds = new Set<string>();
  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    if (raw.billing_account_id) customerBillingIds.add(raw.billing_account_id);
  }

  const totalCrmAmount = quotes.reduce(
    (s: number, q: any) => s + Number(q.amount ?? 0),
    0,
  );

  const identity: Vendedor360Identity = {
    sellerName,
    sellerSlug,
    sagName: null, // Will be enriched from maletas if available
    active: lastMs !== null && (now - lastMs) < ninetyDaysMs,
    firstActivityAt: firstAt?.toISOString?.() ?? (typeof firstAt === "string" ? firstAt : null),
    lastActivityAt: lastAt?.toISOString?.() ?? (typeof lastAt === "string" ? lastAt : null),
    daysSinceLastActivity: daysSince,
    crmQuoteCount: quotes.length,
    customerCount: customerBillingIds.size,
    totalCrmAmount,
  };

  // ── Phase 2: Parallel fetch of clients, SAG orders, cartera ─────────────────

  // Get customer profiles linked to this seller
  const profiles = customerBillingIds.size > 0
    ? await db.customerProfile.findMany({
        where: {
          organizationId,
          crmId: { in: [...customerBillingIds] },
        },
        select: {
          id: true,
          name: true,
          city: true,
          status: true,
          lastPurchaseAt: true,
          nit: true,
          crmId: true,
        },
      })
    : [];

  // Build profile map
  const profileMap = new Map<string, any>();
  const profileIds: string[] = [];
  const nits: string[] = [];
  for (const p of profiles) {
    profileMap.set(p.id, p);
    profileIds.push(p.id);
    if (p.nit) nits.push(p.nit);
  }

  // ── Phase 3: Cartera + SAG orders (depend on profiles) ──────────────────────

  const [receivables, sagOrders] = await Promise.all([
    // Cartera by customer IDs
    profileIds.length > 0
      ? db.customerReceivable.findMany({
          where: { organizationId, customerId: { in: profileIds } },
          select: {
            customerId: true,
            balanceDue: true,
            dueDate: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    // SAG orders by NIT
    nits.length > 0
      ? db.customerOrderRecord.findMany({
          where: { organizationId, customerNit: { in: nits } },
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            amount: true,
            status: true,
            customerName: true,
          },
          orderBy: { orderDate: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  // ── Build clients list ──────────────────────────────────────────────────────

  // Count quotes per customer
  const quotesByCustomer = new Map<string, number>();
  for (const q of quotes) {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const billingId = raw.billing_account_id;
    if (billingId) {
      quotesByCustomer.set(billingId, (quotesByCustomer.get(billingId) ?? 0) + 1);
    }
  }

  // Aggregate cartera per customer
  const carteraByCustomer = new Map<string, number>();
  for (const r of receivables) {
    const curr = carteraByCustomer.get(r.customerId) ?? 0;
    carteraByCustomer.set(r.customerId, curr + Number(r.balanceDue ?? 0));
  }

  // Build crmId → profileId map (profiles already include crmId)
  const crmIdToProfileId = new Map<string, string>();
  for (const p of profiles) {
    if (p.crmId) crmIdToProfileId.set(p.crmId, p.id);
  }

  const clients: Vendedor360Client[] = profiles.map((p: any) => ({
    profileId: p.id,
    name: p.name ?? "Sin nombre",
    city: resolveCity(p.city) ?? null,
    status: p.status ?? "ACTIVE",
    lastPurchaseAt: p.lastPurchaseAt?.toISOString?.() ?? p.lastPurchaseAt ?? null,
    carteraBalance: carteraByCustomer.get(p.id) ?? 0,
    quotesCount: 0, // will fill below
  }));

  // Fill quotesCount via crmId reverse lookup
  for (const client of clients) {
    const profile = profiles.find((p: any) => p.id === client.profileId);
    if (profile?.crmId) {
      client.quotesCount = quotesByCustomer.get(profile.crmId) ?? 0;
    }
  }

  // Sort by quotes descending
  clients.sort((a, b) => b.quotesCount - a.quotesCount);

  // ── Build CRM quotes response ───────────────────────────────────────────────

  const crmQuoteItems: Vendedor360CrmQuote[] = quotes.slice(0, 50).map((q: any) => {
    const raw = (q.rawCrmJson as any)?.raw ?? {};
    const billingId = raw.billing_account_id;
    const profileId = billingId ? crmIdToProfileId.get(billingId) : null;
    const profile = profileId ? profileMap.get(profileId) : null;

    return {
      id: q.id,
      quoteNumber: q.quoteNumber ?? null,
      amount: Number(q.amount ?? 0),
      issuedAt: q.issuedAt?.toISOString?.() ?? q.issuedAt ?? null,
      stage: raw.stage ?? "Desconocido",
      customerName: profile?.name ?? raw.billing_account_name ?? null,
      sagOrderId: raw.id_sag_c ?? null,
    };
  });

  // ── Build SAG orders response ───────────────────────────────────────────────

  const sagOrderItems: Vendedor360SagOrder[] = sagOrders.map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber ?? null,
    orderDate: o.orderDate?.toISOString?.() ?? o.orderDate ?? null,
    amount: Number(o.amount ?? 0),
    status: o.status ?? "DESCONOCIDO",
    customerName: o.customerName ?? null,
  }));

  // ── Build cartera response ──────────────────────────────────────────────────

  // Aggregate cartera per client name
  const carteraEntries: Vendedor360CarteraEntry[] = [];
  const carteraGrouped = new Map<string, { balance: number; docs: number; oldestDue: Date | null }>();

  for (const r of receivables) {
    const profile = profileMap.get(r.customerId);
    const name = profile?.name ?? "Desconocido";
    const existing = carteraGrouped.get(name) ?? { balance: 0, docs: 0, oldestDue: null };
    existing.balance += Number(r.balanceDue ?? 0);
    existing.docs++;
    const dueDate = r.dueDate ? new Date(r.dueDate) : null;
    if (dueDate && (!existing.oldestDue || dueDate < existing.oldestDue)) {
      existing.oldestDue = dueDate;
    }
    carteraGrouped.set(name, existing);
  }

  for (const [clientName, data] of carteraGrouped) {
    const daysOverdue = data.oldestDue
      ? Math.max(0, Math.round((now - data.oldestDue.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    carteraEntries.push({
      clientName,
      balanceDue: data.balance,
      documentsCount: data.docs,
      oldestDueDate: data.oldestDue?.toISOString() ?? null,
      daysOverdue,
    });
  }
  carteraEntries.sort((a, b) => b.balanceDue - a.balanceDue);

  const totalCartera = carteraEntries.reduce((s, e) => s + e.balanceDue, 0);

  // ── Build intelligence ──────────────────────────────────────────────────────

  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

  const pedidosUltimos30d = quotes.filter((q: any) => {
    const d = q.issuedAt ? new Date(q.issuedAt) : null;
    return d && d >= thirtyDaysAgo;
  }).length;

  const pedidosUltimos90d = quotes.filter((q: any) => {
    const d = q.issuedAt ? new Date(q.issuedAt) : null;
    return d && d >= ninetyDaysAgo;
  }).length;

  const clientesSinCompraReciente = clients.filter((c) => {
    if (!c.lastPurchaseAt) return true;
    const d = new Date(c.lastPurchaseAt);
    return d < ninetyDaysAgo;
  }).length;

  // Concentration: top 3 clients by cartera
  let concentracionCartera: { top3Percent: number } | null = null;
  if (totalCartera > 0 && carteraEntries.length >= 3) {
    const top3 = carteraEntries.slice(0, 3).reduce((s, e) => s + e.balanceDue, 0);
    concentracionCartera = { top3Percent: Math.round((top3 / totalCartera) * 100) };
  }

  // Risks
  const riesgos: Vendedor360Risk[] = [];
  if (clientesSinCompraReciente > 0) {
    riesgos.push({
      type: "clientes_inactivos",
      title: `${clientesSinCompraReciente} cliente(s) sin compra reciente`,
      detail: "Clientes sin actividad comercial en los ultimos 90 dias.",
    });
  }
  if (totalCartera > 0) {
    const vencidos = carteraEntries.filter(e => e.daysOverdue > 30);
    if (vencidos.length > 0) {
      riesgos.push({
        type: "cartera_vencida",
        title: `Cartera vencida en ${vencidos.length} cliente(s)`,
        detail: "Documentos con mas de 30 dias de vencimiento.",
      });
    }
  }
  if (daysSince !== null && daysSince > 30) {
    riesgos.push({
      type: "inactividad",
      title: `${daysSince} dias sin actividad CRM`,
      detail: "No se registran cotizaciones recientes para este vendedor.",
    });
  }

  // Opportunities
  const oportunidades: Vendedor360Opportunity[] = [];
  const clientesSinPedido = clients.filter(c => c.quotesCount <= 1);
  if (clientesSinPedido.length > 0) {
    oportunidades.push({
      type: "clientes_bajo_pedido",
      title: `${clientesSinPedido.length} cliente(s) con bajo volumen`,
      detail: "Clientes con 1 o menos pedidos. Potencial de crecimiento.",
    });
  }
  if (concentracionCartera && concentracionCartera.top3Percent > 60) {
    oportunidades.push({
      type: "diversificacion",
      title: "Alta concentracion en pocos clientes",
      detail: "Diversificar cartera comercial reduce riesgo de ingresos.",
    });
  }

  // Recommendations
  const recomendaciones: Vendedor360Recommendation[] = [];
  if (clientesSinCompraReciente > 2) {
    recomendaciones.push({
      type: "reactivar_clientes",
      title: "Reactivar clientes sin compra",
      detail: `Contactar ${clientesSinCompraReciente} cliente(s) sin actividad reciente.`,
    });
  }
  if (totalCartera > 0) {
    recomendaciones.push({
      type: "revisar_cartera",
      title: "Revisar cartera asociada",
      detail: "Gestionar cobros pendientes para mejorar flujo de caja.",
    });
  }
  if (pedidosUltimos30d === 0 && pedidosUltimos90d > 0) {
    recomendaciones.push({
      type: "incrementar_actividad",
      title: "Incrementar actividad comercial",
      detail: "Sin pedidos en los ultimos 30 dias. Retomar gestion activa.",
    });
  }
  if (clients.length > 0 && oportunidades.length > 0) {
    recomendaciones.push({
      type: "cobertura_comercial",
      title: "Ampliar cobertura comercial",
      detail: "Seguimiento a oportunidades abiertas y clientes con potencial.",
    });
  }

  const intelligence: Vendedor360Intelligence = {
    clientesActivos: clients.filter(c => c.status === "ACTIVE").length,
    clientesSinCompraReciente,
    concentracionCartera,
    actividadReciente: { pedidosUltimos30d, pedidosUltimos90d },
    riesgos,
    oportunidades,
    recomendaciones,
  };

  // ── Timing ──────────────────────────────────────────────────────────────────

  const elapsed = Math.round(performance.now() - t0);
  console.log(
    `[VENDEDOR360_TIMING] ${sellerName} — quotes=${quotes.length} clients=${clients.length} sagOrders=${sagOrderItems.length} cartera=${carteraEntries.length} | total=${elapsed}ms`,
  );

  return {
    identity,
    clients: {
      state: clients.length > 0 ? "disponible" : "no_disponible",
      items: clients,
    },
    crmQuotes: {
      state: crmQuoteItems.length > 0 ? "disponible" : "no_disponible",
      items: crmQuoteItems,
    },
    sagOrders: {
      state: sagOrderItems.length > 0 ? "disponible" : "no_disponible",
      items: sagOrderItems,
    },
    cartera: {
      state: totalCartera > 0 ? "provisional_sag" : "no_disponible",
      items: carteraEntries,
      totalBalance: totalCartera,
    },
    recaudos: { state: "pendiente_pya" },
    metas: { state: "pendiente_pya" },
    comisiones: { state: "pendiente_pya" },
    intelligence,
    generatedAt: new Date().toISOString(),
  };
}
