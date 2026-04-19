"use client";

/**
 * NuevoClienteForm — interactive multi-step form for SAG customer upsert.
 *
 * Phases:
 *   form       → user fills fields
 *   previewing → POST /preview in-flight
 *   preview    → shows normalized payload + XML, validation errors or "Crear operación" button
 *   submitting → POST /sag/write in-flight
 *   done       → router.push to detail page
 *   error      → shows error, allows retry
 *
 * No DB write or SAG call happens here.
 * The only DB write is creating a PENDING SagWriteOperation via the existing enqueue API.
 */

import { useState, useCallback } from "react";
import { useRouter }              from "next/navigation";
import type { ClienteFormData }       from "@/lib/sag/clientes/normalizer";
import type { SagCustomerInput }      from "@/lib/sag/write/types";
import type { ValidationResult }      from "@/lib/sag/write/types";
import type { MasterValidationResult } from "@/lib/sag/master-validation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prefill {
  nit: string; nombre: string; email: string; telefono: string;
  ciudad: string; departamento: string; direccion: string;
  erpId: string | null; profileId: string;
}

interface Props {
  orgSlug: string;
  prefill: Prefill | null;
}

interface PreviewResult {
  ok:                boolean;
  normalizedPayload: SagCustomerInput;
  xml:               string;
  validation:        ValidationResult;
  masterValidation?: MasterValidationResult;
  existingCustomer:  { id: string; name: string; nit: string | null; erpId: string | null; status: string } | null;
}

type Phase = "form" | "previewing" | "preview" | "submitting" | "error";

// ── Empty form state ──────────────────────────────────────────────────────────

