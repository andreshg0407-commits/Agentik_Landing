/**
 * components/marketing-studio/catalogs/catalog-wizard-client.tsx
 *
 * MARKETING-STUDIO-CATALOGS-WIZARD-02
 * "Catálogos como Presentaciones Comerciales Inteligentes"
 *
 * 5-step guided wizard. Optimized for sellers: complete in under a minute.
 * Copilot-ready: every selection maps to CatalogSpec (internal only).
 *
 * Paso 1 — Tipo        : 5 primary types + collapsible secondary options
 * Paso 2 — Plantilla   : Visual template cards for the chosen type
 * Paso 3 — Productos   : Category chips + search + preview
 * Paso 4 — Salida      : PDF · Link (the two available destinations)
 * Paso 5 — Resumen     : Business summary — no technical structures exposed
 *
 * CatalogSpec is computed internally for Copilot. Never shown to sellers.
 */

"use client";

import { useState, useMemo }            from "react";
import { C, T, S, R, E }               from "@/lib/ui/tokens";
import type { ProductConsoleItem }      from "@/lib/marketing-studio/products/product-display";
import { ReadinessLevel }              from "@/lib/marketing-studio/products/domain/product-enums";
import { CatalogProductCard }           from "./catalog-product-card";
import {
  CATALOG_TYPE_CONFIGS,
  CATALOG_TEMPLATES,
  type CatalogType,
  type CatalogDestination,
  type CatalogSpec,
  type CatalogSelectionMode,
  type CatalogReadinessPolicy,
}                                       from "@/lib/marketing-studio/catalogs/catalog-v2-types";
import {
  CATALOG_OUTPUT_MODE_CONFIGS,
}                                       from "@/lib/marketing-studio/catalogs/live-catalog-types";

// ── Step metadata ──────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { n: 1, label: "Tipo"      },
  { n: 2, label: "Plantilla" },
  { n: 3, label: "Productos" },
  { n: 4, label: "Salida"    },
  { n: 5, label: "Resumen"   },
] as const;

// ── Props ──────────────────────────────────────────────────────────────────────

