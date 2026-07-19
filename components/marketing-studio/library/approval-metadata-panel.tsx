/**
 * components/marketing-studio/library/approval-metadata-panel.tsx
 *
 * MS-04C — Approval Metadata Step
 *
 * Intermediate visual step triggered when a user clicks "Aprobar" on a
 * generated or review_pending asset.
 *
 * Before the asset is approved, the operator must complete:
 *   - Datos mínimos (name, category, SKU, channels, status, description)
 *   - Datos CRM (expandable: name, line, segment, sales argument, availability)
 *   - Dynamic product attributes (based on selected category)
 *
 * After confirm: calls onConfirm() — no persistence yet (MS-05+).
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - "use client" — manages form state locally
 *   - No mutations — visual step only
 *   - All colors C.* tokens — no raw hex in JSX
 *   - T.mono for ALL operational data
 *   - z-index 300 — renders above the detail drawer (z-index 201)
 */

"use client";

import { useState, useTransition } from "react";
import { C, T, S, R, E }          from "@/lib/ui/tokens";
import { approveAssetAsProduct }   from "@/app/actions/marketing-studio/products";
import {
  ATTRIBUTE_SCHEMAS,
  PRODUCT_CATEGORIES,
  computePropagationImpact,
  type ProductCategory,
  type ProductAttribute,
}                               from "@/lib/marketing-studio/library/product-attributes";
import {
  computeDestinationReadiness,
  type AssetMetadataSnapshot,
}                               from "@/lib/marketing-studio/library/readiness";
import type {
  BibliotecaAssetDisplay,
}                               from "./asset-detail-drawer";

// ── Props ──────────────────────────────────────────────────────────────────────

