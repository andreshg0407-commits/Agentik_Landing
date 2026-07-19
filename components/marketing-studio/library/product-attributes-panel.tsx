/**
 * components/marketing-studio/library/product-attributes-panel.tsx
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
 *
 * Inline attribute viewer + editor for a ProductEntity.
 * Used inside ProductDetailDrawer (block 6 — Atributos).
 *
 * ── Data flow ──────────────────────────────────────────────────────────────────
 *   - `attributes` comes from the lazy-loaded detail response
 *   - `definitions` comes from GET /api/orgs/{slug}/marketing-studio/attribute-definitions
 *   - Editing calls PATCH /api/orgs/{slug}/marketing-studio/products/{id}/attributes
 *
 * ── Design rules ───────────────────────────────────────────────────────────────
 *   - T.mono for ALL operational data
 *   - C.* / S.* / R.* only — no raw hex
 *   - MS_PALETTE.product for domain color
 */

"use client";

import { useState, useEffect } from "react";
import { Pencil, Check, X, Plus } from "lucide-react";
import { C, T, S, R }             from "@/lib/ui/tokens";
import { MS_PALETTE }             from "@/lib/marketing-studio/ms-design-system";

const DOMAIN = MS_PALETTE.product;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AttributeRow {
  key:          string;
  label:        string;
  valueText:    string | null;
  valueNumber:  number | null;
  valueBoolean: boolean | null;
  valueJson:    string[] | null;
  type:         string;
  destination:  string | null;
}

export interface DefinitionRow {
  id:          string;
  key:         string;
  label:       string;
  type:        string;
  required:    boolean;
  helpText:    string | null;
  destination: string | null;
  options:     { value: string; label: string }[];
}

