/**
 * components/marketing-studio/library/attribute-definitions-client.tsx
 *
 * MARKETING-STUDIO-ATTRIBUTES-REDESIGN-01
 *
 * Attribute Library — business-facing view for creating and managing
 * reusable product characteristics (tallas, colores, materiales, etc.).
 *
 * ── Design contract ────────────────────────────────────────────────────────────
 *   - Grid of AttributeCard per definition
 *   - MSDrawer for create / edit form
 *   - Zero technical vocabulary in primary UI
 *   - Advanced settings (key, destination, sortOrder) collapsed by default
 *   - Castillitos preset suggestions when library is empty
 *
 * ── API mapping ────────────────────────────────────────────────────────────────
 *   "Nombre"      → label  (key auto-generated from label)
 *   "Descripción" → helpText
 *   "Tipo"        → type   (business labels → API values)
 *   "Valores"     → options (for select/multiselect)
 */

"use client";

import { useState, useCallback } from "react";
import { X, ChevronDown, ChevronUp, Pencil, Trash2, Copy } from "lucide-react";
import { C, T, S, R }           from "@/lib/ui/tokens";
import { MS_PALETTE, MS_SHADOWS, MS_CARD, MS_CTA } from "@/lib/marketing-studio/ms-design-system";
import { MSDrawer }              from "@/components/marketing-studio/shared/ms-drawer";

const DOMAIN = MS_PALETTE.product;

// ── Types ──────────────────────────────────────────────────────────────────────

interface DefinitionOption {
  id:           string;
  definitionId: string;
  value:        string;
  label:        string;
  sortOrder:    number;
  source?:      string;
}

interface DefinitionData {
  id:          string;
  key:         string;
  label:       string;
  type:        string;
  required:    boolean;
  sortOrder:   number;
  helpText:    string | null;
  destination: string | null;
  /** Import provenance: "manual" | "sag" | "shopify" | "erp_generic" | "pending_review" */
  source?:     string;
  options:     DefinitionOption[];
}

interface AttributeDefinitionsClientProps {
  orgSlug:            string;
  initialDefinitions: DefinitionData[];
}

// ── Business vocabulary ────────────────────────────────────────────────────────

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  select:      "Lista de opciones",
  multiselect: "Lista múltiple",
  text:        "Texto libre",
  number:      "Número",
  boolean:     "Sí / No",
  dimension:   "Dimensión",
  color:       "Color",
};

/** Types shown to business users in the create form */
const PRIMARY_TYPES = [
  { value: "select",  label: "Lista de opciones" },
  { value: "text",    label: "Texto libre" },
  { value: "number",  label: "Número" },
  { value: "boolean", label: "Sí / No" },
];

const needsOptions = (type: string) => type === "select" || type === "multiselect";

// ── Key auto-generation ───────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áéíóúü]/g, c => ({ á:"a",é:"e",í:"i",ó:"o",ú:"u",ü:"u" }[c] ?? c))
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

// ── Castillitos preset suggestions ────────────────────────────────────────────

interface Preset {
  label:   string;
  key:     string;
  type:    string;
  options: string[];
}

const CASTILLITOS_PRESETS: Preset[] = [
  { label: "Talla",            key: "talla",    type: "select",  options: ["XS","S","M","L","XL","XXL"] },
  { label: "Color",            key: "color",    type: "select",  options: ["Negro","Blanco","Rojo","Azul","Verde","Gris","Rosa"] },
  { label: "Edad recomendada", key: "edad",     type: "select",  options: ["0–3 meses","3–6 meses","6–12 meses","1–2 años","2–4 años"] },
  { label: "Género",           key: "genero",   type: "select",  options: ["Niño","Niña","Unisex"] },
  { label: "Material",         key: "material", type: "select",  options: ["Algodón","Denim","Poliéster","Cuero sintético"] },
];

// ── AttributeCard ─────────────────────────────────────────────────────────────

// ── Origin badge helpers ────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  sag:           "SAG",
  shopify:       "Shopify",
  erp_generic:   "ERP",
  pending_review:"Revisión",
};

