"use client";
/**
 * components/marketing-studio/catalogs/catalog-creator-client.tsx
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01 — Catalog Creator
 *
 * Form to create a new CatalogDefinition:
 *   - Name, description
 *   - pricingMode (with_prices / without_prices)
 *   - ctaMode (none / whatsapp_order)
 *   - whatsAppPhone (conditional on ctaMode)
 *   - sortField + sortDirection
 *   - groupBy
 *   - filters (field + operator + value rows)
 *   - Live preview count (calls /preview)
 */

import { useState, useCallback }                   from "react";
import { useRouter }                               from "next/navigation";
import { C, T, S, R, E }                           from "@/lib/ui/tokens";
import {
  PRICING_MODE_LABELS,
  CTA_MODE_LABELS,
  SORT_FIELD_LABELS,
  GROUP_BY_LABELS,
  CATALOG_STATUS_LABELS,
  CATALOG_LAYOUT_LABELS,
  CATEGORY_SORT_LABELS,
  CATALOG_TEMPLATE_KEY_LABELS,
}                                                  from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import type {
  CatalogFilterRule,
  CatalogLayout,
  CatalogSortField,
  CatalogTemplateKey,
  CategorySortMode,
  SortDirection,
  PricingMode,
  CtaMode,
  CatalogGroupBy,
  FilterOperator,
}                                                  from "@/lib/marketing-studio/catalogs/catalog-definition-types";
import {
  CATALOG_TEMPLATES,
  CATALOG_TEMPLATE_KEYS,
  getCatalogTemplate,
}                                                  from "@/lib/marketing-studio/catalogs/catalog-template-definitions";
import type { AttributeValueType }                 from "@/lib/marketing-studio/products/domain/product-enums";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttributeDefinitionMeta {
  key:   string;
  label: string;
  type:  AttributeValueType;
}

