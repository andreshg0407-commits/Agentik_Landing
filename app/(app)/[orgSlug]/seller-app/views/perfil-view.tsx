/**
 * Seller App — Perfil view with live commission statement.
 *
 * Sprint: AGENTIK-SELLER-COMMISSION-V1-IMPLEMENTATION-01
 *
 * Sections:
 *   1. Seller identity card
 *   2. Commission statement (year/month selector + live data from API)
 *   3. Advances placeholder (SOURCE_MISSING)
 *
 * Mobile-first: 390px target. All data from API — zero calculations in React.
 */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { signOut } from "next-auth/react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { SellerIdentityProps } from "./seller-app-shared";
import { fmtCOP } from "./seller-app-shared";
import { SellerIcon, StatusChip, appCard } from "./seller-ui-kit";

// ── Types (mirror of SellerCommissionStatementDto) ───────────────────────────

interface CommissionEntry {
  document: string;
  invoiceDate: string;
  collectionDate: string;
  collectedAmount: number;
  days: number;
  band: string;
  rate: number;
  commissionAmount: number;
  receiptId: number;
}

interface BandSummary {
  band: string;
  applications: number;
  collectedAmount: number;
  commissionAmount: number;
}

interface CommissionStatement {
  sellerTerceroId: number | null;
  year: number;
  month: number;
  periodStart: string;
  periodEndExclusive: string;
  totalApplications: number;
  totalCollected: number;
  totalCommission: number;
  bandSummary: BandSummary[];
  entries: CommissionEntry[];
  truthState: string;
  computedAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const BAND_LABELS: Record<string, string> = {
  "0-59": "0–59 d",
  "60-75": "60–75 d",
  "76-90": "76–90 d",
  "91-105": "91–105 d",
  "106+": "106+ d",
};

const BAND_RATES: Record<string, string> = {
  "0-59": "5%",
  "60-75": "4%",
  "76-90": "3%",
  "91-105": "2%",
  "106+": "1%",
};

function sellerInitials(name: string | null): string {
  if (!name) return "V";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "V";
}

// ── Period selector helpers ──────────────────────────────────────────────────

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

// ── Main component ───────────────────────────────────────────────────────────

export function PerfilView({
  sellerIdentity,
  orgSlug,
}: {
  sellerIdentity: SellerIdentityProps;
  orgSlug: string;
}) {
  const init = currentYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [statement, setStatement] = useState<CommissionStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntries, setExpandedEntries] = useState(false);

  const canGoNext = useMemo(() => {
    const cur = currentYearMonth();
    return year < cur.year || (year === cur.year && month < cur.month);
  }, [year, month]);