function resolveOriginLabel(def: DefinitionData): string | null {
  const defSource = def.source ?? "manual";
  // Check if options have mixed sources
  const optionSources = new Set(def.options.map(o => o.source ?? "manual"));
  const hasMixedOptions =
    optionSources.size > 1 ||
    (optionSources.size === 1 && !optionSources.has(defSource));

  if (hasMixedOptions && defSource !== "manual") {
    return `${SOURCE_LABEL[defSource] ?? defSource} + Manual`;
  }
  if (hasMixedOptions) return "Mixto";
  if (defSource === "manual") return null; // default — no badge
  return `Importado · ${SOURCE_LABEL[defSource] ?? defSource}`;
}

function AttributeCard({
  def, deleting, onEdit, onDuplicate, onDelete,
}: {
  def:        DefinitionData;
  deleting:   boolean;
  onEdit:     () => void;
  onDuplicate:() => void;
  onDelete:   () => void;
}) {
  const valuePreview = def.options.length > 0
    ? def.options.slice(0, 6).map(o => o.label || o.value).join(" · ")
    : null;

  const originLabel = resolveOriginLabel(def);

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: MS_CARD.borderRadius,
      padding:      MS_CARD.padding,
      boxShadow:    MS_SHADOWS.card,
      display:      "flex",
      flexDirection:"column" as const,
      gap:          S[2],
      opacity:      deleting ? 0.5 : 1,
      transition:   "opacity .15s",
    }}>
      {/* Header row: name + count */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            fontWeight:   T.wt.bold,
            color:        C.ink,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap" as const,
            letterSpacing:"-0.01em",
          }}>
            {def.label}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
            marginTop:  2,
          }}>
            {BUSINESS_TYPE_LABELS[def.type] ?? def.type}
          </div>
        </div>
        {def.options.length > 0 && (
          <div style={{
            flexShrink:   0,
            fontFamily:   T.mono,
            fontSize:     9,
            fontWeight:   T.wt.bold,
            color:        DOMAIN.primary,
            background:   DOMAIN.iconBg,
            border:       `1px solid ${DOMAIN.primary}33`,
            borderRadius: R.pill,
            padding:      "2px 7px",
            whiteSpace:   "nowrap" as const,
          }}>
            {def.options.length}
          </div>
        )}
      </div>

      {/* Value preview */}
      {valuePreview ? (
        <div style={{
          fontFamily:   T.mono,
          fontSize:     9,
          color:        C.inkMid,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
          lineHeight:   1.4,
        }}>
          {valuePreview}
          {def.options.length > 6 && (
            <span style={{ color: C.inkFaint }}> +{def.options.length - 6}</span>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, fontStyle: "italic" }}>
          Sin valores definidos
        </div>
      )}

      {/* Origin badge — only rendered for imported / mixed attributes */}
      {originLabel && (
        <div style={{
          display:      "inline-flex",
          alignSelf:    "flex-start",
          fontFamily:   T.mono,
          fontSize:     8,
          fontWeight:   T.wt.semibold,
          color:        C.inkMid,
          background:   C.surfaceAlt,
          border:       `1px solid ${C.line}`,
          borderRadius: R.pill,
          padding:      "1px 6px",
          letterSpacing:"0.03em",
        }}>
          Origen: {originLabel}
        </div>
      )}

      {/* Action row */}
      <div style={{
        display:    "flex",
        gap:        S[1],
        marginTop:  S[1],
        paddingTop: S[2],
        borderTop:  `1px solid ${C.lineSubtle}`,
      }}>
        <button onClick={onEdit} style={actionBtn}>
          <Pencil size={10} strokeWidth={1.8} />
          Editar
        </button>
        <button onClick={onDuplicate} style={actionBtn}>
          <Copy size={10} strokeWidth={1.8} />
          Duplicar
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          style={{ ...actionBtn, color: deleting ? C.inkFaint : C.red, marginLeft: "auto" }}
        >
          <Trash2 size={10} strokeWidth={1.8} />
          Eliminar
        </button>
      </div>
    </div>
  );
}

// ── AttributeDrawer ───────────────────────────────────────────────────────────

interface DrawerForm {
  label:       string;
  helpText:    string;
  type:        string;
  options:     { tempId: number; value: string }[];
  // advanced
  key:         string;
  destination: string;
  sortOrder:   number;
  required:    boolean;
}

