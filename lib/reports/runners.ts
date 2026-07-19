/**
 * Mobile Report Copilot — Query runners.
 *
 * Each runner takes a QuerySpec + orgId, executes Prisma queries, and returns
 * a ReportResult ready to render and export.
 */

import { prisma }         from "@/lib/prisma";
import { Prisma }         from "@prisma/client";
import type { QuerySpec, QueryFamily } from "./interpreter";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ReportColumn {
  key:      string;
  label:    string;
  numeric?: boolean;
  currency?: boolean;
}

export interface ReportKpi {
  label:     string;
  value:     string;
  highlight?: boolean;   // red highlight for alerts
  positive?:  boolean;   // green highlight
}

export interface ReportResult {
  title:       string;
  subtitle:    string;
  kpis:        ReportKpi[];
  columns:     ReportColumn[];
  rows:        Record<string, string | number | null>[];
  totalRows:   number;
  queryFamily: QueryFamily;
  querySpec:   QuerySpec;
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function extractRaw(rawCrmJson: unknown): Record<string, unknown> {
  if (!rawCrmJson || typeof rawCrmJson !== "object") return {};
  const j = rawCrmJson as Record<string, unknown>;
  return (j["raw"] && typeof j["raw"] === "object" ? j["raw"] : j) as Record<string, unknown>;
}

function str(v: unknown): string | null {
  if (v == null || v === "" || v === "null" || v === "undefined") return null;
  return String(v);
}

// ── Runner: cartera_vencida ───────────────────────────────────────────────────

async function runCarteraVencida(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const where: Prisma.CustomerReceivableWhereInput = {
    organizationId: orgId,
    daysOverdue:    { gt: 0 },
    customer: (spec.sellerQuery || spec.cityQuery) ? {
      ...(spec.sellerQuery ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
      ...(spec.cityQuery   ? { city:       { contains: spec.cityQuery,   mode: "insensitive" } } : {}),
    } : undefined,
  };

  const rows = await prisma.customerReceivable.findMany({
    where,
    include: {
      customer: { select: { sellerName: true, sellerSlug: true, city: true, nit: true, slug: true } },
    },
    orderBy: { balanceDue: "desc" },
    take: spec.limit,
  });

  const totalVencido  = rows.reduce((s, r) => s + Number(r.balanceDue), 0);
  const maxDpd        = rows.reduce((mx, r) => Math.max(mx, r.daysOverdue), 0);
  const uniqueClients = new Set(rows.map(r => r.customerName)).size;

  const parts = [spec.sellerQuery && `vendedor: ${spec.sellerQuery}`, spec.cityQuery && `ciudad: ${spec.cityQuery}`].filter(Boolean);
  const subtitle = parts.length ? parts.join(" · ") : "todos los clientes";

  return {
    title:   "Cartera vencida",
    subtitle,
    kpis: [
      { label: "Total vencido",        value: fmtCOP(totalVencido), highlight: totalVencido > 0 },
      { label: "Clientes en mora",     value: String(uniqueClients) },
      { label: "Documentos vencidos",  value: String(rows.length) },
      { label: "Máx días vencido",     value: maxDpd ? `${maxDpd} días` : "—", highlight: maxDpd > 60 },
    ],
    columns: [
      { key: "customerName", label: "Cliente" },
      { key: "nit",          label: "NIT" },
      { key: "invoiceNumber",label: "Factura" },
      { key: "balanceDue",   label: "Saldo vencido", numeric: true, currency: true },
      { key: "daysOverdue",  label: "Días vencido",  numeric: true },
      { key: "agingBucket",  label: "Aging" },
      { key: "sellerName",   label: "Vendedor" },
      { key: "city",         label: "Ciudad" },
      { key: "dueDate",      label: "Fecha venc." },
    ],
    rows: rows.map(r => ({
      customerName:  r.customerName,
      nit:           r.customerNit ?? r.customer?.nit ?? null,
      invoiceNumber: r.invoiceNumber ?? null,
      balanceDue:    Number(r.balanceDue),
      daysOverdue:   r.daysOverdue,
      agingBucket:   r.agingBucket,
      sellerName:    r.customer?.sellerName ?? null,
      city:          r.customer?.city       ?? null,
      dueDate:       fmtDate(r.dueDate),
      // hidden navigation keys (not in columns — excluded from CSV/PDF)
      _sellerSlug:  r.customer?.sellerSlug ?? null,
      _customerKey: r.customerNit ?? r.customer?.nit ?? r.customerName ?? null,
    })),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: pedidos (CRMQuote) ────────────────────────────────────────────────

async function runPedidos(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const where: Prisma.CRMQuoteWhereInput = {
    organizationId: orgId,
    ...(spec.statusFilter?.length ? { status: { in: spec.statusFilter as Prisma.EnumQuoteStatusFilter["in"] } } : {}),
    ...(spec.sellerQuery ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
    ...(spec.dateRange   ? { issuedAt:   { gte: spec.dateRange.from, lte: spec.dateRange.to } } : {}),
  };

  const rows = await prisma.cRMQuote.findMany({
    where,
    include: { customer: { select: { name: true, city: true, nit: true } } },
    orderBy: { issuedAt: "desc" },
    take: spec.limit,
  });

  const total    = rows.reduce((s, r) => s + Number(r.amount), 0);
  const accepted = rows.filter(r => r.status === "ACCEPTED");
  const totalAcc = accepted.reduce((s, r) => s + Number(r.amount), 0);

  const raw0     = rows[0] ? extractRaw(rows[0].rawCrmJson) : {};

  const parts = [
    spec.sellerQuery  && `vendedor: ${spec.sellerQuery}`,
    spec.statusFilter?.length && `estado: ${spec.statusFilter.join(", ")}`,
    spec.dateRange    && `desde ${fmtDate(spec.dateRange.from)}`,
  ].filter(Boolean);

  return {
    title:   "Pedidos / Cotizaciones CRM",
    subtitle: parts.length ? parts.join(" · ") : "todos",
    kpis: [
      { label: "Total pedidos",   value: String(rows.length) },
      { label: "Monto total",     value: fmtCOP(total) },
      { label: "Confirmados",     value: String(accepted.length), positive: accepted.length > 0 },
      { label: "Monto confirmado",value: fmtCOP(totalAcc) },
    ],
    columns: [
      { key: "quoteName",     label: "Pedido / Cotización" },
      { key: "quoteNumber",   label: "Número" },
      { key: "customerName",  label: "Cliente" },
      { key: "sellerName",    label: "Vendedor" },
      { key: "amount",        label: "Monto", numeric: true, currency: true },
      { key: "status",        label: "Estado" },
      { key: "stage",         label: "Etapa CRM" },
      { key: "sucursal",      label: "Sucursal" },
      { key: "sagStatus",     label: "SAG" },
      { key: "issuedAt",      label: "Fecha" },
    ],
    rows: rows.map(r => {
      const raw     = extractRaw(r.rawCrmJson);
      const idSag   = str(raw["id_sag_c"]);
      const sagResp = str(raw["respuesta_sag_c"]);
      return {
        quoteName:    str(raw["name"])      ?? r.quoteNumber ?? null,
        quoteNumber:  r.quoteNumber         ?? null,
        customerName: r.customer?.name ?? (str(raw["billing_account"]) ?? null),
        sellerName:   r.sellerName          ?? null,
        amount:       Number(r.amount),
        status:       r.status,
        stage:        str(raw["stage"])     ?? r.status,
        sucursal:     str(raw["sucursal_c"])  ?? null,
        sagStatus:    idSag ? (sagResp ?? "En SAG") : "Sin SAG",
        issuedAt:     fmtDate(r.issuedAt),
        // hidden navigation keys
        _sellerSlug:  r.sellerSlug ?? null,
        _customerKey: r.customer?.nit ?? str(raw["billing_account"]) ?? null,
        _branchName:  str(raw["sucursal_c"]) ?? null,
      };
    }),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: cotizaciones ──────────────────────────────────────────────────────

async function runCotizaciones(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  // Same as pedidos but with a different title and default to show all statuses
  const result = await runPedidos(orgId, spec);
  result.title = "Cotizaciones / Presupuestos CRM";
  return result;
}

// ── Runner: clientes ──────────────────────────────────────────────────────────

async function runClientes(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const where: Prisma.CustomerProfileWhereInput = {
    organizationId: orgId,
    ...(spec.sellerQuery    ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
    ...(spec.cityQuery      ? { city:       { contains: spec.cityQuery,   mode: "insensitive" } } : {}),
    ...(spec.riskFilter?.length ? { churnRisk: { in: spec.riskFilter } } : {}),
  };

  const rows = await prisma.customerProfile.findMany({
    where,
    orderBy: [{ overdueReceivable: "desc" }, { ltv: "desc" }],
    take: spec.limit,
  });

  const withOverdue   = rows.filter(r => Number(r.overdueReceivable ?? 0) > 0).length;
  const totalOverdue  = rows.reduce((s, r) => s + Number(r.overdueReceivable ?? 0), 0);
  const totalLtv      = rows.reduce((s, r) => s + Number(r.ltv ?? 0), 0);

  const parts = [
    spec.sellerQuery && `vendedor: ${spec.sellerQuery}`,
    spec.cityQuery   && `ciudad: ${spec.cityQuery}`,
    spec.riskFilter?.length && `riesgo: ${spec.riskFilter.join(", ")}`,
  ].filter(Boolean);

  return {
    title:    "Clientes",
    subtitle: parts.length ? parts.join(" · ") : "todos los clientes activos",
    kpis: [
      { label: "Total clientes",      value: String(rows.length) },
      { label: "Con cartera vencida", value: String(withOverdue), highlight: withOverdue > 0 },
      { label: "Cartera vencida",     value: fmtCOP(totalOverdue), highlight: totalOverdue > 0 },
      { label: "LTV total",           value: fmtCOP(totalLtv) },
    ],
    columns: [
      { key: "name",              label: "Cliente" },
      { key: "nit",               label: "NIT" },
      { key: "city",              label: "Ciudad" },
      { key: "sellerName",        label: "Vendedor" },
      { key: "overdueReceivable", label: "Cartera vencida", numeric: true, currency: true },
      { key: "ltv",               label: "LTV",             numeric: true, currency: true },
      { key: "churnRisk",         label: "Riesgo" },
      { key: "lastPurchaseAt",    label: "Última compra" },
    ],
    rows: rows.map(r => ({
      name:              r.name,
      nit:               r.nit ?? null,
      city:              r.city ?? null,
      sellerName:        r.sellerName ?? null,
      overdueReceivable: Number(r.overdueReceivable ?? 0) || null,
      ltv:               Number(r.ltv ?? 0) || null,
      churnRisk:         r.churnRisk ?? null,
      lastPurchaseAt:    fmtDate(r.lastPurchaseAt),
      // hidden navigation keys
      _sellerSlug:  r.sellerSlug ?? null,
      _customerKey: r.nit ?? r.name,
    })),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: clientes_inactivos ────────────────────────────────────────────────

async function runClientesInactivos(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const days  = spec.daysInactive ?? 60;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: Prisma.CustomerProfileWhereInput = {
    organizationId: orgId,
    lastPurchaseAt: { lt: cutoff },
    ...(spec.sellerQuery ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
    ...(spec.cityQuery   ? { city:       { contains: spec.cityQuery,   mode: "insensitive" } } : {}),
  };

  const rows = await prisma.customerProfile.findMany({
    where,
    orderBy: { lastPurchaseAt: "asc" },
    take: spec.limit,
  });

  const now   = Date.now();
  const parts = [
    spec.sellerQuery && `vendedor: ${spec.sellerQuery}`,
    spec.cityQuery   && `ciudad: ${spec.cityQuery}`,
  ].filter(Boolean);

  return {
    title:    `Clientes inactivos (+${days} días sin comprar)`,
    subtitle: parts.length ? parts.join(" · ") : "todos los vendedores",
    kpis: [
      { label: "Inactivos",         value: String(rows.length), highlight: rows.length > 0 },
      { label: "Sin comprar desde", value: fmtDate(cutoff) },
      { label: "Cartera vencida",   value: fmtCOP(rows.reduce((s, r) => s + Number(r.overdueReceivable ?? 0), 0)) },
    ],
    columns: [
      { key: "name",           label: "Cliente" },
      { key: "nit",            label: "NIT" },
      { key: "city",           label: "Ciudad" },
      { key: "sellerName",     label: "Vendedor" },
      { key: "lastPurchaseAt", label: "Última compra" },
      { key: "daysSince",      label: "Días sin comprar", numeric: true },
      { key: "ltv",            label: "LTV", numeric: true, currency: true },
      { key: "churnRisk",      label: "Riesgo" },
    ],
    rows: rows.map(r => ({
      name:           r.name,
      nit:            r.nit ?? null,
      city:           r.city ?? null,
      sellerName:     r.sellerName ?? null,
      lastPurchaseAt: fmtDate(r.lastPurchaseAt),
      daysSince:      r.lastPurchaseAt
        ? Math.floor((now - new Date(r.lastPurchaseAt).getTime()) / 86_400_000)
        : null,
      ltv:            Number(r.ltv ?? 0) || null,
      churnRisk:      r.churnRisk ?? null,
      // hidden navigation keys
      _sellerSlug:  r.sellerSlug ?? null,
      _customerKey: r.nit ?? r.name,
    })),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: top_clientes ──────────────────────────────────────────────────────

async function runTopClientes(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const limit = Math.min(spec.limit, 50);

  const where: Prisma.CustomerProfileWhereInput = {
    organizationId: orgId,
    ...(spec.sellerQuery ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
    ...(spec.cityQuery   ? { city:       { contains: spec.cityQuery,   mode: "insensitive" } } : {}),
  };

  // Prefer recent sales (L12) when available, fall back to LTV
  const rows = await prisma.customerProfile.findMany({
    where,
    orderBy: [{ totalSalesL12: { sort: "desc", nulls: "last" } }, { ltv: { sort: "desc", nulls: "last" } }],
    take: limit,
  });

  const totalRevenue = rows.reduce((s, r) => s + Number(r.totalSalesL12 ?? r.ltv ?? 0), 0);

  const parts = [
    spec.sellerQuery && `vendedor: ${spec.sellerQuery}`,
    spec.cityQuery   && `ciudad: ${spec.cityQuery}`,
  ].filter(Boolean);

  return {
    title:    `Top ${limit} clientes por ventas`,
    subtitle: parts.length ? parts.join(" · ") : "últimos 12 meses",
    kpis: [
      { label: "Clientes en ranking", value: String(rows.length) },
      { label: "Ventas acumuladas",   value: fmtCOP(totalRevenue) },
      { label: "Ticket promedio",     value: fmtCOP(rows.length ? totalRevenue / rows.length : null) },
    ],
    columns: [
      { key: "rank",         label: "#",               numeric: true },
      { key: "name",         label: "Cliente" },
      { key: "nit",          label: "NIT" },
      { key: "city",         label: "Ciudad" },
      { key: "sellerName",   label: "Vendedor" },
      { key: "salesL12",     label: "Ventas L12",      numeric: true, currency: true },
      { key: "ltv",          label: "LTV total",       numeric: true, currency: true },
      { key: "avgTicket",    label: "Ticket prom.",    numeric: true, currency: true },
      { key: "lastPurchase", label: "Última compra" },
    ],
    rows: rows.map((r, i) => ({
      rank:        i + 1,
      name:        r.name,
      nit:         r.nit ?? null,
      city:        r.city ?? null,
      sellerName:  r.sellerName ?? null,
      salesL12:    Number(r.totalSalesL12 ?? 0) || null,
      ltv:         Number(r.ltv ?? 0) || null,
      avgTicket:   Number(r.avgTicket ?? 0) || null,
      lastPurchase: fmtDate(r.lastPurchaseAt),
      // hidden navigation keys
      _sellerSlug:  r.sellerSlug ?? null,
      _customerKey: r.nit ?? r.name,
    })),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: sin_facturar ──────────────────────────────────────────────────────

async function runSinFacturar(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const where: Prisma.CRMQuoteWhereInput = {
    organizationId: orgId,
    ...(spec.sellerQuery ? { sellerName: { contains: spec.sellerQuery, mode: "insensitive" } } : {}),
    ...(spec.dateRange   ? { issuedAt:   { gte: spec.dateRange.from, lte: spec.dateRange.to } } : {}),
  };

  // Fetch all matching quotes, filter by SAG id + no invoice_status in JS
  const all = await prisma.cRMQuote.findMany({
    where,
    include: { customer: { select: { name: true, nit: true, city: true } } },
    orderBy: { issuedAt: "desc" },
    take: 500,
  });

  const rows = all.filter(q => {
    const raw          = extractRaw(q.rawCrmJson);
    const idSag        = str(raw["id_sag_c"]);
    const invoiceStatus = str(raw["invoice_status"]);
    return idSag && !invoiceStatus;
  }).slice(0, spec.limit);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return {
    title:   "Pedidos en SAG sin facturar",
    subtitle: "Sincronizados en SAG pero sin invoice_status registrado",
    kpis: [
      { label: "Pedidos sin factura", value: String(rows.length), highlight: rows.length > 0 },
      { label: "Monto total",         value: fmtCOP(total) },
    ],
    columns: [
      { key: "quoteName",    label: "Pedido" },
      { key: "quoteNumber",  label: "Número" },
      { key: "customerName", label: "Cliente" },
      { key: "sellerName",   label: "Vendedor" },
      { key: "amount",       label: "Monto", numeric: true, currency: true },
      { key: "stage",        label: "Etapa CRM" },
      { key: "idSag",        label: "ID SAG" },
      { key: "sucursal",     label: "Sucursal" },
      { key: "issuedAt",     label: "Fecha" },
    ],
    rows: rows.map(r => {
      const raw = extractRaw(r.rawCrmJson);
      return {
        quoteName:    str(raw["name"]) ?? r.quoteNumber ?? null,
        quoteNumber:  r.quoteNumber   ?? null,
        customerName: r.customer?.name ?? str(raw["billing_account"]) ?? null,
        sellerName:   r.sellerName    ?? null,
        amount:       Number(r.amount),
        stage:        str(raw["stage"])      ?? r.status,
        idSag:        str(raw["id_sag_c"])   ?? null,
        sucursal:     str(raw["sucursal_c"]) ?? null,
        issuedAt:     fmtDate(r.issuedAt),
        // hidden navigation keys
        _sellerSlug:  r.sellerSlug ?? null,
        _customerKey: r.customer?.nit ?? str(raw["billing_account"]) ?? null,
        _branchName:  str(raw["sucursal_c"]) ?? null,
      };
    }),
    totalRows:   rows.length,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Runner: alertas_criticas ──────────────────────────────────────────────────

async function runAlertasCriticas(orgId: string, spec: QuerySpec): Promise<ReportResult> {
  const alerts = await prisma.businessAlert.findMany({
    where: {
      organizationId: orgId,
      status:         "OPEN",
      severity:       "CRITICAL",
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take:    spec.limit,
  });

  const total = await prisma.businessAlert.count({
    where: { organizationId: orgId, status: "OPEN" },
  });

  const critCount  = alerts.length;
  const openCount  = total;

  return {
    title:    "Alertas Críticas Abiertas",
    subtitle: `${critCount} alerta${critCount !== 1 ? "s" : ""} crítica${critCount !== 1 ? "s" : ""} · ${openCount} alertas abiertas en total`,
    kpis: [
      { label: "Alertas críticas", value: String(critCount), highlight: critCount > 0 },
      { label: "Total abiertas",   value: String(openCount)                           },
    ],
    columns: [
      { key: "severity",    label: "Severidad"  },
      { key: "type",        label: "Tipo"       },
      { key: "title",       label: "Alerta"     },
      { key: "entityLabel", label: "Entidad"    },
      { key: "message",     label: "Detalle"    },
      { key: "createdAt",   label: "Fecha"      },
    ],
    rows: alerts.map(a => ({
      severity:    a.severity,
      type:        a.type,
      title:       a.title,
      entityLabel: a.entityLabel ?? a.entityType,
      message:     a.message ?? null,
      createdAt:   fmtDate(a.createdAt),
    })),
    totalRows:   critCount,
    queryFamily: spec.family,
    querySpec:   spec,
    generatedAt: new Date().toISOString(),
  };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function runReport(
  orgId: string,
  spec:  QuerySpec,
): Promise<ReportResult> {
  switch (spec.family) {
    case "cartera_vencida":    return runCarteraVencida(orgId, spec);
    case "pedidos":            return runPedidos(orgId, spec);
    case "cotizaciones":       return runCotizaciones(orgId, spec);
    case "clientes":           return runClientes(orgId, spec);
    case "clientes_inactivos": return runClientesInactivos(orgId, spec);
    case "top_clientes":       return runTopClientes(orgId, spec);
    case "sin_facturar":       return runSinFacturar(orgId, spec);
    case "alertas_criticas":   return runAlertasCriticas(orgId, spec);
    default:                   return runPedidos(orgId, spec);
  }
}