  const fetchStatement = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/comercial/seller-financial/commissions?year=${y}&month=${m}`,
      );
      if (!res.ok) {
        setError("No se pudo cargar la información");
        setStatement(null);
        return;
      }
      const data: CommissionStatement = await res.json();
      setStatement(data);
    } catch {
      setError("Error de conexión");
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchStatement(year, month);
  }, [year, month, fetchStatement]);

  const handlePrev = useCallback(() => {
    const p = prevMonth(year, month);
    setYear(p.year);
    setMonth(p.month);
    setExpandedEntries(false);
  }, [year, month]);

  const handleNext = useCallback(() => {
    if (!canGoNext) return;
    const n = nextMonth(year, month);
    setYear(n.year);
    setMonth(n.month);
    setExpandedEntries(false);
  }, [year, month, canGoNext]);

  return (
    <div style={{ padding: S[4] }}>
      {/* Seller identity card */}
      <div style={{
        ...appCard, padding: S[5], marginBottom: S[4], textAlign: "center",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: C.blueDark, color: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
          margin: "0 auto", marginBottom: S[3], boxShadow: E.md,
        }}>
          {sellerInitials(sellerIdentity.sellerName)}
        </div>
        <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep }}>
          {sellerIdentity.sellerName ?? "Vendedor"}
        </div>
        <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
          {sellerIdentity.isManagerOrAbove ? "Administrador" : "Vendedor"}
          {sellerIdentity.sellerSlug ? ` · ${sellerIdentity.sellerSlug}` : ""}
        </div>
      </div>

      {/* Commission section */}
      <div style={{ ...appCard, padding: 0, marginBottom: S[4], overflow: "hidden" }}>
        {/* Section header */}
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          background: C.surfaceAlt,
          borderBottom: `1px solid ${C.line}`,
          display: "flex", alignItems: "center", gap: S[3],
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, background: C.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${C.line}`, flexShrink: 0,
          }}>
            <SellerIcon name="clipboard" size={18} color={C.blueDark} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
              Mis comisiones
            </div>
          </div>
        </div>

        {/* Period selector */}
        <div style={{
          padding: `${S[2]}px ${S[4]}px`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${C.line}`,
        }}>
          <button onClick={handlePrev} style={navBtnStyle}>
            <SellerIcon name="back" size={18} color={C.ink} />
          </button>
          <div style={{
            fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.titleDeep,
            textAlign: "center",
          }}>
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <button onClick={handleNext} disabled={!canGoNext} style={{
            ...navBtnStyle,
            opacity: canGoNext ? 1 : 0.3,
          }}>
            <SellerIcon name="chevronRight" size={18} color={C.ink} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
          {loading && (
            <div style={{ textAlign: "center", padding: S[5], color: C.inkLight, fontSize: T.sz.sm }}>
              Calculando comisiones...
            </div>
          )}

          {error && (
            <div style={{ textAlign: "center", padding: S[4], color: C.redDark, fontSize: T.sz.sm }}>
              {error}
            </div>
          )}

          {!loading && !error && statement && (
            <CommissionContent
              statement={statement}
              expandedEntries={expandedEntries}
              onToggleEntries={() => setExpandedEntries(v => !v)}
            />
          )}
        </div>
      </div>

      {/* Advances placeholder */}
      <div style={{
        ...appCard, padding: S[4], marginBottom: S[2],
        display: "flex", alignItems: "center", gap: S[3],
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, background: C.surfaceAlt,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <SellerIcon name="briefcase" size={20} color={C.inkFaint} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
            Mis anticipos
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: 2, lineHeight: 1.5 }}>
            Saldo y movimientos de anticipos
          </div>
        </div>
        <StatusChip bg={C.surfaceAlt} color={C.inkLight}>Fuente pendiente</StatusChip>
      </div>
      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.6, marginTop: S[2] }}>
        Anticipos se activarán cuando la vista contable (cuenta 133010) esté disponible.
      </div>

      {/* Logout — separated from profile content */}
      <div style={{ marginTop: S[6], paddingTop: S[4], borderTop: `1px solid ${C.line}` }}>
        <button
          onClick={() => {
            if (window.confirm("¿Desea cerrar sesión?")) {
              signOut({ callbackUrl: "/login" });
            }
          }}
          style={{
            width: "100%",
            padding: `${S[3]}px ${S[4]}px`,
            border: `1px solid ${C.line}`,
            borderRadius: R.md,
            background: C.white,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: S[2],
            fontFamily: T.sans,
            fontSize: T.sz.md,
            fontWeight: T.wt.semibold,
            color: C.redDark,
            touchAction: "manipulation",
          }}
        >
          <SellerIcon name="logout" size={18} color={C.redDark} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ── Commission content ───────────────────────────────────────────────────────

function CommissionContent({
  statement,
  expandedEntries,
  onToggleEntries,
}: {
  statement: CommissionStatement;
  expandedEntries: boolean;
  onToggleEntries: () => void;
}) {
  if (statement.truthState === "IDENTITY_UNRESOLVED") {
    return (
      <div style={{ textAlign: "center", padding: S[3], color: C.inkLight, fontSize: T.sz.sm }}>
        Identidad de vendedor no resuelta. Contacte al administrador.
      </div>
    );
  }

  if (statement.truthState === "SAG_UNAVAILABLE") {
    return (
      <div style={{ textAlign: "center", padding: S[3], color: C.amberDark, fontSize: T.sz.sm }}>
        Sistema contable no disponible. Intente de nuevo más tarde.
      </div>
    );
  }

  if (statement.truthState === "CERTIFIED_ZERO") {
    return (
      <div style={{ textAlign: "center", padding: S[3], color: C.inkLight, fontSize: T.sz.sm }}>
        Sin recaudos comisionables en este período.
      </div>
    );
  }

  // CERTIFIED — show data
  return (
    <>
      {/* KPI row */}
      <div style={{ display: "flex", gap: S[3], marginBottom: S[4] }}>
        <KpiBox label="Comisión" value={fmtCOP(statement.totalCommission)} color={C.greenDark} />
        <KpiBox label="Recaudado" value={fmtCOP(statement.totalCollected)} />
        <KpiBox label="Aplicaciones" value={String(statement.totalApplications)} />
      </div>

      {/* Band breakdown */}
      {statement.bandSummary.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <div style={{
            fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase" as const,
            letterSpacing: "0.04em", marginBottom: S[2], fontWeight: T.wt.semibold,
          }}>
            Por banda de días
          </div>
          <div style={{
            border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              padding: `${S[1]}px ${S[2]}px`,
              background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
              fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkLight,
            }}>
              <span>Banda</span>
              <span style={{ textAlign: "right" }}>Tasa</span>
              <span style={{ textAlign: "right" }}>Recaudado</span>
              <span style={{ textAlign: "right" }}>Comisión</span>
            </div>
            {statement.bandSummary.map(b => (
              <div key={b.band} style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                padding: `${S[2]}px ${S[2]}px`,
                borderBottom: `1px solid ${C.line}`,
                fontSize: T.sz.sm,
              }}>
                <span style={{ color: C.ink, fontWeight: T.wt.medium }}>
                  {BAND_LABELS[b.band] ?? b.band}
                </span>
                <span style={{ textAlign: "right", color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
                  {BAND_RATES[b.band] ?? "—"}
                </span>
                <span style={{ textAlign: "right", color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCOP(b.collectedAmount)}
                </span>
                <span style={{ textAlign: "right", color: C.greenDark, fontWeight: T.wt.semibold, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCOP(b.commissionAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entries toggle */}
      {statement.entries.length > 0 && (
        <div>
          <button onClick={onToggleEntries} style={{
            width: "100%", padding: `${S[2]}px 0`,
            border: "none", background: "transparent",
            fontFamily: T.sans, fontSize: T.sz.sm,
            color: C.blueDark, fontWeight: T.wt.semibold,
            cursor: "pointer", textAlign: "center",
            touchAction: "manipulation",
          }}>
            {expandedEntries
              ? "Ocultar detalle"
              : `Ver detalle (${statement.entries.length} aplicaciones)`}
          </button>

          {expandedEntries && (
            <div style={{
              marginTop: S[2], border: `1px solid ${C.line}`, borderRadius: R.md,
              overflow: "hidden", maxHeight: 400, overflowY: "auto",
            }}>
              {/* Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: `${S[1]}px ${S[2]}px`,
                background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
                fontSize: 10, fontWeight: T.wt.semibold, color: C.inkLight,
                position: "sticky", top: 0,
              }}>
                <span>Documento</span>
                <span style={{ textAlign: "right" }}>Días</span>
                <span style={{ textAlign: "right" }}>Recaudado</span>
                <span style={{ textAlign: "right" }}>Comisión</span>
              </div>
              {statement.entries.map((e, i) => (
                <div key={`${e.document}-${e.receiptId}-${i}`} style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: `${S[1]}px ${S[2]}px`,
                  borderBottom: `1px solid ${C.line}`,
                  fontSize: 11,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.ink, fontWeight: T.wt.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.document}
                    </div>
                    <div style={{ color: C.inkFaint, fontSize: 9 }}>
                      {e.invoiceDate} → {e.collectionDate}
                    </div>
                  </div>
                  <span style={{ textAlign: "right", color: C.inkMid, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
                    {e.days}d
                  </span>
                  <span style={{ textAlign: "right", color: C.ink, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
                    {fmtCOP(e.collectedAmount)}
                  </span>
                  <span style={{ textAlign: "right", color: C.greenDark, fontWeight: T.wt.medium, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
                    {fmtCOP(e.commissionAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

function KpiBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1, textAlign: "center",
      padding: `${S[2]}px ${S[1]}px`,
      background: C.surfaceAlt, borderRadius: R.md,
    }}>
      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: T.sz.lg, fontWeight: T.wt.bold,
        color: color ?? C.titleDeep,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 12,
  border: `1px solid ${C.line}`, background: C.white,
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", padding: 0, touchAction: "manipulation",
};