const emptyForm = (nextSort: number): DrawerForm => ({
  label:       "",
  helpText:    "",
  type:        "select",
  options:     [{ tempId: Date.now(), value: "" }],
  key:         "",
  destination: "",
  sortOrder:   nextSort,
  required:    false,
});

let _tempId = 1;
const nextTempId = () => ++_tempId;

function AttributeDrawer({
  mode,
  initialData,
  orgSlug,
  nextSortOrder,
  onSuccess,
  onClose,
}: {
  mode:         "create" | "edit";
  initialData?: DefinitionData;
  orgSlug:      string;
  nextSortOrder:number;
  onSuccess:    (def: DefinitionData) => void;
  onClose:      () => void;
}) {
  const [form, setForm] = useState<DrawerForm>(() => {
    if (mode === "edit" && initialData) {
      return {
        label:       initialData.label,
        helpText:    initialData.helpText ?? "",
        type:        initialData.type,
        options:     initialData.options.map(o => ({ tempId: nextTempId(), value: o.label || o.value })),
        key:         initialData.key,
        destination: initialData.destination ?? "",
        sortOrder:   initialData.sortOrder,
        required:    initialData.required,
      };
    }
    return emptyForm(nextSortOrder);
  });

  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const setField = useCallback(<K extends keyof DrawerForm>(k: K, v: DrawerForm[K]) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      // Auto-generate key from label if user hasn't overridden
      if (k === "label" && mode === "create") {
        next.key = slugify(v as string);
      }
      return next;
    });
  }, [mode]);

  function addOption() {
    setForm(f => ({ ...f, options: [...f.options, { tempId: nextTempId(), value: "" }] }));
  }

  function updateOption(tempId: number, value: string) {
    setForm(f => ({
      ...f,
      options: f.options.map(o => o.tempId === tempId ? { ...o, value } : o),
    }));
  }

  function removeOption(tempId: number) {
    setForm(f => ({ ...f, options: f.options.filter(o => o.tempId !== tempId) }));
  }

  async function handleSave() {
    if (!form.label.trim()) { setError("El nombre es obligatorio"); return; }

    const key = form.key.trim() || slugify(form.label);
    if (!key) { setError("No se pudo generar una clave del nombre. Usa letras o números."); return; }

    const options = needsOptions(form.type)
      ? form.options
          .filter(o => o.value.trim())
          .map((o, i) => ({ value: slugify(o.value) || o.value.trim(), label: o.value.trim(), sortOrder: i }))
      : [];

    setSaving(true);
    setError(null);

    try {
      let res: Response;

      if (mode === "create") {
        res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/attribute-definitions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            key,
            label:       form.label.trim(),
            type:        form.type,
            required:    form.required,
            sortOrder:   form.sortOrder,
            helpText:    form.helpText.trim() || null,
            destination: form.destination.trim() || null,
            options,
          }),
        });
      } else {
        res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/attribute-definitions/${initialData!.id}`,
          {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              label:       form.label.trim(),
              required:    form.required,
              sortOrder:   form.sortOrder,
              helpText:    form.helpText.trim() || null,
              destination: form.destination.trim() || null,
              options,
            }),
          },
        );
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" })) as { error: string };
        throw new Error(data.error);
      }

      const data = await res.json() as { definition: DefinitionData };
      onSuccess(data.definition);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <MSDrawer onClose={onClose} width="clamp(400px, 36vw, 560px)">
      {/* ── Drawer header ── */}
      <div style={{
        padding:      `${S[4]}px ${S[5]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        borderTop:    `3px solid ${DOMAIN.primary}`,
        background:   C.white,
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.base,
            fontWeight:    T.wt.bold,
            color:         C.ink,
            letterSpacing: "-0.01em",
          }}>
            {isEdit ? "Editar atributo" : "Nuevo atributo"}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
            {isEdit
              ? "Modifica el nombre, descripción y valores"
              : "Define una característica reutilizable para tus productos"}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: S[1], color: C.inkLight, borderRadius: R.sm,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      {/* ── Scrollable form body ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: S[5] }}>

        {/* Nombre */}
        <Field label="Nombre del atributo" required>
          <input
            value={form.label}
            onChange={e => setField("label", e.target.value)}
            placeholder="Ej: Talla, Color, Material, Edad recomendada"
            style={inputSt}
            autoFocus
          />
        </Field>

        {/* Descripción */}
        <Field label="Descripción" hint="opcional">
          <input
            value={form.helpText}
            onChange={e => setField("helpText", e.target.value)}
            placeholder="Ej: Talla según tabla de medidas Europa"
            style={inputSt}
          />
        </Field>

        {/* Tipo — solo en creación; inmutable después */}
        {!isEdit && (
          <Field label="Tipo de atributo">
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {PRIMARY_TYPES.map(t => {
                const active = form.type === t.value;
                return (
                  <label key={t.value} style={{
                    display:    "flex",
                    alignItems: "center",
                    gap:        S[2],
                    padding:    `${S[2]}px ${S[3]}px`,
                    borderRadius: R.md,
                    border:     `1px solid ${active ? DOMAIN.primary : C.line}`,
                    background: active ? DOMAIN.iconBg : C.white,
                    cursor:     "pointer",
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${active ? DOMAIN.primary : C.line}`,
                      background: active ? DOMAIN.primary : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.white }} />}
                    </div>
                    <input
                      type="radio"
                      name="attr-type"
                      value={t.value}
                      checked={active}
                      onChange={() => setField("type", t.value)}
                      style={{ display: "none" }}
                    />
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      fontWeight: active ? T.wt.semibold : T.wt.normal,
                      color:      active ? DOMAIN.primary : C.inkMid,
                    }}>
                      {t.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
        )}
        {isEdit && (
          <Field label="Tipo de atributo">
            <div style={{
              padding: `${S[2]}px ${S[3]}px`,
              background: C.surface, border: `1px solid ${C.line}`,
              borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
            }}>
              {BUSINESS_TYPE_LABELS[form.type] ?? form.type}
              <span style={{ marginLeft: S[2], fontSize: 9, color: C.inkGhost }}>· no modificable</span>
            </div>
          </Field>
        )}

        {/* Valores — only for list types */}
        {needsOptions(form.type) && (
          <Field label="Valores disponibles">
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {form.options.map(opt => (
                <div key={opt.tempId} style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                  <input
                    value={opt.value}
                    onChange={e => updateOption(opt.tempId, e.target.value)}
                    placeholder="Ej: XL"
                    style={{ ...inputSt, flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); addOption(); }
                    }}
                  />
                  <button
                    onClick={() => removeOption(opt.tempId)}
                    style={{
                      flexShrink: 0, background: "none", border: "none",
                      cursor: "pointer", color: C.inkFaint, padding: 4,
                      display: "flex", alignItems: "center",
                    }}
                    aria-label="Eliminar valor"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
              <button
                onClick={addOption}
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: DOMAIN.primary,
                  background: "none", border: "none", cursor: "pointer",
                  padding: "4px 0", textAlign: "left" as const,
                }}
              >
                + Agregar valor
              </button>
            </div>
          </Field>
        )}

        {/* Advanced section — collapsed by default */}
        <div style={{ marginTop: S[4] }}>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: S[1],
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            {showAdvanced ? <ChevronUp size={12} strokeWidth={1.8} /> : <ChevronDown size={12} strokeWidth={1.8} />}
            Configuración avanzada
          </button>

          {showAdvanced && (
            <div style={{
              marginTop: S[3], padding: S[4],
              background: C.surface, border: `1px solid ${C.line}`,
              borderRadius: R.md, display: "flex", flexDirection: "column" as const, gap: S[3],
            }}>
              <Field label="Clave interna">
                <input
                  value={form.key}
                  onChange={e => setField("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  placeholder="auto-generada del nombre"
                  style={inputSt}
                  disabled={isEdit}
                />
                {!isEdit && (
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, marginTop: 3 }}>
                    Se genera automáticamente del nombre. Usa solo letras, números y guiones bajos.
                  </div>
                )}
              </Field>
              <Field label="Canal (vacío = todos)">
                <input
                  value={form.destination}
                  onChange={e => setField("destination", e.target.value)}
                  placeholder="shopify, crm, catalog…"
                  style={inputSt}
                />
              </Field>
              <Field label="Orden de visualización">
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setField("sortOrder", Number(e.target.value))}
                  style={{ ...inputSt, width: 80 }}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: S[4], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
            background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* ── Drawer footer ── */}
      <div style={{
        flexShrink:  0,
        padding:     `${S[3]}px ${S[5]}px`,
        borderTop:   `1px solid ${C.line}`,
        background:  C.white,
        display:     "flex",
        gap:         S[2],
        alignItems:  "center",
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            fontWeight:  T.wt.bold,
            color:       "#fff",
            background:  saving ? C.inkFaint : MS_CTA.primaryButtonBg,
            border:      "none",
            borderRadius:R.md,
            padding:     `${S[2]}px ${S[4]}px`,
            cursor:      saving ? "not-allowed" : "pointer",
            boxShadow:   saving ? "none" : MS_CTA.primaryBoxShadow,
          }}
        >
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear atributo"}
        </button>
        <button
          onClick={onClose}
          style={{
            fontFamily:  T.mono, fontSize: T.sz.xs,
            color:       C.inkMid, background: C.surface,
            border:      `1px solid ${C.line}`, borderRadius: R.md,
            padding:     `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </MSDrawer>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type DrawerState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; def: DefinitionData };

export function AttributeDefinitionsClient({
  orgSlug,
  initialDefinitions,
}: AttributeDefinitionsClientProps) {
  const [definitions, setDefinitions] = useState<DefinitionData[]>(initialDefinitions);
  const [drawer,      setDrawer]      = useState<DrawerState>({ open: false });
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreate() { setDrawer({ open: true, mode: "create" }); }

  function openEdit(def: DefinitionData) { setDrawer({ open: true, mode: "edit", def }); }

  function closeDrawer() { setDrawer({ open: false }); }

  function handleSaved(def: DefinitionData) {
    setDefinitions(prev => {
      const idx = prev.findIndex(d => d.id === def.id);
      return idx >= 0 ? prev.map(d => d.id === def.id ? def : d) : [...prev, def];
    });
    setDrawer({ open: false });
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setGlobalError(null);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/attribute-definitions/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error al eliminar el atributo");
      setDefinitions(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(null);
    }
  }

  async function handleDuplicate(def: DefinitionData) {
    const newKey    = `${def.key}_copia`;
    const newLabel  = `${def.label} (copia)`;
    setGlobalError(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/attribute-definitions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          key:         newKey,
          label:       newLabel,
          type:        def.type,
          required:    def.required,
          sortOrder:   definitions.length,
          helpText:    def.helpText,
          destination: def.destination,
          options:     def.options.map(o => ({ value: o.value, label: o.label, sortOrder: o.sortOrder })),
        }),
      });
      if (!res.ok) throw new Error("No se pudo duplicar");
      const data = await res.json() as { definition: DefinitionData };
      setDefinitions(prev => [...prev, data.definition]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al duplicar");
    }
  }

  async function handleCreatePreset(preset: Preset) {
    setGlobalError(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/attribute-definitions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          key:      preset.key,
          label:    preset.label,
          type:     preset.type,
          required: false,
          sortOrder:definitions.length,
          helpText: null,
          destination: null,
          options:  preset.options.map((v, i) => ({ value: slugify(v), label: v, sortOrder: i })),
        }),
      });
      if (!res.ok) throw new Error("No se pudo crear el atributo");
      const data = await res.json() as { definition: DefinitionData };
      setDefinitions(prev => [...prev, data.definition]);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error");
    }
  }

  // ── Which presets haven't been created yet ────────────────────────────────
  const existingKeys = new Set(definitions.map(d => d.key));
  const availablePresets = CASTILLITOS_PRESETS.filter(p => !existingKeys.has(p.key));

  const nextSortOrder = definitions.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Global error ── */}
      {globalError && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
          background: C.redLight, border: `1px solid ${C.redBorder}`,
          borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[4],
        }}>
          {globalError}
          <button
            onClick={() => setGlobalError(null)}
            style={{ marginLeft: S[2], background: "none", border: "none",
              cursor: "pointer", color: C.red, fontFamily: T.mono, fontSize: T.sz["2xs"] }}
          >✕</button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[5],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
          {definitions.length === 0
            ? "Sin atributos creados"
            : `${definitions.length} atributo${definitions.length !== 1 ? "s" : ""} disponible${definitions.length !== 1 ? "s" : ""}`}
        </div>
        <button
          onClick={openCreate}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.bold,
            color:        "#fff",
            background:   MS_CTA.primaryButtonBg,
            border:       "none",
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[4]}px`,
            cursor:       "pointer",
            boxShadow:    MS_CTA.primaryBoxShadow,
          }}
        >
          + Nuevo atributo
        </button>
      </div>

      {/* ── Empty state ── */}
      {definitions.length === 0 && (
        <div style={{
          padding:    "48px 24px",
          textAlign:  "center" as const,
          background: C.surface,
          border:     `1px dashed ${C.line}`,
          borderRadius: R.md,
          marginBottom: S[6],
        }}>
          <div style={{
            fontFamily:  T.mono, fontSize: T.sz.sm,
            fontWeight:  T.wt.semibold, color: C.inkMid, marginBottom: S[2],
          }}>
            Aún no has creado atributos reutilizables
          </div>
          <div style={{
            fontFamily:  T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            maxWidth: 380, margin: "0 auto", marginBottom: S[5], lineHeight: 1.6,
          }}>
            Los atributos permiten reutilizar tallas, colores, materiales y otras características entre todos tus productos.
          </div>
          <button
            onClick={openCreate}
            style={{
              fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
              color:        "#fff", background: MS_CTA.primaryButtonBg,
              border:       "none", borderRadius: R.md,
              padding:      `${S[2]}px ${S[5]}px`,
              cursor:       "pointer", boxShadow: MS_CTA.primaryBoxShadow,
            }}
          >
            Crear primer atributo
          </button>
        </div>
      )}

      {/* ── Preset suggestions ── */}
      {availablePresets.length > 0 && (
        <div style={{ marginBottom: S[5] }}>
          <div style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.06em", marginBottom: S[2],
          }}>
            Atributos frecuentes — agregar rápidamente
          </div>
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
            {availablePresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => handleCreatePreset(preset)}
                style={{
                  fontFamily:   T.mono, fontSize: T.sz.xs,
                  fontWeight:   T.wt.semibold,
                  color:        DOMAIN.primary,
                  background:   DOMAIN.iconBg,
                  border:       `1px solid ${DOMAIN.primary}33`,
                  borderRadius: R.pill,
                  padding:      `${S[1]}px ${S[3]}px`,
                  cursor:       "pointer",
                }}
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Attribute grid ── */}
      {definitions.length > 0 && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap:                 S[4],
        }}>
          {definitions.map(def => (
            <AttributeCard
              key={def.id}
              def={def}
              deleting={deleting === def.id}
              onEdit={() => openEdit(def)}
              onDuplicate={() => handleDuplicate(def)}
              onDelete={() => handleDelete(def.id)}
            />
          ))}
        </div>
      )}

      {/* ── Drawer ── */}
      {drawer.open && (
        <AttributeDrawer
          mode={drawer.mode}
          initialData={drawer.mode === "edit" ? drawer.def : undefined}
          orgSlug={orgSlug}
          nextSortOrder={nextSortOrder}
          onSuccess={handleSaved}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

// ── Shared micro-components ────────────────────────────────────────────────────

function Field({
  label, hint, required, children,
}: {
  label:     string;
  hint?:     string;
  required?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.bold,
        color:         C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.06em", marginBottom: S[1],
        display:       "flex", gap: S[1], alignItems: "center",
      }}>
        {label}
        {required && <span style={{ color: C.red }}>*</span>}
        {hint && <span style={{ fontWeight: T.wt.normal, color: C.inkGhost }}>· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  color:        C.ink,
  background:   C.white,
  border:       `1px solid ${C.line}`,
  borderRadius: R.sm,
  padding:      `${S[2]}px ${S[3]}px`,
  outline:      "none",
  width:        "100%",
  boxSizing:    "border-box" as const,
};

const actionBtn: React.CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          4,
  fontFamily:   T.mono,
  fontSize:     9,
  fontWeight:   T.wt.semibold,
  color:        C.inkMid,
  background:   "none",
  border:       "none",
  cursor:       "pointer",
  padding:      "2px 4px",
  borderRadius: R.sm,
};