interface Props {
  orgSlug:              string;
  attributeDefinitions: AttributeDefinitionMeta[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCALAR_FIELD_OPTIONS = [
  { value: "status",           label: "Estado de producto" },
  { value: "commercialStatus", label: "Estado comercial" },
  { value: "category",         label: "Categoría" },
  { value: "productLine",      label: "Línea de producto" },
  { value: "readinessLevel",   label: "Nivel de preparación" },
];

const OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = [
  { value: "equals",      label: "=" },
  { value: "not_equals",  label: "≠" },
  { value: "contains",    label: "contiene" },
  { value: "in",          label: "está en" },
  { value: "not_in",      label: "no está en" },
  { value: "gt",          label: ">" },
  { value: "gte",         label: ">=" },
  { value: "lt",          label: "<" },
  { value: "lte",         label: "<=" },
  { value: "is_set",      label: "tiene valor" },
  { value: "is_not_set",  label: "no tiene valor" },
];

const SORT_FIELDS = Object.entries(SORT_FIELD_LABELS) as [CatalogSortField, string][];

const GROUP_BY_OPTIONS: { value: string; label: string }[] = [
  { value: "",                 label: "Sin agrupación" },
  { value: "category",         label: "Categoría" },
  { value: "productLine",      label: "Línea de producto" },
  { value: "commercialStatus", label: "Estado comercial" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogCreatorClient({ orgSlug, attributeDefinitions }: Props) {
  const router = useRouter();

  const [name,          setName]          = useState("");
  const [description,   setDescription]   = useState("");
  const [pricingMode,   setPricingMode]   = useState<PricingMode>("with_prices");
  const [ctaMode,       setCtaMode]       = useState<CtaMode>("none");
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [sortField,       setSortField]       = useState<CatalogSortField>("name");
  const [sortDirection,   setSortDirection]   = useState<SortDirection>("asc");
  const [groupBy,         setGroupBy]         = useState<string>("");
  const [layout,          setLayout]          = useState<CatalogLayout>("GRID_STANDARD");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [categorySort,    setCategorySort]    = useState<CategorySortMode>("alphabetical");
  const [templateKey,     setTemplateKey]     = useState<CatalogTemplateKey>("retail");
  const [filters,       setFilters]       = useState<CatalogFilterRule[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  // ── Filter management ───────────────────────────────────────────────────────

  const addFilter = useCallback(() => {
    setFilters(f => [...f, { field: "status", operator: "equals", value: "approved" }]);
  }, []);

  const updateFilter = useCallback((idx: number, patch: Partial<CatalogFilterRule>) => {
    setFilters(f => f.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const removeFilter = useCallback((idx: number) => {
    setFilters(f => f.filter((_, i) => i !== idx));
  }, []);

  // ── All field options (scalar + attribute) ──────────────────────────────────

  const fieldOptions = [
    ...SCALAR_FIELD_OPTIONS,
    ...attributeDefinitions.map(d => ({ value: `attribute:${d.key}`, label: `Atrib: ${d.label}` })),
  ];

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setError("El nombre es requerido"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/catalog-definitions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          name.trim(),
          description:   description.trim() || null,
          pricingMode,
          ctaMode,
          whatsAppPhone:   ctaMode === "whatsapp_order" ? (whatsAppPhone.trim() || null) : null,
          sortField,
          sortDirection,
          groupBy:         groupBy || null,
          filters,
          layout,
          groupByCategory,
          categorySort,
          categoryOrder:   [],
          templateKey,
          status:          "draft",
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Error al guardar");
        return;
      }
      const data = await res.json() as { definition: { id: string } };
      router.push(`/${orgSlug}/agentik/marketing-studio/catalogos/${data.definition.id}`);
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
    background: C.white, border: `1px solid ${C.line}`,
    borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
    outline: "none", width: "100%", boxSizing: "border-box" as const,
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

  const labelStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
    color: C.inkMid, marginBottom: S[1], display: "block",
  };

  const fieldGroup = (label: string, children: React.ReactNode, half = false) => (
    <div style={{ ...(half ? { flex: "0 0 calc(50% - 6px)" } : { flex: "1 1 auto" }) }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, fontFamily: T.mono }}>

      {/* Name + Description */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4], marginBottom: S[5] }}>
        {fieldGroup("Nombre del catálogo *",
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Colección Temporada — WhatsApp"
          />
        )}
        {fieldGroup("Descripción",
          <input
            style={inputStyle}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Opcional"
          />
        )}
      </div>

      {/* Commercial mode */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.ink, marginBottom: S[3] }}>
          Modo comercial
        </div>
        <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
          {fieldGroup("Visibilidad de precios",
            <select style={selectStyle} value={pricingMode}
              onChange={e => setPricingMode(e.target.value as PricingMode)}>
              {(Object.entries(PRICING_MODE_LABELS) as [PricingMode, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>,
            true
          )}
          {fieldGroup("Acción de contacto",
            <select style={selectStyle} value={ctaMode}
              onChange={e => setCtaMode(e.target.value as CtaMode)}>
              {(Object.entries(CTA_MODE_LABELS) as [CtaMode, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>,
            true
          )}
        </div>
        {ctaMode === "whatsapp_order" && (
          <div style={{ marginTop: S[3] }}>
            {fieldGroup("Teléfono WhatsApp (E.164, ej: +573001234567)",
              <input
                style={inputStyle}
                value={whatsAppPhone}
                onChange={e => setWhatsAppPhone(e.target.value)}
                placeholder="+573001234567"
              />
            )}
          </div>
        )}
      </div>

      {/* Sort + Group */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.ink, marginBottom: S[3] }}>
          Ordenamiento y agrupación
        </div>
        <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
          {fieldGroup("Ordenar por",
            <select style={selectStyle} value={sortField}
              onChange={e => setSortField(e.target.value as CatalogSortField)}>
              {SORT_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>,
            true
          )}
          {fieldGroup("Dirección",
            <select style={selectStyle} value={sortDirection}
              onChange={e => setSortDirection(e.target.value as SortDirection)}>
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>,
            true
          )}
          {fieldGroup("Agrupar por",
            <select style={selectStyle} value={groupBy}
              onChange={e => setGroupBy(e.target.value)}>
              {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              {attributeDefinitions.map(d => (
                <option key={`attribute:${d.key}`} value={`attribute:${d.key}`}>
                  Atrib: {d.label}
                </option>
              ))}
            </select>,
            true
          )}
        </div>
      </div>

      {/* Template selector */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.ink, marginBottom: S[3] }}>
          Plantilla comercial
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          {CATALOG_TEMPLATE_KEYS.map(k => {
            const tpl = CATALOG_TEMPLATES[k];
            const isActive = templateKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTemplateKey(k);
                  // Apply recommended commercial defaults (user can override)
                  setPricingMode(tpl.recommendedPricingMode);
                  setCtaMode(tpl.recommendedCtaMode);
                }}
                style={{
                  display:     "flex",
                  alignItems:  "flex-start",
                  gap:         S[3],
                  textAlign:   "left" as const,
                  padding:     `${S[2]}px ${S[3]}px`,
                  borderRadius: R.md,
                  border:      `1px solid ${isActive ? C.blueDark : C.line}`,
                  background:  isActive ? `${C.blueDark}08` : C.white,
                  cursor:      "pointer",
                  width:       "100%",
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 3,
                  background: isActive ? C.blueDark : C.line,
                  border:     `2px solid ${isActive ? C.blueDark : C.line}`,
                }} />
                <div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    color: isActive ? C.blueDark : C.ink,
                  }}>
                    {CATALOG_TEMPLATE_KEY_LABELS[k]}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                    {tpl.description}
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    marginTop: 2, fontStyle: "italic",
                  }}>
                    {tpl.useCase}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout & Presentation */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[4],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.ink, marginBottom: S[3] }}>
          Presentación
        </div>
        <div style={{ display: "flex", gap: S[4], flexWrap: "wrap" as const, alignItems: "flex-start" }}>
          {/* Layout */}
          <div>
            <label style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              color: C.inkMid, display: "block", marginBottom: S[1] }}>Layout</label>
            <div style={{ display: "flex", gap: S[1] }}>
              {(["GRID_STANDARD", "LIST_STANDARD"] as CatalogLayout[]).map(v => (
                <button key={v} onClick={() => setLayout(v)} type="button" style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  fontWeight: layout === v ? T.wt.bold : T.wt.normal,
                  padding: "3px 10px", borderRadius: R.sm,
                  border: `1px solid ${layout === v ? C.blueDark : C.line}`,
                  background: layout === v ? C.blueDark : C.white,
                  color: layout === v ? C.white : C.inkMid,
                  cursor: "pointer",
                }}>
                  {CATALOG_LAYOUT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          {/* Group by category */}
          <div>
            <label style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              color: C.inkMid, display: "block", marginBottom: S[1] }}>Organización</label>
            <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <input
                type="checkbox"
                checked={groupByCategory}
                onChange={e => setGroupByCategory(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink }}>
                Agrupar por categoría
              </span>
            </div>
          </div>

          {/* Category sort */}
          {groupByCategory && (
            <div>
              <label style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                color: C.inkMid, display: "block", marginBottom: S[1] }}>Orden de categorías</label>
              <select
                value={categorySort}
                onChange={e => setCategorySort(e.target.value as CategorySortMode)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
                  background: C.white, border: `1px solid ${C.line}`,
                  borderRadius: R.sm, padding: "3px 6px", cursor: "pointer",
                }}
              >
                {(Object.entries(CATEGORY_SORT_LABELS) as [CategorySortMode, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[5],
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
            Filtros
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
              marginLeft: S[2], fontWeight: T.wt.normal }}>
              {filters.length === 0 ? "sin filtros — incluye todos los productos" : `${filters.length} reglas`}
            </span>
          </div>
          <button
            onClick={addFilter}
            style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm,
              background: "transparent", border: `1px solid ${C.line}`,
              color: C.inkMid, cursor: "pointer",
            }}
          >
            + Regla
          </button>
        </div>

        {filters.length === 0 ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
            padding: `${S[2]}px 0` }}>
            Sin filtros activos. Este catálogo incluirá todos los productos del org.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {filters.map((rule, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <select
                  style={{ ...selectStyle, flex: "2 1 0" }}
                  value={rule.field}
                  onChange={e => updateFilter(idx, { field: e.target.value })}
                >
                  {fieldOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  style={{ ...selectStyle, flex: "1 1 0" }}
                  value={rule.operator}
                  onChange={e => updateFilter(idx, { operator: e.target.value as FilterOperator })}
                >
                  {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {rule.operator !== "is_set" && rule.operator !== "is_not_set" &&
                  rule.operator !== "is_true" && rule.operator !== "is_false" && (
                  <input
                    style={{ ...inputStyle, flex: "2 1 0" }}
                    value={Array.isArray(rule.value) ? rule.value.join(", ") : String(rule.value ?? "")}
                    onChange={e => {
                      const raw = e.target.value;
                      const v = rule.operator === "in" || rule.operator === "not_in"
                        ? raw.split(",").map(s => s.trim()).filter(Boolean)
                        : raw;
                      updateFilter(idx, { value: v });
                    }}
                    placeholder={rule.operator === "in" || rule.operator === "not_in"
                      ? "val1, val2, …" : "valor"}
                  />
                )}
                <button
                  onClick={() => removeFilter(idx)}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                    background: "transparent", border: "none", cursor: "pointer",
                    padding: `${S[1]}px`,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
          background: C.redLight ?? "#fff1f0", border: `1px solid ${C.red}40`,
          borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
          marginBottom: S[4],
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
            background: saving ? C.inkFaint : C.blueDark,
            color: C.white, border: "none", cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Guardando…" : "Crear catálogo"}
        </button>
        <a
          href={`/${orgSlug}/agentik/marketing-studio/catalogos`}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
            textDecoration: "none",
          }}
        >
          Cancelar
        </a>
      </div>

    </div>
  );
}