interface CatalogWizardClientProps {
  products:          ProductConsoleItem[];
  orgSlug:           string;
  initialType?:      CatalogType | null;  // pre-select type, jumps to step 2
  initialTemplateId?: string | null;      // pre-select template; combined with initialType jumps to step 3
  initialStep?:      1 | 2 | 3 | 4 | 5; // override starting step (respects initialType/initialTemplateId)
  onClose?:          () => void;          // called when user dismisses the wizard
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CatalogWizardClient({ products, orgSlug, initialType, initialTemplateId, initialStep, onClose }: CatalogWizardClientProps) {
  const computedInitialStep = initialStep ?? (
    initialType && initialTemplateId ? 3 :
    initialType                      ? 2 : 1
  );
  const [step,                 setStep]                 = useState<1|2|3|4|5>(computedInitialStep as 1|2|3|4|5);
  const [showSecondaryTypes,   setShowSecondaryTypes]   = useState(false);
  const [selectedType,         setSelectedType]         = useState<CatalogType | null>(initialType ?? null);
  const [selectedTemplateId,   setSelectedTemplateId]   = useState<string | null>(initialTemplateId ?? null);
  const [selectedCategories,   setSelectedCategories]   = useState<string[]>([]);
  const [searchQuery,          setSearchQuery]          = useState("");
  const [selectedDestinations, setSelectedDestinations] = useState<CatalogDestination[]>([]);

  // ── Derived: primary / secondary type configs ───────────────────────────────
  const primaryTypes   = CATALOG_TYPE_CONFIGS.filter(c => c.primary);
  const secondaryTypes = CATALOG_TYPE_CONFIGS.filter(c => !c.primary);

  // ── Derived: templates relevant for selected type ───────────────────────────
  const relevantTemplates = useMemo(() =>
    CATALOG_TEMPLATES.filter(t =>
      t.forTypes.length === 0 ||
      (selectedType != null && t.forTypes.includes(selectedType)),
    ),
    [selectedType],
  );

  // ── Derived: unique categories ──────────────────────────────────────────────
  const allCategories = useMemo(() =>
    Array.from(new Set(
      products.map(p => p.category).filter((c): c is string => typeof c === "string" && c.length > 0),
    )).sort(),
    [products],
  );

  // ── Derived: filtered product set ──────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let result = [...products];
    if (selectedCategories.length > 0) {
      result = result.filter(p => p.category && selectedCategories.includes(p.category));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku != null && p.sku.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [products, selectedCategories, searchQuery]);

  // ── Derived: readiness breakdown ────────────────────────────────────────────
  const readyCount   = filteredProducts.filter(p => p.readinessLevel === ReadinessLevel.READY).length;
  const partialCount = filteredProducts.filter(p => p.readinessLevel === ReadinessLevel.PARTIAL).length;
  const notReadyCount = filteredProducts.filter(p => p.readinessLevel === ReadinessLevel.NOT_READY).length;

  // ── Derived: current selected template object ───────────────────────────────
  const selectedTemplate = CATALOG_TEMPLATES.find(t => t.id === selectedTemplateId) ?? null;

  // ── Derived: catalog spec (Copilot contract — internal only) ───────────────
  const spec = useMemo((): CatalogSpec | null => {
    if (!selectedType) return null;
    const cfg = CATALOG_TYPE_CONFIGS.find(c => c.id === selectedType);
    if (!cfg) return null;

    // FASE 8 — defaults for selectionMode and productReadinessPolicy.
    // These are not exposed in the wizard UI yet; Copilot will set them from
    // natural language later. For now, sensible defaults ship in every spec.
    //
    //   selectionMode:          "dynamic" → new products that match rules auto-appear
    //   productReadinessPolicy: "show_all" → no filtering by readiness in the wizard
    //
    // A PDF destination will override selectionMode to "fixed" in a future sprint
    // once manual product selection UI exists.
    const selectionMode: CatalogSelectionMode          = "dynamic";
    const productReadinessPolicy: CatalogReadinessPolicy = "show_all";

    return {
      type:                   selectedType,
      typeName:               cfg.label,
      templateId:             selectedTemplateId,
      templateName:           selectedTemplate?.name ?? null,
      destinations:           selectedDestinations,
      filter: {
        categories:  selectedCategories,
        searchQuery: searchQuery.trim(),
        manualIds:   [],
        rules:       [],
      },
      showPrices:             cfg.showPrices,
      ctaText:                cfg.defaultCta,
      selectionMode,
      productReadinessPolicy,
    };
  }, [selectedType, selectedTemplateId, selectedTemplate, selectedCategories, searchQuery, selectedDestinations]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const canAdvance =
    step === 1 ? selectedType !== null        :
    step === 2 ? selectedTemplateId !== null  :
    step === 3 ? filteredProducts.length > 0  :
    step === 4 ? selectedDestinations.length > 0 :
    false;

  function goNext() { if (canAdvance && step < 5) setStep((step + 1) as 1|2|3|4|5); }
  function goBack() { if (step > 1) setStep((step - 1) as 1|2|3|4|5); }

  function selectType(type: CatalogType) {
    setSelectedType(type);
    setSelectedTemplateId(null); // reset template when type changes
    setStep(2);
  }

  function selectTemplate(id: string) {
    setSelectedTemplateId(id);
    setStep(3);
  }

  function toggleCategory(cat: string) {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );
  }

  function toggleDestination(dest: CatalogDestination) {
    setSelectedDestinations(prev =>
      prev.includes(dest) ? prev.filter(d => d !== dest) : [...prev, dest],
    );
  }

  const selectedTypeCfg = CATALOG_TYPE_CONFIGS.find(c => c.id === selectedType);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Wizard header (only when embedded in panel) ── */}
      {onClose && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: S[4], paddingBottom: S[3], borderBottom: `1px solid ${C.line}`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Configurador avanzado
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
              background: "none", border: `1px solid ${C.line}`, borderRadius: R.md,
              padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
            }}
          >
            ✕ Cerrar
          </button>
        </div>
      )}

      {/* ── Step indicator ── */}
      <div style={{
        display: "flex", marginBottom: S[5],
        background: C.surface, border: `1px solid ${C.line}`,
        borderRadius: R.md, overflow: "hidden",
      }}>
        {WIZARD_STEPS.map((s, i) => {
          const isActive = step === s.n;
          const isDone   = step > s.n;
          const isLast   = i === WIZARD_STEPS.length - 1;
          return (
            <div
              key={s.n}
              onClick={() => { if (isDone) setStep(s.n); }}
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: S[1],
                padding: `${S[2]}px ${S[2]}px`,
                background: isActive ? C.blueDark : isDone ? C.blueLight : "transparent",
                borderRight: !isLast ? `1px solid ${C.line}` : undefined,
                cursor: isDone ? "pointer" : "default",
                justifyContent: "center",
              }}
            >
              <span style={{
                fontFamily: T.mono, fontWeight: T.wt.bold,
                fontSize:   9,
                width: 18, height: 18, borderRadius: R.pill, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isActive ? C.white : isDone ? C.blueDark : C.line,
                color:      isActive ? C.blueDark : isDone ? C.white : C.inkFaint,
              }}>
                {isDone ? "✓" : s.n}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                color:      isActive ? C.white : isDone ? C.blueDark : C.inkFaint,
                fontWeight: isActive ? T.wt.semibold : T.wt.normal,
              }}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          PASO 1 — Tipo de catálogo
          ══════════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div>
          <div style={{ fontFamily: T.mono, marginBottom: S[5] }}>
            <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
              ¿Qué tipo de catálogo quieres crear?
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              Elige el tipo que mejor describe tu propósito comercial.
            </div>
          </div>

          {/* Primary types */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: S[3], marginBottom: S[3],
          }}>
            {primaryTypes.map(cfg => {
              const isActive = selectedType === cfg.id;
              return (
                <button
                  key={cfg.id}
                  onClick={() => selectType(cfg.id)}
                  style={{
                    fontFamily: T.mono, textAlign: "left" as const, cursor: "pointer",
                    padding:    `${S[4]}px`, borderRadius: R.md,
                    background: isActive ? C.blueLight : C.white,
                    border:     `1px solid ${isActive ? C.blueDark : C.line}`,
                    boxShadow:  isActive ? E.sm : E.xs,
                    transition: "border-color .1s, background .1s",
                  }}
                >
                  <div style={{ fontSize: 26, lineHeight: 1, marginBottom: S[2] }}>{cfg.emoji}</div>
                  <div style={{
                    fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: isActive ? C.blueDark : C.ink, marginBottom: 4,
                  }}>
                    {cfg.label}
                  </div>
                  <div style={{ fontSize: 9, color: C.inkFaint, lineHeight: 1.45, marginBottom: S[2] }}>
                    {cfg.description}
                  </div>
                  <div style={{
                    fontSize: 9, color: C.inkGhost, fontStyle: "italic" as const,
                    lineHeight: 1.4,
                  }}>
                    {cfg.example}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Secondary types — collapsible */}
          <button
            onClick={() => setShowSecondaryTypes(v => !v)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
              background: "none", border: "none", cursor: "pointer",
              padding: `${S[1]}px 0`, display: "flex", alignItems: "center", gap: S[1],
            }}
          >
            <span style={{
              display: "inline-block",
              transform: showSecondaryTypes ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform .15s",
            }}>›</span>
            Más opciones
          </button>

          {showSecondaryTypes && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: S[3], marginTop: S[3],
            }}>
              {secondaryTypes.map(cfg => {
                const isActive = selectedType === cfg.id;
                return (
                  <button
                    key={cfg.id}
                    onClick={() => selectType(cfg.id)}
                    style={{
                      fontFamily: T.mono, textAlign: "left" as const, cursor: "pointer",
                      padding: `${S[3]}px`, borderRadius: R.md,
                      background: isActive ? C.blueLight : C.surface,
                      border:     `1px solid ${isActive ? C.blueDark : C.line}`,
                      boxShadow:  isActive ? E.sm : "none",
                    }}
                  >
                    <div style={{ fontSize: 20, lineHeight: 1, marginBottom: S[1] }}>{cfg.emoji}</div>
                    <div style={{
                      fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                      color: isActive ? C.blueDark : C.ink, marginBottom: 2,
                    }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 9, color: C.inkFaint, lineHeight: 1.4 }}>
                      {cfg.description}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PASO 2 — Plantilla visual
          ══════════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div>
          <div style={{ fontFamily: T.mono, marginBottom: S[5] }}>
            <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
              ¿Cómo quieres que se vea el catálogo?
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              Elige una plantilla. Define el diseño visual y la presentación de los productos.
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: S[3],
          }}>
            {relevantTemplates.map(tmpl => {
              const isActive = selectedTemplateId === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => selectTemplate(tmpl.id)}
                  style={{
                    fontFamily: T.mono, textAlign: "left" as const, cursor: "pointer",
                    padding: `${S[4]}px`, borderRadius: R.md,
                    background: isActive ? C.blueLight : C.white,
                    border:     `1px solid ${isActive ? C.blueDark : C.line}`,
                    boxShadow:  isActive ? E.sm : E.xs,
                    transition: "border-color .1s, background .1s",
                  }}
                >
                  {/* Mini layout preview */}
                  <div style={{
                    height: 80, borderRadius: R.sm, marginBottom: S[3],
                    background: isActive ? C.blueDark : C.surface,
                    border: `1px solid ${isActive ? C.blueDark : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", position: "relative" as const,
                  }}>
                    <span style={{ fontSize: 32, opacity: 0.6 }}>{tmpl.emoji}</span>
                    {/* Layout dots hint */}
                    <div style={{
                      position: "absolute" as const, bottom: S[1], right: S[1],
                      display: "flex", gap: 3,
                    }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 8, height: 8, borderRadius: R.sm,
                          background: isActive ? "rgba(255,255,255,0.5)" : C.line,
                        }} />
                      ))}
                    </div>
                  </div>

                  <div style={{
                    fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: isActive ? C.blueDark : C.ink, marginBottom: 3,
                  }}>
                    {tmpl.name}
                  </div>
                  <div style={{ fontSize: 9, color: C.inkFaint, lineHeight: 1.45, marginBottom: S[1] }}>
                    {tmpl.description}
                  </div>
                  <div style={{
                    fontSize: 8, color: C.inkGhost,
                    padding: `1px ${S[1]}px`, background: C.surface,
                    border: `1px solid ${C.line}`, borderRadius: R.sm,
                    display: "inline-block",
                  }}>
                    {tmpl.style}
                  </div>

                  {isActive && (
                    <div style={{ marginTop: S[1], fontSize: 8, color: C.blueDark, fontWeight: T.wt.semibold }}>
                      ✓ Seleccionada
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PASO 3 — Selección de productos
          ══════════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div>
          <div style={{ fontFamily: T.mono, marginBottom: S[4] }}>
            <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
              ¿Qué productos harán parte del catálogo?
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              Selecciona por categoría o busca por nombre o referencia.
              Sin filtros, se incluyen todos los productos disponibles.
            </div>
          </div>

          {/* Category selection */}
          {allCategories.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                color: C.inkFaint, textTransform: "uppercase" as const,
                letterSpacing: "0.06em", marginBottom: S[2],
              }}>
                Categorías
              </div>
              <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
                <button
                  onClick={() => setSelectedCategories([])}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer",
                    padding: `4px ${S[3]}px`, borderRadius: R.pill, border: "none",
                    background: selectedCategories.length === 0 ? C.blueDark : C.surface,
                    color:      selectedCategories.length === 0 ? C.white    : C.inkLight,
                  }}
                >
                  Todas las categorías ({products.length})
                </button>
                {allCategories.map(cat => {
                  const isActive = selectedCategories.includes(cat);
                  const count    = products.filter(p => p.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer",
                        padding: `4px ${S[3]}px`, borderRadius: R.pill,
                        border:     `1px solid ${isActive ? C.blueDark : C.line}`,
                        background: isActive ? C.blueLight : C.surface,
                        color:      isActive ? C.blueDark  : C.inkLight,
                      }}
                    >
                      {cat}
                      <span style={{ marginLeft: S[1], opacity: 0.5 }}>({count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[2],
            background: C.white,
            border: `1px solid ${searchQuery ? C.blueBorder : C.line}`,
            borderRadius: R.md, padding: `5px ${S[3]}px`, marginBottom: S[4],
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint, flexShrink: 0 }}>⌕</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o referencia…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Preparación summary */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3],
            padding: `${S[3]}px ${S[4]}px`, background: C.surface,
            border: `1px solid ${C.line}`, borderRadius: R.md, marginBottom: S[4],
          }}>
            {[
              { label: "Seleccionados",          value: filteredProducts.length, color: C.ink    },
              { label: "Listos para publicar",    value: readyCount,              color: C.green  },
              { label: "Con información parcial", value: partialCount,            color: C.amber  },
              { label: "Incompletos",             value: notReadyCount,           color: C.red    },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                  color: item.color, lineHeight: 1 }}>
                  {item.value}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* Product grid preview */}
          {filteredProducts.length > 0 ? (
            <>
              <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                color: C.inkFaint, textTransform: "uppercase" as const,
                letterSpacing: "0.06em", marginBottom: S[2] }}>
                {filteredProducts.length} producto{filteredProducts.length !== 1 ? "s" : ""} en este catálogo
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: S[2], marginBottom: S[3],
                maxHeight: 360, overflowY: "auto" as const,
              }}>
                {filteredProducts.slice(0, 18).map(p => (
                  <CatalogProductCard
                    key={p.productId}
                    product={p}
                    inclusion={
                      p.readinessLevel === ReadinessLevel.NOT_READY ? "excluded" :
                      p.readinessLevel === ReadinessLevel.PARTIAL    ? "partial"  : "included"
                    }
                    targetChannel="catalog"
                  />
                ))}
              </div>
              {filteredProducts.length > 18 && (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                  padding: `${S[2]}px ${S[3]}px`, textAlign: "center" as const,
                  background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md,
                  marginBottom: S[3],
                }}>
                  +{filteredProducts.length - 18} productos más incluidos en el catálogo
                </div>
              )}
            </>
          ) : (
            <div style={{
              padding: `${S[5]}px ${S[4]}px`, textAlign: "center" as const,
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[4],
            }}>
              Sin productos con la selección actual.
              <div style={{ fontSize: T.sz.xs, marginTop: S[1], color: C.inkGhost }}>
                Cambia la categoría o limpia la búsqueda para ver más productos.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PASO 4 — Salida del catálogo
          ══════════════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div>
          <div style={{ fontFamily: T.mono, marginBottom: S[4] }}>
            <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
              ¿Cómo vas a compartir este catálogo?
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              Puedes seleccionar más de uno. Cada formato tiene un comportamiento diferente.
            </div>
          </div>

          {/* Behavioral distinction banner */}
          <div style={{
            padding: `${S[3]}px ${S[4]}px`,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.md, marginBottom: S[4],
            display: "flex", gap: S[4], flexWrap: "wrap" as const,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green,
                display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                <strong style={{ color: C.ink }}>Catálogo web</strong> — Siempre actualizado.
                Cada vez que alguien lo abre, ve la información más reciente.
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.blueDark,
                display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                <strong style={{ color: C.ink }}>PDF</strong> — Fotografía estática.
                Congela el catálogo al momento de generarse.
              </span>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: S[3],
          }}>
            {CATALOG_OUTPUT_MODE_CONFIGS.map(cfg => {
              const isSelected = selectedDestinations.includes(cfg.id as CatalogDestination);
              const isLive     = cfg.behavior === "live";
              const accentColor = isLive ? C.green : C.blueDark;
              return (
                <button
                  key={cfg.id}
                  onClick={() => toggleDestination(cfg.id as CatalogDestination)}
                  style={{
                    fontFamily: T.mono, textAlign: "left" as const, cursor: "pointer",
                    padding: `${S[4]}px`, borderRadius: R.md,
                    background: isSelected ? (isLive ? "#f0fdf4" : C.blueLight) : C.white,
                    border:     `1px solid ${isSelected ? accentColor : C.line}`,
                    boxShadow:  isSelected ? E.sm : E.xs,
                    transition: "border-color .1s, background .1s",
                  }}
                >
                  {/* Header: emoji + behavior badge */}
                  <div style={{ display: "flex", alignItems: "flex-start",
                    justifyContent: "space-between", gap: S[2], marginBottom: S[3] }}>
                    <span style={{ fontSize: 30, lineHeight: 1 }}>{cfg.emoji}</span>
                    <span style={{
                      fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
                      padding: "2px 7px", borderRadius: R.pill,
                      background: isLive ? "#dcfce7" : "#dbeafe",
                      color: accentColor,
                      border: `1px solid ${isLive ? "#86efac" : "#93c5fd"}`,
                      textTransform: "uppercase" as const, letterSpacing: "0.05em",
                    }}>
                      {cfg.behaviorLabel}
                    </span>
                  </div>

                  {/* Name + description */}
                  <div style={{
                    fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: isSelected ? accentColor : C.ink, marginBottom: 4,
                  }}>
                    {cfg.label}
                  </div>
                  <div style={{ fontSize: 9, color: C.inkFaint, lineHeight: 1.45, marginBottom: S[2] }}>
                    {cfg.description}
                  </div>

                  {/* Behavior detail */}
                  <div style={{
                    fontSize: 9, color: C.inkMid, lineHeight: 1.45,
                    padding: `${S[1]}px ${S[2]}px`,
                    background: isLive ? "#f0fdf4" : "#eff6ff",
                    borderRadius: R.sm,
                    border: `1px solid ${isLive ? "#bbf7d0" : "#bfdbfe"}`,
                  }}>
                    {cfg.behaviorDetail}
                  </div>

                  {isSelected && (
                    <div style={{ marginTop: S[2], fontSize: 8,
                      color: accentColor, fontWeight: T.wt.semibold }}>
                      ✓ Seleccionado
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PASO 5 — Resumen empresarial
          ══════════════════════════════════════════════════════════════════════ */}
      {step === 5 && spec && selectedTypeCfg && (
        <div>
          <div style={{ fontFamily: T.mono, marginBottom: S[4] }}>
            <div style={{ fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: 4 }}>
              Tu catálogo está listo para generar
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
              Revisa la configuración. Puedes volver a cualquier paso para ajustar.
            </div>
          </div>

          {/* Business summary card */}
          <div style={{
            background: C.white, border: `1px solid ${C.line}`,
            borderRadius: R.md, padding: S[4], boxShadow: E.sm, marginBottom: S[4],
          }}>

            {/* Type + template header */}
            <div style={{
              display: "flex", gap: S[3], alignItems: "flex-start",
              paddingBottom: S[4], marginBottom: S[4],
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}>
              <span style={{ fontSize: 40, lineHeight: 1, flexShrink: 0 }}>
                {selectedTypeCfg.emoji}
              </span>
              <div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                  color: C.ink, marginBottom: 3,
                }}>
                  {selectedTypeCfg.label}
                </div>
                {selectedTemplate && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    display: "flex", alignItems: "center", gap: S[1],
                  }}>
                    <span>{selectedTemplate.emoji}</span>
                    <span>Plantilla: {selectedTemplate.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary rows */}
            {[
              {
                label: "Productos",
                value: (
                  <div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                      {filteredProducts.length} referencia{filteredProducts.length !== 1 ? "s" : ""}
                    </span>
                    {readyCount > 0 && (
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green, marginLeft: S[2] }}>
                        {readyCount} listas para publicar
                      </span>
                    )}
                    {partialCount > 0 && (
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber, marginLeft: S[2] }}>
                        · {partialCount} con información parcial
                      </span>
                    )}
                  </div>
                ),
              },
              selectedCategories.length > 0 && {
                label: "Categorías",
                value: (
                  <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                    {selectedCategories.map(cat => (
                      <span key={cat} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, padding: `1px ${S[2]}px`,
                        borderRadius: R.pill, background: C.blueLight,
                        color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                      }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                ),
              },
              spec.filter.searchQuery && {
                label: "Búsqueda",
                value: (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                    &ldquo;{spec.filter.searchQuery}&rdquo;
                  </span>
                ),
              },
              {
                label: "Precios",
                value: (
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs,
                    color: selectedTypeCfg.showPrices ? C.green : C.amber,
                  }}>
                    {selectedTypeCfg.showPrices ? "Incluidos" : "No incluidos"}
                  </span>
                ),
              },
              spec.destinations.length > 0 && {
                label: "Salida",
                value: (
                  <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
                    {spec.destinations.map(dest => {
                      const cfg = CATALOG_OUTPUT_MODE_CONFIGS.find(d => d.id === dest);
                      return cfg ? (
                        <span key={dest} style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
                          borderRadius: R.pill,
                          background: cfg.behavior === "live" ? "#dcfce7" : C.blueLight,
                          color:      cfg.behavior === "live" ? C.green    : C.blueDark,
                          border:     `1px solid ${cfg.behavior === "live" ? "#86efac" : C.blueBorder}`,
                        }}>
                          {cfg.emoji} {cfg.label}
                          <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 8 }}>
                            · {cfg.behaviorLabel}
                          </span>
                        </span>
                      ) : null;
                    })}
                  </div>
                ),
              },
            ].filter(Boolean).map((row, i) => {
              if (!row) return null;
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "120px 1fr", gap: S[3],
                  paddingBottom: S[3], marginBottom: S[3],
                  borderBottom: `1px solid ${C.lineSubtle}`,
                }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    color: C.inkFaint, paddingTop: 2,
                  }}>
                    {row.label}
                  </div>
                  <div>{row.value}</div>
                </div>
              );
            })}

            {/* CTA reminder */}
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, marginTop: S[1] }}>
              CTA: &ldquo;{selectedTypeCfg.defaultCta}&rdquo;
            </div>
          </div>

          {/* Action tray */}
          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" as const }}>
            <button
              disabled
              title="La generación de catálogos estará disponible próximamente"
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[5]}px`, borderRadius: R.md,
                background: C.surface, color: C.inkGhost,
                border: `1px solid ${C.line}`, cursor: "not-allowed", opacity: 0.7,
              }}
            >
              Generar catálogo
              <span style={{ marginLeft: S[1], fontSize: 9, fontWeight: T.wt.normal, color: C.amber }}>
                — próximamente
              </span>
            </button>
            <a
              href={`/${orgSlug}/agentik/marketing-studio/catalogos/nuevo`}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
                background: C.blueDark, color: C.white,
                textDecoration: "none", display: "inline-block",
              }}
            >
              Guardar configuración →
            </a>
          </div>
        </div>
      )}

      {/* ── Navigation footer (steps 2–5) ── */}
      {step > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: S[6], paddingTop: S[4], borderTop: `1px solid ${C.lineSubtle}`,
        }}>
          <button
            onClick={goBack}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              padding: `${S[2]}px ${S[4]}px`, borderRadius: R.md,
              background: C.surface, color: C.inkLight,
              border: `1px solid ${C.line}`, cursor: "pointer",
            }}
          >
            ← Atrás
          </button>
          {step < 5 && (
            <button
              onClick={goNext}
              disabled={!canAdvance}
              title={!canAdvance ? "Completa este paso para continuar" : undefined}
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px ${S[5]}px`, borderRadius: R.md,
                background: canAdvance ? C.blueDark : C.surface,
                color:      canAdvance ? C.white    : C.inkGhost,
                border:     `1px solid ${canAdvance ? C.blueDark : C.line}`,
                cursor:     canAdvance ? "pointer"  : "not-allowed",
                opacity:    canAdvance ? 1 : 0.6,
              }}
            >
              Continuar →
            </button>
          )}
        </div>
      )}

    </div>
  );
}
