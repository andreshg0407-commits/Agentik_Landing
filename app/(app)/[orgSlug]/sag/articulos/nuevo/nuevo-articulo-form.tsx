"use client";

/**
 * NuevoArticuloForm — multi-step form for SAG article upsert (tipo 5).
 *
 * Phases:
 *   form       → operator fills fields (5 sections)
 *   previewing → POST /preview-articulo in-flight
 *   preview    → shows normalized payload + XML; if valid enables "Crear operación"
 *   submitting → POST /sag/write in-flight
 *   error      → shows error, allows back to form or preview
 *
 * SAG upserts on CODIGO: sending an existing code updates the record.
 * The form pre-labels the action as "Actualizar artículo SAG" if the user
 * indicates the code already exists (checkbox).
 */

import { useState, useCallback } from "react";
import { useRouter }              from "next/navigation";
import type { ArticuloFormData }   from "@/lib/sag/articulos/normalizer";
import type { SagProductInput }    from "@/lib/sag/write/types";
import type { ValidationResult }   from "@/lib/sag/write/types";
import type { MasterValidationResult } from "@/lib/sag/master-validation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
}

interface PreviewResult {
  ok:                boolean;
  normalizedPayload: SagProductInput;
  xml:               string;
  validation:        ValidationResult;
  masterValidation?: MasterValidationResult;
}

type Phase = "form" | "previewing" | "preview" | "submitting" | "error";

// ── Default form state ────────────────────────────────────────────────────────

function emptyForm(): ArticuloFormData {
  return {
    codigo:           "",
    descripcion:      "",
    pv1:              "",
    grupo:            "",
    subGrupo:         "",
    linea:            "",
    marca:            "",
    referencia:       "",
    unidad:           "UND",
    manejaKardex:     "S",
    manejaTallaColor: "N",
    talla:            "",
    color:            "",
    manejaLote:       "N",
    tarifaIVA:        "",
    porcentajeIVA:    "19",
    costo:            "",
    incluidoIVA:      "N",
    composicion:      "N",
    adquisicion:      "",
    tiendaVirtual:    "N",
    activo:           "S",
    bloqueado:        "N",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 12, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.05em", color: "#6b7280",
      margin: "24px 0 12px", borderBottom: "1px solid #f3f4f6", paddingBottom: 6,
    }}>
      {children}
    </h3>
  );
}