function emptyForm(prefill: Prefill | null): ClienteFormData {
  return {
    tipoDocumento:        "NIT",
    documento:            prefill?.nit             ?? "",
    digitoVerificacion:   "",
    naturaleza:           "J",
    nombre:               prefill?.nombre          ?? "",
    direccion:            prefill?.direccion        ?? "",
    codigoDaneCiudad:     "",
    ciudad:               prefill?.ciudad           ?? "",
    departamento:         prefill?.departamento     ?? "",
    telefonoPpal:         prefill?.telefono         ?? "",
    email:                prefill?.email            ?? "",
    emailFacElectronica:  "",
    tipoTercero:          "",
    tipoCliente:          "",
    zona:                 "",
    nitVendedor:          "",
    formaPago:            "30",
    precioVenta:          "1",
    cupoMaximo:           "",
    diasCredito:          "",
    retenedor:            "N",
    iva:                  "S",
    responsabilidadFiscal:"",
    activo:               "S",
    activoComercial:      "S",
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
      {hint && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</span>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 10px",
  border: "1px solid #d1d5db", borderRadius: 5,
  fontFamily: "inherit", background: "#fff", color: "#111827",
  width: "100%", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle };

function TextInput({
  name, value, onChange, placeholder, type = "text", mono,
}: {
  name: keyof ClienteFormData; value: string;
  onChange: (name: keyof ClienteFormData, value: string) => void;
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
  name: keyof ClienteFormData; value: string;
  onChange: (name: keyof ClienteFormData, value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={e => onChange(name, e.target.value)} style={selectStyle}>
      {children}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevoClienteForm({ orgSlug, prefill }: Props) {
  const router = useRouter();

  const [form,    setForm]    = useState<ClienteFormData>(() => emptyForm(prefill));
  const [phase,   setPhase]   = useState<Phase>("form");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const set = useCallback(
    (name: keyof ClienteFormData, value: string) =>
      setForm(prev => ({ ...prev, [name]: value })),
    [],
  );

  // ── Preview call ──────────────────────────────────────────────────────────

  async function handlePreview() {
    setPhase("previewing");
    setError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/sag/write/preview`, {
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

    const isUpdate   = !!preview.existingCustomer;
    const nombre     = preview.normalizedPayload.NOMBRE;
    const nit        = preview.normalizedPayload.NIT;
    const description = isUpdate
      ? `Actualizar cliente "${nombre}" (NIT ${nit}) en SAG`
      : `Crear cliente "${nombre}" (NIT ${nit}) en SAG`;
    const sourceRef   = prefill?.profileId ?? preview.existingCustomer?.id ?? undefined;

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/sag/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input:       { type: 1, payload: preview.normalizedPayload },
          description,
          sourceRef,
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

  // ── Error recovery ────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <div style={{
        padding: "18px 20px", borderRadius: 8,
        background: "#fef2f2", border: "1px solid #fecaca", maxWidth: 600,
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
      <div style={{ display: phase === "preview" ? "none" : "block" }}>

        {/* ── Identification ────────────────────────────────────────────── */}
        <SectionTitle>1. Identificación</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Tipo de documento" required>
            <Select name="tipoDocumento" value={form.tipoDocumento} onChange={set}>
              <option value="NIT">NIT</option>
              <option value="CC">Cédula de Ciudadanía</option>
              <option value="CE">Cédula de Extranjería</option>
              <option value="PPN">Pasaporte</option>
              <option value="DIE">Documento de Identificación Extranjero</option>
            </Select>
          </Field>

          <Field label="Número de documento (NIT)" required hint="Sin puntos, guiones ni dígito de verificación">
            <TextInput name="documento" value={form.documento} onChange={set}
              placeholder="ej. 900123456" mono />
          </Field>

          <Field label="Dígito de verificación" hint="Solo el dígito (0-9), sin guión">
            <TextInput name="digitoVerificacion" value={form.digitoVerificacion} onChange={set}
              placeholder="ej. 7" />
          </Field>

          <Field label="Naturaleza" required>
            <Select name="naturaleza" value={form.naturaleza} onChange={set}>
              <option value="J">J — Jurídica</option>
              <option value="N">N — Natural</option>
            </Select>
          </Field>
        </div>

        {/* ── Razón social & contacto ───────────────────────────────────── */}
        <SectionTitle>2. Razón Social y Contacto</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Nombre / Razón social" required>
            <TextInput name="nombre" value={form.nombre} onChange={set}
              placeholder="ej. EMPRESA ABC SAS" />
          </Field>

          <Field label="Dirección">
            <TextInput name="direccion" value={form.direccion} onChange={set}
              placeholder="ej. CL 72 # 10-07" />
          </Field>

          <Field label="Código DANE ciudad" hint="5 o 6 dígitos">
            <TextInput name="codigoDaneCiudad" value={form.codigoDaneCiudad} onChange={set}
              placeholder="ej. 11001" mono />
          </Field>

          <Field label="Ciudad">
            <TextInput name="ciudad" value={form.ciudad} onChange={set}
              placeholder="ej. BOGOTA" />
          </Field>

          <Field label="Departamento">
            <TextInput name="departamento" value={form.departamento} onChange={set}
              placeholder="ej. CUNDINAMARCA" />
          </Field>

          <Field label="Teléfono principal">
            <TextInput name="telefonoPpal" value={form.telefonoPpal} onChange={set}
              placeholder="ej. 6017200000" />
          </Field>

          <Field label="Correo electrónico">
            <TextInput name="email" value={form.email} onChange={set}
              type="email" placeholder="ej. contacto@empresa.com" />
          </Field>

          <Field label="Email facturación electrónica">
            <TextInput name="emailFacElectronica" value={form.emailFacElectronica} onChange={set}
              type="email" placeholder="ej. facturas@empresa.com" />
          </Field>
        </div>

        {/* ── Información comercial ─────────────────────────────────────── */}
        <SectionTitle>3. Información Comercial</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Tipo de tercero">
            <TextInput name="tipoTercero" value={form.tipoTercero} onChange={set}
              placeholder="ej. CLI, PROV" />
          </Field>

          <Field label="Tipo de cliente">
            <TextInput name="tipoCliente" value={form.tipoCliente} onChange={set}
              placeholder="ej. MAYORISTA" />
          </Field>

          <Field label="Zona comercial">
            <TextInput name="zona" value={form.zona} onChange={set}
              placeholder="ej. ZONA1" />
          </Field>

          <Field label="NIT del vendedor asignado" hint="Sin puntos ni dígito verificación">
            <TextInput name="nitVendedor" value={form.nitVendedor} onChange={set}
              placeholder="ej. 123456789" mono />
          </Field>

          <Field label="Forma de pago" hint="Código SAG (ej. 1=Contado, 30=30 días)">
            <TextInput name="formaPago" value={form.formaPago} onChange={set}
              placeholder="ej. 30" />
          </Field>

          <Field label="Días de crédito">
            <TextInput name="diasCredito" value={form.diasCredito} onChange={set}
              placeholder="ej. 30" type="number" />
          </Field>

          <Field label="Lista de precio (precioVenta)">
            <TextInput name="precioVenta" value={form.precioVenta} onChange={set}
              placeholder="ej. 1" type="number" />
          </Field>

          <Field label="Cupo máximo de crédito (COP)">
            <TextInput name="cupoMaximo" value={form.cupoMaximo} onChange={set}
              placeholder="ej. 5000000" type="number" />
          </Field>
        </div>

        {/* ── Fiscal ────────────────────────────────────────────────────── */}
        <SectionTitle>4. Información Fiscal</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="¿Es agente retenedor?" required>
            <Select name="retenedor" value={form.retenedor} onChange={set}>
              <option value="N">N — No es retenedor</option>
              <option value="S">S — Sí es retenedor</option>
            </Select>
          </Field>

          <Field label="Responsable de IVA" required>
            <Select name="iva" value={form.iva} onChange={set}>
              <option value="S">S — Responsable de IVA</option>
              <option value="N">N — No responsable</option>
            </Select>
          </Field>

          <Field label="Responsabilidad fiscal DIAN" hint="ej. O-13, O-15, O-23, O-47">
            <TextInput name="responsabilidadFiscal" value={form.responsabilidadFiscal} onChange={set}
              placeholder="ej. O-13" />
          </Field>
        </div>

        {/* ── Estado ────────────────────────────────────────────────────── */}
        <SectionTitle>5. Estado</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>

          <Field label="Activo en SAG" required>
            <Select name="activo" value={form.activo} onChange={set}>
              <option value="S">S — Activo</option>
              <option value="N">N — Inactivo</option>
            </Select>
          </Field>

          <Field label="Activo comercial" required>
            <Select name="activoComercial" value={form.activoComercial} onChange={set}>
              <option value="S">S — Activo comercialmente</option>
              <option value="N">N — Inactivo comercialmente</option>
            </Select>
          </Field>
        </div>

        {/* ── Fixed defaults ─────────────────────────────────────────────── */}
        <SectionTitle>6. Valores predeterminados (fijos en v1)</SectionTitle>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px 12px",
          background: "#f8fafc", borderRadius: 6, padding: "12px 16px", fontSize: 12,
        }}>
          {[
            ["Activo fijo",        "N"],
            ["Comisión ventas",    "0"],
            ["Comisión cobros",    "0"],
            ["Descuento general",  "0%"],
            ["Descuento pronto pago", "0%"],
          ].map(([label, val]) => (
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

          {/* Back to form */}
          <button
            onClick={() => setPhase("form")}
            style={{
              marginBottom: 20, fontSize: 12, cursor: "pointer", padding: "4px 12px",
              border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", color: "#374151",
            }}
          >
            ← Editar formulario
          </button>

          {/* Existing customer banner */}
          {preview.existingCustomer && (
            <div style={{
              padding: "12px 16px", borderRadius: 6, marginBottom: 16,
              background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                Cliente existente detectado
              </div>
              <div style={{ color: "#1e40af" }}>
                <b>{preview.existingCustomer.name}</b>
                {preview.existingCustomer.erpId
                  ? ` — ERP ID: ${preview.existingCustomer.erpId}`
                  : " — Sin ID ERP (es un registro nuevo en SAG)"}
              </div>
              <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>
                Esta operación actualizará los datos del cliente en SAG.
              </div>
            </div>
          )}

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
            maxHeight: 280, overflowY: "auto", marginBottom: 20,
          }}>
            {JSON.stringify(preview.normalizedPayload, null, 2)}
          </pre>

          {/* Generated XML */}
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            XML que se enviará a SAG
          </h3>
          <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
            Este es el contenido exacto de a_s_xml en la llamada SOAP insercionSag.
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
                  No se envía nada al ERP ahora. Un administrador o gerente debe aprobarla en{" "}
                  <b>Cola de Aprobación SAG</b> para que el envío ocurra.
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
                  : `Crear operación pendiente (${preview.existingCustomer ? "actualizar" : "crear"} cliente)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
