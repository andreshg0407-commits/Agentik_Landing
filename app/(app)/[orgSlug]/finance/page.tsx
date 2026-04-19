import Link from "next/link";
import React from "react";
import type { AlertSeverity, DocumentType } from "@prisma/client";
import { ActionTaskType, ActionTaskPriority } from "@prisma/client";
import { requireOrgAccess } from "@/lib/auth/org-access";
import ActionButton from "@/app/(app)/[orgSlug]/_action-button";
import ContextHeader from "@/components/app/context-header";
import ProcessButton from "@/components/finance/process-button";
import ProcessAllButton from "@/components/finance/process-all-button";
import {
  getFinanceOverview,
  getRecentFinancialDocuments,
  getFinancialAlerts,
  getRecentFinancialActivity,
  getValidationStatusCounts,
  FINANCIAL_DOC_TYPES,
  type RecentFinancialDocument,
  type ValidationStatusCounts,
  type FinanceDocumentFilters,
} from "@/lib/finance/queries";
import {
  getFpaRevenueForecast,
  getFpaBudgets,
  getFpaVariance,
  getFpaCashFlow,
  buildFpaRecommendations,
  type RevenueForecast,
  type BudgetRow,
  type VarianceRow,
  type CashFlowSummary,
  type FpaRecommendation,
} from "@/lib/finance/fpa-queries";
import { statusLabel, severityLabel, validationLabel, badgeTone } from "@/lib/ui/status-labels";
import {
  getReconciliationSummary,
  type ReconciliationSummary,
  type ReconciliationItem,
  type ReconciliationStatus,
} from "@/lib/finance/reconciliation";
import {
  getAccountingClassifications,
  type ClassificationBatch,
  type AccountingClassification,
} from "@/lib/finance/accounting-classifier";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  CHART_OF_ACCOUNTS,
  AUTO_APPROVE_THRESHOLD,
  type AccountingCategory,
} from "@/lib/finance/accounting-taxonomy";
import {
  getDianFiscalSummary,
  FISCAL_STATUS_STYLE,
  type FiscalSummary,
  type FiscalDocument,
  type FiscalStatus,
} from "@/lib/finance/dian-read";
import {
  computeCloseScore,
  type CloseScore,
  type CloseScoreDimension,
  type CloseGrade,
} from "@/lib/finance/close-score";
import {
  buildCommitteeReport,
  type CommitteeReport,
  type CommitteeRisk,
  type CommitteeOpportunity,
  type LiquiditySummary,
  type BudgetSummary as CommitteeBudgetSummary,
} from "@/lib/finance/close-committee";
import { C, T, S, R } from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge } from "@/components/shell/primitives";

// ── Tabs ──────────────────────────────────────────────────────────────────────

