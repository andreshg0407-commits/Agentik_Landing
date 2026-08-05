"use client";

/**
 * components/comercial/store-supply-rules-tab.tsx
 *
 * AGENTIK-STORES-SUPPLY-RULES-RESET-01
 *
 * Pure supply rules editor for the store drawer Derrotero tab.
 *
 * Responsibility: define policies per line.
 * NOT responsible for: coverage, inventory, candidates, allocation, KPIs.
 *
 * Sections:
 *   1. Castillitos textile — per grupo+subgrupo table
 *   2. Latin Kids textile — per subgrupo table
 *   3. Accessories — per sizeClass target
 *   4. Rule 36 — threshold + allowed stores
 *   5. Special rules — per product per store
 *
 * Consumes:
 *   - distribution_effective_config (existing API)
 *   - distribution_save_config (existing API)
 *   - distribution_preview_impact (existing API)
 *   - derrotero_catalog (new API — entry structure only)
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { C, T, S, R, panel } from "@/lib/ui/tokens";

// ── Client-side types (mirror server types — no server imports) ─────────────

interface EffectiveTextileConfig {
  enabled: boolean;
  minUnits: number;
  maxUnits: number;
  targetUnits: number;
  validFrom: string | null;
  validTo: string | null;
  season: string | null;
  notes: string | null;
  source: "tenant_default" | "store_override";
}

interface EffectiveAccessoryConfig {
  sizeClass: string;
  targetUnits: number;
  validFrom: string | null;
  validTo: string | null;
  season: string | null;
  notes: string | null;
  source: "tenant_default" | "store_override";
}

interface EffectiveScarcityConfig {
  enabled: boolean;
  lowStockConcentrationThreshold: number;
  allowedStoresWhenScarce: string[];
  allowedStoreNames: string[];
  validFrom: string | null;
  validTo: string | null;
  season: string | null;
  notes: string | null;
  source: "tenant_default" | "store_override";
}

interface EffectiveStoreConfig {
  castillitos: EffectiveTextileConfig;
  latinKids: EffectiveTextileConfig;
  accessories: { small: EffectiveAccessoryConfig; medium: EffectiveAccessoryConfig; large: EffectiveAccessoryConfig };
  scarcity: EffectiveScarcityConfig;
}

interface RuleImpactPreview {
  additionalSurtir: number;
  additionalUnitsNeeded: number;
  resolvedDeficits: number;
  newRetirar: number;
}

// ── Catalog types (entry structure only — no coverage) ─────────────────────

interface CatalogEntry {
  entryCode: string;
  entryName: string;
  sagSubgrupo: string | string[] | null;
  sizeClass?: string | null;
  minUnitsPerRef: number;
  idealUnitsPerRef: number;
  maxUnitsPerRef: number;
  active: boolean;
}

interface CatalogGroup {
  groupCode: string;
  groupName: string;
  sagGrupo?: string | null;
  entries: CatalogEntry[];
}

interface DerroteroCatalog {
  castillitos: CatalogGroup[];
  latinKids: CatalogGroup[];
  accessories: CatalogGroup[];
  totalEntries: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const mono2xs = { fontFamily: T.mono, fontSize: T.sz["2xs"] } as const;
const monoXs = { fontFamily: T.mono, fontSize: T.sz.xs } as const;
const monoSm = { fontFamily: T.mono, fontSize: T.sz.sm } as const;

const headerCell = {
  ...mono2xs, fontWeight: T.wt.semibold, color: C.inkLight,
  padding: `${S[1]}px ${S[2]}px`, whiteSpace: "nowrap" as const,
} as const;

const cellStyle = {
  ...mono2xs, color: C.ink, padding: `${S[1]}px ${S[2]}px`,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
} as const;

const ACTIVE_STORE_NAMES: Record<string, string> = {
  san_diego: "San Diego",
  centro: "Centro",
  gran_plaza: "Gran Plaza",
  caldas: "Caldas",
};
const ACTIVE_STORE_SLUGS = ["san_diego", "centro", "gran_plaza", "caldas"];

// ── Special rules data ────────────────────────────────────────────────────────

interface SpecialRuleEntry {
  product: string;
  stores: Record<string, number>;
}

const DEFAULT_SPECIAL_RULES: SpecialRuleEntry[] = [
  { product: "Banera", stores: { san_diego: 3, caldas: 3, centro: 0, gran_plaza: 0 } },
  { product: "Cuna colecho", stores: { san_diego: 3, caldas: 3, centro: 0, gran_plaza: 0 } },
  { product: "Corral", stores: { san_diego: 3, caldas: 3, centro: 0, gran_plaza: 0 } },
];

// ── Section type ──────────────────────────────────────────────────────────────

type RulesSection = "castillitos" | "latin_kids" | "accessories" | "rule36" | "special";

const SECTION_NAV: { key: RulesSection; label: string }[] = [
  { key: "castillitos", label: "Castillitos" },
  { key: "latin_kids", label: "Latin Kids" },
  { key: "accessories", label: "Accesorios" },
  { key: "rule36", label: "Regla 36" },
  { key: "special", label: "Reglas Especiales" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export function StoreSupplyRulesTab({
  orgSlug,
  storeId,
  storeName, onSaved }: {
  orgSlug: string;
  storeId: string;
  storeName: string;
  /** F3A.1: notifica una escritura exitosa (refetch del snapshot). */
  onSaved?: () => void;
}) {
  const [config, setConfig] = useState<EffectiveStoreConfig | null>(null);
  const [catalog, setCatalog] = useState<DerroteroCatalog | null>(null);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<RulesSection>("castillitos");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState<RulesSection | null>(null);
  const [draft, setDraft] = useState<Partial<EffectiveStoreConfig>>({});
  const [preview, setPreview] = useState<RuleImpactPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Special rules — display-only from policy pack defaults (not yet persisted per-store)
  const specialRules = DEFAULT_SPECIAL_RULES;

  const [prevStoreId, setPrevStoreId] = useState(storeId);

  // Store change cleanup
  if (storeId !== prevStoreId) {
    setPrevStoreId(storeId);
    setConfig(null);
    setCatalog(null);
    setLoaded(false);
    setSection("castillitos");
    setEditing(null);
    setDraft({});
    setPreview(null);
    setError(null);
    setSuccess(null);
    setValidationErrors({});
  }

  const tiendasApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [orgSlug]);

  // Load config + catalog
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, catalogRes] = await Promise.all([
        tiendasApi({ action: "distribution_effective_config", storeId }),
        tiendasApi({ action: "derrotero_catalog" }),
      ]);
      if (configRes.config) {
        setConfig(configRes.config);
        setEditable(configRes.editable ?? false);
      }
      if (catalogRes.catalog) setCatalog(catalogRes.catalog);
      setLoaded(true);
    } catch {
      setError("No se pudo cargar la configuracion.");
    } finally {
      setLoading(false);
    }
  }, [storeId, tiendasApi]);

  useEffect(() => {
    if (!loaded && !loading) loadData();
  }, [loaded, loading, loadData]);

  // ── Validation ──────────────────────────────────────────────────────────
  function validateTextile(tc: EffectiveTextileConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!Number.isInteger(tc.minUnits) || tc.minUnits < 0) errs.minUnits = "Entero >= 0";
    if (!Number.isInteger(tc.targetUnits) || tc.targetUnits < tc.minUnits) errs.targetUnits = "Entero >= minimo";
    if (!Number.isInteger(tc.maxUnits) || tc.maxUnits < tc.targetUnits) errs.maxUnits = "Entero >= objetivo";
    return errs;
  }

  function validateScarcity(sc: EffectiveScarcityConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    if (sc.lowStockConcentrationThreshold < 0) errs.threshold = ">= 0";
    if (sc.enabled && sc.allowedStoresWhenScarce.length === 0) errs.allowedStores = "Al menos una tienda";
    return errs;
  }

  // ── Edit handlers ──────────────────────────────────────────────────────
  function startEdit(sec: RulesSection) {
    if (!editable || !config) return;
    setEditing(sec);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setValidationErrors({});

    if (sec === "castillitos") setDraft({ castillitos: { ...config.castillitos, source: "store_override" } });
    else if (sec === "latin_kids") setDraft({ latinKids: { ...config.latinKids, source: "store_override" } });
    else if (sec === "accessories") setDraft({
      accessories: {
        small: { ...config.accessories.small, source: "store_override" },
        medium: { ...config.accessories.medium, source: "store_override" },
        large: { ...config.accessories.large, source: "store_override" },
      },
    });
    else if (sec === "rule36") setDraft({ scarcity: { ...config.scarcity, source: "store_override" } });
  }

  function cancelEdit() {
    setEditing(null);
    setDraft({});
    setPreview(null);
    setValidationErrors({});
  }

  // AGENTIK-STORES-DERROTERO-DELIVERY-01 §3: DEACTIVATE (revert override → tenant default)
  async function revertToDefault(sec: RulesSection) {
    if (!config || !editable) return;
    setSaving(true);
    setError(null);
    try {
      let revertConfig: Partial<EffectiveStoreConfig>;
      const sectionLabels: Record<string, string> = {
        castillitos: "Castillitos", latin_kids: "Latin Kids", rule36: "Regla 36",
      };
      if (sec === "castillitos") {
        revertConfig = { castillitos: { ...config.castillitos, source: "tenant_default" } };
      } else if (sec === "latin_kids") {
        revertConfig = { latinKids: { ...config.latinKids, source: "tenant_default" } };
      } else if (sec === "rule36") {
        revertConfig = { scarcity: { ...config.scarcity, source: "tenant_default" } };
      } else return;

      const data = await tiendasApi({
        action: "distribution_save_config",
        storeId, storeName,
        config: revertConfig,
        motivo: `Restablecimiento a valores predeterminados: ${sectionLabels[sec] ?? sec}`,
      });
      if (data.error) { setError(data.error); return; }
      if (data.config) setConfig(data.config);
      setEditing(null);
      setDraft({});
      setPreview(null);
      setSuccess(`${sectionLabels[sec] ?? sec}: restablecido a predeterminado del tenant`);
      setTimeout(() => setSuccess(null), 4000);
      onSaved?.();
    } catch { setError("Error al restablecer"); }
    finally { setSaving(false); }
  }

  async function requestPreview() {
    if (!draft || Object.keys(draft).length === 0) return;
    let errs: Record<string, string> = {};
    if (draft.castillitos) errs = validateTextile(draft.castillitos);
    if (draft.latinKids) errs = { ...errs, ...validateTextile(draft.latinKids) };
    if (draft.scarcity) errs = { ...errs, ...validateScarcity(draft.scarcity) };
    if (Object.keys(errs).length > 0) { setValidationErrors(errs); return; }
    setValidationErrors({});
    setPreviewLoading(true);
    try {
      const data = await tiendasApi({ action: "distribution_preview_impact", storeId, proposedConfig: draft });
      if (data.preview) setPreview(data.preview);
      else setError("No se pudo calcular el impacto");
    } catch { setError("Error al calcular impacto"); }
    finally { setPreviewLoading(false); }
  }

  async function saveChanges() {
    if (!draft || Object.keys(draft).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const data = await tiendasApi({
        action: "distribution_save_config",
        storeId, storeName,
        config: draft,
        motivo: "Cambio de reglas de surtido desde editor",
      });
      if (data.error) { setError(data.error); return; }
      if (data.config) setConfig(data.config);
      const savedSection = editing;
      const sectionLabels: Record<string, string> = {
        castillitos: "Castillitos", latin_kids: "Latin Kids",
        accessories: "Accesorios", rule36: "Regla 36",
      };
      setEditing(null);
      setDraft({});
      setPreview(null);
      setSuccess(`${sectionLabels[savedSection ?? ""] ?? "Reglas"} guardado como override de tienda`);
      setTimeout(() => setSuccess(null), 4000);
      onSaved?.();   // F3A.1: escritura exitosa → refetch del StoreSnapshot
    } catch { setError("Error al guardar configuracion"); }
    finally { setSaving(false); }
  }

  // ── Loading/error states ──────────────────────────────────────────────
  if (loading && !loaded) {
    return (
      <div style={{ ...monoSm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Cargando reglas de surtido...
      </div>
    );
  }

  if (error && !config) {
    return (
      <div style={{ ...monoXs, color: C.red, padding: S[3], background: C.redLight, borderRadius: R.sm }}>
        {error}
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ ...monoSm, color: C.inkFaint, textAlign: "center", padding: S[8] }}>
        Configuracion no disponible
      </div>
    );
  }

  const isEditing = editing === section;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
            Reglas de Surtido
          </span>
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: 2 }}>
            Configuracion de politicas por linea para {storeName}
          </div>
        </div>
        {!editable && (
          <span style={{ ...mono2xs, color: C.inkFaint, padding: "2px 6px", background: C.surface, borderRadius: R.pill, border: `1px solid ${C.line}` }}>
            Solo lectura
          </span>
        )}
      </div>

      {error && <div style={{ ...monoXs, color: C.red, padding: S[2], background: C.redLight, borderRadius: R.sm }}>{error}</div>}
      {success && <div style={{ ...monoXs, color: C.green, padding: S[2], background: C.greenLight, borderRadius: R.sm }}>{success}</div>}

      {/* ── Section navigation ── */}
      <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
        {SECTION_NAV.map(s => {
          const active = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => { setSection(s.key); if (editing && editing !== s.key) cancelEdit(); }}
              style={{
                ...monoXs, fontWeight: T.wt.semibold,
                padding: "3px 10px", borderRadius: R.pill, cursor: "pointer",
                background: active ? C.blueDark : C.surface,
                color: active ? C.white : C.inkMid,
                border: `1px solid ${active ? C.blueDark : C.line}`,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Section content ── */}
      {section === "castillitos" && (
        <TextileSection
          label="Castillitos"
          config={config.castillitos}
          groups={catalog?.castillitos ?? []}
          showGrupo={true}
          isEditing={isEditing}
          draft={draft.castillitos}
          editable={editable}
          onChange={(tc) => setDraft({ castillitos: tc })}
          errors={validationErrors}
        />
      )}

      {section === "latin_kids" && (
        <TextileSection
          label="Latin Kids"
          config={config.latinKids}
          groups={catalog?.latinKids ?? []}
          showGrupo={false}
          isEditing={isEditing}
          draft={draft.latinKids}
          editable={editable}
          onChange={(tc) => setDraft({ latinKids: tc })}
          errors={validationErrors}
        />
      )}

      {section === "accessories" && (
        <AccessoriesSection config={config.accessories} groups={catalog?.accessories ?? []} />
      )}

      {section === "rule36" && (
        <Rule36Section
          config={config.scarcity}
          isEditing={isEditing}
          draft={draft.scarcity}
          editable={editable}
          onChange={(sc) => setDraft({ scarcity: sc })}
          errors={validationErrors}
        />
      )}

      {section === "special" && (
        <SpecialRulesSection
          rules={specialRules}
        />
      )}

      {/* ── Edit/Save controls (AGENTIK-STORES-DERROTERO-DELIVERY-01) ── */}
      {section !== "special" && editable && (() => {
        // Resolve source for current section
        const sectionSource =
          section === "castillitos" ? config.castillitos.source
          : section === "latin_kids" ? config.latinKids.source
          : section === "accessories" ? (
            config.accessories.small.source === "store_override"
            || config.accessories.medium.source === "store_override"
            || config.accessories.large.source === "store_override"
              ? "store_override" : "tenant_default"
          )
          : section === "rule36" ? config.scarcity.source
          : "tenant_default";
        const isOverride = sectionSource === "store_override";
        const canRevert = isOverride && !isEditing && section !== "accessories";

        return (
          <div style={{ paddingTop: S[2], borderTop: `1px solid ${C.line}` }}>
            {/* Source badge */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
              <span style={{
                ...mono2xs, padding: "2px 8px", borderRadius: R.pill,
                background: isOverride ? C.amberLight : C.surfaceAlt,
                color: isOverride ? C.amber : C.inkFaint,
                border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
              }}>
                {isOverride ? "Personalizado para esta tienda" : "Predeterminado del tenant"}
              </span>
            </div>

            {!isEditing ? (
              <div style={{ display: "flex", gap: S[2] }}>
                {section !== "accessories" && (
                  <button onClick={() => startEdit(section)} className="ag-action-secondary" style={{
                    ...monoXs, padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm, cursor: "pointer",
                    background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                  }}>
                    {isOverride ? "Editar override" : "Crear override"}
                  </button>
                )}
                {canRevert && (
                  <button
                    onClick={() => revertToDefault(section)}
                    disabled={saving}
                    className="ag-action-ghost"
                    style={{
                      ...monoXs, padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm,
                      cursor: saving ? "wait" : "pointer",
                      background: C.surface, color: C.inkMid, border: `1px solid ${C.line}`,
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Restableciendo..." : "Restablecer al default"}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                {preview && (
                  <div style={{ ...panel, padding: S[3], background: C.surfaceAlt }}>
                    <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
                      Impacto del cambio
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                      <div style={{ ...mono2xs, color: C.inkMid }}>+{preview.additionalSurtir} ref. adicionales por surtir</div>
                      <div style={{ ...mono2xs, color: C.inkMid }}>+{preview.additionalUnitsNeeded} unidades adicionales</div>
                      <div style={{ ...mono2xs, color: preview.resolvedDeficits > 0 ? C.green : C.inkMid }}>{preview.resolvedDeficits} deficit resueltos</div>
                      <div style={{ ...mono2xs, color: preview.newRetirar > 0 ? C.amber : C.inkMid }}>{preview.newRetirar} nuevos por retirar</div>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: S[2] }}>
                  {!preview && (
                    <button onClick={requestPreview} disabled={previewLoading} className="ag-action-secondary" style={{
                      ...monoXs, padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
                      cursor: previewLoading ? "wait" : "pointer",
                      background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                      opacity: previewLoading ? 0.6 : 1,
                    }}>
                      {previewLoading ? "Calculando..." : "Previsualizar impacto"}
                    </button>
                  )}
                  {preview && (
                    <button onClick={saveChanges} disabled={saving} className="ag-action-primary" style={{
                      ...monoXs, fontWeight: T.wt.semibold,
                      padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
                      cursor: saving ? "wait" : "pointer",
                      background: C.blueDark, color: C.white, border: "none",
                      opacity: saving ? 0.6 : 1,
                    }}>
                      {saving ? "Guardando..." : "Guardar como override"}
                    </button>
                  )}
                  <button onClick={cancelEdit} style={{
                    ...monoXs, padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm,
                    cursor: "pointer", background: C.surface, color: C.inkMid, border: `1px solid ${C.line}`,
                  }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Textile Section ──────────────────────────────────────────────────────────

function TextileSection({
  label, config, groups, showGrupo, isEditing, draft, editable, onChange, errors,
}: {
  label: string;
  config: EffectiveTextileConfig;
  groups: CatalogGroup[];
  showGrupo: boolean;
  isEditing: boolean;
  draft: EffectiveTextileConfig | undefined;
  editable: boolean;
  onChange: (tc: EffectiveTextileConfig) => void;
  errors: Record<string, string>;
}) {
  const val = isEditing && draft ? draft : config;
  const fieldStyle = {
    ...monoXs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm,
    border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Global rule for this line */}
      <div style={{ ...panel, padding: S[3] }}>
        <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
          Meta de cobertura por subgrupo — {label}
        </div>
        {/* Ley certificada (DERROTERO-MEASUREMENT-SEMANTICS-01): la regla se
            cumple con la SUMA de unidades de todas las referencias elegibles
            del subgrupo — ninguna referencia individual define el cumplimiento. */}
        <div style={{ ...mono2xs, color: C.inkFaint, marginBottom: S[2] }}>
          Se evalúa el TOTAL agregado del subgrupo: la suma de unidades de todas sus referencias elegibles.
          Varias referencias distintas pueden completar juntas el mínimo, ideal o máximo.
        </div>
        <div style={{ display: "flex", gap: S[4], alignItems: "flex-start" }}>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Minimo</div>
            {isEditing ? (
              <input type="number" value={val.minUnits} min={0} onChange={e => onChange({ ...val, minUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ ...monoSm, fontWeight: T.wt.bold, color: C.ink }}>{val.minUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Total del subgrupo debajo: surtir</div>
            {errors.minUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.minUnits}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Ideal</div>
            {isEditing ? (
              <input type="number" value={val.targetUnits} min={0} onChange={e => onChange({ ...val, targetUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ ...monoSm, fontWeight: T.wt.bold, color: C.blueDark }}>{val.targetUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Meta agregada del subgrupo</div>
            {errors.targetUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.targetUnits}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Maximo</div>
            {isEditing ? (
              <input type="number" value={val.maxUnits} min={0} onChange={e => onChange({ ...val, maxUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ ...monoSm, fontWeight: T.wt.bold, color: C.ink }}>{val.maxUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Total del subgrupo encima: retirar excedente</div>
            {errors.maxUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.maxUnits}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Estado</div>
            <div style={{
              ...mono2xs, padding: "2px 6px", borderRadius: R.pill, marginTop: S[1],
              background: val.enabled ? C.greenLight : C.surface,
              color: val.enabled ? C.green : C.inkFaint,
            }}>
              {val.enabled ? "Activo" : "Inactivo"}
            </div>
          </div>
        </div>
        {config.notes && (
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: S[2] }}>
            Nota: {config.notes}
          </div>
        )}
      </div>

      {/* Per-entry table — structure only, no coverage */}
      {groups.length > 0 && (
        <div>
          <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
            Puntos del derrotero ({groups.reduce((s, g) => s + g.entries.length, 0)})
          </div>
          <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
            {/* Header */}
            <div className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: showGrupo ? "120px 1fr 50px 50px 50px 50px" : "1fr 50px 50px 50px 50px",
              borderBottom: `1px solid ${C.line}`,
            }}>
              {showGrupo && <span style={headerCell}>Grupo</span>}
              <span style={headerCell}>Subgrupo</span>
              <span style={{ ...headerCell, textAlign: "right" }}>Min</span>
              <span style={{ ...headerCell, textAlign: "right" }}>Ideal</span>
              <span style={{ ...headerCell, textAlign: "right" }}>Max</span>
              <span style={headerCell}>Activo</span>
            </div>

            {/* Rows */}
            {groups.map(group =>
              group.entries.map(entry => {
                const subgrupo = typeof entry.sagSubgrupo === "string"
                  ? entry.sagSubgrupo
                  : Array.isArray(entry.sagSubgrupo)
                    ? entry.sagSubgrupo[0]
                    : entry.entryName;

                return (
                  <div key={entry.entryCode} className="ag-op-row" style={{
                    display: "grid",
                    gridTemplateColumns: showGrupo ? "120px 1fr 50px 50px 50px 50px" : "1fr 50px 50px 50px 50px",
                    borderBottom: `1px solid ${C.lineSubtle}`,
                  }}>
                    {showGrupo && (
                      <span style={{ ...cellStyle, fontWeight: T.wt.semibold }} title={group.sagGrupo ?? ""}>
                        {group.sagGrupo ?? "\u2014"}
                      </span>
                    )}
                    <span style={cellStyle} title={subgrupo}>{subgrupo}</span>
                    <span style={{ ...cellStyle, textAlign: "right" }}>{entry.minUnitsPerRef}</span>
                    <span style={{ ...cellStyle, textAlign: "right", color: C.blueDark }}>{entry.idealUnitsPerRef}</span>
                    <span style={{ ...cellStyle, textAlign: "right" }}>{entry.maxUnitsPerRef}</span>
                    <span style={cellStyle}>
                      <span style={{
                        ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                        background: entry.active ? C.greenLight : C.surface,
                        color: entry.active ? C.green : C.inkFaint,
                      }}>
                        {entry.active ? "Si" : "No"}
                      </span>
                    </span>
                  </div>
                );
              }),
            )}
          </div>
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: S[1] }}>
            Cada punto (grupo + subgrupo) se evalúa por el TOTAL de unidades de sus referencias elegibles,
            heredando la regla global de {label}: {config.minUnits}/{config.targetUnits}/{config.maxUnits}.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accessories Section ──────────────────────────────────────────────────────

function AccessoriesSection({
  config,
  groups,
}: {
  config: { small: EffectiveAccessoryConfig; medium: EffectiveAccessoryConfig; large: EffectiveAccessoryConfig };
  groups: CatalogGroup[];
}) {
  const sizes = [
    { key: "small" as const, label: "Pequeno", cfg: config.small },
    { key: "medium" as const, label: "Mediano", cfg: config.medium },
    { key: "large" as const, label: "Grande", cfg: config.large },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink }}>
        Reglas por tamano de accesorio
      </div>

      <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
        <div className="ag-op-row" style={{
          display: "grid", gridTemplateColumns: "120px 80px 80px",
          borderBottom: `1px solid ${C.line}`,
        }}>
          <span style={headerCell}>Tamano</span>
          <span style={{ ...headerCell, textAlign: "right" }}>Objetivo</span>
          <span style={headerCell}>Fuente</span>
        </div>
        {sizes.map(s => (
          <div key={s.key} className="ag-op-row" style={{
            display: "grid", gridTemplateColumns: "120px 80px 80px",
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <span style={{ ...cellStyle, fontWeight: T.wt.semibold }}>{s.label}</span>
            <span style={{ ...cellStyle, textAlign: "right", color: C.blueDark, fontWeight: T.wt.bold }}>
              {s.cfg.targetUnits}
            </span>
            <span style={cellStyle}>
              <span style={{
                ...mono2xs, padding: "1px 4px", borderRadius: R.pill,
                background: s.cfg.source === "store_override" ? C.amberLight : C.surface,
                color: s.cfg.source === "store_override" ? C.amber : C.inkFaint,
              }}>
                {s.cfg.source === "store_override" ? "Override" : "Heredado"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rule 36 Section ──────────────────────────────────────────────────────────

function Rule36Section({
  config, isEditing, draft, editable, onChange, errors,
}: {
  config: EffectiveScarcityConfig;
  isEditing: boolean;
  draft: EffectiveScarcityConfig | undefined;
  editable: boolean;
  onChange: (sc: EffectiveScarcityConfig) => void;
  errors: Record<string, string>;
}) {
  const val = isEditing && draft ? draft : config;
  const fieldStyle = {
    ...monoXs, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm,
    border: `1px solid ${C.line}`, width: 60, textAlign: "center" as const,
  };

  function toggleStore(slug: string) {
    const ids = [...val.allowedStoresWhenScarce];
    const names = [...val.allowedStoreNames];
    const idx = ids.indexOf(slug);
    if (idx >= 0) { ids.splice(idx, 1); names.splice(idx, 1); }
    else { ids.push(slug); names.push(ACTIVE_STORE_NAMES[slug] || slug); }
    onChange({ ...val, allowedStoresWhenScarce: ids, allowedStoreNames: names });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ ...panel, padding: S[3] }}>
        <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
          Regla 36 — Concentracion por escasez
        </div>
        <div style={{ ...mono2xs, color: C.inkMid, lineHeight: "1.4", marginBottom: S[2] }}>
          Si una referencia tiene {val.lowStockConcentrationThreshold} unidades o menos en bodega principal,
          solo puede distribuirse a las tiendas autorizadas. Si tiene mas de {val.lowStockConcentrationThreshold},
          puede ir a cualquier tienda.
        </div>

        {/* Threshold */}
        <div style={{ display: "flex", gap: S[4], alignItems: "flex-start", marginBottom: S[3] }}>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Umbral</div>
            {isEditing ? (
              <input type="number" value={val.lowStockConcentrationThreshold} min={0}
                onChange={e => onChange({ ...val, lowStockConcentrationThreshold: parseInt(e.target.value) || 0 })}
                style={fieldStyle} />
            ) : (
              <div style={{ ...monoSm, fontWeight: T.wt.bold, color: C.ink }}>{val.lowStockConcentrationThreshold}</div>
            )}
            {errors.threshold && <div style={{ ...mono2xs, color: C.red }}>{errors.threshold}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight }}>Activada</div>
            <div style={{
              ...mono2xs, padding: "2px 6px", borderRadius: R.pill, marginTop: S[1],
              background: val.enabled ? C.greenLight : C.surface,
              color: val.enabled ? C.green : C.inkFaint,
            }}>
              {val.enabled ? "Si" : "No"}
            </div>
          </div>
        </div>

        {/* Allowed stores */}
        <div>
          <div style={{ ...mono2xs, color: C.inkLight, marginBottom: S[1] }}>Tiendas autorizadas cuando escaso:</div>
          {isEditing ? (
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {ACTIVE_STORE_SLUGS.map(slug => {
                const selected = val.allowedStoresWhenScarce.includes(slug);
                return (
                  <button key={slug} onClick={() => toggleStore(slug)} style={{
                    ...mono2xs, padding: "2px 8px", borderRadius: R.pill,
                    background: selected ? C.greenLight : C.surface,
                    color: selected ? C.green : C.inkFaint,
                    border: `1px solid ${selected ? C.greenBorder : C.line}`,
                    cursor: "pointer",
                  }}>
                    {selected ? "\u2713 " : ""}{ACTIVE_STORE_NAMES[slug] || slug}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {val.allowedStoreNames.map((name, i) => (
                <span key={i} style={{
                  ...mono2xs, padding: "2px 6px", borderRadius: R.pill,
                  background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}`,
                }}>
                  {name}
                </span>
              ))}
            </div>
          )}
          {errors.allowedStores && <div style={{ ...mono2xs, color: C.red, marginTop: S[1] }}>{errors.allowedStores}</div>}
        </div>

      </div>

      {/* Semantics explanation */}
      <div style={{ ...panel, padding: S[2], background: C.surfaceAlt }}>
        <div style={{ ...mono2xs, color: C.inkMid, lineHeight: "1.5" }}>
          <strong>Semantica:</strong><br />
          Stock bodega &gt; {val.lowStockConcentrationThreshold} uds: todas las tiendas (Centro, Caldas, San Diego, Gran Plaza)<br />
          Stock bodega &le; {val.lowStockConcentrationThreshold} uds: solo {val.allowedStoreNames.join(", ") || "ninguna"}
        </div>
      </div>
    </div>
  );
}

// ── Special Rules Section ────────────────────────────────────────────────────

function SpecialRulesSection({
  rules,
}: {
  rules: SpecialRuleEntry[];
}) {
  const storeKeys = ["san_diego", "caldas", "centro", "gran_plaza"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ ...monoXs, fontWeight: T.wt.semibold, color: C.ink }}>
        Reglas especiales por producto
      </div>

      <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
        <div className="ag-op-row" style={{
          display: "grid", gridTemplateColumns: "120px 70px 70px 70px 70px",
          borderBottom: `1px solid ${C.line}`,
        }}>
          <span style={headerCell}>Producto</span>
          {storeKeys.map(s => (
            <span key={s} style={{ ...headerCell, textAlign: "right" }}>{ACTIVE_STORE_NAMES[s]}</span>
          ))}
        </div>
        {rules.map(rule => (
          <div key={rule.product} className="ag-op-row" style={{
            display: "grid", gridTemplateColumns: "120px 70px 70px 70px 70px",
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            <span style={{ ...cellStyle, fontWeight: T.wt.semibold }}>{rule.product}</span>
            {storeKeys.map(s => (
              <span key={s} style={{ ...cellStyle, textAlign: "right" }}>
                <span style={{ color: (rule.stores[s] ?? 0) > 0 ? C.ink : C.inkFaint }}>
                  {rule.stores[s] ?? 0}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* AGENTIK-STORES-DERROTERO-DELIVERY-01: special rules come from policy pack config.
          Per-store persistence requires cross-store write (all 4 stores at once).
          Current UI is display-only from CASTILLITOS_SPECIAL_PRODUCTS defaults. */}
      <div style={{
        ...mono2xs, color: C.inkFaint, padding: `${S[2]}px ${S[3]}px`,
        background: C.surfaceAlt, borderRadius: R.sm, lineHeight: "1.5",
      }}>
        Valores definidos en la politica del tenant (CASTILLITOS_SPECIAL_PRODUCTS).
        Para modificar, contactar administrador del sistema.
      </div>
    </div>
  );
}