function Field({
  label, required: req, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
        {label}{req && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 10px",
  border: "1px solid #d1d5db", borderRadius: 5,
  fontFamily: "inherit", background: "#fff", color: "#111827",
  width: "100%", boxSizing: "border-box",
};

function TextInput({
  name, value, onChange, placeholder, type = "text", mono,
}: {
  name: keyof ArticuloFormData; value: string;
  onChange: (n: keyof ArticuloFormData, v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(name, e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, fontFamily: mono ? "monospace" : "inherit" }}
    />
  );
}

function Select({
  name, value, onChange, children,
}: {
  name: keyof ArticuloFormData; value: string;
  onChange: (n: keyof ArticuloFormData, v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={e => onChange(name, e.target.value)} style={inputStyle}>
      {children}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevoArticuloForm({ orgSlug }: Props) {
  const router = useRouter();

  const [form,    setForm]    = useState<ArticuloFormData>(emptyForm);
  const [isUpdate, setIsUpdate] = useState(false);
  const [phase,   setPhase]   = useState<Phase>("form");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const set = useCallback(
    (name: keyof ArticuloFormData, value: string) =>
      setForm(prev => ({ ...prev, [name]: value })),
    [],
  );

  // ── Preview call ──────────────────────────────────────────────────────────

  async function handlePreview() {
    setPhase("previewing");
    setError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/sag/write/preview-articulo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ formData: form }),
      });
      const data = await res.json() as PreviewResult;
      if (!res.ok) {
        setPhase("error");
        setError((data as { error?: string }).error ?? "Error en la vista previa.");
        return;
      }
      setPreview(data);
      setPhase("preview");
    } catch (e) {
      setPhase("error");
      setError((e as Error).message);
    }
  }

  // ── Enqueue call ──────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!preview?.normalizedPayload) return;
    setPhase("submitting");
    setError(null);

    const codigo      = preview.normalizedPayload.CODIGO;
    const descripcion = preview.normalizedPayload.DESCRIPCION;
    const description = isUpdate
      ? `Actualizar artículo "${descripcion}" (${codigo}) en SAG`
      : `Crear artículo "${descripcion}" (${codigo}) en SAG`;

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/sag/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input:       { type: 5, payload: preview.normalizedPayload },
          description,
          sourceRef:   `articulo:${codigo}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase("error");
        setError(data?.error ?? "Error al crear la operación.");
        return;
      }
      router.push(`/${orgSlug}/sag/write/${data.operationId}`);
    } catch (e) {
      setPhase("error");
      setError((e as Error).message);
    }
  }

  const isLoading = phase === "previewing" || phase === "submitting";

  // ── Error ─────────────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div style={{
        padding: "18px 20px", borderRadius: 8, maxWidth: 600,
        background: "#fef2f2", border: "1px solid #fecaca",
      }}>
        <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>Error</div>
        <div style={{ fontSize: 13, color: "#7f1d1d" }}>{error}</div>
        <button
          onClick={() => { setPhase(preview ? "preview" : "form"); setError(null); }}
          style={{
            marginTop: 12, fontSize: 12, cursor: "pointer", padding: "4px 14px",
            border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151",
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>

      {/* ── FORM ─────────────────────────────────────────────────────────── */}
      <div style={{ display: (phase === "preview" || phase === "submitting") ? "none" : "block" }}>

        {/* Existing article toggle */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600, color: "#374151",
          marginBottom: 20, cursor: "pointer",
          padding: "8px 14px", borderRadius: 6,
          border: `1px solid ${isUpdate ? "#1d4ed8" : "#d1d5db"}`,
          background: isUpdate ? "#eff6ff" : "#f9fafb",
        }}>
          <input
            type="checkbox"
            checked={isUpdate}
            onChange={e => setIsUpdate(e.target.checked)}
            style={{ width: 14, height: 14 }}
          />
          {isUpdate
            ? "Actualizar artículo existente en SAG"
            : "Crear artículo nuevo en SAG"}
        </label>

        {/* ── Section 1: Identificación ─────────────────────────────────── */}
        <SectionTitle>1. Identificación del artículo</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Código SAG" required hint="Exactamente como aparece en SAG. Upsert por este campo.">
            <TextInput name="codigo" value={form.codigo} onChange={set}
              placeholder="ej. PRD001" mono />
          </Field>

          <Field label="Referencia / SKU" hint="Código externo, barcode o SKU del catálogo">
            <TextInput name="referencia" value={form.referencia} onChange={set}
              placeholder="ej. SKU-12345" mono />
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Descripción" required>
              <TextInput name="descripcion" value={form.descripcion} onChange={set}
                placeholder="ej. CAMISA POLO MANGA CORTA AZUL" />
            </Field>
          </div>

        </div>{/* end grid Section 1 */}

        {/* ── Section 2: Clasificación ──────────────────────────────────── */}
        <SectionTitle>2. Clasificación</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Grupo">
            <TextInput name="grupo" value={form.grupo} onChange={set}
              placeholder="ej. ROPA" />
          </Field>

          <Field label="Subgrupo">
            <TextInput name="subGrupo" value={form.subGrupo} onChange={set}
              placeholder="ej. CAMISAS" />
          </Field>

          <Field label="Línea de producto">
            <TextInput name="linea" value={form.linea} onChange={set}
              placeholder="ej. CABALLERO" />
          </Field>

          <Field label="Marca">
            <TextInput name="marca" value={form.marca} onChange={set}
              placeholder="ej. POLO" />
          </Field>
        </div>

        {/* ── Section 3: Logística ──────────────────────────────────────── */}
        <SectionTitle>3. Logística e inventario</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Unidad de medida" required>
            <Select name="unidad" value={form.unidad} onChange={set}>
              <option value="UND">UND — Unidad</option>
              <option value="KG">KG — Kilogramo</option>
              <option value="LT">LT — Litro</option>
              <option value="MT">MT — Metro</option>
              <option value="CJ">CJ — Caja</option>
              <option value="BOL">BOL — Bolsa</option>
              <option value="PAR">PAR — Par</option>
              <option value="DOC">DOC — Docena</option>
            </Select>
          </Field>

          <Field label="Maneja Kardex (inventario)">
            <Select name="manejaKardex" value={form.manejaKardex} onChange={set}>
              <option value="S">S — Sí maneja inventario</option>
              <option value="N">N — No maneja inventario</option>
            </Select>
          </Field>

          <Field label="Maneja Talla y Color">
            <Select name="manejaTallaColor" value={form.manejaTallaColor} onChange={set}>
              <option value="N">N — No</option>
              <option value="S">S — Sí (habilita campos talla/color)</option>
            </Select>
          </Field>

          {form.manejaTallaColor === "S" && (
            <>
              <Field label="Talla">
                <TextInput name="talla" value={form.talla} onChange={set}
                  placeholder="ej. M, XL, 42" />
              </Field>
              <Field label="Color">
                <TextInput name="color" value={form.color} onChange={set}
                  placeholder="ej. AZUL, ROJO" />
              </Field>
            </>
          )}

          <Field label="Composición / Kit">
            <Select name="composicion" value={form.composicion} onChange={set}>
              <option value="N">N — Artículo simple</option>
              <option value="S">S — Es un kit o composición</option>
            </Select>
          </Field>

          <Field label="Adquisición">
            <TextInput name="adquisicion" value={form.adquisicion} onChange={set}
              placeholder="ej. COMPRA, PRODUCCION" />
          </Field>
        </div>

        {/* ── Section 4: Precios e IVA ──────────────────────────────────── */}
        <SectionTitle>4. Precios e impuestos</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Precio de venta (PV1, COP)" required hint="Precio lista 1 — base de referencia">
            <TextInput name="pv1" value={form.pv1} onChange={set}
              type="number" placeholder="ej. 50000" />
          </Field>

          <Field label="Costo (COP)">
            <TextInput name="costo" value={form.costo} onChange={set}
              type="number" placeholder="ej. 35000" />
          </Field>

          <Field label="Tarifa IVA" hint="Código SAG de la tarifa (ej. IVA19, IVA5, IVA0)">
            <Select name="tarifaIVA" value={form.tarifaIVA} onChange={set}>
              <option value="">— Sin especificar —</option>
              <option value="IVA19">IVA19 — 19%</option>
              <option value="IVA5">IVA5 — 5%</option>
              <option value="IVA0">IVA0 — 0% / Exento</option>
              <option value="IVA_EX">IVA_EX — Excluido</option>
            </Select>
          </Field>

          <Field label="Porcentaje IVA">
            <Select name="porcentajeIVA" value={form.porcentajeIVA} onChange={set}>
              <option value="19">19%</option>
              <option value="5">5%</option>
              <option value="0">0% / Exento</option>
            </Select>
          </Field>

          <Field label="Precio incluye IVA">
            <Select name="incluidoIVA" value={form.incluidoIVA} onChange={set}>
              <option value="N">N — Precio sin IVA</option>
              <option value="S">S — Precio ya incluye IVA</option>
            </Select>
          </Field>

          <Field label="Disponible en tienda virtual">
            <Select name="tiendaVirtual" value={form.tiendaVirtual} onChange={set}>
              <option value="N">N — Solo venta presencial</option>
              <option value="S">S — Disponible en e-commerce</option>
            </Select>
          </Field>
        </div>

        {/* ── Section 5: Estado ──────────────────────────────────────────── */}
        <SectionTitle>5. Estado</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Activo en SAG" required>
            <Select name="activo" value={form.activo} onChange={set}>
              <option value="S">S — Activo</option>
              <option value="N">N — Inactivo</option>
            </Select>
          </Field>

          <Field label="Bloqueado para nuevas transacciones">
            <Select name="bloqueado" value={form.bloqueado} onChange={set}>
              <option value="N">N — No bloqueado</option>
              <option value="S">S — Bloqueado</option>
            </Select>
          </Field>
        </div>

        {/* ── Fixed defaults ─────────────────────────────────────────────── */}
        <SectionTitle>6. Valores fijos en v1</SectionTitle>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px 12px",
          background: "#f8fafc", borderRadius: 6, padding: "12px 16px", fontSize: 12,
        }}>
          {([
            ["Maneja Lote", "N"],
            ["Incluido IVA", "N"],
          ] as const).map(([label, val]) => (
            <div key={label}>
              <div style={{ color: "#9ca3af", marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 600, color: "#374151", fontFamily: "monospace" }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Preview button ─────────────────────────────────────────────── */}
        <div style={{ marginTop: 28, display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={handlePreview}
            disabled={isLoading}
            style={{
              fontSize: 14, fontWeight: 700, padding: "10px 24px", borderRadius: 6,
              border: "2px solid #1d4ed8", background: "#1d4ed8", color: "#fff",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {phase === "previewing" ? "Generando vista previa…" : "Generar vista previa"}
          </button>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            Se validará el formulario y se mostrará el XML antes de crear la operación.
          </span>
        </div>
      </div>

      {/* ── PREVIEW ──────────────────────────────────────────────────────── */}
      {(phase === "preview" || phase === "submitting") && preview && (
        <div>
          <button
            onClick={() => setPhase("form")}
            style={{
              marginBottom: 20, fontSize: 12, cursor: "pointer", padding: "4px 12px",
              border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151",
            }}
          >
            ← Editar formulario
          </button>

          {/* Validation errors */}
          {!preview.ok && preview.validation.errors.length > 0 && (
            <div style={{
              padding: "14px 16px", borderRadius: 6, marginBottom: 16,
              background: "#fef2f2", border: "1px solid #fecaca",
            }}>
              <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 8, fontSize: 13 }}>
                Errores de validación — corrija antes de continuar
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#7f1d1d" }}>
                {preview.validation.errors.map((e, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>
                    <b>{e.field}:</b> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Master-data warnings */}
          {preview.masterValidation && preview.masterValidation.warnings.length > 0 && (
            <div style={{
              padding: "14px 16px", borderRadius: 6, marginBottom: 16,
              background: "#fffbeb", border: "1px solid #fde68a",
            }}>
              <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 8, fontSize: 13 }}>
                ⚠ {preview.masterValidation.warnings.length} advertencia(s) de datos maestros — pendientes de homologación con SAG Castillitos
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#78350f" }}>
                {preview.masterValidation.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b>{w.field}:</b> {w.message}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 8 }}>
                La operación puede encolarse pero SAG podría rechazarla si los valores no están configurados.
              </div>
            </div>
          )}

          {preview.masterValidation && !preview.masterValidation.safe && preview.masterValidation.errors.length > 0 && (
            <div style={{
              padding: "14px 16px", borderRadius: 6, marginBottom: 16,
              background: "#fef2f2", border: "1px solid #fecaca",
            }}>
              <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 8, fontSize: 13 }}>
                ✗ Error de datos maestros — no se puede encolar hasta corregir
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#7f1d1d" }}>
                {preview.masterValidation.errors.map((e, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>
                    <b>{e.field}:</b> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.ok && (
            <div style={{
              padding: "10px 14px", borderRadius: 6, marginBottom: 16,
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              fontSize: 12, color: "#15803d", fontWeight: 600,
            }}>
              ✓ Validación correcta — el payload es válido para SAG
            </div>
          )}

          {/* Normalized payload */}
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
            Payload normalizado
          </h3>
          <pre style={{
            fontSize: 12, background: "#f8fafc", padding: "12px 16px",
            borderRadius: 6, border: "1px solid #e2e8f0",
            overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 260, overflowY: "auto", marginBottom: 20,
          }}>
            {JSON.stringify(preview.normalizedPayload, null, 2)}
          </pre>

          {/* XML preview */}
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            XML que se enviará a SAG
          </h3>
          <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
            Contenido exacto de <code>a_s_xml</code> en la llamada SOAP <code>insercionSag</code> con tipo=5.
          </p>
          <pre style={{
            fontSize: 12, background: "#f8fafc", padding: "12px 16px",
            borderRadius: 6, border: "1px solid #e2e8f0",
            overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
            maxHeight: 320, overflowY: "auto", marginBottom: 24,
          }}>
            {preview.xml}
          </pre>

          {/* Submit */}
          {preview.ok && (
            <div>
              <div style={{
                padding: "14px 18px", borderRadius: 8, marginBottom: 16,
                background: "#fffbeb", border: "1px solid #fde68a",
              }}>
                <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 4 }}>
                  ⚠ Esta operación creará una solicitud pendiente en la cola de aprobación SAG.
                </div>
                <div style={{ fontSize: 12, color: "#78350f" }}>
                  Un administrador o gerente debe aprobarla para que el envío ocurra.
                  El artículo <b>no se crea ni actualiza en SAG</b> hasta entonces.
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={phase === "submitting"}
                style={{
                  fontSize: 14, fontWeight: 700, padding: "10px 24px", borderRadius: 6,
                  border: "2px solid #15803d", background: "#15803d", color: "#fff",
                  cursor: phase === "submitting" ? "not-allowed" : "pointer",
                  opacity: phase === "submitting" ? 0.5 : 1,
                }}
              >
                {phase === "submitting"
                  ? "Creando operación…"
                  : `Crear operación pendiente (${isUpdate ? "actualizar" : "crear"} artículo)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