interface ApprovalMetadataPanelProps {
  asset:           BibliotecaAssetDisplay;
  organizationId:  string;
  onConfirm: () => void;
  onCancel:  () => void;
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface MinimalMetadataForm {
  commercialName:   string;
  category:         ProductCategory | "";
  sku:              string;
  usagePermission:  string;
  commercialStatus: string;
  shortDescription: string;
  // CRM
  crmName:          string;
  productLine:      string;
  segment:          string;
  salesArgument:    string;
  availability:     string;
  price:            string;
  notes:            string;
}

const EMPTY_FORM: MinimalMetadataForm = {
  commercialName:   "",
  category:         "",
  sku:              "",
  usagePermission:  "commercial",
  commercialStatus: "active",
  shortDescription: "",
  crmName:          "",
  productLine:      "",
  segment:          "",
  salesArgument:    "",
  availability:     "",
  price:            "",
  notes:            "",
};

// ── Readiness preview ──────────────────────────────────────────────────────────

function buildPreviewSnapshot(
  form:  MinimalMetadataForm,
  asset: BibliotecaAssetDisplay,
): AssetMetadataSnapshot {
  return {
    name:             form.commercialName || undefined,
    sku:              form.sku || asset.sku || undefined,
    category:         form.category || undefined,
    channels:         asset.channels,
    hasPrice:         form.price.length > 0,
    hasDescription:   form.shortDescription.length > 0,
    hasVariant1_1:    asset.variantCount >= 1,
    hasVariant9_16:   asset.variantCount >= 3,
    hasVariantBanner: asset.variantCount >= 4,
    crmName:          form.crmName || form.commercialName || undefined,
    productLine:      form.productLine || undefined,
    salesArgument:    form.salesArgument || undefined,
    availability:     form.availability || undefined,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ApprovalMetadataPanel({ asset, organizationId, onConfirm, onCancel }: ApprovalMetadataPanelProps) {
  const [form, setForm]             = useState<MinimalMetadataForm>({
    ...EMPTY_FORM,
    sku: asset.sku ?? "",
    commercialName: asset.name.startsWith("SKU ") ? "" : asset.name,
  });
  const [showCrm, setShowCrm]       = useState(false);
  const [confirmed, setConfirmed]   = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

  const set = (k: keyof MinimalMetadataForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // Live readiness preview — updates as form changes
  const snapshot     = buildPreviewSnapshot(form, asset);
  const readiness    = computeDestinationReadiness(snapshot);
  const readyCount   = readiness.filter(r => r.status === "ready").length;
  const partialCount = readiness.filter(r => r.status === "partial").length;

  // Dynamic attributes for selected category
  const categorySchema = form.category ? ATTRIBUTE_SCHEMAS[form.category] : null;
  const dynamicAttrs   = categorySchema?.suggestedAttributes ?? [];

  // Propagation impact preview
  const changedFields = Object.entries(form)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k]) => k);
  const impact = computePropagationImpact(asset.id, changedFields, asset.channels);

  function handleConfirm() {
    setActionError(null);
    startTransition(async () => {
      const result = await approveAssetAsProduct({
        assetId:          asset.id,
        organizationId,
        channels:         asset.channels,
        commercialName:   form.commercialName,
        category:         form.category,
        sku:              form.sku,
        usagePermission:  form.usagePermission,
        commercialStatus: form.commercialStatus,
        shortDescription: form.shortDescription,
        price:            form.price,
        crmName:          form.crmName,
        productLine:      form.productLine,
        segment:          form.segment,
        salesArgument:    form.salesArgument,
        availability:     form.availability,
        notes:            form.notes,
        dynamicAttributes: {},
      });

      if (!result.success) {
        setActionError(result.error ?? "Error al aprobar el asset");
        return;
      }

      setConfirmed(true);
      setTimeout(() => onConfirm(), 1200);
    });
  }

  return (
    <>
      {/* Backdrop — above drawer */}
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,.42)",
          zIndex: 299,
        }}
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Panel — centered modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Completar datos para aprobación"
        style={{
          position:      "fixed",
          top:           "50%",
          left:          "50%",
          transform:     "translate(-50%, -50%)",
          width:         560,
          maxWidth:      "calc(100vw - 32px)",
          maxHeight:     "calc(100vh - 48px)",
          background:    C.white,
          borderRadius:  R.lg,
          border:        `1px solid ${C.line}`,
          boxShadow:     E.md,
          zIndex:        300,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding:      `${S[4]}px ${S[5]}px ${S[3]}px`,
          borderBottom: `1px solid ${C.line}`,
          background:   C.surface,
          flexShrink:   0,
        }}>
          {/* Asset context */}
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
            <div style={{
              width: 32, height: 32, borderRadius: R.md,
              background: C.surfaceAlt, border: `1px solid ${C.line}`,
              overflow: "hidden", flexShrink: 0,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.assetUrl} alt={asset.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {asset.name}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {asset.assetType.replace(/_/g, " ")} · {asset.origin === "ai" ? "IA" : "Manual"}
              </div>
            </div>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            Completar datos mínimos para Biblioteca
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            Antes de aprobar, completa los datos que permiten a Luca, Mila y el equipo usar este asset.
          </div>
        </div>

        {/* ── Success state ── */}
        {confirmed && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: S[3],
            padding: S[6],
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: C.greenLight, border: `2px solid ${C.greenBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: T.mono, fontSize: 20, color: C.green,
            }}>✓</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
              Asset aprobado y preparado para Biblioteca
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "center" }}>
              Producto creado y vinculado a la Biblioteca
            </div>
          </div>
        )}

        {/* ── Form body ── */}
        {!confirmed && (
          <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain" }}>

            {/* Readiness preview strip */}
            <div style={{
              padding:      `${S[2]}px ${S[5]}px`,
              background:   C.blueLight,
              borderBottom: `1px solid ${C.blueBorder}`,
              display:      "flex", alignItems: "center", gap: S[3],
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                Readiness en tiempo real:
              </div>
              {readiness.map(r => (
                <span
                  key={r.destination}
                  style={{
                    fontFamily:   T.mono, fontSize: 9, fontWeight: T.wt.bold,
                    padding:      "2px 5px", borderRadius: R.pill,
                    background:   r.status === "ready" ? C.greenLight : r.status === "partial" ? C.amberLight : C.surface,
                    color:        r.status === "ready" ? C.green : r.status === "partial" ? C.amber : C.inkFaint,
                    border:       `1px solid ${r.status === "ready" ? C.greenBorder : r.status === "partial" ? C.amberBorder : C.line}`,
                  }}
                >
                  {r.label}
                </span>
              ))}
            </div>

            <div style={{ padding: `${S[4]}px ${S[5]}px` }}>

              {/* ── Datos mínimos ── */}
              <FormSectionTitle>Datos mínimos</FormSectionTitle>

              <FormRow>
                <FormField label="Nombre comercial *" hint="Cómo aparece en catálogo y canales">
                  <input
                    className="ag-approval-input"
                    value={form.commercialName}
                    onChange={e => set("commercialName", e.target.value)}
                    placeholder="Ej: Peluche Dinosaurio Grande"
                  />
                </FormField>
                <FormField label="SKU / código interno">
                  <input
                    className="ag-approval-input"
                    value={form.sku}
                    onChange={e => set("sku", e.target.value)}
                    placeholder="Ej: PLU-DINO-001"
                  />
                </FormField>
              </FormRow>

              <FormRow>
                <FormField label="Categoría de producto *">
                  <select
                    className="ag-approval-input"
                    value={form.category}
                    onChange={e => set("category", e.target.value as ProductCategory | "")}
                  >
                    <option value="">Seleccionar categoría…</option>
                    {(Object.entries(PRODUCT_CATEGORIES) as [ProductCategory, string][]).map(
                      ([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      )
                    )}
                  </select>
                </FormField>
                <FormField label="Estado comercial">
                  <select
                    className="ag-approval-input"
                    value={form.commercialStatus}
                    onChange={e => set("commercialStatus", e.target.value)}
                  >
                    <option value="active">Activo</option>
                    <option value="draft">Borrador</option>
                    <option value="discontinued">Descontinuado</option>
                  </select>
                </FormField>
              </FormRow>

              <FormRow single>
                <FormField label="Descripción corta" hint="Para Shopify, catálogo y Ads">
                  <textarea
                    className="ag-approval-input"
                    style={{ resize: "vertical", minHeight: 56, fontFamily: T.mono }}
                    value={form.shortDescription}
                    onChange={e => set("shortDescription", e.target.value)}
                    placeholder="Descripción breve del producto para canales digitales…"
                  />
                </FormField>
              </FormRow>

              <FormRow>
                <FormField label="Uso permitido">
                  <select
                    className="ag-approval-input"
                    value={form.usagePermission}
                    onChange={e => set("usagePermission", e.target.value)}
                  >
                    <option value="commercial">Comercial</option>
                    <option value="internal">Interno</option>
                    <option value="editorial">Editorial</option>
                    <option value="restricted">Restringido</option>
                  </select>
                </FormField>
                <FormField label="Precio base (opcional)">
                  <input
                    className="ag-approval-input"
                    value={form.price}
                    onChange={e => set("price", e.target.value)}
                    placeholder="Ej: 45000"
                    type="number"
                  />
                </FormField>
              </FormRow>

              {/* ── Dynamic attributes by category ── */}
              {dynamicAttrs.length > 0 && (
                <>
                  <FormSectionTitle style={{ marginTop: S[4] }}>
                    Atributos de {categorySchema?.label}
                  </FormSectionTitle>
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr",
                    gap: S[2], marginBottom: S[3],
                  }}>
                    {dynamicAttrs.map(attr => (
                      <DynamicAttributeField key={attr.key} attr={attr} />
                    ))}
                  </div>
                  {/* Custom field addition */}
                  <button
                    className="ag-action-ghost"
                    style={{ width: "100%", justifyContent: "center", marginBottom: S[3], opacity: 0.7 }}
                    disabled
                  >
                    + Agregar campo personalizado
                    <span style={{ fontFamily: T.mono, fontSize: 9, marginLeft: S[1], color: C.inkFaint }}>
                      · MS-05+
                    </span>
                  </button>
                </>
              )}

              {/* ── CRM section (expandable) ── */}
              <button
                onClick={() => setShowCrm(v => !v)}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[2],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   showCrm ? C.blueLight : C.surface,
                  border:       `1px solid ${showCrm ? C.blueBorder : C.line}`,
                  borderRadius: R.md,
                  cursor:       "pointer",
                  marginBottom: showCrm ? S[3] : 0,
                  width:        "100%",
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        showCrm ? C.blueDark : C.inkMid,
                  fontWeight:   T.wt.semibold,
                }}
              >
                <span style={{ fontSize: 9 }}>{showCrm ? "▾" : "▸"}</span>
                Datos para CRM (Mila)
                <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontWeight: T.wt.normal }}>
                  {form.crmName || form.salesArgument ? "datos ingresados" : "opcional"}
                </span>
              </button>

              {showCrm && (
                <>
                  <FormRow>
                    <FormField label="Nombre para CRM" hint="Como Mila presenta el producto">
                      <input
                        className="ag-approval-input"
                        value={form.crmName}
                        onChange={e => set("crmName", e.target.value)}
                        placeholder={form.commercialName || "Ej: Peluche Dino"}
                      />
                    </FormField>
                    <FormField label="Familia / línea">
                      <input
                        className="ag-approval-input"
                        value={form.productLine}
                        onChange={e => set("productLine", e.target.value)}
                        placeholder="Ej: Línea Selva"
                      />
                    </FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Segmento">
                      <input
                        className="ag-approval-input"
                        value={form.segment}
                        onChange={e => set("segment", e.target.value)}
                        placeholder="Ej: Niños 3-6 años"
                      />
                    </FormField>
                    <FormField label="Disponibilidad">
                      <select
                        className="ag-approval-input"
                        value={form.availability}
                        onChange={e => set("availability", e.target.value)}
                      >
                        <option value="">Seleccionar…</option>
                        <option value="in_stock">En stock</option>
                        <option value="low_stock">Stock bajo</option>
                        <option value="pre_order">Pre-venta</option>
                        <option value="out_of_stock">Agotado</option>
                      </select>
                    </FormField>
                  </FormRow>
                  <FormRow single>
                    <FormField label="Argumento de venta corto" hint="Mila lo usa para responder clientes">
                      <textarea
                        className="ag-approval-input"
                        style={{ resize: "vertical", minHeight: 48, fontFamily: T.mono }}
                        value={form.salesArgument}
                        onChange={e => set("salesArgument", e.target.value)}
                        placeholder="Ej: Suave, sin BPA, ideal para regalo. Edad recomendada 3+."
                      />
                    </FormField>
                  </FormRow>
                  <FormRow single>
                    <FormField label="Observaciones comerciales">
                      <input
                        className="ag-approval-input"
                        value={form.notes}
                        onChange={e => set("notes", e.target.value)}
                        placeholder="Ej: No vender junto a línea Bosque."
                      />
                    </FormField>
                  </FormRow>
                </>
              )}

              {/* ── Propagation impact ── */}
              {impact.affectedDestinations.length > 0 && (
                <div style={{
                  marginTop:    S[4],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.amberLight,
                  border:       `1px solid ${C.amberBorder}`,
                  borderRadius: R.md,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.amberMid, marginBottom: 2 }}>
                    Impacto al aprobar
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    {impact.summary}
                  </div>
                  {impact.requiresApproval && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid, marginTop: 2 }}>
                      Los destinos Shopify / CRM requieren revisión adicional antes de sincronizar.
                    </div>
                  )}
                </div>
              )}

              {/* ── Readiness detail ── */}
              <div style={{ marginTop: S[4] }}>
                <div style={{
                  fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  color: C.inkFaint, marginBottom: S[2],
                }}>
                  Al aprobar: {readyCount} listo · {partialCount} parcial
                </div>
                {readiness.filter(r => r.status !== "not_ready").map(r => (
                  <div key={r.destination} style={{
                    display: "flex", alignItems: "center", gap: S[2],
                    padding: "4px 0", borderBottom: `1px solid ${C.lineSubtle}`,
                  }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                      padding: "2px 5px", borderRadius: R.pill,
                      background: r.status === "ready" ? C.greenLight : C.amberLight,
                      color:      r.status === "ready" ? C.green : C.amber,
                      border:     `1px solid ${r.status === "ready" ? C.greenBorder : C.amberBorder}`,
                      minWidth:   38, textAlign: "center" as const,
                    }}>
                      {r.label}
                    </span>
                    {r.missing.length > 0 && (
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                        Falta: {r.missing.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        {!confirmed && (
          <div style={{
            padding:      `${S[3]}px ${S[5]}px`,
            borderTop:    `1px solid ${C.line}`,
            background:   C.surface,
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            flexShrink:   0,
          }}>
            <button className="ag-action-ghost" onClick={onCancel} disabled={isPending}>
              Cancelar
            </button>
            <div style={{ flex: 1 }} />
            {actionError && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, maxWidth: 200 }}>
                {actionError}
              </div>
            )}
            {!actionError && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {readyCount + partialCount} destinos activos después de aprobar
              </div>
            )}
            <button
              className="ag-action-primary"
              onClick={handleConfirm}
              disabled={isPending || !form.commercialName.trim()}
              style={{ minWidth: 140, opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? "Aprobando…" : "Confirmar aprobación"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Local sub-components ───────────────────────────────────────────────────────

function FormSectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.bold,
      textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkFaint,
      marginBottom:  S[2], ...style,
    }}>
      {children}
    </div>
  );
}

function FormRow({ children, single }: { children: React.ReactNode; single?: boolean }) {
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: single ? "1fr" : "1fr 1fr",
      gap:                 S[2],
      marginBottom:        S[3],
    }}>
      {children}
    </div>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
        {label}
      </div>
      {hint && (
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, marginBottom: 1 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function DynamicAttributeField({ attr }: { attr: ProductAttribute }) {
  // Visual-only — no state wiring yet (MS-05+ will connect to MetadataTable)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid }}>
        {attr.label}{attr.required ? " *" : ""}
      </div>
      {attr.type === "boolean" ? (
        <select className="ag-approval-input">
          <option value="">No especificado</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : attr.type === "select" && attr.options ? (
        <select className="ag-approval-input">
          <option value="">Seleccionar…</option>
          {attr.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : attr.type === "multiselect" && attr.options ? (
        <select className="ag-approval-input" multiple size={3} style={{ fontFamily: T.mono }}>
          {attr.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          className="ag-approval-input"
          type={attr.type === "number" ? "number" : "text"}
          placeholder={attr.placeholder ?? attr.label}
        />
      )}
    </div>
  );
}
