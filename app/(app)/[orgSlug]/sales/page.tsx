import { requireOrgAccess } from "@/lib/auth/org-access";
import { isInternalRole }   from "@/lib/auth/module-access";
import {
  getLatestPeriod,
  getComparativoAnoMes,
  getParticipacionVendedor,
  getPedidosResumidos,
  getSourceKpisBySeller,
  getSourceKpisByStore,
  type ComparativoRow,
  type ParticipacionVendedorRow,
  type PedidosResumidosRow,
  type SourceKpiRow,
} from "@/lib/sales/reports";
import { getSalesAlerts, type BusinessAlertRow } from "@/lib/sales/alert-engine";
import { getSourceSplitOverview, type SourceSplitOverview } from "@/lib/finance/fpa-queries";
import { ImportTester, PivotImportTester } from "./import-tester";
import SalesDashboard from "./dashboard";

// ── Debug section periods (raw report tables below the dashboard) ─────────────
// Edit these to change what the three debug reports query.
// The executive dashboard derives its own period dynamically from the DB.
const COMPARATIVO_START = "202401";
const COMPARATIVO_END   = "202412";
const PART_START        = "202401";
const PART_END          = "202412";
const PEDIDOS_START     = "202401";
const PEDIDOS_END       = "202412";
// ─────────────────────────────────────────────────────────────────────────────

type ReportResult<T> =
  | { ok: true;  data: T[];   ms: number }
  | { ok: false; error: string; ms: number };

async function safeCall<T>(fn: () => Promise<T[]>): Promise<ReportResult<T>> {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { ok: true, data, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - t0 };
  }
}

