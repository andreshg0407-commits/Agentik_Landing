"use client";

/**
 * AgreementsClient — commercial agreement management surface.
 *
 * Sprint: AGENTIK-CUSTOM-COMMERCIAL-AGREEMENTS-01
 *
 * SUPER_ADMIN / AGENTIK_ADMIN only.
 * View, create, supersede, and expire tenant commercial agreements.
 * Displays Castillitos target as a reference preset (never auto-creates).
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { C, T, S, R } from "@/lib/ui/tokens";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgreementModule {
  id: string;
  agreementId: string;
  moduleKey: string;
}

interface AgreementUsageLimit {
  id: string;
  agreementId: string;
  metricKey: string;
  includedQuantity: number;
  policy: string;
  overagePriceCents: number | null;
  overageCurrency: string | null;
}

interface AgreementFull {
  id: string;
  organizationId: string;
  agreementType: string;
  monthlyPriceCents: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  modules: AgreementModule[];
  usageLimits: AgreementUsageLimit[];
}

interface SellableModule {
  key: string;
  name: string;
  category: string;
}

interface ContractLimit {
  metricKey: string;
  includedQuantity: number;
  policy: string;
  overagePriceCents: number | null;
  overageCurrency: string | null;
  contractualNote: string;
}

interface Props {
  orgSlug: string;
  agreements: AgreementFull[];
  activeAgreement: AgreementFull | null;
  sellableModules: SellableModule[];
  castillitosPreset: {
    moduleKeys: string[];
    contractLimits: ContractLimit[];
  };
  metricReadiness: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  const d = Math.floor(cents / 100);
  const r = cents % 100;
  const formatted = `${d}.${String(r).padStart(2, "0")}`;
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric", month: "short", day: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: C.green,
  EXPIRED: C.inkLight,
  SUPERSEDED: C.amber,
  DRAFT: C.blueDark,
};

const METRIC_LABELS: Record<string, string> = {
  whatsapp_conversations_monthly: "WhatsApp conversaciones/mes",
  ai_chat_queries_monthly: "Consultas IA/mes",
  image_units_monthly: "Imágenes/mes",
  ai_videos_monthly: "Videos/mes",
  accounting_documents_monthly: "Documentos contables/mes",
  ai_credits_monthly: "Créditos IA/mes",
  video_seconds_monthly: "Segundos video/mes (interno)",
  automation_executions_monthly: "Ejecuciones automatización/mes",
  storage_gb: "Almacenamiento GB",
  whatsapp_messages_monthly: "Mensajes WhatsApp/mes (interno)",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AgreementsClient({
  orgSlug,
  agreements,
  activeAgreement,
  sellableModules,
  castillitosPreset,
  metricReadiness,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // ── Create form state ──────────────────────────────────────────────────────

  const [formPrice, setFormPrice] = useState(75000);
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formFrom, setFormFrom] = useState(new Date().toISOString().slice(0, 10));
  const [formTo, setFormTo] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formModules, setFormModules] = useState<Set<string>>(new Set());
  const [formLimits, setFormLimits] = useState<ContractLimit[]>([]);

  const loadPreset = useCallback(() => {
    setFormPrice(75000);
    setFormCurrency("USD");
    setFormModules(new Set(castillitosPreset.moduleKeys));
    setFormLimits(castillitosPreset.contractLimits);
    setFormNote("Acuerdo Castillitos — paquete USD 750/mes (propuesta 2026-03-09)");
  }, [castillitosPreset]);

  const toggleModule = useCallback((key: string) => {
    setFormModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── API calls ──────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (formModules.size === 0) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        agreementType: "CUSTOM_BUNDLE",
        monthlyPriceCents: formPrice,
        currency: formCurrency,
        effectiveFrom: formFrom,
        effectiveTo: formTo || undefined,
        note: formNote || undefined,
        includedModuleKeys: [...formModules],
        usageLimits: formLimits.map(l => ({
          metricKey: l.metricKey,
          includedQuantity: l.includedQuantity,
          policy: l.policy,
          overagePriceCents: l.overagePriceCents,
          overageCurrency: l.overageCurrency,
        })),
      };

      if (activeAgreement) {
        // Supersede
        await fetch(`/api/orgs/${orgSlug}/modules/agreements`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ existingAgreementId: activeAgreement.id, ...body }),
        });
      } else {
        await fetch(`/api/orgs/${orgSlug}/modules/agreements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setShowCreate(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }, [orgSlug, router, formPrice, formCurrency, formFrom, formTo, formNote, formModules, formLimits, activeAgreement]);

  const handleExpire = useCallback(async (agreementId: string) => {
    setLoading(true);
    try {
      await fetch(`/api/orgs/${orgSlug}/modules/agreements`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }, [orgSlug, router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: S[6], fontFamily: T.mono, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: S[6] }}>
        <div style={{
          fontSize: T.sz.xs, fontWeight: 700, letterSpacing: "0.12em",
          color: C.inkLight, textTransform: "uppercase", marginBottom: S[1],
        }}>
          {orgSlug} · Acuerdos Comerciales
        </div>
        <h1 style={{
          margin: 0, fontSize: T.sz.xl, fontWeight: 700,
          color: C.ink, letterSpacing: "-0.3px",
        }}>
          Contratos & Bundles
        </h1>
      </div>

      {/* Active agreement card */}
      {activeAgreement ? (
        <div style={{
          background: C.surface, border: `1px solid ${C.green}`,
          borderRadius: R.md, padding: S[4], marginBottom: S[5],
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{
                fontSize: 10, fontWeight: 700, color: C.green,
                textTransform: "uppercase", letterSpacing: "0.1em",
              }}>
                ACUERDO ACTIVO
              </span>
              <div style={{ fontSize: T.sz.lg, fontWeight: 700, color: C.ink, marginTop: S[1] }}>
                {formatCents(activeAgreement.monthlyPriceCents, activeAgreement.currency)}/mes
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
                Desde {formatDate(activeAgreement.effectiveFrom)}
                {activeAgreement.effectiveTo ? ` hasta ${formatDate(activeAgreement.effectiveTo)}` : " · sin fecha fin"}
              </div>
              {activeAgreement.note && (
                <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1], fontStyle: "italic" }}>
                  {activeAgreement.note}
                </div>
              )}
            </div>
            <button
              onClick={() => handleExpire(activeAgreement.id)}
              disabled={loading}
              className="ag-action-ghost"
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
                color: C.red, cursor: loading ? "wait" : "pointer",
              }}
            >
              Expirar
            </button>
          </div>

          {/* Included modules */}
          <div style={{ marginTop: S[3], borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", marginBottom: S[2] }}>
              Módulos incluidos ({activeAgreement.modules.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
              {activeAgreement.modules.map(m => (
                <span key={m.moduleKey} style={{
                  fontSize: 10, fontWeight: 600, color: C.blueDark,
                  background: "rgba(0,74,173,0.06)", padding: "2px 8px",
                  borderRadius: R.sm,
                }}>
                  {m.moduleKey}
                </span>
              ))}
            </div>
          </div>

          {/* Usage limits */}
          {activeAgreement.usageLimits.length > 0 && (
            <div style={{ marginTop: S[3], borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkLight, textTransform: "uppercase", marginBottom: S[2] }}>
                Límites contractuales
              </div>
              {activeAgreement.usageLimits.map(ul => (
                <div key={ul.metricKey} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px 0`,
                }}>
                  <span>{METRIC_LABELS[ul.metricKey] ?? ul.metricKey}</span>
                  <span style={{ fontWeight: 600 }}>
                    {ul.includedQuantity.toLocaleString()}
                    <span style={{ color: C.inkLight, fontWeight: 500, marginLeft: 4 }}>
                      ({ul.policy})
                    </span>
                    {ul.overagePriceCents != null && (
                      <span style={{ color: C.amber, marginLeft: 8 }}>
                        +{formatCents(ul.overagePriceCents, ul.overageCurrency ?? "USD")}/u
                      </span>
                    )}
                    <span style={{
                      fontSize: 9, marginLeft: 8,
                      color: metricReadiness[ul.metricKey] === "TRACKING_NOT_READY" ? C.amber : C.green,
                    }}>
                      {metricReadiness[ul.metricKey] ?? "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: R.md, padding: S[4], marginBottom: S[5],
          color: C.inkLight, fontSize: T.sz.sm,
        }}>
          Sin acuerdo comercial activo. Facturación por módulo individual.
        </div>
      )}

      {/* Create / Supersede button */}
      <div style={{ marginBottom: S[5] }}>
        <button
          onClick={() => { setShowCreate(!showCreate); if (!showCreate) loadPreset(); }}
          className="ag-action-primary"
          style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
            padding: `${S[2]}px ${S[4]}px`, borderRadius: R.sm,
          }}
        >
          {activeAgreement ? "Superseder acuerdo" : "Crear acuerdo"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: C.surface, border: `1px solid ${C.blueDark}`,
          borderRadius: R.md, padding: S[4], marginBottom: S[5],
        }}>
          <div style={{
            fontSize: T.sz.sm, fontWeight: 700, color: C.ink, marginBottom: S[3],
          }}>
            {activeAgreement ? "Superseder acuerdo existente" : "Nuevo acuerdo CUSTOM_BUNDLE"}
          </div>

          {/* Price + currency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3], marginBottom: S[3] }}>
            <label style={{ fontSize: T.sz.xs, color: C.inkLight }}>
              Precio mensual (centavos)
              <input
                type="number"
                value={formPrice}
                onChange={e => setFormPrice(Number(e.target.value))}
                style={{
                  width: "100%", padding: S[2], fontFamily: T.mono,
                  fontSize: T.sz.sm, border: `1px solid ${C.line}`,
                  borderRadius: R.sm, marginTop: 4,
                }}
              />
            </label>
            <label style={{ fontSize: T.sz.xs, color: C.inkLight }}>
              Moneda
              <input
                type="text"
                value={formCurrency}
                onChange={e => setFormCurrency(e.target.value)}
                style={{
                  width: "100%", padding: S[2], fontFamily: T.mono,
                  fontSize: T.sz.sm, border: `1px solid ${C.line}`,
                  borderRadius: R.sm, marginTop: 4,
                }}
              />
            </label>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.blueDark, alignSelf: "end", paddingBottom: S[2] }}>
              = {formatCents(formPrice, formCurrency)}/mes
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3], marginBottom: S[3] }}>
            <label style={{ fontSize: T.sz.xs, color: C.inkLight }}>
              Efectivo desde
              <input
                type="date"
                value={formFrom}
                onChange={e => setFormFrom(e.target.value)}
                style={{
                  width: "100%", padding: S[2], fontFamily: T.mono,
                  fontSize: T.sz.sm, border: `1px solid ${C.line}`,
                  borderRadius: R.sm, marginTop: 4,
                }}
              />
            </label>
            <label style={{ fontSize: T.sz.xs, color: C.inkLight }}>
              Efectivo hasta (opcional)
              <input
                type="date"
                value={formTo}
                onChange={e => setFormTo(e.target.value)}
                style={{
                  width: "100%", padding: S[2], fontFamily: T.mono,
                  fontSize: T.sz.sm, border: `1px solid ${C.line}`,
                  borderRadius: R.sm, marginTop: 4,
                }}
              />
            </label>
          </div>

          {/* Note */}
          <label style={{ fontSize: T.sz.xs, color: C.inkLight, display: "block", marginBottom: S[3] }}>
            Nota
            <input
              type="text"
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              style={{
                width: "100%", padding: S[2], fontFamily: T.mono,
                fontSize: T.sz.sm, border: `1px solid ${C.line}`,
                borderRadius: R.sm, marginTop: 4,
              }}
            />
          </label>

          {/* Module selection */}
          <div style={{ marginBottom: S[3] }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: C.inkLight,
              textTransform: "uppercase", marginBottom: S[2],
            }}>
              Módulos incluidos ({formModules.size})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: S[1] }}>
              {sellableModules.map(m => (
                <button
                  key={m.key}
                  onClick={() => toggleModule(m.key)}
                  style={{
                    fontSize: 10, fontWeight: 600, fontFamily: T.mono,
                    padding: "3px 10px", borderRadius: R.sm,
                    border: `1px solid ${formModules.has(m.key) ? C.blueDark : C.line}`,
                    background: formModules.has(m.key) ? "rgba(0,74,173,0.08)" : "transparent",
                    color: formModules.has(m.key) ? C.blueDark : C.inkLight,
                    cursor: "pointer",
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Usage limits */}
          {formLimits.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.inkLight,
                textTransform: "uppercase", marginBottom: S[2],
              }}>
                Límites contractuales
              </div>
              {formLimits.map(l => (
                <div key={l.metricKey} style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: T.sz.xs, color: C.ink, padding: `${S[1]}px 0`,
                  borderBottom: `1px solid ${C.line}`,
                }}>
                  <span>{METRIC_LABELS[l.metricKey] ?? l.metricKey}</span>
                  <span style={{ fontWeight: 600 }}>
                    {l.includedQuantity.toLocaleString()}
                    {l.overagePriceCents != null && (
                      <span style={{ color: C.amber, marginLeft: 8 }}>
                        +{formatCents(l.overagePriceCents, l.overageCurrency ?? "USD")}/u
                      </span>
                    )}
                    <span style={{
                      fontSize: 9, marginLeft: 8,
                      color: metricReadiness[l.metricKey] === "TRACKING_NOT_READY" ? C.amber : C.green,
                    }}>
                      {metricReadiness[l.metricKey] ?? "—"}
                    </span>
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 9, color: C.amber, marginTop: S[1] }}>
                Métricas TRACKING_NOT_READY: sin contador confiable — no se aplican cargos por excedente.
              </div>
            </div>
          )}

          {/* Submit */}
          <div style={{ display: "flex", gap: S[3], marginTop: S[3] }}>
            <button
              onClick={handleCreate}
              disabled={loading || formModules.size === 0}
              className="ag-action-primary"
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
                padding: `${S[2]}px ${S[4]}px`, borderRadius: R.sm,
                opacity: loading || formModules.size === 0 ? 0.5 : 1,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {activeAgreement ? "Superseder" : "Crear"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="ag-action-ghost"
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600,
                padding: `${S[2]}px ${S[4]}px`,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Agreement history */}
      {agreements.length > 0 && (
        <div>
          <h2 style={{
            fontSize: T.sz.sm, fontWeight: 700, color: C.ink,
            textTransform: "uppercase", letterSpacing: "0.08em",
            margin: `0 0 ${S[3]}px 0`,
          }}>
            Historial de acuerdos
          </h2>
          <div className="ag-op-table" style={{ borderRadius: R.md }}>
            {agreements.map(agr => (
              <div
                key={agr.id}
                className="ag-op-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px 100px",
                  alignItems: "center",
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  opacity: agr.status === "ACTIVE" ? 1 : 0.6,
                }}
              >
                <div>
                  <div style={{ fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                    {formatCents(agr.monthlyPriceCents, agr.currency)}/mes
                  </div>
                  <div style={{ fontSize: 10, color: C.inkLight, marginTop: 2 }}>
                    {agr.modules.length} módulos · {agr.usageLimits.length} límites
                    {agr.note && ` · ${agr.note}`}
                  </div>
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                  {formatDate(agr.effectiveFrom)}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                  {agr.effectiveTo ? formatDate(agr.effectiveTo) : "—"}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: STATUS_COLORS[agr.status] ?? C.inkLight,
                  textTransform: "uppercase",
                }}>
                  {agr.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
