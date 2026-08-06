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

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { C, T, S, R, panel, panelHeader } from "@/lib/ui/tokens";

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

interface EffectiveSpecialProductEntry {
  pattern: string;
  idealUnits: number;
  source: "tenant_default" | "store_override";
  validFrom: string | null;
  validTo: string | null;
  season: string | null;
  notes: string | null;
}

interface EffectiveSpecialProductConfig {
  entries: EffectiveSpecialProductEntry[];
}

interface EffectiveStoreConfig {
  castillitos: EffectiveTextileConfig;
  latinKids: EffectiveTextileConfig;
  accessories: { small: EffectiveAccessoryConfig; medium: EffectiveAccessoryConfig; large: EffectiveAccessoryConfig };
  scarcity: EffectiveScarcityConfig;
  specialProducts: EffectiveSpecialProductConfig;
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

/** VISUAL-HARMONIZATION-01 — hint de viewport SOLO presentación (patrón Inteligencia). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}
const ACTIVE_STORE_SLUGS = ["san_diego", "centro", "gran_plaza", "caldas"];

const PATTERN_LABEL: Record<string, string> = {
  "BAÑERA": "Bañera",
  "CUNA_COLECHO": "Cuna Colecho",
  "CORRAL": "Corral",
};

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

  function validateSpecialProducts(sp: EffectiveSpecialProductConfig): Record<string, string> {
    const errs: Record<string, string> = {};
    sp.entries.forEach((e, i) => {
      if (!e.pattern || e.pattern.trim() === "") errs[`sp_${i}_pattern`] = "Patrón requerido";
      if (!Number.isFinite(e.idealUnits) || e.idealUnits < 0) errs[`sp_${i}_ideal`] = "Entero >= 0";
    });
    const patterns = sp.entries.map(e => e.pattern.trim().toUpperCase());
    patterns.forEach((p, i) => {
      if (p && patterns.indexOf(p) !== i) errs[`sp_${i}_pattern`] = "Patrón duplicado";
    });
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
    else if (sec === "special") setDraft({ specialProducts: { entries: config.specialProducts.entries.map(e => ({ ...e })) } });
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
        castillitos: "Castillitos", latin_kids: "Latin Kids", rule36: "Regla 36", special: "Productos Especiales",
      };
      if (sec === "castillitos") {
        revertConfig = { castillitos: { ...config.castillitos, source: "tenant_default" } };
      } else if (sec === "latin_kids") {
        revertConfig = { latinKids: { ...config.latinKids, source: "tenant_default" } };
      } else if (sec === "rule36") {
        revertConfig = { scarcity: { ...config.scarcity, source: "tenant_default" } };
      } else if (sec === "special") {
        revertConfig = { specialProducts: { entries: config.specialProducts.entries.map(e => ({ ...e, source: "tenant_default" as const, notes: null, validFrom: null, validTo: null, season: null })) } };
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
      setSuccess(`${sectionLabels[sec] ?? sec}: configuración predeterminada restablecida`);
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
    if (draft.specialProducts) errs = { ...errs, ...validateSpecialProducts(draft.specialProducts) };
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
        accessories: "Accesorios", rule36: "Regla 36", special: "Productos Especiales",
      };
      setEditing(null);
      setDraft({});
      setPreview(null);
      setSuccess(`${sectionLabels[savedSection ?? ""] ?? "Reglas"}: cambios guardados para esta tienda`);
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

  // ── EDIT-FLOW-UX-01: los controles viven JUNTO a la configuración que editan
  //    (§1/§3), en lenguaje de negocio (§2). La semántica interna
  //    OVERRIDE/tenant_default NO cambia (§12) — solo presentación/interacción.
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
    : section === "special" ? (config.specialProducts?.entries.some(e => e.source === "store_override") ? "store_override" : "tenant_default")
    : "tenant_default";
  const isOverride = sectionSource === "store_override";
  const canRevert = isOverride && !isEditing;

  const btnPrimary = { ...monoXs, fontWeight: T.wt.semibold, padding: `${S[2]}px ${S[3]}px`, minHeight: 36, borderRadius: R.sm, background: C.blueDark, color: C.white, border: "none" } as const;
  const btnSecondary = { ...monoXs, fontWeight: T.wt.semibold, padding: `${S[2]}px ${S[3]}px`, minHeight: 36, borderRadius: R.sm, background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}` } as const;
  const btnGhost = { ...monoXs, padding: `${S[2]}px ${S[3]}px`, minHeight: 36, borderRadius: R.sm, background: C.surface, color: C.inkMid, border: `1px solid ${C.line}` } as const;

  const editControls: ReactNode = editable && section !== "accessories" ? (
    !isEditing ? (
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        <button onClick={() => startEdit(section)} className="ag-action-secondary" style={{ ...btnSecondary, cursor: "pointer" }}>
          Editar cantidades
        </button>
        {canRevert && (
          <button
            onClick={() => revertToDefault(section)}
            disabled={saving}
            className="ag-action-ghost"
            style={{ ...btnGhost, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Restableciendo..." : "Restablecer configuración predeterminada"}
          </button>
        )}
      </div>
    ) : (
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {!preview && (
          <button onClick={requestPreview} disabled={previewLoading} className="ag-action-secondary"
            style={{ ...btnSecondary, cursor: previewLoading ? "wait" : "pointer", opacity: previewLoading ? 0.6 : 1 }}>
            {previewLoading ? "Calculando..." : "Previsualizar impacto"}
          </button>
        )}
        {preview && (
          <button onClick={saveChanges} disabled={saving} className="ag-action-primary"
            style={{ ...btnPrimary, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        )}
        <button onClick={cancelEdit} style={{ ...btnGhost, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    )
  ) : null;

  // §4: el impacto se muestra INMEDIATAMENTE debajo de la card de configuración.
  const previewPanel: ReactNode = isEditing && preview ? (
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
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* ── Header — misma jerarquía título/apoyo que Inteligencia (LAW 1) ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[2], flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>
            Reglas de Surtido
          </span>
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: 2 }}>
            Configuracion de politicas por linea para {storeName}
          </div>
        </div>
        {!editable && (
          <span style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.inkFaint, padding: "2px 8px", background: C.surfaceAlt, borderRadius: R.pill, border: `1px solid ${C.line}` }}>
            Solo lectura
          </span>
        )}
      </div>

      {error && <div style={{ ...monoXs, color: C.red, padding: `${S[2]}px ${S[3]}px`, background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: R.sm }}>{error}</div>}
      {success && <div style={{ ...monoXs, color: C.green, padding: `${S[2]}px ${S[3]}px`, background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: R.sm }}>{success}</div>}

      {/* ── Section navigation — zona de filtros del sistema (LAW 3):
          label superior + chips con activo azul, touch target 32px ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
        <div style={{ ...mono2xs, fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
          Seccion de reglas
        </div>
        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
          {SECTION_NAV.map(s => {
            const active = section === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setSection(s.key); if (editing && editing !== s.key) cancelEdit(); }}
                style={{
                  ...monoXs, fontWeight: T.wt.semibold,
                  padding: "6px 14px", minHeight: 32, borderRadius: R.sm, cursor: "pointer",
                  background: active ? C.blueDark : C.white,
                  color: active ? C.white : C.ink,
                  border: `1.5px solid ${active ? C.blueDark : C.line}`,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
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
          isOverride={isOverride}
          controls={editControls}
          previewPanel={previewPanel}
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
          isOverride={isOverride}
          controls={editControls}
          previewPanel={previewPanel}
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
          isOverride={isOverride}
          controls={editControls}
          previewPanel={previewPanel}
        />
      )}

      {section === "special" && (
        <SpecialRulesSection
          config={config.specialProducts}
          isEditing={isEditing}
          draft={draft.specialProducts}
          editable={editable}
          onChange={(sp) => setDraft({ specialProducts: sp })}
          errors={validationErrors}
          isOverride={isOverride}
          controls={editControls}
          previewPanel={previewPanel}
          storeId={storeId}
        />
      )}

    </div>
  );
}

// ── Textile Section ──────────────────────────────────────────────────────────

function TextileSection({
  label, config, groups, showGrupo, isEditing, draft, editable, onChange, errors,
  isOverride, controls, previewPanel,
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
  isOverride: boolean;
  controls: ReactNode;
  previewPanel: ReactNode;
}) {
  const isNarrow = useIsNarrow();
  const val = isEditing && draft ? draft : config;
  // EDIT-FLOW-UX-01 §3: en modo edición los inputs son inequívocamente editables
  const fieldStyle = {
    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
    color: C.ink, padding: `${S[2]}px`, borderRadius: R.sm,
    border: `1.5px solid ${C.blueBorder}`, background: C.white,
    width: 72, minHeight: 34, textAlign: "center" as const,
  };
  // §7: Puntos del derrotero colapsable; al entrar en edición se auto-colapsa
  // (el usuario edita la configuración, no inspecciona las filas derivadas).
  const [pointsOpen, setPointsOpen] = useState(true);
  useEffect(() => {
    if (isEditing) setPointsOpen(false);
  }, [isEditing]);
  const entryGridCols = isNarrow
    ? "minmax(0, 1fr) 40px 40px 40px 44px"
    : showGrupo ? "120px 1fr 50px 50px 50px 50px" : "1fr 50px 50px 50px 50px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Global rule for this line — EDIT-FLOW-UX-01: la card de configuración
          concentra valores + origen + controles de edición (§1/§8). */}
      <div style={{ ...panel, ...(isEditing ? { border: `1.5px solid ${C.blueDark}` } : null) }}>
        <div style={{ ...panelHeader, justifyContent: "space-between", flexWrap: "wrap", gap: S[2] }}>
          <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
            Meta de cobertura por subgrupo — {label}
          </span>
          <span style={{ display: "flex", gap: S[1], alignItems: "center", flexWrap: "wrap" }}>
            {isEditing && (
              <span style={{
                ...mono2xs, fontWeight: T.wt.bold, padding: "2px 8px", borderRadius: R.pill,
                background: C.blueDark, color: C.white,
              }}>
                Editando
              </span>
            )}
            <span style={{
              ...mono2xs, fontWeight: T.wt.semibold, padding: "2px 8px", borderRadius: R.pill,
              background: isOverride ? C.amberLight : C.surfaceAlt,
              color: isOverride ? C.amber : C.inkFaint,
              border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
            }}>
              {isOverride ? "Configuración personalizada" : "Configuración predeterminada"}
            </span>
            <span style={{
              ...mono2xs, fontWeight: T.wt.semibold, padding: "2px 8px", borderRadius: R.pill,
              background: val.enabled ? C.greenLight : C.surfaceAlt,
              color: val.enabled ? C.green : C.inkFaint,
            }}>
              {val.enabled ? "Activo" : "Inactivo"}
            </span>
          </span>
        </div>
        <div style={{ padding: S[3] }}>
        {/* Ley certificada (DERROTERO-MEASUREMENT-SEMANTICS-01): la regla se
            cumple con la SUMA de unidades de todas las referencias elegibles
            del subgrupo — ninguna referencia individual define el cumplimiento. */}
        <div style={{ ...mono2xs, color: C.inkFaint, marginBottom: S[2] }}>
          Se evalúa el TOTAL agregado del subgrupo: la suma de unidades de todas sus referencias elegibles.
          Varias referencias distintas pueden completar juntas el mínimo, ideal o máximo.
        </div>
        <div style={{ display: "flex", gap: S[4], alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight, textTransform: "uppercase" as const }}>Minimo</div>
            {isEditing ? (
              <input type="number" value={val.minUnits} min={0} onChange={e => onChange({ ...val, minUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.minUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Total del subgrupo debajo: surtir</div>
            {errors.minUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.minUnits}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight, textTransform: "uppercase" as const }}>Ideal</div>
            {isEditing ? (
              <input type="number" value={val.targetUnits} min={0} onChange={e => onChange({ ...val, targetUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.blueDark }}>{val.targetUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Meta agregada del subgrupo</div>
            {errors.targetUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.targetUnits}</div>}
          </div>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight, textTransform: "uppercase" as const }}>Maximo</div>
            {isEditing ? (
              <input type="number" value={val.maxUnits} min={0} onChange={e => onChange({ ...val, maxUnits: parseInt(e.target.value) || 0 })} style={fieldStyle} />
            ) : (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.maxUnits}</div>
            )}
            <div style={{ ...mono2xs, color: C.inkFaint }}>Total del subgrupo encima: retirar excedente</div>
            {errors.maxUnits && <div style={{ ...mono2xs, color: C.red }}>{errors.maxUnits}</div>}
          </div>
        </div>
        {config.notes && (
          <div style={{ ...mono2xs, color: C.inkFaint, marginTop: S[2] }}>
            Nota: {config.notes}
          </div>
        )}
        {/* §1/§3: controles DIRECTAMENTE junto a los campos que editan */}
        {controls && (
          <div style={{ marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}` }}>
            {controls}
          </div>
        )}
        </div>
      </div>

      {/* §4: impacto inmediatamente debajo de la configuración */}
      {previewPanel}

      {/* Per-entry table — structure only, no coverage.
          VISUAL-HARMONIZATION-01: section card con panelHeader + conteo (LAW 4);
          en móvil el grupo baja como prefijo del subgrupo (LAW 7). */}
      {groups.length > 0 && (
        <div style={{ ...panel }}>
          <button
            onClick={() => setPointsOpen(o => !o)}
            aria-expanded={pointsOpen}
            style={{
              ...panelHeader, justifyContent: "space-between", width: "100%",
              border: "none", borderBottom: pointsOpen ? `1px solid ${C.line}` : "none",
              cursor: "pointer", textAlign: "left", minHeight: 40,
            }}
          >
            <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
              <span aria-hidden>{pointsOpen ? "\u25BE" : "\u25B8"}</span> Puntos del derrotero ({groups.reduce((s, g) => s + g.entries.length, 0)})
            </span>
            <span style={{ ...mono2xs, color: C.inkFaint }}>
              Detalle efectivo derivado
            </span>
          </button>
          {pointsOpen && (
          <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
            {/* Header */}
            <div className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: entryGridCols,
              borderBottom: `1px solid ${C.line}`, background: C.surface,
            }}>
              {showGrupo && !isNarrow && <span style={headerCell}>Grupo</span>}
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
                    gridTemplateColumns: entryGridCols,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    alignItems: "center",
                  }}>
                    {showGrupo && !isNarrow && (
                      <span style={{ ...cellStyle, fontWeight: T.wt.semibold }} title={group.sagGrupo ?? ""}>
                        {group.sagGrupo ?? "\u2014"}
                      </span>
                    )}
                    <span style={{ ...cellStyle, whiteSpace: "normal" as const }} title={subgrupo}>
                      {showGrupo && isNarrow && (
                        <span style={{ display: "block", fontWeight: T.wt.semibold, color: C.inkLight }}>
                          {group.sagGrupo ?? "\u2014"}
                        </span>
                      )}
                      {subgrupo}
                    </span>
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
          )}
          {pointsOpen && (
          <div style={{ ...mono2xs, color: C.inkFaint, padding: `${S[2]}px ${S[4]}px` }}>
            Cada punto (grupo + subgrupo) se evalúa por el TOTAL de unidades de sus referencias elegibles,
            heredando la regla global de {label}: {config.minUnits}/{config.targetUnits}/{config.maxUnits}.
          </div>
          )}
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
      {/* VISUAL-HARMONIZATION-01: section card con panelHeader (LAW 4) */}
      <div style={{ ...panel }}>
      <div style={{ ...panelHeader }}>
        <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
          Reglas por tamano de accesorio
        </span>
      </div>

      <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
        <div className="ag-op-row" style={{
          display: "grid", gridTemplateColumns: "120px 80px 80px",
          borderBottom: `1px solid ${C.line}`, background: C.surface,
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
                {s.cfg.source === "store_override" ? "Personalizado" : "Heredado"}
              </span>
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ── Rule 36 Section ──────────────────────────────────────────────────────────

function Rule36Section({
  config, isEditing, draft, editable, onChange, errors,
  isOverride, controls, previewPanel,
}: {
  config: EffectiveScarcityConfig;
  isEditing: boolean;
  draft: EffectiveScarcityConfig | undefined;
  editable: boolean;
  onChange: (sc: EffectiveScarcityConfig) => void;
  errors: Record<string, string>;
  isOverride: boolean;
  controls: ReactNode;
  previewPanel: ReactNode;
}) {
  const val = isEditing && draft ? draft : config;
  const fieldStyle = {
    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
    color: C.ink, padding: `${S[2]}px`, borderRadius: R.sm,
    border: `1.5px solid ${C.blueBorder}`, background: C.white,
    width: 72, minHeight: 34, textAlign: "center" as const,
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
      {/* EDIT-FLOW-UX-01: card de configuración con origen + estado + controles (§1/§8/§10) */}
      <div style={{ ...panel, ...(isEditing ? { border: `1.5px solid ${C.blueDark}` } : null) }}>
        <div style={{ ...panelHeader, justifyContent: "space-between", flexWrap: "wrap", gap: S[2] }}>
          <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
            Regla 36 — Concentracion por escasez
          </span>
          <span style={{ display: "flex", gap: S[1], alignItems: "center", flexWrap: "wrap" }}>
            {isEditing && (
              <span style={{
                ...mono2xs, fontWeight: T.wt.bold, padding: "2px 8px", borderRadius: R.pill,
                background: C.blueDark, color: C.white,
              }}>
                Editando
              </span>
            )}
            <span style={{
              ...mono2xs, fontWeight: T.wt.semibold, padding: "2px 8px", borderRadius: R.pill,
              background: isOverride ? C.amberLight : C.surfaceAlt,
              color: isOverride ? C.amber : C.inkFaint,
              border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
            }}>
              {isOverride ? "Configuración personalizada" : "Configuración predeterminada"}
            </span>
            <span style={{
              ...mono2xs, fontWeight: T.wt.semibold, padding: "2px 8px", borderRadius: R.pill,
              background: val.enabled ? C.greenLight : C.surfaceAlt,
              color: val.enabled ? C.green : C.inkFaint,
            }}>
              {val.enabled ? "Activada" : "Inactiva"}
            </span>
          </span>
        </div>
        <div style={{ padding: S[3] }}>
        <div style={{ ...mono2xs, color: C.inkMid, lineHeight: "1.4", marginBottom: S[2] }}>
          Si una referencia tiene {val.lowStockConcentrationThreshold} unidades o menos en bodega principal,
          solo puede distribuirse a las tiendas autorizadas. Si tiene mas de {val.lowStockConcentrationThreshold},
          puede ir a cualquier tienda.
        </div>

        {/* Threshold */}
        <div style={{ display: "flex", gap: S[4], alignItems: "flex-start", marginBottom: S[3] }}>
          <div>
            <div style={{ ...mono2xs, color: C.inkLight, textTransform: "uppercase" as const }}>Umbral</div>
            {isEditing ? (
              <input type="number" value={val.lowStockConcentrationThreshold} min={0}
                onChange={e => onChange({ ...val, lowStockConcentrationThreshold: parseInt(e.target.value) || 0 })}
                style={fieldStyle} />
            ) : (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{val.lowStockConcentrationThreshold}</div>
            )}
            {errors.threshold && <div style={{ ...mono2xs, color: C.red }}>{errors.threshold}</div>}
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

        {/* §1/§3/§10: controles junto a la configuración que editan */}
        {controls && (
          <div style={{ marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}` }}>
            {controls}
          </div>
        )}
        </div>

      </div>

      {/* §4: impacto inmediatamente debajo de la configuración */}
      {previewPanel}

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

// ── Special Rules Section (CRUD — restored from ea51178) ─────────────────────

function SpecialRulesSection({
  config, isEditing, draft, editable, onChange, errors,
  isOverride, controls, previewPanel, storeId,
}: {
  config: EffectiveSpecialProductConfig;
  isEditing: boolean;
  draft: EffectiveSpecialProductConfig | undefined;
  editable: boolean;
  onChange: (sp: EffectiveSpecialProductConfig) => void;
  errors: Record<string, string>;
  isOverride: boolean;
  controls: ReactNode;
  previewPanel: ReactNode;
  storeId: string;
}) {
  const entries = isEditing && draft ? draft.entries : config.entries;
  const fieldStyle = {
    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
    color: C.ink, padding: `${S[2]}px`, borderRadius: R.sm,
    border: `1.5px solid ${C.blueBorder}`, background: C.white,
    width: 72, minHeight: 34, textAlign: "center" as const,
  };

  function updateEntry(idx: number, patch: Partial<EffectiveSpecialProductEntry>) {
    const updated = entries.map((e, i) => i === idx ? { ...e, ...patch, source: "store_override" as const } : e);
    onChange({ entries: updated });
  }

  function removeEntry(idx: number) {
    onChange({ entries: entries.filter((_, i) => i !== idx) });
  }

  function addEntry() {
    onChange({ entries: [...entries, { pattern: "", idealUnits: 1, source: "store_override", validFrom: null, validTo: null, season: null, notes: null }] });
  }

  function revertEntry(idx: number) {
    const original = config.entries.find(o => o.pattern === entries[idx].pattern);
    const idealUnits = original?.idealUnits ?? entries[idx].idealUnits;
    const updated = entries.map((e, i) => i === idx ? { ...e, idealUnits, source: "tenant_default" as const, notes: null, validFrom: null, validTo: null, season: null } : e);
    onChange({ entries: updated });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Configuration card — same Fable pattern as Castillitos/LatinKids/Rule36 */}
      <div style={{ ...panel, ...(isEditing ? { border: `1.5px solid ${C.blueDark}` } : null) }}>
        <div style={{ ...panelHeader, justifyContent: "space-between", flexWrap: "wrap", gap: S[2] }}>
          <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
            Productos especiales — {ACTIVE_STORE_NAMES[storeId] || storeId}
          </span>
          <span style={{ display: "flex", gap: S[1], alignItems: "center", flexWrap: "wrap" }}>
            {isEditing && (
              <span style={{
                ...mono2xs, fontWeight: T.wt.bold, padding: "2px 8px", borderRadius: R.pill,
                background: C.blueDark, color: C.white,
              }}>
                Editando
              </span>
            )}
            <span style={{
              ...mono2xs, fontWeight: T.wt.semibold, padding: "2px 8px", borderRadius: R.pill,
              background: isOverride ? C.amberLight : C.surface,
              color: isOverride ? C.amber : C.inkFaint,
              border: `1px solid ${isOverride ? C.amberBorder : C.line}`,
            }}>
              {isOverride ? "Personalizado" : "Predeterminado"}
            </span>
          </span>
        </div>

        <div style={{ padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ ...mono2xs, color: C.inkMid, lineHeight: "1.4" }}>
            Cada regla define un patrón de coincidencia y la cantidad objetivo para esta tienda. Ideal=0 indica producto no autorizado.
          </div>

          {entries.map((entry, idx) => {
            const label = PATTERN_LABEL[entry.pattern] || entry.pattern.replace(/_/g, " ") || "—";
            const entryIsOverride = entry.source === "store_override";
            const isDisabled = isEditing && entry.idealUnits === 0 && entryIsOverride;
            const isKnownPattern = !!PATTERN_LABEL[entry.pattern];

            return (
              <div key={idx} style={{
                padding: S[2], borderRadius: R.sm,
                background: isDisabled ? C.surface : C.surfaceAlt,
                opacity: isDisabled ? 0.6 : 1,
                border: `1px solid ${entryIsOverride ? C.amberBorder : C.lineSubtle}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1], flexWrap: "wrap", gap: S[1] }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{ ...monoSm, fontWeight: T.wt.semibold, color: C.ink }}>
                      {isEditing && !isKnownPattern ? (
                        <input
                          type="text"
                          value={entry.pattern}
                          placeholder="PATRON_PRODUCTO"
                          onChange={e => updateEntry(idx, { pattern: e.target.value.toUpperCase() })}
                          style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, padding: `${S[1]}px`, borderRadius: R.sm, border: `1.5px solid ${C.blueBorder}`, width: 160 }}
                        />
                      ) : (
                        label
                      )}
                    </span>
                    <span style={{
                      ...mono2xs, padding: "1px 5px", borderRadius: R.pill,
                      background: entryIsOverride ? C.amberLight : C.surface,
                      color: entryIsOverride ? C.amber : C.inkFaint,
                      border: `1px solid ${entryIsOverride ? C.amberBorder : C.line}`,
                    }}>
                      {entryIsOverride ? "Personalizado" : "Predeterminado"}
                    </span>
                  </div>

                  {isEditing && (
                    <div style={{ display: "flex", gap: S[1] }}>
                      {entryIsOverride && isKnownPattern && (
                        <button onClick={() => revertEntry(idx)} style={{
                          ...mono2xs, padding: "2px 6px", borderRadius: R.sm,
                          background: C.surface, color: C.inkMid, border: `1px solid ${C.line}`, cursor: "pointer",
                        }}>
                          Restablecer
                        </button>
                      )}
                      {!isKnownPattern && (
                        <button onClick={() => removeEntry(idx)} style={{
                          ...mono2xs, padding: "2px 6px", borderRadius: R.sm,
                          background: C.surface, color: C.red, border: `1px solid ${C.redBorder}`, cursor: "pointer",
                        }}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: S[4], alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ ...mono2xs, color: C.inkLight }}>Patrón</div>
                    <div style={{ ...monoXs, color: C.inkMid }}>{entry.pattern || "—"}</div>
                  </div>
                  <div>
                    <div style={{ ...mono2xs, color: C.inkLight }}>Cantidad objetivo</div>
                    {isEditing ? (
                      <input
                        type="number"
                        value={entry.idealUnits}
                        min={0}
                        onChange={e => updateEntry(idx, { idealUnits: parseInt(e.target.value) || 0 })}
                        style={fieldStyle}
                      />
                    ) : (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: entry.idealUnits === 0 ? C.red : C.blueDark }}>
                        {entry.idealUnits}
                      </div>
                    )}
                    <div style={{ ...mono2xs, color: C.inkFaint, marginTop: 1 }}>
                      {entry.idealUnits === 0 ? "No autorizado en esta tienda" : `${entry.idealUnits} uds objetivo`}
                    </div>
                    {errors[`sp_${idx}_ideal`] && <div style={{ ...mono2xs, color: C.red }}>{errors[`sp_${idx}_ideal`]}</div>}
                    {errors[`sp_${idx}_pattern`] && <div style={{ ...mono2xs, color: C.red }}>{errors[`sp_${idx}_pattern`]}</div>}
                  </div>
                </div>

                {isEditing && entryIsOverride && (
                  <div style={{ marginTop: S[2] }}>
                    <div style={{ ...mono2xs, color: C.inkLight }}>Notas</div>
                    <input type="text" value={entry.notes || ""} placeholder="Observaciones" maxLength={500}
                      onChange={e => updateEntry(idx, { notes: e.target.value || null })}
                      style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px`, borderRadius: R.sm, border: `1px solid ${C.line}`, width: "100%" }}
                    />
                  </div>
                )}

                {!isEditing && entry.notes && (
                  <div style={{ ...mono2xs, color: C.inkFaint, fontStyle: "italic", marginTop: S[1] }}>
                    {entry.notes}
                  </div>
                )}
              </div>
            );
          })}

          {isEditing && (
            <button onClick={addEntry} className="ag-action-secondary" style={{
              fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
              borderRadius: R.sm, cursor: "pointer", background: C.blueLight,
              color: C.blueDark, border: `1px solid ${C.blueBorder}`,
              alignSelf: "flex-start",
            }}>
              + Agregar regla especial
            </button>
          )}

          {!isEditing && (
            <div style={{ ...mono2xs, color: C.inkFaint }}>
              Fuente: {entries.some(e => e.source === "store_override") ? "Con personalizaciones" : "Politica predeterminada"}
              {" · "}Tienda: {ACTIVE_STORE_NAMES[storeId] || storeId}
            </div>
          )}
        </div>

        {/* Edit controls inside the panel — same Fable pattern */}
        {controls && (
          <div style={{ padding: `${S[2]}px ${S[3]}px`, borderTop: `1px solid ${C.lineSubtle}` }}>
            {controls}
          </div>
        )}
      </div>

      {/* Impact preview below card */}
      {previewPanel}
    </div>
  );
}