export default async function SalesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                       = await params;
  const { organization, membership }      = await requireOrgAccess(orgSlug);
  const orgId                             = organization.id;
  const isInternal                        = isInternalRole(membership.role);

  // ── Dynamic executive period ──────────────────────────────────────────────
  const latestPeriod = await getLatestPeriod(orgId);
  const dashTrendEnd   = latestPeriod;
  const dashTrendStart = periodMinusMonths(latestPeriod, 11);

  // Source-split KPIs are always shown (not debug-only)
  const [sourceSplit, sellerSourceKpis, storeSourceKpis] = await Promise.all([
    getSourceSplitOverview(orgId, latestPeriod).catch(() => null),
    getSourceKpisBySeller(orgId, latestPeriod).catch(() => []),
    getSourceKpisByStore(orgId, latestPeriod).catch(()  => []),
  ]);

  // ── Internal-only debug data ──────────────────────────────────────────────
  const [comparativo, participacion, pedidos, alerts] = isInternal
    ? await Promise.all([
        safeCall<ComparativoRow>(()       => getComparativoAnoMes(orgId, COMPARATIVO_START, COMPARATIVO_END)),
        safeCall<ParticipacionVendedorRow>(() => getParticipacionVendedor(orgId, PART_START, PART_END)),
        safeCall<PedidosResumidosRow>(()  => getPedidosResumidos(orgId, PEDIDOS_START, PEDIDOS_END)),
        safeCall<BusinessAlertRow>(()     => getSalesAlerts(orgId, PEDIDOS_END)),
      ])
    : [null, null, null, null];

  const secs = isInternal && comparativo && participacion && pedidos ? [
    {
      title:    "Comparativo Año/Mes",
      subtitle: `start=${COMPARATIVO_START} end=${COMPARATIVO_END}`,
      result:   comparativo,
      count:    comparativo.ok ? `${comparativo.data.length} months` : null,
      extra:    comparativo.ok
        ? (() => {
            const t = comparativo.data.reduce((s, r) => s + r.totalAmount, 0);
            return t ? `YTD: ${fmtCOP(t)}` : null;
          })()
        : null,
    },
    {
      title:    "Participación Vendedor",
      subtitle: `start=${PART_START} end=${PART_END}`,
      result:   participacion,
      count:    participacion.ok ? `${participacion.data.length} sellers` : null,
      extra:    null,
    },
    {
      title:    "Pedidos Resumidos",
      subtitle: `start=${PEDIDOS_START} end=${PEDIDOS_END}`,
      result:   pedidos,
      count:    pedidos.ok ? `${pedidos.data.length} rows` : null,
      extra:    null,
    },
  ] : [];

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Quick nav ── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 16,
        fontSize: 11, fontFamily: "monospace", flexWrap: "wrap",
      }}>
        {[
          { label: "Vendedores",     href: `/${orgSlug}/sales/vendors` },
          { label: "Líneas",         href: `/${orgSlug}/sales/lines` },
          { label: "Clientes",       href: `/${orgSlug}/sales/customers` },
          { label: "Sucursales",     href: `/${orgSlug}/sales/branches` },
          { label: "Canales",        href: `/${orgSlug}/sales/channels` },
        ].map(nav => (
          <a key={nav.href} href={nav.href} style={{
            padding: "4px 12px",
            border: "1px solid #ddd",
            borderRadius: 4,
            textDecoration: "none",
            color: "#444",
            background: "#fafafa",
            fontWeight: 600,
          }}>
            {nav.label} ↗
          </a>
        ))}
        <a href={`/${orgSlug}/data-explorer`} style={{
          padding: "4px 12px", border: "1px solid #ddd",
          borderRadius: 4, textDecoration: "none", color: "#888", background: "#fafafa",
        }}>
          Explorador →
        </a>
        <a href={`/${orgSlug}/reconciliation`} style={{
          padding: "4px 12px", border: "1px solid #ddd",
          borderRadius: 4, textDecoration: "none", color: "#888", background: "#fafafa",
        }}>
          Conciliación →
        </a>
        <a href={`/${orgSlug}/reports`} style={{
          padding: "4px 12px", border: "1px solid #7c3aed",
          borderRadius: 4, textDecoration: "none",
          color: "#7c3aed", background: "#faf5ff", fontWeight: 700,
        }}>
          ✨ Informes Inteligentes →
        </a>
      </div>

      {/* ── Executive Dashboard ── */}
      <SalesDashboard
        orgId={orgId}
        orgSlug={orgSlug}
        currentPeriod={latestPeriod}
        trendStart={dashTrendStart}
        trendEnd={dashTrendEnd}
      />

      {/* ── Source Split KPIs ── */}
      {(sourceSplit?.hasData || sellerSourceKpis.length > 0) && (
        <SourceSplitSection
          split={sourceSplit}
          sellerKpis={sellerSourceKpis}
          storeKpis={storeSourceKpis}
          orgSlug={orgSlug}
          period={latestPeriod}
        />
      )}

      {/* ── Debug sections — internal only ─────────────────────────────────── */}
      {isInternal && alerts && secs.length > 0 && (
        <>
          {/* Separator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            margin: "8px 0 24px",
          }}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e5e7eb", margin: 0 }} />
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#aaa",
              textTransform: "uppercase", letterSpacing: "0.08em",
              padding: "0 4px",
            }}>
              Validación técnica · solo uso interno
            </span>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e5e7eb", margin: 0 }} />
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#888" }}>Validación de datos</h2>
          <p style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
            Panel de validación técnica. Carga CSV, verifica el resultado de importación y confirma integridad de los reportes.
          </p>

          {/* Debug summary bar */}
          <div style={{
            display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center",
            padding: "8px 14px", background: "#f5f5f5",
            border: "1px solid #ddd", borderRadius: 6, marginBottom: 32,
            fontSize: 12,
          }}>
            <span><span style={{ color: "#888" }}>org: </span><b>{orgSlug}</b></span>
            <span><span style={{ color: "#888" }}>id: </span><b style={{ fontSize: 11 }}>{orgId}</b></span>
            <span style={{ color: "#bbb" }}>|</span>
            {secs.map(s => (
              <span key={s.title}>
                <span style={{ color: "#888" }}>{s.title.split(" ")[0]}: </span>
                <span style={{
                  fontWeight: 600,
                  color: s.result.ok ? (s.count && s.count !== "0 months" ? "#14532d" : "#888") : "#991b1b",
                }}>
                  {s.result.ok ? (s.count ?? "ok") : "error"}
                </span>
                {s.extra && <span style={{ color: "#555" }}> · {s.extra}</span>}
              </span>
            ))}
            <span style={{ color: "#bbb", marginLeft: "auto", fontSize: 11 }}>
              edit periods at top of page.tsx
            </span>
          </div>

          {/* Pivot import tester */}
          <PivotImportTester orgSlug={orgSlug} />

          {/* Flat CSV import tester */}
          <ImportTester orgSlug={orgSlug} />

          {/* Business Alerts */}
          <section style={{ marginBottom: 32, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              padding: "10px 16px", borderBottom: "1px solid #ddd",
              background: alerts.ok && alerts.data.some(a => a.severity === "CRITICAL") ? "#fff0f0"
                        : alerts.ok && alerts.data.length > 0 ? "#fffbeb"
                        : "#f5f5f5",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Alertas Comerciales</span>
              <Badge ok={alerts.ok} />
              <span style={{ fontSize: 11, color: "#666" }}>period: {PEDIDOS_END}</span>
              {alerts.ok && (
                <span style={{ fontSize: 11, color: "#888" }}>
                  {alerts.data.length} alert{alerts.data.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {!alerts.ok && (
              <div style={{ padding: "8px 16px", fontSize: 13, background: "#fff0f0", color: "#991b1b" }}>
                {alerts.error}
              </div>
            )}

            {alerts.ok && alerts.data.length === 0 && (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "#888", background: "#fafafa" }}>
                Sin alertas para el período {PEDIDOS_END}.
              </div>
            )}

            {alerts.ok && alerts.data.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}>
                    {["Gravedad", "Tipo", "Entidad", "Título", "Mensaje", "Período"].map(h => (
                      <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#555" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.data.map((a, i) => (
                    <tr key={a.id} style={{
                      borderBottom: "1px solid #f0f0f0",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}>
                      <td style={{ padding: "6px 12px" }}><SeverityBadge severity={a.severity} /></td>
                      <td style={{ padding: "6px 12px", color: "#555" }}>{a.type}</td>
                      <td style={{ padding: "6px 12px" }}>
                        <span style={{ fontSize: 10, color: "#888" }}>{a.entityType} </span>
                        <b>{a.entityLabel}</b>
                      </td>
                      <td style={{ padding: "6px 12px", fontWeight: 600 }}>{a.title}</td>
                      <td style={{ padding: "6px 12px", color: "#444", maxWidth: 340 }}>{a.message}</td>
                      <td style={{ padding: "6px 12px", color: "#888" }}>{a.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Report sections */}
          {secs.map(({ title, subtitle, result }) => (
            <section key={title} style={{
              marginBottom: 32, border: "1px solid #ddd",
              borderRadius: 6, overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 16px", borderBottom: "1px solid #ddd",
                background: result.ok ? "#f5f5f5" : "#fff0f0",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
                <Badge ok={result.ok} />
                <span style={{ fontSize: 11, color: "#666" }}>{subtitle}</span>
                <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto" }}>{result.ms} ms</span>
              </div>

              {!result.ok && (
                <div style={{
                  padding: "8px 16px", fontSize: 13,
                  background: "#fff0f0", color: "#991b1b",
                  borderBottom: "1px solid #fca5a5",
                }}>
                  {result.error}
                </div>
              )}

              {result.ok && result.data.length === 0 && (
                <div style={{ padding: "12px 16px", fontSize: 13, color: "#888", background: "#fafafa" }}>
                  Sin datos — importe un CSV primero y recargue la página.
                </div>
              )}

              {result.ok && result.data.length > 0 && (
                <pre style={{
                  margin: 0, padding: 16, fontSize: 11, lineHeight: 1.6,
                  overflowX: "auto", background: "#fff", color: "#111",
                  maxHeight: 380, overflowY: "auto",
                }}>
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </section>
          ))}

          <p style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
            To change test periods: edit COMPARATIVO_START / COMPARATIVO_END etc. at the top of{" "}
            <code>app/(app)/[orgSlug]/sales/page.tsx</code>.
          </p>
        </>
      )}
    </div>
  );
}

// ── Period helpers ────────────────────────────────────────────────────────────

/** Subtract N months from a "YYYYMM" string, returning a new "YYYYMM" string. */
function periodMinusMonths(periodo: string, months: number): string {
  const year  = Number(periodo.slice(0, 4));
  const month = Number(periodo.slice(4));          // 1-based
  const date  = new Date(year, month - 1 - months, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    CRITICAL: { bg: "#fca5a5", color: "#991b1b" },
    WARNING:  { bg: "#fde68a", color: "#92400e" },
    INFO:     { bg: "#bfdbfe", color: "#1e3a8a" },
  };
  const s = map[severity] ?? { bg: "#e5e7eb", color: "#374151" };
  return (
    <span style={{
      fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {severity}
    </span>
  );
}

function Badge({ ok }: { ok: boolean }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
      background: ok ? "#bbf7d0" : "#fca5a5",
      color:      ok ? "#14532d" : "#991b1b",
    }}>
      {ok ? "OK" : "ERROR"}
    </span>
  );
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

// ── Source Split Section ──────────────────────────────────────────────────────
//
// Shows F1/F2 source split KPIs: ventas oficiales, remisiones, conversión,
// and breakdown by seller / store with risk indicators.

function SourceSplitSection({
  split,
  sellerKpis,
  storeKpis,
  orgSlug,
  period,
}: {
  split:      SourceSplitOverview | null;
  sellerKpis: SourceKpiRow[];
  storeKpis:  SourceKpiRow[];
  orgSlug:    string;
  period:     string;
}) {
  const fmtPct = (n: number) => n.toFixed(1) + "%";
  const f2Sellers = sellerKpis.filter(s => s.f2Amount > 0);
  const f2Stores  = storeKpis.filter(s => s.f2Amount > 0);

  return (
    <div style={{
      border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        padding: "9px 14px", borderBottom: "1px solid #ddd",
        background: "#fafafa", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>📊 Fuente 1 vs Fuente 2 · {period}</span>
        <span style={{
          fontSize: 10, background: "#dcfce7", color: "#14532d",
          padding: "2px 7px", borderRadius: 4, fontWeight: 700,
        }}>F1 OFICIAL</span>
        <span style={{
          fontSize: 10, background: "#fef3c7", color: "#92400e",
          padding: "2px 7px", borderRadius: 4, fontWeight: 700,
        }}>F2 REMISIÓN</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#aaa" }}>
          Solo Fuente 1 cuenta como ingreso reconocido
        </span>
      </div>

      {/* Overview KPIs */}
      {split && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
          borderBottom: "1px solid #f0f0f0",
        }}>
          {[
            { label: "Ventas oficiales (F1)",    value: fmtCOP(split.f1Amount),    sub: fmtPct(split.f1SharePct) + " del total", color: "#14532d", bg: "#f0fdf4" },
            { label: "Ventas remisión (F2)",      value: fmtCOP(split.f2Amount),    sub: fmtPct(split.f2SharePct) + " del total", color: "#92400e", bg: "#fffbeb" },
            { label: "Total operacional",         value: fmtCOP(split.totalAmount), sub: "F1 + F2",                                color: "#111",    bg: "#fff"    },
            { label: "Conversión F2 → F1",        value: fmtPct(split.conversionRate), sub: "tasa estimada",                       color: split.conversionRate >= 75 ? "#14532d" : split.conversionRate >= 50 ? "#92400e" : "#991b1b", bg: "#fff" },
            { label: "Datos legado asumidos",     value: fmtPct(split.legacyAssumedPct), sub: "sin señal explícita",                color: split.legacyAssumedPct > 30 ? "#92400e" : "#6b7280", bg: "#fff" },
          ].map(kpi => (
            <div key={kpi.label} style={{
              padding: "12px 14px", background: kpi.bg,
              borderRight: "1px solid #f0f0f0",
            }}>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Seller source breakdown */}
      {f2Sellers.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Vendedores · Peor conversión F2 → F1 (mayor riesgo primero)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Vendedor", "F1 Oficial", "F2 Remisión", "Total", "% F1", "Conversión", "Riesgo", "Legado"].map(h => (
                  <th key={h} style={{ padding: "4px 10px", textAlign: "left", fontWeight: 600, color: "#555", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {f2Sellers.slice(0, 8).map((s, i) => {
                const riskBg    = s.riskLevel === "HIGH" ? "#fef2f2" : s.riskLevel === "MEDIUM" ? "#fffbeb" : "#f0fdf4";
                const riskColor = s.riskLevel === "HIGH" ? "#dc2626" : s.riskLevel === "MEDIUM" ? "#d97706" : "#16a34a";
                return (
                  <tr key={s.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "5px 10px", fontWeight: 600 }}>
                      <a href={`/${orgSlug}/sales/vendors/${s.key}`} style={{ color: "#111", textDecoration: "none" }}>{s.label}</a>
                    </td>
                    <td style={{ padding: "5px 10px", color: "#14532d" }}>{fmtCOP(s.f1Amount)}</td>
                    <td style={{ padding: "5px 10px", color: "#d97706" }}>{fmtCOP(s.f2Amount)}</td>
                    <td style={{ padding: "5px 10px", color: "#555" }}>{fmtCOP(s.totalAmount)}</td>
                    <td style={{ padding: "5px 10px" }}>{fmtPct(s.f1SharePct)}</td>
                    <td style={{ padding: "5px 10px", fontWeight: 700, color: riskColor }}>{fmtPct(s.conversionRate)}</td>
                    <td style={{ padding: "5px 10px" }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: riskBg, color: riskColor, fontWeight: 700 }}>
                        {s.riskLevel}
                      </span>
                    </td>
                    <td style={{ padding: "5px 10px", color: s.legacyCount > 0 ? "#d97706" : "#aaa", fontSize: 10 }}>
                      {s.legacyCount > 0 ? `${s.legacyCount} legado` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Store source breakdown */}
      {f2Stores.length > 0 && (
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Sucursales · Alta preventa no facturada
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {f2Stores.filter(s => s.f2Amount > s.f1Amount).map(s => {
              const riskColor = s.riskLevel === "HIGH" ? "#dc2626" : s.riskLevel === "MEDIUM" ? "#d97706" : "#16a34a";
              const riskBg    = s.riskLevel === "HIGH" ? "#fef2f2" : s.riskLevel === "MEDIUM" ? "#fffbeb" : "#f0fdf4";
              return (
                <a key={s.key} href={`/${orgSlug}/sales/branches/${s.key}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    padding: "6px 10px", borderRadius: 5, border: `1px solid ${riskBg}`,
                    background: riskBg, fontSize: 11,
                  }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.label}</div>
                    <div style={{ color: riskColor, fontWeight: 600 }}>F2: {fmtCOP(s.f2Amount)}</div>
                    <div style={{ color: "#aaa", fontSize: 10 }}>{fmtPct(s.f2SharePct)} remisión</div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