interface ProductAttributesPanelProps {
  orgSlug:        string;
  productId:      string;
  attributes:     AttributeRow[];
  onSaved?:       () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function displayValue(attr: AttributeRow): string {
  if (attr.type === "boolean") {
    return attr.valueBoolean === true  ? "Sí"
         : attr.valueBoolean === false ? "No"
         : "—";
  }
  if (attr.type === "number") {
    return attr.valueNumber !== null ? String(attr.valueNumber) : "—";
  }
  if (attr.type === "multiselect") {
    return attr.valueJson && attr.valueJson.length > 0 ? attr.valueJson.join(", ") : "—";
  }
  return attr.valueText || "—";
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ProductAttributesPanel({
  orgSlug,
  productId,
  attributes,
  onSaved,
}: ProductAttributesPanelProps) {
  const [rows,        setRows]        = useState<AttributeRow[]>(attributes);
  const [definitions, setDefinitions] = useState<DefinitionRow[]>([]);
  const [defsLoading, setDefsLoading] = useState(true);
  const [editingKey,  setEditingKey]  = useState<string | null>(null);
  const [editValue,   setEditValue]   = useState<string>("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Sync incoming attributes changes (e.g. after parent re-fetches)
  useEffect(() => { setRows(attributes); }, [attributes]);

  // Fetch definitions for this org
  useEffect(() => {
    let cancelled = false;
    setDefsLoading(true);
    fetch(`/api/orgs/${orgSlug}/marketing-studio/attribute-definitions`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { definitions: DefinitionRow[] } | null) => {
        if (!cancelled && data) setDefinitions(data.definitions);
      })
      .catch(() => {/* silent — can edit even without definitions */})
      .finally(() => { if (!cancelled) setDefsLoading(false); });
    return () => { cancelled = true; };
  }, [orgSlug]);

  function startEdit(attr: AttributeRow) {
    setEditingKey(attr.key);
    setEditValue(attr.type === "boolean"
      ? (attr.valueBoolean === true ? "true" : attr.valueBoolean === false ? "false" : "")
      : attr.type === "number"
      ? (attr.valueNumber !== null ? String(attr.valueNumber) : "")
      : attr.type === "multiselect"
      ? (attr.valueJson?.join(", ") ?? "")
      : (attr.valueText ?? "")
    );
    setError(null);
  }

  async function saveEdit(attr: AttributeRow) {
    setSaving(true);
    setError(null);
    try {
      let value: string | number | boolean | string[] | null;
      if (attr.type === "boolean") {
        value = editValue === "true" ? true : editValue === "false" ? false : null;
      } else if (attr.type === "number") {
        value = editValue === "" ? null : Number(editValue);
      } else if (attr.type === "multiselect") {
        value = editValue.split(",").map(s => s.trim()).filter(Boolean);
      } else {
        value = editValue || null;
      }

      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/products/${productId}/attributes`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ key: attr.key, label: attr.label, value, type: attr.type, destination: attr.destination }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" })) as { error: string };
        throw new Error(data.error);
      }

      // Optimistically update local row
      setRows(prev => prev.map(r => {
        if (r.key !== attr.key) return r;
        if (attr.type === "boolean") {
          return { ...r, valueBoolean: value as boolean | null };
        } else if (attr.type === "number") {
          return { ...r, valueNumber: value as number | null };
        } else if (attr.type === "multiselect") {
          return { ...r, valueJson: value as string[] | null };
        } else {
          return { ...r, valueText: value as string | null };
        }
      }));

      setEditingKey(null);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  // Find definitions that don't have a value yet (available to add)
  const existingKeys = new Set(rows.map(r => r.key));
  const addableDefinitions = definitions.filter(d => !existingKeys.has(d.key));

  async function addFromDefinition(def: DefinitionRow) {
    const newRow: AttributeRow = {
      key:          def.key,
      label:        def.label,
      valueText:    null,
      valueNumber:  null,
      valueBoolean: null,
      valueJson:    null,
      type:         def.type,
      destination:  def.destination,
    };
    setRows(prev => [...prev, newRow]);
    setTimeout(() => startEdit(newRow), 50);
  }

  if (rows.length === 0 && definitions.length === 0 && !defsLoading) {
    return (
      <EmptyAttributesState orgSlug={orgSlug} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      {/* Attribute rows */}
      {rows.map(attr => {
        const isEditing = editingKey === attr.key;
        const def = definitions.find(d => d.key === attr.key);

        return (
          <div
            key={attr.key}
            style={{
              border:       `1px solid ${isEditing ? DOMAIN.primary + "66" : C.line}`,
              borderRadius: R.md,
              background:   isEditing ? DOMAIN.cardBg : C.surface,
              overflow:     "hidden",
              transition:   "border-color 0.12s, background 0.12s",
            }}
          >
            {/* Header row */}
            <div style={{
              display:    "flex",
              alignItems: "center",
              gap:        S[2],
              padding:    `${S[2]}px ${S[3]}px`,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                  {attr.label}
                  {attr.destination && (
                    <span style={{ marginLeft: 6, color: DOMAIN.primary, fontWeight: T.wt.medium }}>
                      · {attr.destination}
                    </span>
                  )}
                </div>
                {!isEditing && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, marginTop: 2 }}>
                    {displayValue(attr)}
                  </div>
                )}
              </div>

              {/* Type badge */}
              <span style={{
                fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
                color: C.inkFaint, background: C.surface,
                border: `1px solid ${C.line}`, borderRadius: R.pill,
                padding: "2px 6px", letterSpacing: "0.04em",
                whiteSpace: "nowrap" as const,
              }}>
                {attr.type}
              </span>

              {/* Edit / save / cancel buttons */}
              {!isEditing ? (
                <button
                  onClick={() => startEdit(attr)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, border: `1px solid ${C.line}`,
                    borderRadius: R.sm, background: C.surface, cursor: "pointer",
                    color: C.inkMid, flexShrink: 0,
                  }}
                  aria-label={`Editar ${attr.label}`}
                >
                  <Pencil size={11} strokeWidth={1.8} />
                </button>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => saveEdit(attr)}
                    disabled={saving}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24,
                      border: "none", borderRadius: R.sm,
                      background: saving ? C.line : DOMAIN.primary,
                      color: "#fff", cursor: saving ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                    aria-label="Guardar"
                  >
                    <Check size={11} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24,
                      border: `1px solid ${C.line}`, borderRadius: R.sm,
                      background: C.surface, cursor: "pointer",
                      color: C.inkMid, flexShrink: 0,
                    }}
                    aria-label="Cancelar"
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            {/* Edit input */}
            {isEditing && (
              <div style={{ padding: `0 ${S[3]}px ${S[3]}px` }}>
                <EditField
                  type={attr.type}
                  value={editValue}
                  onChange={setEditValue}
                  options={def?.options}
                />
                {error && (
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: C.red, marginTop: S[1] }}>
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Help text */}
            {def?.helpText && !isEditing && (
              <div style={{
                fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
                padding: `0 ${S[3]}px ${S[2]}px`,
              }}>
                {def.helpText}
              </div>
            )}
          </div>
        );
      })}

      {/* Add attribute from definition catalog */}
      {!defsLoading && addableDefinitions.length > 0 && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, color: C.inkFaint, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: S[2] }}>
            Agregar atributo
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] }}>
            {addableDefinitions.map(def => (
              <button
                key={def.key}
                onClick={() => addFromDefinition(def)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.medium,
                  color: DOMAIN.primary,
                  background: DOMAIN.cardBg,
                  border: `1px solid ${DOMAIN.primary}44`,
                  borderRadius: R.pill,
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                <Plus size={9} strokeWidth={2.4} />
                {def.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit field by type ─────────────────────────────────────────────────────────

function EditField({
  type,
  value,
  onChange,
  options,
}: {
  type:     string;
  value:    string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[];
}) {
  const inputBase: React.CSSProperties = {
    fontFamily:   T.mono,
    fontSize:     T.sz["2xs"],
    color:        C.ink,
    background:   "#fff",
    border:       `1px solid ${C.line}`,
    borderRadius: R.sm,
    padding:      `${S[1]}px ${S[2]}px`,
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box" as const,
  };

  if (type === "boolean") {
    return (
      <div style={{ display: "flex", gap: S[2] }}>
        {(["true", "false"] as const).map(v => (
          <button
            key={v}
            onClick={() => onChange(value === v ? "" : v)}
            style={{
              fontFamily:   T.mono,
              fontSize:     10,
              fontWeight:   value === v ? T.wt.bold : T.wt.medium,
              color:        value === v ? "#fff" : C.inkMid,
              background:   value === v ? C.blueDark : C.surface,
              border:       `1px solid ${value === v ? C.blueDark : C.line}`,
              borderRadius: R.sm,
              padding:      "5px 14px",
              cursor:       "pointer",
            }}
          >
            {v === "true" ? "Sí" : "No"}
          </button>
        ))}
      </div>
    );
  }

  if (type === "select" && options && options.length > 0) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputBase}
      >
        <option value="">— Seleccionar —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={inputBase}
      />
    );
  }

  // text, dimension, color, multiselect (comma-separated), fallback
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={type === "multiselect" ? "Valores separados por comas" : type === "color" ? "#000000" : ""}
      style={inputBase}
    />
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyAttributesState({ orgSlug }: { orgSlug: string }) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      alignItems:    "center",
      gap:           S[3],
      padding:       "28px 0",
      textAlign:     "center" as const,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
        Esta referencia no tiene atributos registrados.
      </div>
      <a
        href={`/${orgSlug}/agentik/marketing-studio/biblioteca/atributos`}
        style={{
          fontFamily:     T.mono,
          fontSize:       "11px",
          fontWeight:     T.wt.semibold,
          color:          C.blueDark,
          background:     C.blueLight,
          border:         `1px solid ${C.blueBorder}`,
          borderRadius:   R.sm,
          padding:        "5px 12px",
          textDecoration: "none",
        }}
      >
        Configurar atributos →
      </a>
    </div>
  );
}
