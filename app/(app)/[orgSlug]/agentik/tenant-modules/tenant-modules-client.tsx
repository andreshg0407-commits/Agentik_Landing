"use client";

/**
 * TenantModulesClient — module entitlement management surface.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * SUPER_ADMIN / AGENTIK_ADMIN only. Shows all modules grouped by category
 * with toggle activation, commercial terms, and multi-currency billing preview.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { C, T, S, R } from "@/lib/ui/tokens";

// ── Types ────────────────────────────────────────────────────────────────────

interface CommercialTermData {
  monthlyPriceCents: number;
  currency:          string;
  effectiveFrom:     string;
  effectiveTo:       string | null;
}

interface EntitlementPeriodData {
  effectiveFrom: string;
  effectiveTo:   string | null;
}

interface ModuleData {
  key:           string;
  name:          string;
  description:   string;
  category:      string;
  sellable:      boolean;
  enabled:       boolean;
  currentTerm:   CommercialTermData | null;
  currentPeriod: EntitlementPeriodData | null;
}

interface BillingLineItem {
  moduleKey:         string;
  moduleName:        string;
  monthlyPriceCents: number;
  currency:          string;
}

interface CurrencySubtotal {
  currency:      string;
  subtotalCents: number;
  itemCount:     number;
}

interface BillingPreviewData {
  period:             string;
  activeModuleCount:  number;
  hasMixedCurrencies: boolean;
  subtotals:          CurrencySubtotal[];
  lineItems:          BillingLineItem[];
}

interface Props {
  orgSlug:        string;
  modules:        ModuleData[];
  billingPreview: BillingPreviewData;
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
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

const CATEGORY_LABELS: Record<string, string> = {
  operations:     "Operaciones",
  intelligence:   "Inteligencia IA",
  channel:        "Canales",
  internal:       "Interno Agentik",
  platform_admin: "Administracion Plataforma",
};

const CATEGORY_ORDER = ["operations", "intelligence", "channel", "internal", "platform_admin"];

// ── Component ────────────────────────────────────────────────────────────────

export function TenantModulesClient({ orgSlug, modules, billingPreview }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleToggle = useCallback(async (mod: ModuleData) => {
    setLoading(mod.key);
    try {
      const body: Record<string, unknown> = {
        moduleKey: mod.key,
        action: mod.enabled ? "deactivate" : "activate",
      };
      // Activation requires price and currency — use current term or prompt
      if (!mod.enabled && mod.currentTerm) {
        body.monthlyPriceCents = mod.currentTerm.monthlyPriceCents;
        body.currency = mod.currentTerm.currency;
      } else if (!mod.enabled) {
        // No prior term — default to 0 COP (price decision required later)
        body.monthlyPriceCents = 0;
        body.currency = "COP";
        body.note = "Activado sin precio — requiere configuracion comercial";
      }
      await fetch(`/api/orgs/${orgSlug}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }, [orgSlug, router]);

  // Group modules by category
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: modules.filter(m => m.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div style={{ padding: S[6], fontFamily: T.mono, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: S[6] }}>
        <div style={{
          fontSize: T.sz.xs, fontWeight: 700, letterSpacing: "0.12em",
          color: C.inkLight, textTransform: "uppercase", marginBottom: S[1],
        }}>
          {orgSlug} · Gestion de Modulos
        </div>
        <h1 style={{
          margin: 0, fontSize: T.sz.xl, fontWeight: 700,
          color: C.ink, letterSpacing: "-0.3px",
        }}>
          Entitlements & Facturacion
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: S[5], alignItems: "start" }}>
        {/* Module list */}
        <div>
          {grouped.map(group => (
            <div key={group.category} style={{ marginBottom: S[5] }}>
              <h2 style={{
                fontSize: T.sz.sm, fontWeight: 700, color: C.ink,
                margin: `0 0 ${S[3]}px 0`, textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}>
                {group.label}
              </h2>
              <div className="ag-op-table" style={{ borderRadius: R.md }}>
                {group.items.map(mod => (
                  <div
                    key={mod.key}
                    className="ag-op-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 160px 80px",
                      alignItems: "center",
                      gap: S[3],
                      padding: `${S[3]}px ${S[4]}px`,
                    }}
                  >
                    {/* Info */}
                    <div>
                      <div style={{ fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                        {mod.name}
                      </div>
                      <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
                        {mod.description}
                      </div>
                      {mod.currentPeriod && (
                        <span style={{
                          fontSize: 10, fontWeight: 500, color: C.inkLight,
                          marginTop: 4, display: "inline-block",
                        }}>
                          Activo desde {formatDate(mod.currentPeriod.effectiveFrom)}
                        </span>
                      )}
                    </div>

                    {/* Price + currency */}
                    <div style={{
                      fontSize: T.sz.sm, fontWeight: 600, textAlign: "right",
                      color: mod.currentTerm ? C.ink : C.inkLight,
                    }}>
                      {mod.sellable
                        ? mod.currentTerm
                          ? `${formatCents(mod.currentTerm.monthlyPriceCents, mod.currentTerm.currency)}/mes`
                          : "Sin precio"
                        : "\u2014"}
                    </div>

                    {/* Toggle */}
                    <div style={{ textAlign: "right" }}>
                      <button
                        onClick={() => handleToggle(mod)}
                        disabled={loading === mod.key}
                        style={{
                          padding: "4px 12px",
                          fontSize: T.sz.xs,
                          fontWeight: 600,
                          fontFamily: T.mono,
                          border: "1px solid",
                          borderColor: mod.enabled ? C.green : C.line,
                          borderRadius: R.sm,
                          background: mod.enabled ? "rgba(34,197,94,0.08)" : "transparent",
                          color: mod.enabled ? C.green : C.inkLight,
                          cursor: loading === mod.key ? "wait" : "pointer",
                          opacity: loading === mod.key ? 0.6 : 1,
                        }}
                      >
                        {mod.enabled ? "Activo" : "Inactivo"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Billing preview sidebar */}
        <div style={{
          position: "sticky", top: S[4],
          background: C.surface, border: `1px solid ${C.line}`,
          borderRadius: R.md, padding: S[4],
        }}>
          <h3 style={{
            margin: `0 0 ${S[3]}px 0`, fontSize: T.sz.sm, fontWeight: 700,
            color: C.ink, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            Vista previa mensual — {billingPreview.period}
          </h3>

          {/* Subtotals per currency */}
          {billingPreview.subtotals.map(sub => (
            <div key={sub.currency} style={{
              fontSize: 28, fontWeight: 700, color: C.blueDark,
              marginBottom: S[1],
            }}>
              {formatCents(sub.subtotalCents, sub.currency)}
              <span style={{ fontSize: T.sz.xs, color: C.inkLight, fontWeight: 500, marginLeft: 4 }}>
                /mes
              </span>
            </div>
          ))}

          {billingPreview.subtotals.length === 0 && (
            <div style={{
              fontSize: 28, fontWeight: 700, color: C.inkLight,
              marginBottom: S[1],
            }}>
              —
            </div>
          )}

          {billingPreview.hasMixedCurrencies && (
            <div style={{
              fontSize: 10, color: C.amber, fontWeight: 600,
              marginBottom: S[2],
            }}>
              Monedas mixtas — subtotales separados por moneda
            </div>
          )}

          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[4] }}>
            {billingPreview.activeModuleCount} modulos activos
          </div>

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
            {billingPreview.lineItems
              .filter(li => li.monthlyPriceCents > 0)
              .map(li => (
                <div
                  key={li.moduleKey}
                  style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: T.sz.xs, color: C.ink,
                    padding: `${S[1]}px 0`,
                  }}
                >
                  <span>{li.moduleName}</span>
                  <span style={{ fontWeight: 600 }}>
                    {formatCents(li.monthlyPriceCents, li.currency)}
                  </span>
                </div>
              ))}

            {billingPreview.lineItems.filter(li => li.monthlyPriceCents > 0).length === 0 && (
              <div style={{ fontSize: T.sz.xs, color: C.inkLight, fontStyle: "italic" }}>
                Sin modulos con precio configurado
              </div>
            )}
          </div>

          <div style={{
            marginTop: S[4], fontSize: 10, color: C.inkLight,
            borderTop: `1px solid ${C.line}`, paddingTop: S[2],
          }}>
            Vista previa — no genera cargos. Precios por modulo se configuran al activar.
          </div>
        </div>
      </div>
    </div>
  );
}