type FinanceTab = "ops" | "planning";
const TABS: { id: FinanceTab; label: string }[] = [
  { id: "ops",      label: "Operaciones" },
  { id: "planning", label: "Planeación y Presupuesto" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fmtAmount(
  amount: { toString(): string } | null,
  currency: string | null,
) {
  if (!amount) return "—";
  if (!currency) return amount.toString();
  const n = parseFloat(amount.toString());
  if (!isFinite(n)) return `${amount.toString()} ${currency}`;
  const noDecimals = new Set(["COP", "CLP", "PEN"]);
  const decimals   = noDecimals.has(currency.toUpperCase()) ? 0 : 2;
  const number     = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  const dollarSign = new Set(["COP", "USD", "MXN", "ARS", "CLP", "CAD"]);
  return dollarSign.has(currency.toUpperCase()) ? `$${number}` : `${number} ${currency.toUpperCase()}`;
}

function fmtCurrency(n: number, currency = "COP"): string {
  const noDecimals = new Set(["COP", "CLP", "PEN"]);
  const decimals   = noDecimals.has(currency) ? 0 : 2;
  const formatted  = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `$${formatted}`;
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// ── Document meta helpers ─────────────────────────────────────────────────────

type ProcessingMode  = "xml-first" | "pdf-fallback" | "xml-and-pdf" | "manual-review-needed";
type ValidationStatus = "VALID" | "INCOMPLETE" | "REVIEW_REQUIRED";

function parseDocMeta(doc: RecentFinancialDocument): {
  processingMode:   ProcessingMode | null;
  validationStatus: ValidationStatus | null;
  validationErrors: string[];
} {
  const ej = doc.extractedJson as Record<string, unknown> | null;
  if (!ej) return { processingMode: null, validationStatus: null, validationErrors: [] };
  return {
    processingMode:   (ej.processingMode   as ProcessingMode   | undefined) ?? null,
    validationStatus: (ej.validationStatus as ValidationStatus | undefined) ?? null,
    validationErrors: (ej.validationErrors as string[]         | undefined) ?? [],
  };
}

const MODE_STYLE: Record<ProcessingMode, { color: string; label: string }> = {
  "xml-first":            { color: "#2e7d32", label: "XML"       },
  "xml-and-pdf":          { color: "#1565c0", label: "XML+PDF"   },
  "pdf-fallback":         { color: "#f57f17", label: "PDF"       },
  "manual-review-needed": { color: "#b71c1c", label: "MANUAL"    },
};

const VALIDATION_STYLE: Record<ValidationStatus, { color: string; bg: string; border: string }> = {
  VALID:           { color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
  INCOMPLETE:      { color: "#b71c1c", bg: "#fce4ec", border: "#f48fb1" },
  REVIEW_REQUIRED: { color: "#f57f17", bg: "#fff8e1", border: "#ffe082" },
};

const SEVERITY_ORDER: AlertSeverity[] = ["CRITICAL", "WARNING", "INFO"];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function FinancePage({
  params,
  searchParams,
}: {
  params:       { orgSlug: string };
  searchParams: { vs?: string; pm?: string; dt?: string; tab?: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const tab: FinanceTab  = searchParams.tab === "planning" ? "planning" : "ops";

  const filters: FinanceDocumentFilters = {
    validationStatus: searchParams.vs || undefined,
    processingMode:   searchParams.pm || undefined,
    docType:          (searchParams.dt as DocumentType) || undefined,
  };

  // Load ops data always; FP&A data only on the planning tab.
  // cashFlow is always loaded for the close score widget.
  const [overview, documents, alerts, activity, validationCounts, reconciliation, accountingBatch, fiscal, cashFlow] = await Promise.all([
    getFinanceOverview(organization.id),
    getRecentFinancialDocuments(organization.id, filters),
    getFinancialAlerts(organization.id),
    getRecentFinancialActivity(organization.id),
    getValidationStatusCounts(organization.id),
    getReconciliationSummary(organization.id),
    getAccountingClassifications(organization.id),
    getDianFiscalSummary(organization.id),
    getFpaCashFlow(organization.id),
  ]);

  const groupedAlerts = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: alerts.filter((a) => a.severity === severity),
  })).filter((g) => g.items.length > 0);

  let forecast:  RevenueForecast   | null = null;
  let budgets:   BudgetRow[]              = [];
  let variance:  { rows: VarianceRow[]; hasData: boolean } = { rows: [], hasData: false };
  let fpaRecs:   FpaRecommendation[]      = [];

  if (tab === "planning") {
    const year = new Date().getFullYear();
    [forecast, budgets, variance] = await Promise.all([
      getFpaRevenueForecast(organization.id),
      getFpaBudgets(organization.id, year),
      getFpaVariance(organization.id, year),
    ]);
    fpaRecs = buildFpaRecommendations(forecast, variance, cashFlow);
  }

  // ── Cierre financiero — sprint 4 ──────────────────────────────────────────
  const closeScore    = computeCloseScore(fiscal, reconciliation, accountingBatch, validationCounts, cashFlow);
  const committee     = buildCommitteeReport(
    closeScore, fiscal, reconciliation, accountingBatch, cashFlow,
    variance.hasData ? variance.rows : null,
    overview, fpaRecs,
  );

  const tabBaseUrl = (t: FinanceTab) => `/${params.orgSlug}/finance?tab=${t}`;

  return (
    <main>
      <ContextHeader organization={organization} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: S[4], marginBottom: S[1] }}>
        <h1 style={{ margin: 0, fontSize: T.sz["4xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>Finanzas</h1>
        {tab === "ops" && <ProcessAllButton organizationId={organization.id} />}
      </div>
      <p style={{ color: C.inkLight, marginTop: S[1], marginBottom: S[4], fontSize: T.sz.md }}>
        {tab === "ops"
          ? "Operaciones financieras — documentos, alertas y actividad reciente."
          : "Planeación estratégica — proyecciones, presupuesto, varianza y flujo de caja."}
      </p>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `2px solid ${C.line}`,
        marginBottom: S[8] - 4,
      }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabBaseUrl(t.id)}
            style={{
              padding:      "8px 20px",
              fontSize:     T.sz.lg,
              fontWeight:   tab === t.id ? T.wt.bold : T.wt.normal,
              color:        tab === t.id ? C.ink : C.inkLight,
              borderBottom: tab === t.id ? `2px solid ${C.ink}` : "2px solid transparent",
              marginBottom: -2,
              textDecoration: "none",
              whiteSpace:   "nowrap",
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — OPERACIONES (existing)
          ══════════════════════════════════════════════════════════════════ */}
      {tab === "ops" && (
        <>
          {/* Summary */}
          <section style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12, margin: "0 0 24px",
          }}>
            <StatCard value={overview.documents.pending}  label="Documentos pendientes"
              note={`${overview.documents.total} total`}
              highlight={overview.documents.pending > 0} />
            <StatCard value={overview.documents.processed} label="Documentos procesados" />
            <StatCard value={overview.documents.errors}    label="Errores en documentos"
              highlight={overview.documents.errors > 0} highlightColor="#c00" />
            <StatCard value={overview.openAlerts}          label="Alertas abiertas"
              highlight={overview.openAlerts > 0}
              highlightColor={overview.openAlerts > 0 ? "#b45" : undefined}
              note={overview.recentFailedRuns > 0
                ? `${overview.recentFailedRuns} ejecuciones fallidas (7d)`
                : undefined} />
          </section>

          {/* ── Cierre financiero — compact widget ─────────────────────── */}
          <CloseScoreWidget
            score={closeScore}
            orgSlug={params.orgSlug}
          />

          {/* Recent Documents */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 8px" }}>
              <h2 style={{ margin: 0 }}>Documentos recientes</h2>
              <Link href={`/${params.orgSlug}/documents`} style={{ fontSize: 13, opacity: 0.7 }}>
                Ver todos →
              </Link>
            </div>
            <ValidationSummaryBar counts={validationCounts} orgSlug={params.orgSlug} />
            <FilterBar orgSlug={params.orgSlug} filters={filters} />

            {documents.length === 0 ? (
              <p>Aún no hay documentos financieros.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Título</th><th>Tipo</th><th>Estado</th>
                    <th>Validación</th><th>Modo</th><th>Emisor</th>
                    <th>Monto</th><th>Fecha</th><th></th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const meta      = parseDocMeta(doc);
                    const vs        = meta.validationStatus;
                    const pm        = meta.processingMode;
                    const needsAction =
                      doc.status === "ERROR" || doc.status === "REJECTED" ||
                      vs === "INCOMPLETE" || vs === "REVIEW_REQUIRED";
                    return (
                      <tr key={doc.id}>
                        <td>
                          <Link href={`/${params.orgSlug}/documents/${doc.id}`}>{doc.title}</Link>
                        </td>
                        <td><span style={{ fontSize: 12 }}>{doc.category ?? doc.type}</span></td>
                        <td><StatusBadge status={doc.status} /></td>
                        <td>
                          {vs ? (
                            <span
                              title={meta.validationErrors.join("\n") || undefined}
                              style={{
                                fontSize: 11, fontWeight: 600,
                                color: VALIDATION_STYLE[vs].color, background: VALIDATION_STYLE[vs].bg,
                                border: `1px solid ${VALIDATION_STYLE[vs].border}`,
                                borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
                                cursor: meta.validationErrors.length > 0 ? "help" : undefined,
                              }}
                            >
                              {validationLabel(vs)}
                            </span>
                          ) : "—"}
                        </td>
                        <td>
                          {pm ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: MODE_STYLE[pm].color, whiteSpace: "nowrap" }}>
                              {MODE_STYLE[pm].label}
                            </span>
                          ) : "—"}
                        </td>
                        <td>{doc.issuerName ?? "—"}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtAmount(doc.amount, doc.currency)}
                        </td>
                        <td>{doc.documentDate ? fmt(doc.documentDate) : fmt(doc.createdAt)}</td>
                        <td>
                          <ProcessButton
                            documentId={doc.id}
                            organizationId={organization.id}
                            documentStatus={doc.status}
                            hasOverrides={
                              typeof doc.extractedJson === "object" &&
                              doc.extractedJson !== null &&
                              !Array.isArray(doc.extractedJson) &&
                              Object.keys((doc.extractedJson as Record<string, unknown>).overrides ?? {}).length > 0
                            }
                          />
                        </td>
                        <td>
                          {needsAction && (
                            <ActionButton
                              orgSlug={params.orgSlug}
                              label="Acción"
                              size="xs"
                              variant="outline"
                              prefill={{
                                sourceModule: "finanzas",
                                actionType:   ActionTaskType.ABRIR_ALERTA_OPERATIVA,
                                priority:     ActionTaskPriority.HIGH,
                                targetType:   "documento",
                                targetLabel:  doc.title,
                                title:        `Revisar documento con error: ${doc.title}`,
                                description:  `Documento ${doc.type} con estado ${doc.status}${vs ? `, validación: ${vs}` : ""}. ${meta.validationErrors.length > 0 ? "Errores: " + meta.validationErrors.slice(0, 2).join(", ") : ""}`.trim(),
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* ── Conciliación bancaria y documental ────────────────────────── */}
          <ReconciliationSection
            reconciliation={reconciliation}
            orgSlug={params.orgSlug}
          />

          {/* ── Clasificación contable automática ─────────────────────────── */}
          <AccountingSection
            batch={accountingBatch}
            orgSlug={params.orgSlug}
          />

          {/* ── Verdad fiscal / DIAN ──────────────────────────────────────── */}
          <DianFiscalSection fiscal={fiscal} orgSlug={params.orgSlug} />

          {/* Alerts */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "24px 0 8px" }}>
              <h2 style={{ margin: 0 }}>Alertas</h2>
              <Link href={`/${params.orgSlug}/alerts`} style={{ fontSize: 13, opacity: 0.7 }}>
                Ver todas →
              </Link>
            </div>
            {groupedAlerts.length === 0 ? (
              <p>Sin alertas financieras abiertas.</p>
            ) : (
              groupedAlerts.map(({ severity, items }) => (
                <div key={severity} style={{ marginBottom: 16 }}>
                  <h3 style={{
                    margin: "0 0 6px", fontSize: 13, fontWeight: 600,
                    color: severity === "CRITICAL" ? "#c00" : severity === "WARNING" ? "#a60" : "#555",
                  }}>
                    {severityLabel(severity)}
                  </h3>
                  <table>
                    <thead><tr><th>Título</th><th>Tipo</th><th>Estado</th><th>Desde</th><th></th></tr></thead>
                    <tbody>
                      {items.map((alert) => (
                        <tr key={alert.id}>
                          <td>
                            <Link href={`/${params.orgSlug}/alerts/${alert.id}`}>{alert.title}</Link>
                          </td>
                          <td style={{ fontSize: 12 }}>{alert.type}</td>
                          <td>{statusLabel(alert.status)}</td>
                          <td>{fmt(alert.createdAt)}</td>
                          <td>
                            <ActionButton
                              orgSlug={params.orgSlug}
                              label={severity === "CRITICAL" ? "Escalar" : "Crear acción"}
                              size="xs"
                              variant={severity === "CRITICAL" ? "danger" : "outline"}
                              prefill={{
                                sourceModule: "finanzas",
                                actionType:   severity === "CRITICAL"
                                  ? ActionTaskType.ESCALAR_A_GERENCIA
                                  : ActionTaskType.ABRIR_ALERTA_OPERATIVA,
                                priority: severity === "CRITICAL"
                                  ? ActionTaskPriority.URGENT
                                  : ActionTaskPriority.HIGH,
                                targetType:  "alerta_financiera",
                                targetLabel: alert.title,
                                title: severity === "CRITICAL"
                                  ? `Escalar alerta: ${alert.title}`
                                  : `Revisar alerta: ${alert.title}`,
                                description: `Alerta ${alert.type} con severidad ${severity}. Estado actual: ${alert.status}.`,
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>

          {/* Activity */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "24px 0 8px" }}>
              <h2 style={{ margin: 0 }}>Actividad</h2>
              <Link href={`/${params.orgSlug}/runs`}   style={{ fontSize: 13, opacity: 0.7 }}>Ejecuciones →</Link>
              <Link href={`/${params.orgSlug}/events`} style={{ fontSize: 13, opacity: 0.7 }}>Eventos →</Link>
            </div>
            {activity.length === 0 ? (
              <p>Sin actividad financiera reciente.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Operación</th><th>Estado</th><th>Origen</th><th>Fecha</th><th></th></tr>
                </thead>
                <tbody>
                  {activity.map((item) => {
                    const isFailed = item.status === "FAILED" || item.status === "ERROR";
                    return (
                      <tr key={`${item.kind}-${item.id}`}>
                        <td style={{ fontSize: 12, opacity: 0.7 }}>
                          {item.kind === "run" ? "Ejecución" : "Evento"}
                        </td>
                        <td>
                          <Link href={`/${params.orgSlug}/${item.kind}s/${item.id}`} style={{ fontSize: 13 }}>
                            {item.type}
                          </Link>
                        </td>
                        <td><StatusBadge status={item.status} /></td>
                        <td style={{ fontSize: 12, opacity: 0.7 }}>{item.sourceType ?? "—"}</td>
                        <td style={{ fontSize: 12 }}>
                          {item.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC
                        </td>
                        <td>
                          {isFailed && (
                            <ActionButton
                              orgSlug={params.orgSlug}
                              label="Acción"
                              size="xs"
                              variant="outline"
                              prefill={{
                                sourceModule: "finanzas",
                                actionType:   ActionTaskType.ABRIR_ALERTA_OPERATIVA,
                                priority:     ActionTaskPriority.HIGH,
                                targetType:   item.kind === "run" ? "ejecucion" : "evento",
                                title:        `Revisar ejecución fallida: ${item.type}`,
                                description:  `${item.kind === "run" ? "Ejecución" : "Evento"} de tipo "${item.type}" falló con estado ${item.status}. Origen: ${item.sourceType ?? "desconocido"}.`,
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — PLANEACIÓN Y PRESUPUESTO (FP&A)
          ══════════════════════════════════════════════════════════════════ */}
      {tab === "planning" && (
        <>
          {/* ── Cierre financiero inteligente ──────────────────────────────── */}
          <CloseSection
            score={closeScore}
            committee={committee}
            orgSlug={params.orgSlug}
          />

          {/* ── FP&A View ─────────────────────────────────────────────────── */}
          {forecast && cashFlow && (
            <FpaView
              orgSlug={params.orgSlug}
              forecast={forecast}
              budgets={budgets}
              variance={variance}
              cashFlow={cashFlow}
              recommendations={fpaRecs}
            />
          )}
        </>
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FP&A VIEW
// ══════════════════════════════════════════════════════════════════════════════

function FpaView({
  orgSlug,
  forecast,
  budgets,
  variance,
  cashFlow,
  recommendations,
}: {
  orgSlug:         string;
  forecast:        RevenueForecast;
  budgets:         BudgetRow[];
  variance:        { rows: VarianceRow[]; hasData: boolean };
  cashFlow:        CashFlowSummary;
  recommendations: FpaRecommendation[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>

      {/* ── 1. AI Recommendations ────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <FpaSection title="Recomendaciones IA" icon="✦">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recommendations.map((rec) => (
              <FpaRecommendationCard key={rec.id} rec={rec} orgSlug={orgSlug} />
            ))}
          </div>
        </FpaSection>
      )}

      {/* ── 2. Revenue Forecast ──────────────────────────────────────────── */}
      <FpaSection title="Proyección de ingresos" icon="↗">
        {!forecast.hasData ? (
          <FpaEmpty message="Sin datos de ventas aún. Importa registros SAG para activar las proyecciones." />
        ) : (
          <>
            {/* KPI row */}
            {forecast.yoyGrowthPct !== null && forecast.yoyGrowthPct < -10 && (
              <div style={{ marginBottom: 12 }}>
                <ActionButton
                  orgSlug={orgSlug}
                  label="Escalar proyección"
                  size="xs"
                  variant="danger"
                  icon="⚠"
                  prefill={{
                    sourceModule: "finanzas",
                    actionType:   ActionTaskType.ESCALAR_A_GERENCIA,
                    priority:     ActionTaskPriority.HIGH,
                    targetType:   "proyeccion_ingresos",
                    title:        `Proyección por debajo del año anterior (${fmtPct(forecast.yoyGrowthPct)} YoY)`,
                    description:  `La proyección de ingresos del mes actual muestra un crecimiento YoY de ${fmtPct(forecast.yoyGrowthPct)}. Mes actual: ${fmtCurrency(forecast.monthToDate)}. Proyección: ${fmtCurrency(forecast.monthProjection)}.`,
                  }}
                />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              <FpaKpi
                label={`Mes actual (día ${forecast.dayOfMonth}/${forecast.daysInMonth})`}
                value={fmtCurrency(forecast.monthToDate)}
                sub={`Proyección mes: ${fmtCurrency(forecast.monthProjection)}`}
                trend={forecast.yoyGrowthPct !== null
                  ? { pct: forecast.yoyGrowthPct, label: "vs mismo mes año anterior" }
                  : undefined}
              />
              <FpaKpi
                label={`Q${forecast.currentQuarter} — acumulado`}
                value={fmtCurrency(forecast.quarterToDate)}
                sub={`Proyección trimestre: ${fmtCurrency(forecast.quarterForecast)}`}
              />
              <FpaKpi
                label="Últimos 12 meses"
                value={fmtCurrency(forecast.rolling12Total)}
                sub={`${forecast.rolling12Months.length} meses con datos`}
              />
            </div>

            {/* Rolling 12M bar chart (CSS-only) */}
            {forecast.rolling12Months.length > 0 && (
              <Rolling12Chart months={forecast.rolling12Months} />
            )}
          </>
        )}
      </FpaSection>

      {/* ── 3. Budget Allocation ─────────────────────────────────────────── */}
      <FpaSection title="Asignación de presupuesto" icon="⊞">
        {budgets.length === 0 ? (
          <FpaEmpty
            message="Aún no hay presupuesto configurado para este año."
            action={{ label: "Configurar presupuesto via API", href: `#` }}
            hint={`POST /api/orgs/${orgSlug}/finance/budget`}
          />
        ) : (
          <BudgetTable rows={budgets} />
        )}
      </FpaSection>

      {/* ── 4. Variance Analysis ─────────────────────────────────────────── */}
      <FpaSection title="Análisis de varianza" icon="△">
        {!variance.hasData ? (
          <FpaEmpty
            message={
              budgets.length === 0
                ? "Configura el presupuesto para ver el análisis de varianza vs real."
                : "Sin ventas registradas para comparar contra el presupuesto."
            }
          />
        ) : (
          <VarianceTable rows={variance.rows} orgSlug={orgSlug} />
        )}
      </FpaSection>

      {/* ── 5. Cash Flow Planning ────────────────────────────────────────── */}
      <FpaSection title="Planeación de flujo de caja" icon="⇌">
        {!cashFlow.hasData ? (
          <FpaEmpty message="Sin datos de cartera. Sincroniza cuentas por cobrar para activar el plan de caja." />
        ) : (
          <CashFlowView cf={cashFlow} orgSlug={orgSlug} />
        )}
      </FpaSection>

      {/* ── Footer: future join points ──────────────────────────────────── */}
      <FpaJoinPointsNotice />
    </div>
  );
}

// ── Revenue: Rolling 12M bar chart ────────────────────────────────────────────

function Rolling12Chart({ months }: { months: { year: number; month: number; total: number }[] }) {
  const max = Math.max(...months.map((m) => m.total), 1);
  const MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return (
    <div>
      <p style={{ fontSize: T.sz.sm, color: C.inkLight, margin: `0 0 ${S[2]}px`, fontWeight: T.wt.semibold, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Ventas mensuales — últimos 12 meses
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
        {months.map((m, i) => {
          const h = Math.max((m.total / max) * 72, 2);
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div
                title={`${MONTH_LABELS[m.month - 1]} ${m.year}: ${fmtCurrency(m.total)}`}
                style={{ width: "100%", height: h, background: C.blue, borderRadius: "2px 2px 0 0", cursor: "default" }}
              />
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}>
                {MONTH_LABELS[m.month - 1]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Budget table ──────────────────────────────────────────────────────────────

const DIM_LABELS: Record<string, string> = {
  TOTAL:   "Total",
  BRANCH:  "Sucursal",
  CHANNEL: "Canal",
  SELLER:  "Vendedor",
  LINE:    "Línea",
  PAYROLL: "Nómina",
};

const CAT_LABELS: Record<string, string> = {
  revenue:   "Ingresos",
  cogs:      "Costo de ventas",
  opex:      "Gastos operativos",
  payroll:   "Nómina",
  capex:     "Capex",
  marketing: "Marketing",
};

function BudgetTable({ rows }: { rows: BudgetRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Dimensión</th>
          <th>Entidad</th>
          <th>Categoría</th>
          <th>Período</th>
          <th style={{ textAlign: "right" }}>Presupuesto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><span style={{ fontSize: 11, color: "#555" }}>{DIM_LABELS[r.dimension] ?? r.dimension}</span></td>
            <td>{r.dimensionLabel}</td>
            <td><span style={{ fontSize: 11 }}>{CAT_LABELS[r.category] ?? r.category}</span></td>
            <td style={{ fontSize: 12, color: "#888" }}>
              {r.periodType === "ANNUAL"    ? `${r.year}`                   : ""}
              {r.periodType === "QUARTERLY" ? `${r.year} Q${r.quarter}`     : ""}
              {r.periodType === "MONTHLY"   ? `${r.year}-${String(r.month).padStart(2, "0")}` : ""}
            </td>
            <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {fmtCurrency(r.amount, r.currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Variance table ────────────────────────────────────────────────────────────

function VarianceTable({ rows, orgSlug }: { rows: VarianceRow[]; orgSlug: string }) {
  const sorted = [...rows].sort((a, b) => a.variancePct - b.variancePct);
  return (
    <table>
      <thead>
        <tr>
          <th>Dimensión</th>
          <th>Entidad</th>
          <th style={{ textAlign: "right" }}>Presupuesto</th>
          <th style={{ textAlign: "right" }}>Real</th>
          <th style={{ textAlign: "right" }}>Varianza</th>
          <th style={{ textAlign: "right" }}>%</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const good = r.variancePct >= 0;
          const abs  = Math.abs(r.variancePct);
          const needsAction = !good && abs > 10;
          return (
            <tr key={i}>
              <td><span style={{ fontSize: 11, color: "#555" }}>{DIM_LABELS[r.dimension] ?? r.dimension}</span></td>
              <td>{r.dimensionLabel}</td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(r.budgeted, r.currency)}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(r.actual, r.currency)}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: good ? "#2e7d32" : "#c00" }}>
                {good ? "+" : ""}{fmtCurrency(r.variance, r.currency)}
              </td>
              <td style={{ textAlign: "right" }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                  background: abs > 15 ? (good ? "#e8f5e9" : "#fce4ec") : "#f5f5f5",
                  color: abs > 15 ? (good ? "#2e7d32" : "#c00") : "#555",
                }}>
                  {fmtPct(r.variancePct)}
                </span>
              </td>
              <td>
                {needsAction && (
                  <ActionButton
                    orgSlug={orgSlug}
                    label={abs > 20 ? "Escalar" : "Seguimiento"}
                    size="xs"
                    variant={abs > 20 ? "danger" : "outline"}
                    prefill={{
                      sourceModule: "finanzas",
                      actionType:   abs > 20
                        ? ActionTaskType.ESCALAR_A_GERENCIA
                        : ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
                      priority: abs > 20 ? ActionTaskPriority.URGENT : ActionTaskPriority.HIGH,
                      targetType:   r.dimension.toLowerCase(),
                      targetLabel:  r.dimensionLabel,
                      title:        `Varianza negativa — ${r.dimensionLabel} ${fmtPct(r.variancePct)}`,
                      description:  `Varianza negativa de ${fmtPct(r.variancePct)} en "${r.dimensionLabel}". Presupuesto: ${fmtCurrency(r.budgeted, r.currency)}, Real: ${fmtCurrency(r.actual, r.currency)}, Diferencia: ${fmtCurrency(r.variance, r.currency)}.`,
                    }}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Cash Flow view ────────────────────────────────────────────────────────────

function CashFlowView({ cf, orgSlug }: { cf: CashFlowSummary; orgSlug: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <FpaKpi
          label="Cartera total (OPEN + PARTIAL)"
          value={fmtCurrency(cf.totalOutstanding)}
          sub={`${cf.aging.length} buckets activos`}
        />
        <div>
          <FpaKpi
            label="Cartera vencida"
            value={fmtCurrency(cf.totalOverdue)}
            sub={`${cf.totalOutstanding > 0 ? ((cf.totalOverdue / cf.totalOutstanding) * 100).toFixed(1) : 0}% del total`}
            highlight={cf.totalOverdue > cf.totalOutstanding * 0.3}
          />
          {cf.totalOverdue > 0 && (
            <div style={{ marginTop: 8 }}>
              <ActionButton
                orgSlug={orgSlug}
                label="Crear acción de cobranza"
                icon="⚡"
                size="sm"
                variant="danger"
                prefill={{
                  sourceModule: "finanzas",
                  actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
                  priority:     ActionTaskPriority.URGENT,
                  targetType:   "cartera",
                  title:        `Cobranza — cartera vencida: ${fmtCurrency(cf.totalOverdue)}`,
                  description:  `Cartera vencida total: ${fmtCurrency(cf.totalOverdue)} (${cf.totalOutstanding > 0 ? ((cf.totalOverdue / cf.totalOutstanding) * 100).toFixed(1) : 0}% del total outstanding de ${fmtCurrency(cf.totalOutstanding)}).`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 30/60/90 day inflow horizons */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: "#888", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Flujo esperado por horizonte (cuentas por cobrar no vencidas)
          </p>
          <ActionButton
            orgSlug={orgSlug}
            label="Programar informe"
            size="xs"
            variant="ghost"
            prefill={{
              sourceModule: "finanzas",
              actionType:   ActionTaskType.PROGRAMAR_INFORME,
              priority:     ActionTaskPriority.MEDIUM,
              targetType:   "informe",
              title:        "Informe de flujo de caja 30/60/90 días",
              description:  "Programar informe de proyección de flujo de caja por horizontes 30, 60 y 90 días basado en cuentas por cobrar vigentes.",
            }}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Horizonte</th>
              <th style={{ textAlign: "right" }}>Facturas</th>
              <th style={{ textAlign: "right" }}>Conservador (60%)</th>
              <th style={{ textAlign: "right" }}>Base (100%)</th>
              <th style={{ textAlign: "right" }}>Agresivo (95%)</th>
            </tr>
          </thead>
          <tbody>
            {cf.horizons.map((h) => (
              <tr key={h.label}>
                <td><span style={{ fontWeight: 600 }}>{h.label}</span></td>
                <td style={{ textAlign: "right" }}>{h.receivableCount}</td>
                <td style={{ textAlign: "right", color: "#888", fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(h.conservative)}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(h.expected)}
                </td>
                <td style={{ textAlign: "right", color: "#2563eb", fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(h.aggressive)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Overdue recovery scenarios */}
      {cf.totalOverdue > 0 && (
        <div>
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Escenario de recuperación de cartera vencida ({fmtCurrency(cf.totalOverdue)})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { label: "Conservador",  amount: cf.overdueRecovery.conservative, rate: "40%", color: "#888"    },
              { label: "Base",         amount: cf.overdueRecovery.base,          rate: "70%", color: "#2563eb" },
              { label: "Agresivo",     amount: cf.overdueRecovery.aggressive,    rate: "90%", color: "#2e7d32" },
            ].map((s) => (
              <div key={s.label} style={{
                border: `1px solid #e5e7eb`, borderRadius: 6, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{s.label} ({s.rate} recovery)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(s.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aging breakdown */}
      {cf.aging.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Aging de cartera
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cf.aging.map((a) => {
              const isOverdue   = a.bucket !== "CURRENT";
              const bucketDays  = isOverdue ? parseInt(a.bucket) : 0;
              const urgency     = bucketDays > 60 ? ActionTaskPriority.URGENT : ActionTaskPriority.HIGH;
              return (
                <div key={a.bucket} style={{
                  border: `1px solid ${isOverdue ? "#f48fb1" : "#a5d6a7"}`,
                  background: isOverdue ? "#fce4ec" : "#e8f5e9",
                  borderRadius: 6, padding: "8px 14px", minWidth: 120,
                }}>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>
                    {a.bucket === "CURRENT" ? "Al día" : `${a.bucket} días`} · {a.count} docs
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    color: isOverdue ? "#c00" : "#2e7d32" }}>
                    {fmtCurrency(a.amount)}
                  </div>
                  {isOverdue && (
                    <div style={{ marginTop: 6 }}>
                      <ActionButton
                        orgSlug={orgSlug}
                        label="Cobrar"
                        size="xs"
                        variant="danger"
                        prefill={{
                          sourceModule: "finanzas",
                          actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
                          priority:     urgency,
                          targetType:   "cartera_vencida",
                          title:        `Cobranza — cartera vencida ${a.bucket} días`,
                          description:  `Cartera vencida bucket "${a.bucket}" días: ${fmtCurrency(a.amount)} en ${a.count} documentos. Requiere gestión de cobro.`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Recommendation card ────────────────────────────────────────────────────

const REC_SEVERITY_STYLE = {
  critical: { bg: "#fce4ec", border: "#f48fb1", color: "#c00",    icon: "⚠" },
  warning:  { bg: "#fff8e1", border: "#ffe082", color: "#a60",    icon: "△" },
  info:     { bg: "#e3f2fd", border: "#90caf9", color: "#1565c0", icon: "✦" },
};

const REC_ACTION_TYPE: Record<string, ActionTaskType> = {
  budget:    ActionTaskType.ESCALAR_A_GERENCIA,
  cashflow:  ActionTaskType.CREAR_ACCION_COBRANZA,
  growth:    ActionTaskType.CREAR_TAREA_COMERCIAL,
  workforce: ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
};

const REC_PRIORITY: Record<string, ActionTaskPriority> = {
  critical: ActionTaskPriority.URGENT,
  warning:  ActionTaskPriority.HIGH,
  info:     ActionTaskPriority.MEDIUM,
};

function FpaRecommendationCard({ rec, orgSlug }: { rec: FpaRecommendation; orgSlug: string }) {
  const s = REC_SEVERITY_STYLE[rec.severity];
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 6, padding: "10px 14px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 16, color: s.color, flexShrink: 0 }}>{s.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginBottom: 3 }}>{rec.title}</div>
        <div style={{ fontSize: 12, color: "#444", lineHeight: 1.5 }}>{rec.body}</div>
        {rec.metric && (
          <div style={{ fontSize: 10, color: s.color, fontWeight: 700, marginTop: 4 }}>{rec.metric}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        <ActionButton
          orgSlug={orgSlug}
          label="Crear acción"
          size="xs"
          variant="outline"
          prefill={{
            sourceModule: "finanzas",
            actionType:   REC_ACTION_TYPE[rec.category] ?? ActionTaskType.CREAR_TAREA_COMERCIAL,
            priority:     REC_PRIORITY[rec.severity]   ?? ActionTaskPriority.MEDIUM,
            targetType:   "recomendacion_ia",
            title:        rec.title,
            description:  rec.body + (rec.metric ? ` Métrica: ${rec.metric}` : ""),
          }}
        />
      </div>
    </div>
  );
}

// ── FP&A structural sub-components ───────────────────────────────────────────

function FpaSection({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        marginBottom: S[3] + 2, paddingBottom: S[2],
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{ fontSize: T.sz.lg, color: C.inkMid }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FpaKpi({ label, value, sub, trend, highlight }: {
  label:     string;
  value:     string;
  sub?:      string;
  highlight?: boolean;
  trend?:    { pct: number; label: string };
}) {
  const trendGood = trend && trend.pct >= 0;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3] + 2}px ${S[4]}px` }}>
      <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[1], fontWeight: T.wt.semibold, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: T.sz["3xl"] + 2, fontWeight: T.wt.bold, lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
        color: highlight ? C.red : C.ink }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: S[1] }}>{sub}</div>}
      {trend && (
        <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, marginTop: S[1], color: trendGood ? C.green : C.red }}>
          {fmtPct(trend.pct)} {trend.label}
        </div>
      )}
    </div>
  );
}

function FpaEmpty({ message, action, hint }: {
  message: string;
  action?: { label: string; href: string };
  hint?:   string;
}) {
  return (
    <div style={{
      padding: "28px 20px", textAlign: "center",
      background: C.surface, border: `1px dashed ${C.line}`, borderRadius: R.md,
    }}>
      <p style={{ color: C.inkLight, fontSize: T.sz.md, margin: `0 0 ${S[2]}px` }}>{message}</p>
      {hint && (
        <code style={{ fontSize: T.sz.sm, color: C.inkFaint, background: C.surfaceAlt, padding: "2px 6px", borderRadius: R.xs }}>
          {hint}
        </code>
      )}
      {action && (
        <div style={{ marginTop: S[2] + 2 }}>
          <Link href={action.href} style={{ fontSize: T.sz.base, color: C.blue }}>{action.label}</Link>
        </div>
      )}
    </div>
  );
}

function FpaJoinPointsNotice() {
  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`, background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.md, fontSize: T.sz.sm, color: C.inkLight,
    }}>
      <span style={{ fontWeight: T.wt.bold, color: C.inkMid }}>Puntos de integración futuros: </span>
      Nómina/workforce (PayrollEntry, EmployeeProfile) →{" "}
      <span style={{ color: C.inkMid }}>presupuesto de contratación y costo por headcount</span>
      {" · "}
      SAG Ventas →{" "}
      <span style={{ color: C.inkMid }}>varianza por vendedor y sucursal en tiempo real</span>
      {" · "}
      CRM Pipeline →{" "}
      <span style={{ color: C.inkMid }}>ingresos proyectados por oportunidades en curso</span>
    </div>
  );
}

// ── Ops sub-components (unchanged from V1) ────────────────────────────────────

function buildUrl(
  orgSlug: string,
  current: FinanceDocumentFilters,
  patch:   Partial<{ vs: string | null; pm: string | null; dt: string | null }>,
): string {
  const p  = new URLSearchParams();
  const vs = "vs" in patch ? patch.vs : current.validationStatus;
  const pm = "pm" in patch ? patch.pm : current.processingMode;
  const dt = "dt" in patch ? patch.dt : current.docType;
  if (vs) p.set("vs", vs);
  if (pm) p.set("pm", pm);
  if (dt) p.set("dt", dt);
  // Always preserve tab=ops so filter navigation doesn't reset the tab
  p.set("tab", "ops");
  const qs = p.toString();
  return `/${orgSlug}/finance?${qs}`;
}

function PillLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: "nowrap",
      background: active ? "#1a1a1a" : "transparent",
      color: active ? "#fff" : "#555",
      border: active ? "1px solid #1a1a1a" : "1px solid #ccc",
      textDecoration: "none",
    }}>
      {children}
    </Link>
  );
}

function FilterBar({ orgSlug, filters }: { orgSlug: string; filters: FinanceDocumentFilters }) {
  const { validationStatus: vs, processingMode: pm, docType: dt } = filters;
  const hasActiveFilter = !!(vs || pm || dt);

  const VS_OPTIONS = [
    { value: "INCOMPLETE",      label: "Incompleto"        },
    { value: "REVIEW_REQUIRED", label: "Requiere revisión" },
    { value: "VALID",           label: "Válido"            },
  ];
  const PM_OPTIONS = [
    { value: "xml-first",            label: "XML"          },
    { value: "pdf-fallback",         label: "PDF fallback" },
    { value: "xml-and-pdf",          label: "XML + PDF"    },
    { value: "manual-review-needed", label: "Manual"       },
  ];
  const DT_OPTIONS = FINANCIAL_DOC_TYPES.map((t) => ({
    value: t,
    label: t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  }));

  const rowStyle:   React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#888", minWidth: 80, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ padding: "10px 12px", background: "#fafafa", border: "1px solid #eee", borderRadius: 6, marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Validación</span>
        <PillLink href={buildUrl(orgSlug, filters, { vs: null })} active={!vs}>Todos</PillLink>
        {VS_OPTIONS.map((o) => (
          <PillLink key={o.value} href={buildUrl(orgSlug, filters, { vs: vs === o.value ? null : o.value })} active={vs === o.value}>
            {o.label}
          </PillLink>
        ))}
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Modo</span>
        <PillLink href={buildUrl(orgSlug, filters, { pm: null })} active={!pm}>Todos</PillLink>
        {PM_OPTIONS.map((o) => (
          <PillLink key={o.value} href={buildUrl(orgSlug, filters, { pm: pm === o.value ? null : o.value })} active={pm === o.value}>
            {o.label}
          </PillLink>
        ))}
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Tipo</span>
        <PillLink href={buildUrl(orgSlug, filters, { dt: null })} active={!dt}>Todos</PillLink>
        {DT_OPTIONS.map((o) => (
          <PillLink key={o.value} href={buildUrl(orgSlug, filters, { dt: dt === o.value ? null : o.value })} active={dt === o.value}>
            {o.label}
          </PillLink>
        ))}
      </div>
      {hasActiveFilter && (
        <div style={{ marginTop: 2 }}>
          <Link href={`/${orgSlug}/finance?tab=ops`} style={{ fontSize: 11, color: "#888", textDecoration: "underline" }}>
            Limpiar filtros
          </Link>
        </div>
      )}
    </div>
  );
}

function ValidationSummaryBar({ counts, orgSlug }: { counts: ValidationStatusCounts; orgSlug: string }) {
  const total = counts.VALID + counts.INCOMPLETE + counts.REVIEW_REQUIRED;
  if (total === 0 && counts.unprocessed === 0) return null;

  const pills = [
    { label: "Revisado",          count: counts.reviewed,        color: "#1b5e20", bg: "#c8e6c9", border: "#66bb6a" },
    { label: "Válido",            count: counts.VALID,           color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
    { label: "Incompleto",        count: counts.INCOMPLETE,      color: "#b71c1c", bg: "#fce4ec", border: "#f48fb1" },
    { label: "Requiere revisión", count: counts.REVIEW_REQUIRED, color: "#f57f17", bg: "#fff8e1", border: "#ffe082" },
    { label: "Sin procesar",      count: counts.unprocessed,     color: "#888",    bg: "#f5f5f5", border: "#ddd"    },
  ].filter((p) => p.count > 0);

  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      marginBottom: 12, padding: "8px 12px",
      background: "#fafafa", border: "1px solid #eee", borderRadius: 6, fontSize: 12,
    }}>
      <span style={{ color: "#888", fontWeight: 600, marginRight: 4 }}>Validación:</span>
      {pills.map((p) => (
        <span key={p.label} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 20,
          border: `1px solid ${p.border}`, background: p.bg, color: p.color, fontWeight: 700,
        }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{p.count}</span>
          <span style={{ fontWeight: 400 }}>{p.label}</span>
        </span>
      ))}
      <Link href={`/${orgSlug}/documents`} style={{ marginLeft: "auto", fontSize: 12, opacity: 0.6 }}>
        Ver todos →
      </Link>
    </div>
  );
}

function StatCard({ value, label, note, highlight = false, highlightColor = C.inkMid }: {
  value: number; label: string; note?: string; highlight?: boolean; highlightColor?: string;
}) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3] + 2}px ${S[4]}px` }}>
      <div style={{ fontSize: T.sz["3xl"] + 4, fontWeight: T.wt.bold, lineHeight: 1, color: highlight ? highlightColor : C.ink }}>
        {value}
      </div>
      <div style={{ fontSize: T.sz.base, marginTop: S[1], color: C.inkLight }}>{label}</div>
      {note && <div style={{ fontSize: T.sz.sm, marginTop: S[1], color: C.inkFaint }}>{note}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = badgeTone(status);
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      border: `1px solid ${color}`, borderRadius: 3,
      padding: "1px 5px", whiteSpace: "nowrap",
    }}>
      {statusLabel(status)}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONCILIACIÓN BANCARIA Y DOCUMENTAL — Sprint 1
// ══════════════════════════════════════════════════════════════════════════════

const REC_STATUS_STYLE: Record<ReconciliationStatus, {
  color: string; bg: string; border: string; label: string; icon: string;
}> = {
  CONCILIADO:    { color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7", label: "Conciliado",    icon: "✓" },
  PARCIAL:       { color: "#f57f17", bg: "#fff8e1", border: "#ffe082", label: "Parcial",       icon: "△" },
  PENDIENTE:     { color: "#555",    bg: "#f5f5f5", border: "#ddd",    label: "Pendiente",     icon: "○" },
  INCONSISTENTE: { color: "#c00",    bg: "#fce4ec", border: "#f48fb1", label: "Inconsistente", icon: "!" },
};

function RecBadge({ status }: { status: ReconciliationStatus }) {
  const s = REC_STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 10 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

function ReconciliationSummaryBar({ r }: { r: ReconciliationSummary }) {
  const pills: { status: ReconciliationStatus; count: number }[] = [
    { status: "CONCILIADO",    count: r.conciliado    },
    { status: "PARCIAL",       count: r.parcial       },
    { status: "PENDIENTE",     count: r.pendiente     },
    { status: "INCONSISTENTE", count: r.inconsistente },
  ];
  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      padding: "10px 14px", background: "#fafafa",
      border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 14,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
        Estado
      </span>
      {pills.map(({ status, count }) => {
        const s = REC_STATUS_STYLE[status];
        return (
          <span key={status} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20,
            border: `1px solid ${s.border}`, background: s.bg, color: s.color, fontWeight: 700,
            fontSize: 12,
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>{count}</span>
            <span style={{ fontWeight: 400 }}>{s.label}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>
        {r.total} ítems · motor V1
      </span>
    </div>
  );
}

function ReconciliationRow({
  item,
  orgSlug,
}: {
  item:    ReconciliationItem;
  orgSlug: string;
}) {
  const doc = item.document;
  const rec = item.receivable;

  // ── Action type & prefill based on status ────────────────────────────────
  const actionType = item.status === "INCONSISTENTE"
    ? ActionTaskType.ESCALAR_A_GERENCIA
    : item.status === "PARCIAL"
      ? ActionTaskType.CREAR_ACCION_COBRANZA
      : ActionTaskType.ABRIR_ALERTA_OPERATIVA;

  const actionPriority = item.status === "INCONSISTENTE"
    ? ActionTaskPriority.URGENT
    : (rec?.daysOverdue ?? 0) > 60
      ? ActionTaskPriority.URGENT
      : ActionTaskPriority.HIGH;

  const targetLabel = rec?.customerName ?? doc?.issuerName ?? rec?.invoiceNumber ?? doc?.title ?? "—";
  const targetNit   = rec?.customerNit  ?? doc?.receiverId ?? "—";

  const actionTitle = item.status === "INCONSISTENTE"
    ? `Escalar inconsistencia: ${targetLabel}`
    : item.status === "PARCIAL"
      ? `Cobrar saldo pendiente: ${targetLabel}`
      : `Investigar diferencia: ${targetLabel}`;

  const actionDesc = [
    doc  ? `Documento: ${doc.title} (${doc.type})` : null,
    rec  ? `Factura #${rec.invoiceNumber ?? "—"} · NIT ${rec.customerNit ?? "—"}` : null,
    rec  ? `Original: ${fmtCurrency(rec.originalAmount)} · Pagado: ${fmtCurrency(rec.paidAmount)} · Saldo: ${fmtCurrency(rec.balanceDue)}` : null,
    item.amountDiff !== null ? `Diferencia de monto: ${fmtCurrency(item.amountDiff)}` : null,
    ...item.notes,
  ].filter(Boolean).join(". ");

  const showAction = item.status !== "CONCILIADO";

  return (
    <tr>
      {/* Documento */}
      <td>
        {doc ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
              {doc.extractedInvoiceNum ?? doc.title}
            </span>
            {doc.issuerName && (
              <span style={{ fontSize: 10, color: "#888" }}>{doc.issuerName}</span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              {doc.type}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#aaa" }}>Sin documento</span>
        )}
      </td>

      {/* Contraparte */}
      <td>
        {rec ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
              {rec.customerName ?? "—"}
            </span>
            <span style={{ fontSize: 10, color: "#888" }}>NIT {targetNit}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#aaa" }}>Sin cartera</span>
        )}
      </td>

      {/* Factura # */}
      <td style={{ fontSize: 12, color: "#555" }}>
        {rec?.invoiceNumber ?? doc?.extractedInvoiceNum ?? "—"}
      </td>

      {/* Monto */}
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
          {doc?.amount !== null && doc?.amount !== undefined && (
            <span style={{ fontSize: 12 }}>
              {fmtCurrency(doc.amount, doc.currency ?? "COP")}
            </span>
          )}
          {rec && (
            <span style={{ fontSize: 11, color: rec.balanceDue > 0 ? "#c00" : "#2e7d32" }}>
              Saldo: {fmtCurrency(rec.balanceDue)}
            </span>
          )}
          {item.amountDiff !== null && item.amountDiff > 0 && (
            <span style={{ fontSize: 10, color: "#f57f17" }}>
              Δ {fmtCurrency(item.amountDiff)}
            </span>
          )}
        </div>
      </td>

      {/* Fecha */}
      <td style={{ fontSize: 12, color: "#555" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {doc?.documentDate && <span>{fmt(doc.documentDate)}</span>}
          {rec?.dueDate && (
            <span style={{ fontSize: 10, color: (rec.daysOverdue > 0) ? "#c00" : "#888" }}>
              Vence: {fmt(rec.dueDate)}
              {rec.daysOverdue > 0 && ` (+${rec.daysOverdue}d)`}
            </span>
          )}
        </div>
      </td>

      {/* Score */}
      <td style={{ textAlign: "center" }}>
        {item.matchScore > 0 ? (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: item.matchScore >= 60 ? "#2e7d32" : item.matchScore >= 30 ? "#f57f17" : "#c00",
          }}>
            {item.matchScore}
          </span>
        ) : (
          <span style={{ color: "#ddd", fontSize: 11 }}>—</span>
        )}
      </td>

      {/* Estado */}
      <td><RecBadge status={item.status} /></td>

      {/* Notas */}
      <td style={{ fontSize: 10, color: "#888", maxWidth: 180 }}>
        {item.notes.length > 0 ? item.notes[0] : ""}
      </td>

      {/* Acción */}
      <td>
        {showAction && (
          <ActionButton
            orgSlug={orgSlug}
            label={
              item.status === "INCONSISTENTE" ? "Escalar" :
              item.status === "PARCIAL"       ? "Cobrar saldo" :
                                               "Investigar"
            }
            size="xs"
            variant={item.status === "INCONSISTENTE" ? "danger" : "outline"}
            prefill={{
              sourceModule: "finanzas",
              actionType,
              priority:     actionPriority,
              targetType:   "conciliacion",
              targetLabel,
              title:        actionTitle,
              description:  actionDesc,
            }}
          />
        )}
      </td>
    </tr>
  );
}

function ReconciliationSection({
  reconciliation,
  orgSlug,
}: {
  reconciliation: ReconciliationSummary;
  orgSlug:        string;
}) {
  return (
    <section style={{ marginTop: 32 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
        marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e5e7eb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: T.sz.lg, color: C.inkMid }}>⇄</span>
          <h2 style={{ margin: 0, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
            Conciliación bancaria y documental
          </h2>
          <Badge variant="brand" size="xs">Sprint 1 · V1</Badge>
        </div>
      </div>

      {/* Empty state */}
      {!reconciliation.hasData ? (
        <div style={{
          padding: "28px 20px", textAlign: "center",
          background: C.surface, border: `1px dashed ${C.line}`, borderRadius: R.md,
        }}>
          <p style={{ color: C.inkLight, fontSize: T.sz.md, margin: `0 0 ${S[1] + 2}px` }}>
            Sin datos para conciliar aún.
          </p>
          <p style={{ color: C.inkFaint, fontSize: T.sz.sm, margin: 0 }}>
            Importa documentos financieros y sincroniza cartera (CustomerReceivable) para activar la conciliación.
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <ReconciliationSummaryBar r={reconciliation} />

          {/* Items that need attention first (non-conciliado) */}
          {reconciliation.inconsistente > 0 && (
            <ReconciliationSubTable
              title="Inconsistencias"
              titleColor="#c00"
              items={reconciliation.items.filter((i) => i.status === "INCONSISTENTE")}
              orgSlug={orgSlug}
            />
          )}

          {reconciliation.pendiente > 0 && (
            <ReconciliationSubTable
              title="Pendientes de conciliación"
              titleColor="#555"
              items={reconciliation.items.filter((i) => i.status === "PENDIENTE").slice(0, 15)}
              orgSlug={orgSlug}
            />
          )}

          {reconciliation.parcial > 0 && (
            <ReconciliationSubTable
              title="Parcialmente conciliados"
              titleColor="#f57f17"
              items={reconciliation.items.filter((i) => i.status === "PARCIAL")}
              orgSlug={orgSlug}
            />
          )}

          {/* Conciliados (collapsed summary) */}
          {reconciliation.conciliado > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: S[2],
              padding: `${S[2]}px ${S[3]}px`, background: C.greenLight, border: `1px solid ${C.greenBorder}`,
              borderRadius: R.md, marginTop: S[3],
            }}>
              <span style={{ fontSize: T.sz.md, color: C.green }}>✓</span>
              <span style={{ fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.green }}>
                {reconciliation.conciliado} documento{reconciliation.conciliado !== 1 ? "s" : ""} completamente conciliados
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReconciliationSubTable({
  title,
  titleColor,
  items,
  orgSlug,
}: {
  title:      string;
  titleColor: string;
  items:      ReconciliationItem[];
  orgSlug:    string;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{
        margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: titleColor,
      }}>
        {title} ({items.length})
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Contraparte</th>
              <th>Factura #</th>
              <th style={{ textAlign: "right" }}>Montos</th>
              <th>Fecha</th>
              <th style={{ textAlign: "center" }}>Score</th>
              <th>Estado</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ReconciliationRow key={item.id} item={item} orgSlug={orgSlug} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLASIFICACIÓN CONTABLE AUTOMÁTICA — Sprint 2
// ══════════════════════════════════════════════════════════════════════════════

function CategoryBadge({ category }: { category: AccountingCategory }) {
  const s = CATEGORY_STYLE[category];
  const a = CHART_OF_ACCOUNTS[category];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 3, padding: "1px 7px", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>{a.code}</span>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= AUTO_APPROVE_THRESHOLD ? "#2e7d32"
               : score >= 60                    ? "#f57f17"
               :                                  "#c00";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 100 }}>
      <div style={{
        flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32, textAlign: "right" }}>
        {score}%
      </span>
    </div>
  );
}

function AccountingRow({
  item,
  orgSlug,
}: {
  item:    AccountingClassification;
  orgSlug: string;
}) {
  const isLowConf = item.confidenceScore < 60;
  const isTax = item.suggestedAccount.taxSensitive;

  const actionType = (isTax && item.requiresReview)
    ? ActionTaskType.ESCALAR_A_GERENCIA
    : ActionTaskType.ABRIR_ALERTA_OPERATIVA;

  const actionPriority = (isTax && item.confidenceScore < 60)
    ? ActionTaskPriority.HIGH
    : ActionTaskPriority.MEDIUM;

  const actionTitle = isTax && item.requiresReview
    ? `Revisar clasificación fiscal: ${item.documentTitle}`
    : `Clasificación pendiente: ${item.documentTitle}`;

  const actionDesc = [
    `Documento: ${item.documentTitle} (${item.documentType})`,
    `Categoría sugerida: ${CATEGORY_LABEL[item.accountingCategory]} — Cuenta ${item.suggestedAccount.code}`,
    `Confianza: ${item.confidenceScore}%`,
    item.reviewReason ? `Motivo revisión: ${item.reviewReason}` : null,
    item.counterparty ? `Contraparte: ${item.counterparty}` : null,
    item.invoiceNumber ? `Factura: ${item.invoiceNumber}` : null,
  ].filter(Boolean).join(". ");

  return (
    <tr style={{ background: isLowConf ? "#fffbf0" : undefined }}>
      {/* Documento */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
            {item.documentTitle}
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {item.documentType}
            </span>
            {item.xmlFamily && (
              <span style={{
                fontSize: 9, color: "#2563eb", fontWeight: 600,
                background: "#eff6ff", border: "1px solid #bfdbfe",
                borderRadius: 2, padding: "0 4px",
              }}>
                {item.xmlFamily}
              </span>
            )}
          </div>
          {item.invoiceNumber && (
            <span style={{ fontSize: 10, color: "#888" }}>#{item.invoiceNumber}</span>
          )}
        </div>
      </td>

      {/* Categoría */}
      <td><CategoryBadge category={item.accountingCategory} /></td>

      {/* Cuenta sugerida */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#111", fontVariantNumeric: "tabular-nums" }}>
            {item.suggestedAccount.code}
          </span>
          <span style={{ fontSize: 10, color: "#555" }}>{item.suggestedAccount.description}</span>
          <span style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {item.suggestedAccount.nature}
          </span>
        </div>
      </td>

      {/* Contraparte */}
      <td>
        {item.counterparty ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 12, color: "#111" }}>{item.counterparty}</span>
            {item.counterpartyNit && (
              <span style={{ fontSize: 10, color: "#888" }}>NIT {item.counterpartyNit}</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "#ccc" }}>—</span>
        )}
      </td>

      {/* IVA / Impuesto */}
      <td>
        {item.taxProfile.hasIva ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#f57f17" }}>
              IVA {item.taxProfile.estimatedRate ?? "?"}%
            </span>
            {item.taxProfile.ivaAmount && (
              <span style={{ fontSize: 10, color: "#888", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(item.taxProfile.ivaAmount)}
              </span>
            )}
            {item.taxProfile.cufe && (
              <span style={{ fontSize: 8, color: "#2e7d32", fontWeight: 700 }}>✓ CUFE</span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
        )}
      </td>

      {/* Confianza */}
      <td style={{ minWidth: 120 }}>
        <ConfidenceBar score={item.confidenceScore} />
      </td>

      {/* Revisión */}
      <td>
        {item.requiresReview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#c00",
              background: "#fce4ec", border: "1px solid #f48fb1",
              borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
            }}>
              Revisar
            </span>
            {item.reviewReason && (
              <span style={{ fontSize: 9, color: "#888" }}>{item.reviewReason}</span>
            )}
          </div>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#2e7d32",
            background: "#e8f5e9", border: "1px solid #a5d6a7",
            borderRadius: 3, padding: "1px 6px",
          }}>
            Auto ✓
          </span>
        )}
      </td>

      {/* Acciones */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {item.requiresReview && (
            <ActionButton
              orgSlug={orgSlug}
              label={isTax ? "Escalar" : "Revisar"}
              size="xs"
              variant={isTax ? "danger" : "outline"}
              prefill={{
                sourceModule: "finanzas",
                actionType,
                priority:     actionPriority,
                targetType:   "clasificacion_contable",
                targetLabel:  item.counterparty ?? item.documentTitle,
                title:        actionTitle,
                description:  actionDesc,
              }}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function AccountingStatsBar({ batch }: { batch: ClassificationBatch }) {
  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      padding: "10px 14px", background: "#fafafa",
      border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 14,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4 }}>
        Clasificación
      </span>
      {[
        { label: "Auto-aprobados", count: batch.autoApproved,   color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
        { label: "Requieren revisión", count: batch.requiresReview, color: "#c00",    bg: "#fce4ec", border: "#f48fb1" },
        { label: "Sensibles a impuesto", count: batch.taxSensitive, color: "#f57f17", bg: "#fff8e1", border: "#ffe082" },
      ].map((p) => (
        <span key={p.label} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "3px 10px", borderRadius: 20,
          border: `1px solid ${p.border}`, background: p.bg, color: p.color, fontWeight: 700, fontSize: 12,
        }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>{p.count}</span>
          <span style={{ fontWeight: 400 }}>{p.label}</span>
        </span>
      ))}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>
        {batch.total} documentos · motor V1
      </span>
    </div>
  );
}

function AccountingSection({
  batch,
  orgSlug,
}: {
  batch:   ClassificationBatch;
  orgSlug: string;
}) {
  const reviewItems = batch.items.filter((i) => i.requiresReview);
  const autoItems   = batch.items.filter((i) => !i.requiresReview);

  return (
    <section style={{ marginTop: 32 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
        marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e5e7eb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: T.sz.lg, color: C.inkMid }}>⊟</span>
          <h2 style={{ margin: 0, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
            Clasificación contable automática
          </h2>
          <Badge variant="brand" size="xs">Sprint 2 · V1</Badge>
        </div>
        {batch.requiresReview > 0 && (
          <ActionButton
            orgSlug={orgSlug}
            label="Generar informe de revisión"
            size="xs"
            variant="ghost"
            icon="⊞"
            prefill={{
              sourceModule: "finanzas",
              actionType:   ActionTaskType.GENERAR_INFORME,
              priority:     ActionTaskPriority.MEDIUM,
              targetType:   "informe_contable",
              title:        `Informe de clasificación contable — ${batch.requiresReview} documentos pendientes`,
              description:  `${batch.requiresReview} de ${batch.total} documentos requieren revisión contable. ${batch.taxSensitive} son sensibles a impuesto.`,
            }}
          />
        )}
      </div>

      {/* Empty state */}
      {!batch.hasData ? (
        <div style={{
          padding: "28px 20px", textAlign: "center",
          background: "#fafafa", border: "1px dashed #ddd", borderRadius: 6,
        }}>
          <p style={{ color: "#888", fontSize: 13, margin: "0 0 6px" }}>
            Sin documentos financieros para clasificar.
          </p>
          <p style={{ color: "#aaa", fontSize: 11, margin: 0 }}>
            Sube documentos (XML, PDF, estados de cuenta) para activar la clasificación contable automática.
          </p>
        </div>
      ) : (
        <>
          <AccountingStatsBar batch={batch} />

          {/* Category distribution chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {(Object.entries(batch.byCategory) as [AccountingCategory, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([cat, count]) => {
                const s = CATEGORY_STYLE[cat];
                return (
                  <span key={cat} style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 12,
                    border: `1px solid ${s.border}`, background: s.bg, color: s.color,
                    fontWeight: 600,
                  }}>
                    {CATEGORY_LABEL[cat]} ({count})
                  </span>
                );
              })}
          </div>

          {/* Review required table */}
          {reviewItems.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#c00" }}>
                Requieren revisión ({reviewItems.length})
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 1000 }}>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Categoría</th>
                      <th>Cuenta sugerida</th>
                      <th>Contraparte</th>
                      <th>Impuesto</th>
                      <th>Confianza</th>
                      <th>Revisión</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewItems.map((item) => (
                      <AccountingRow key={item.documentId} item={item} orgSlug={orgSlug} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Auto-approved (collapsed) */}
          {autoItems.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#2e7d32" }}>
                Auto-aprobados ({autoItems.length})
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 1000 }}>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Categoría</th>
                      <th>Cuenta sugerida</th>
                      <th>Contraparte</th>
                      <th>Impuesto</th>
                      <th>Confianza</th>
                      <th>Revisión</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoItems.slice(0, 10).map((item) => (
                      <AccountingRow key={item.documentId} item={item} orgSlug={orgSlug} />
                    ))}
                    {autoItems.length > 10 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", fontSize: 11, color: "#aaa", padding: "8px" }}>
                          + {autoItems.length - 10} documentos más auto-aprobados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VERDAD FISCAL / DIAN — Sprint 3
// ══════════════════════════════════════════════════════════════════════════════

function FiscalBadge({ status }: { status: FiscalStatus }) {
  const s = FISCAL_STATUS_STYLE[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 3, padding: "1px 6px", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 10 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

function FiscalSummaryBar({ f }: { f: FiscalSummary }) {
  const pills: { status: FiscalStatus; count: number }[] = [
    { status: "VALIDADO",      count: f.validado      },
    { status: "RECHAZADO",     count: f.rechazado     },
    { status: "DUPLICADO",     count: f.duplicado     },
    { status: "INCONSISTENTE", count: f.inconsistente },
    { status: "NO_ENCONTRADO", count: f.noEncontrado  },
  ];
  return (
    <div style={{
      display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
      padding: "10px 14px", background: "#fafafa",
      border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 14,
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: "#888",
        textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4,
      }}>
        Estado fiscal
      </span>
      {pills.filter((p) => p.count > 0).map(({ status, count }) => {
        const s = FISCAL_STATUS_STYLE[status];
        return (
          <span key={status} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20, fontSize: 12,
            border: `1px solid ${s.border}`, background: s.bg,
            color: s.color, fontWeight: 700,
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>{count}</span>
            <span style={{ fontWeight: 400 }}>{s.label}</span>
          </span>
        );
      })}
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa" }}>
        {f.total} docs · validación local V1
      </span>
    </div>
  );
}

function FiscalRow({ item, orgSlug }: { item: FiscalDocument; orgSlug: string }) {
  const criticalMismatches = item.mismatches.filter((m) => m.severity === "CRITICAL");
  const warningMismatches  = item.mismatches.filter((m) => m.severity === "WARNING");
  const isTaxCritical = criticalMismatches.length > 0;

  const actionType = isTaxCritical
    ? ActionTaskType.ESCALAR_A_GERENCIA
    : ActionTaskType.ABRIR_ALERTA_OPERATIVA;

  const actionPriority = isTaxCritical
    ? ActionTaskPriority.URGENT
    : item.fiscalStatus === "RECHAZADO" || item.fiscalStatus === "DUPLICADO"
      ? ActionTaskPriority.HIGH
      : ActionTaskPriority.MEDIUM;

  const actionTitle =
    item.fiscalStatus === "DUPLICADO"      ? `Resolver CUFE duplicado: ${item.documentTitle}`  :
    item.fiscalStatus === "RECHAZADO"      ? `Revisar documento rechazado: ${item.documentTitle}` :
    item.fiscalStatus === "INCONSISTENTE"  ? `Inconsistencia fiscal: ${item.documentTitle}`     :
                                             `Obtener soporte XML: ${item.documentTitle}`;

  const mismatchDesc = [
    ...criticalMismatches.map((m) => `[CRÍTICO] ${m.field}: ${m.note}`),
    ...warningMismatches.map((m)  => `[AVISO] ${m.field}: ${m.note}`),
  ].join(". ");

  const actionDesc = [
    `Documento: ${item.documentTitle} (${item.documentType})`,
    `Estado fiscal: ${item.fiscalStatus}`,
    item.dian.cufe ? `CUFE: ${item.dian.cufe.slice(0, 20)}…` : "Sin CUFE",
    item.dian.invoiceNumber ? `Factura: ${item.dian.fullReference ?? item.dian.invoiceNumber}` : null,
    mismatchDesc || null,
    ...item.notes,
  ].filter(Boolean).join(". ");

  return (
    <tr>
      {/* Documento */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
            {item.documentTitle}
          </span>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {item.documentType}
            </span>
            {item.dian.colombiaXmlType && (
              <span style={{
                fontSize: 9, color: "#2563eb", fontWeight: 600,
                background: "#eff6ff", border: "1px solid #bfdbfe",
                borderRadius: 2, padding: "0 4px",
              }}>
                {item.dian.colombiaXmlType}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* CUFE / Referencia */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {item.dian.fullReference && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#111", fontVariantNumeric: "tabular-nums" }}>
              {item.dian.fullReference}
            </span>
          )}
          {item.dian.cufe ? (
            <span
              title={item.dian.cufe}
              style={{
                fontSize: 9, fontFamily: "monospace", color: "#2e7d32",
                background: "#f0fdf4", borderRadius: 2, padding: "1px 4px",
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                display: "block",
              }}
            >
              ✓ {item.dian.cufe.slice(0, 20)}…
            </span>
          ) : (
            <span style={{ fontSize: 9, color: "#ccc" }}>Sin CUFE</span>
          )}
        </div>
      </td>

      {/* Emisor */}
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 11, color: "#111" }}>{item.dian.issuerName ?? item.issuerId ?? "—"}</span>
          {item.dian.issuerNit && (
            <span style={{ fontSize: 10, color: "#888" }}>NIT {item.dian.issuerNit}</span>
          )}
        </div>
      </td>

      {/* Montos */}
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
          {item.dian.totalAmount !== null ? (
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {fmtCurrency(item.dian.totalAmount, item.dian.currency ?? "COP")}
            </span>
          ) : item.amount !== null ? (
            <span style={{ fontSize: 12, color: "#888" }}>
              {fmtCurrency(item.amount, item.currency ?? "COP")}
              <span style={{ fontSize: 9, marginLeft: 3 }}>(doc)</span>
            </span>
          ) : (
            <span style={{ color: "#ccc", fontSize: 11 }}>—</span>
          )}
          {item.dian.taxAmount !== null && item.dian.taxAmount > 0 && (
            <span style={{ fontSize: 10, color: "#f57f17" }}>
              IVA {fmtCurrency(item.dian.taxAmount)}
            </span>
          )}
        </div>
      </td>

      {/* Fecha */}
      <td style={{ fontSize: 11, color: "#555" }}>
        {item.dian.issueDate
          ? item.dian.issueDate.toISOString().slice(0, 10)
          : item.documentDate
            ? item.documentDate.toISOString().slice(0, 10)
            : "—"}
      </td>

      {/* Estado */}
      <td><FiscalBadge status={item.fiscalStatus} /></td>

      {/* Inconsistencias */}
      <td style={{ maxWidth: 220 }}>
        {item.mismatches.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {item.mismatches.slice(0, 2).map((m, i) => (
              <span key={i} style={{
                fontSize: 10,
                color: m.severity === "CRITICAL" ? "#c00" : m.severity === "WARNING" ? "#f57f17" : "#888",
              }}>
                {m.severity === "CRITICAL" ? "⚠ " : m.severity === "WARNING" ? "△ " : "· "}
                {m.field}: {m.note}
              </span>
            ))}
            {item.mismatches.length > 2 && (
              <span style={{ fontSize: 9, color: "#aaa" }}>
                +{item.mismatches.length - 2} más
              </span>
            )}
          </div>
        ) : item.notes.length > 0 ? (
          <span style={{ fontSize: 10, color: "#888" }}>{item.notes[0]}</span>
        ) : (
          <span style={{ color: "#ddd", fontSize: 11 }}>—</span>
        )}
      </td>

      {/* Acción */}
      <td>
        {item.fiscalStatus !== "VALIDADO" && (
          <ActionButton
            orgSlug={orgSlug}
            label={
              isTaxCritical                         ? "Escalar"       :
              item.fiscalStatus === "DUPLICADO"     ? "Resolver dup." :
              item.fiscalStatus === "RECHAZADO"     ? "Revisar"       :
              item.fiscalStatus === "INCONSISTENTE" ? "Investigar"    :
                                                      "Obtener XML"
            }
            size="xs"
            variant={isTaxCritical || item.fiscalStatus === "DUPLICADO" ? "danger" : "outline"}
            prefill={{
              sourceModule: "finanzas",
              actionType,
              priority:     actionPriority,
              targetType:   "documento_fiscal",
              targetLabel:  item.dian.issuerName ?? item.documentTitle,
              title:        actionTitle,
              description:  actionDesc,
            }}
          />
        )}
      </td>
    </tr>
  );
}

function FiscalSubTable({
  title, titleColor, items, orgSlug, limit = 20,
}: {
  title: string; titleColor: string; items: FiscalDocument[];
  orgSlug: string; limit?: number;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: titleColor }}>
        {title} ({items.length})
      </h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 960 }}>
          <thead>
            <tr>
              <th>Documento</th>
              <th>CUFE / Referencia</th>
              <th>Emisor</th>
              <th style={{ textAlign: "right" }}>Montos</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Inconsistencias</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, limit).map((item) => (
              <FiscalRow key={item.documentId} item={item} orgSlug={orgSlug} />
            ))}
            {items.length > limit && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", fontSize: 11, color: "#aaa", padding: "8px" }}>
                  +{items.length - limit} documentos más
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DianFiscalSection({ fiscal, orgSlug }: { fiscal: FiscalSummary; orgSlug: string }) {
  const critical     = fiscal.items.filter((i) => i.fiscalStatus === "RECHAZADO" || i.fiscalStatus === "DUPLICADO");
  const inconsistente = fiscal.items.filter((i) => i.fiscalStatus === "INCONSISTENTE");
  const noEncontrado  = fiscal.items.filter((i) => i.fiscalStatus === "NO_ENCONTRADO");
  const validado      = fiscal.items.filter((i) => i.fiscalStatus === "VALIDADO");

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
        marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #e5e7eb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontSize: T.sz.lg, color: C.inkMid }}>⊛</span>
          <h2 style={{ margin: 0, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>Verdad fiscal / DIAN</h2>
          <Badge variant="brand" size="xs">Sprint 3 · V1</Badge>
        </div>
        {fiscal.total > 0 && (
          <ActionButton
            orgSlug={orgSlug}
            label="Informe fiscal mensual"
            size="xs"
            variant="ghost"
            icon="⊞"
            prefill={{
              sourceModule: "finanzas",
              actionType:   ActionTaskType.GENERAR_INFORME,
              priority:     ActionTaskPriority.MEDIUM,
              targetType:   "informe_fiscal",
              title:        `Informe DIAN mensual — ${fiscal.validado} validados, ${fiscal.inconsistente} inconsistencias`,
              description:  `Resumen fiscal: ${fiscal.validado} VALIDADOS, ${fiscal.rechazado} RECHAZADOS, ${fiscal.duplicado} DUPLICADOS, ${fiscal.inconsistente} INCONSISTENTES, ${fiscal.noEncontrado} SIN SOPORTE XML.`,
            }}
          />
        )}
      </div>

      {!fiscal.hasData ? (
        <div style={{
          padding: "28px 20px", textAlign: "center",
          background: C.surface, border: `1px dashed ${C.line}`, borderRadius: R.md,
        }}>
          <p style={{ color: C.inkLight, fontSize: T.sz.md, margin: `0 0 ${S[1] + 2}px` }}>
            Sin documentos XML para validar.
          </p>
          <p style={{ color: C.inkFaint, fontSize: T.sz.sm, margin: 0 }}>
            Sube facturas electrónicas XML (DIAN UBL 2.1) para activar la capa de verdad fiscal.
          </p>
        </div>
      ) : (
        <>
          <FiscalSummaryBar f={fiscal} />

          <FiscalSubTable
            title="Rechazados y duplicados"
            titleColor={C.red}
            items={critical}
            orgSlug={orgSlug}
          />
          <FiscalSubTable
            title="Inconsistencias fiscales"
            titleColor={C.amber}
            items={inconsistente}
            orgSlug={orgSlug}
          />
          <FiscalSubTable
            title="Sin soporte XML / CUFE"
            titleColor={C.inkMid}
            items={noEncontrado}
            orgSlug={orgSlug}
          />

          {validado.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: S[2],
              padding: `${S[2] + 2}px ${S[4]}px`, background: C.greenLight,
              border: `1px solid ${C.greenBorder}`, borderRadius: R.md, marginTop: S[2],
            }}>
              <span style={{ fontSize: T.sz.lg, color: C.green }}>✓</span>
              <span style={{ fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.green, flex: 1 }}>
                {validado.length} documento{validado.length !== 1 ? "s" : ""} con CUFE válido — sin inconsistencias
              </span>
              <span style={{ fontSize: T.sz.sm, color: C.green, fontWeight: T.wt.semibold }}>
                {validado.filter((i) => i.dian.cufe).length} con CUFE ·{" "}
                {validado.filter((i) => i.dian.taxAmount && i.dian.taxAmount > 0).length} con IVA declarado
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SPRINT 4 — CIERRE FINANCIERO INTELIGENTE
// ══════════════════════════════════════════════════════════════════════════════

// ── Grade helpers ─────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<CloseGrade, { color: string; bg: string; border: string; label: string }> = {
  A: { color: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7", label: "Excelente"    },
  B: { color: "#2e7d32", bg: "#f1f8e9", border: "#c5e1a5", label: "Muy bueno"    },
  C: { color: "#e65100", bg: "#fff3e0", border: "#ffcc80", label: "Con alertas"  },
  D: { color: "#b71c1c", bg: "#fce4ec", border: "#f48fb1", label: "En riesgo"    },
  F: { color: "#880e4f", bg: "#fce4ec", border: "#f48fb1", label: "Crítico"      },
};

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  CRITICO: { color: "#b71c1c", bg: "#fce4ec" },
  ALTO:    { color: "#e65100", bg: "#fff3e0" },
  MEDIO:   { color: "#f57f17", bg: "#fff8e1" },
};

const DIM_ICON: Record<string, string> = {
  fiscal:         "🏛",
  reconciliacion: "⚖️",
  contabilidad:   "📒",
  cartera:        "🧾",
  tesoreria:      "💵",
  documentacion:  "📄",
};

// ── Score ring (text-based) ───────────────────────────────────────────────────

function ScoreRing({ score, grade }: { score: number; grade: CloseGrade }) {
  const st = GRADE_STYLE[grade];
  return (
    <div style={{
      width: 88, height: 88, borderRadius: "50%",
      border: `4px solid ${st.border}`,
      background: st.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 26, fontWeight: 800, color: st.color, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{grade}</span>
    </div>
  );
}

// ── Compact ops-tab widget ────────────────────────────────────────────────────

function CloseScoreWidget({ score, orgSlug }: { score: CloseScore; orgSlug: string }) {
  const st = GRADE_STYLE[score.grade];
  return (
    <section style={{
      background: "#fafafa",
      border: `1px solid ${st.border}`,
      borderRadius: 8,
      padding: "14px 18px",
      marginBottom: 24,
      display: "flex",
      alignItems: "center",
      gap: 20,
      flexWrap: "wrap",
    }}>
      <ScoreRing score={score.total} grade={score.grade} />

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
            Cierre financiero
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: st.color,
            background: st.bg, border: `1px solid ${st.border}`,
            borderRadius: 4, padding: "1px 6px",
          }}>
            {st.label}
          </span>
          {score.closeable
            ? <span style={{ fontSize: 11, color: "#2e7d32" }}>✓ Listo para cierre</span>
            : <span style={{ fontSize: 11, color: "#b71c1c" }}>✗ No apto para cierre</span>}
        </div>

        {/* Dimension bars */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {score.dimensions.map((d) => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11 }}>{DIM_ICON[d.key] ?? "•"}</span>
              <span style={{ fontSize: 11, color: "#555" }}>{d.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: d.severity === "ok" ? "#2e7d32" : d.severity === "warning" ? "#e65100" : "#b71c1c",
              }}>
                {d.score}
              </span>
            </div>
          ))}
        </div>

        {score.blockers.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#b71c1c" }}>
              ⚠ {score.blockers[0]}
              {score.blockers.length > 1 && ` (+${score.blockers.length - 1} más)`}
            </span>
          </div>
        )}
      </div>

      <Link
        href={`/${orgSlug}/finance?tab=planning`}
        style={{
          fontSize: 12, color: "#1565c0", textDecoration: "none",
          border: "1px solid #90caf9", borderRadius: 4, padding: "4px 10px",
          background: "#e3f2fd", whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Ver comité ejecutivo →
      </Link>
    </section>
  );
}

// ── Full cierre section (planning tab) ───────────────────────────────────────

function CloseSection({
  score,
  committee,
  orgSlug,
}: {
  score:     CloseScore;
  committee: CommitteeReport;
  orgSlug:   string;
}) {
  const st = GRADE_STYLE[score.grade];

  return (
    <section style={{ marginBottom: 40 }}>
      {/* ── Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Cierre financiero inteligente</h2>
        <span style={{ fontSize: 12, color: "#888" }}>
          Generado {committee.generatedAt.toLocaleString("es-CO", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      </div>

      {/* ── Score + checklist row */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
        {/* Score card */}
        <div style={{
          border: `1px solid ${st.border}`, borderRadius: 8, background: st.bg,
          padding: "16px 20px", display: "flex", gap: 20, alignItems: "center",
          minWidth: 280,
        }}>
          <ScoreRing score={score.total} grade={score.grade} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{st.label}</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
              {score.closeable
                ? "✓ Apto para cierre mensual"
                : "✗ Resolver bloqueantes antes del cierre"}
            </div>
            {score.blockers.length > 0 && (
              <ul style={{ margin: "6px 0 0", padding: "0 0 0 16px", fontSize: 11, color: "#b71c1c" }}>
                {score.blockers.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
        </div>

        {/* Dimension scores */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
          }}>
            {score.dimensions.map((d) => (
              <DimensionCard key={d.key} dim={d} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Checklist */}
      <CloseChecklist score={score} committee={committee} orgSlug={orgSlug} />

      {/* ── Risks & Opportunities */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <RisksPanel risks={committee.risks} orgSlug={orgSlug} />
        <OpportunitiesPanel opportunities={committee.opportunities} />
      </div>

      {/* ── Financials row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <LiquidityCard liquidity={committee.liquidity} />
        <BudgetCard budget={committee.budget} />
      </div>

      {/* ── Suggested decisions */}
      {committee.suggestedDecisions.length > 0 && (
        <DecisionsPanel decisions={committee.suggestedDecisions} orgSlug={orgSlug} />
      )}
    </section>
  );
}

// ── Dimension card ─────────────────────────────────────────────────────────────

function DimensionCard({ dim }: { dim: CloseScoreDimension }) {
  const borderColor = dim.severity === "ok" ? "#a5d6a7" : dim.severity === "warning" ? "#ffcc80" : "#f48fb1";
  const bgColor     = dim.severity === "ok" ? "#f9fbe7" : dim.severity === "warning" ? "#fff8e1" : "#fce4ec";
  const scoreColor  = dim.severity === "ok" ? "#2e7d32" : dim.severity === "warning" ? "#e65100" : "#b71c1c";
  return (
    <div style={{
      border: `1px solid ${borderColor}`, borderRadius: 6,
      background: bgColor, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
          {DIM_ICON[dim.key] ?? "•"} {dim.label}
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor }}>{dim.score}</span>
      </div>
      {/* Simple score bar */}
      <div style={{ height: 3, background: "#e0e0e0", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${dim.score}%`,
          background: scoreColor, borderRadius: 2,
        }} />
      </div>
      {dim.signals.slice(0, 1).map((s, i) => (
        <div key={i} style={{ fontSize: 10, color: "#666", marginTop: 4, lineHeight: 1.3 }}>{s}</div>
      ))}
    </div>
  );
}

// ── Close checklist ───────────────────────────────────────────────────────────

function CloseChecklist({
  score,
  committee,
  orgSlug,
}: {
  score:     CloseScore;
  committee: CommitteeReport;
  orgSlug:   string;
}) {
  type CheckItem = { label: string; ok: boolean; link: string; note?: string };
  const items: CheckItem[] = [
    {
      label: "Documentos validados por DIAN",
      ok:    committee.fiscalRisk.inconsistente === 0 && committee.fiscalRisk.duplicado === 0,
      link:  `/${orgSlug}/finance?tab=ops`,
      note:  committee.fiscalRisk.hasCritical
        ? `${committee.fiscalRisk.inconsistente + committee.fiscalRisk.duplicado} pendientes`
        : `${committee.fiscalRisk.validado}/${committee.fiscalRisk.total} validados`,
    },
    {
      label: "Conciliación bancaria completada",
      ok:    (score.dimensions.find((d) => d.key === "reconciliacion")?.score ?? 0) >= 75,
      link:  `/${orgSlug}/finance?tab=ops`,
      note:  score.dimensions.find((d) => d.key === "reconciliacion")?.signals[0] ?? "",
    },
    {
      label: "Clasificación contable al día",
      ok:    (score.dimensions.find((d) => d.key === "contabilidad")?.score ?? 0) >= 70,
      link:  `/${orgSlug}/finance?tab=ops`,
      note:  score.dimensions.find((d) => d.key === "contabilidad")?.signals[0] ?? "",
    },
    {
      label: "Cartera dentro de umbral aceptable",
      ok:    (score.dimensions.find((d) => d.key === "cartera")?.score ?? 0) >= 60,
      link:  `/${orgSlug}/finance?tab=ops`,
      note:  score.dimensions.find((d) => d.key === "cartera")?.signals[0] ?? "",
    },
    {
      label: "Liquidez 90 días proyectada",
      ok:    committee.liquidity.hasData
        ? committee.liquidity.next90DayInflow > committee.liquidity.totalOverdue * 0.5
        : true,
      link:  `/${orgSlug}/finance?tab=planning`,
      note:  committee.liquidity.hasData
        ? `Inflow 90d: $${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(committee.liquidity.next90DayInflow)}`
        : "Sin datos de cartera",
    },
    {
      label: "Score de cierre ≥ 75 (apto)",
      ok:    score.closeable,
      link:  `/${orgSlug}/finance?tab=planning`,
      note:  `Score actual: ${score.total}/100`,
    },
  ];

  const doneCount = items.filter((i) => i.ok).length;

  return (
    <div style={{
      border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 20,
      overflow: "hidden",
    }}>
      <div style={{
        background: "#f9fafb", padding: "10px 16px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Checklist de cierre</span>
        <span style={{ fontSize: 12, color: "#555" }}>{doneCount}/{items.length} completados</span>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px",
          borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : undefined,
          background: item.ok ? "#fafff9" : "#fffcfb",
        }}>
          <span style={{ fontSize: 14, color: item.ok ? "#2e7d32" : "#ccc" }}>
            {item.ok ? "✓" : "○"}
          </span>
          <span style={{ flex: 1, fontSize: 13, color: item.ok ? "#333" : "#666" }}>
            {item.label}
          </span>
          {item.note && (
            <span style={{ fontSize: 11, color: "#888" }}>{item.note}</span>
          )}
          <Link href={item.link} style={{ fontSize: 11, color: "#1565c0", textDecoration: "none" }}>
            →
          </Link>
        </div>
      ))}
    </div>
  );
}

// ── Risks panel ───────────────────────────────────────────────────────────────

function RisksPanel({ risks, orgSlug }: { risks: CommitteeRisk[]; orgSlug: string }) {
  return (
    <div style={{ border: "1px solid #fecdd3", borderRadius: 8, overflow: "hidden" }}>
      <div style={{
        background: "#fef2f2", padding: "10px 16px", borderBottom: "1px solid #fecdd3",
        fontWeight: 700, fontSize: 13, color: "#991b1b",
      }}>
        ⚠ Riesgos identificados ({risks.length})
      </div>
      {risks.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: "#2e7d32" }}>
          Sin riesgos críticos detectados.
        </div>
      ) : (
        risks.map((r, i) => {
          const ss = SEVERITY_STYLE[r.severity] ?? { color: "#555", bg: "#f5f5f5" };
          return (
            <div key={r.id} style={{
              padding: "10px 16px",
              borderBottom: i < risks.length - 1 ? "1px solid #fef2f2" : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: ss.color, background: ss.bg,
                  border: `1px solid ${ss.color}30`, borderRadius: 3, padding: "1px 5px",
                }}>
                  {r.severity}
                </span>
                <span style={{ fontSize: 11, color: "#888" }}>{r.area}</span>
              </div>
              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.4 }}>{r.description}</div>
              {r.metric && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{r.metric}</div>
              )}
              <div style={{ marginTop: 6 }}>
                <ActionButton
                  orgSlug={orgSlug}
                  label="Escalar"
                  size="xs"
                  variant="danger"
                  prefill={{
                    title:       `Riesgo financiero: ${r.area} — ${r.severity}`,
                    description: r.description,
                    actionType:  r.severity === "CRITICO"
                      ? ActionTaskType.ESCALAR_A_GERENCIA
                      : ActionTaskType.ABRIR_ALERTA_OPERATIVA,
                    priority:    r.severity === "CRITICO"
                      ? ActionTaskPriority.URGENT
                      : ActionTaskPriority.HIGH,
                    sourceModule: "finanzas",
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Opportunities panel ───────────────────────────────────────────────────────

function OpportunitiesPanel({ opportunities }: { opportunities: CommitteeOpportunity[] }) {
  return (
    <div style={{ border: "1px solid #bbf7d0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{
        background: "#f0fdf4", padding: "10px 16px", borderBottom: "1px solid #bbf7d0",
        fontWeight: 700, fontSize: 13, color: "#166534",
      }}>
        ✓ Oportunidades ({opportunities.length})
      </div>
      {opportunities.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: "#555" }}>
          Sin oportunidades detectadas aún.
        </div>
      ) : (
        opportunities.map((o, i) => (
          <div key={o.id} style={{
            padding: "10px 16px",
            borderBottom: i < opportunities.length - 1 ? "1px solid #f0fdf4" : undefined,
          }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{o.area}</div>
            <div style={{ fontSize: 12, color: "#333", lineHeight: 1.4 }}>{o.description}</div>
            {o.metric && (
              <div style={{ fontSize: 11, color: "#16a34a", marginTop: 2, fontWeight: 600 }}>
                {o.metric}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Liquidity card ────────────────────────────────────────────────────────────

function LiquidityCard({ liquidity }: { liquidity: LiquiditySummary }) {
  const fmt = (n: number) =>
    `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

  if (!liquidity.hasData) {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>💵 Tesorería / Liquidez</div>
        <p style={{ fontSize: 12, color: "#888" }}>Sin datos de cartera disponibles.</p>
      </div>
    );
  }

  const overduePct = (liquidity.overduePct * 100).toFixed(0);
  const overdueColor = liquidity.overduePct >= 0.40 ? "#b71c1c"
    : liquidity.overduePct >= 0.25 ? "#e65100" : "#2e7d32";

  return (
    <div style={{ border: "1px solid #bfdbfe", borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>💵 Tesorería / Liquidez</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Cartera total</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(liquidity.totalOutstanding)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Vencida</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: overdueColor }}>
            {fmt(liquidity.totalOverdue)}
            <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>({overduePct}%)</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Inflow esperado 30d</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1565c0" }}>
            {fmt(liquidity.next30DayInflow)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Inflow esperado 90d</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0277bd" }}>
            {fmt(liquidity.next90DayInflow)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Budget card ───────────────────────────────────────────────────────────────

function BudgetCard({ budget }: { budget: CommitteeBudgetSummary }) {
  const fmt = (n: number) =>
    `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

  if (!budget.hasData) {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📊 Presupuesto</div>
        <p style={{ fontSize: 12, color: "#888" }}>Sin datos presupuestales disponibles.</p>
      </div>
    );
  }

  const pct    = budget.variancePct;
  const pctStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  const pctColor = pct >= 0 ? "#2e7d32" : pct >= -10 ? "#e65100" : "#b71c1c";

  return (
    <div style={{ border: "1px solid #ddd6fe", borderRadius: 8, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>📊 Presupuesto vs Real</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Presupuestado</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(budget.totalBudgeted)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Real</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt(budget.totalActual)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Varianza</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: pctColor }}>{pctStr}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, height: 6, background: "#e0e0e0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, (budget.totalActual / Math.max(budget.totalBudgeted, 1)) * 100)}%`,
          background: pct >= 0 ? "#2e7d32" : "#e65100",
          borderRadius: 3,
        }} />
      </div>
    </div>
  );
}

// ── Decisions panel ───────────────────────────────────────────────────────────

function DecisionsPanel({ decisions, orgSlug }: { decisions: string[]; orgSlug: string }) {
  return (
    <div style={{
      border: "1px solid #e0e7ff", borderRadius: 8, overflow: "hidden",
    }}>
      <div style={{
        background: "#eef2ff", padding: "10px 16px", borderBottom: "1px solid #e0e7ff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#3730a3" }}>
          🎯 Decisiones sugeridas para comité
        </span>
        <ActionButton
          orgSlug={orgSlug}
          label="Generar informe"
          size="sm"
          variant="primary"
          prefill={{
            title:       "Informe ejecutivo de cierre financiero",
            description: decisions.join("\n• "),
            actionType:  ActionTaskType.GENERAR_INFORME,
            priority:    ActionTaskPriority.HIGH,
            sourceModule: "finanzas",
          }}
        />
      </div>
      <ul style={{ margin: 0, padding: "8px 16px 8px 32px" }}>
        {decisions.map((d, i) => (
          <li key={i} style={{
            fontSize: 13, color: "#1e1b4b", lineHeight: 1.5, marginBottom: 6,
          }}>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}
