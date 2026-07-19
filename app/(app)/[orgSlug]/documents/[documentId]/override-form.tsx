"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validationLabel } from "@/lib/ui/status-labels";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverrideEntry {
  value:         unknown;
  originalValue: unknown;
  setBy:         string;
  setAt:         string;
}

export interface OverrideFormProps {
  documentId:    string;
  organizationId: string;
  // Current effective values (post-override if any)
  current: {
    issuerName?:    string | null;
    issuerId?:      string | null;
    receiverName?:  string | null;
    receiverId?:    string | null;
    documentDate?:  string | null;
    currency?:      string | null;
    totalAmount?:   number | null;
    invoiceNumber?: string | null;
    dueDate?:       string | null;
    subtotal?:      number | null;
    taxAmount?:     number | null;
    cufe?:          string | null;
  };
  // Existing override map — for showing "was: ..." annotations
  existingOverrides: Record<string, OverrideEntry>;
}

// ── Field definitions ─────────────────────────────────────────────────────────

const FIELD_DEFS: {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  placeholder?: string;
  note?: string;
}[] = [
  { key: "invoiceNumber", label: "Número de factura",  type: "text",   note: "Requerido para VÁLIDO" },
  { key: "issuerId",      label: "NIT emisor",          type: "text",   note: "Requerido para VÁLIDO" },
  { key: "issuerName",    label: "Nombre emisor",       type: "text"   },
  { key: "receiverId",    label: "NIT cliente",         type: "text",   note: "Requerido para VÁLIDO" },
  { key: "receiverName",  label: "Nombre cliente",      type: "text"   },
  { key: "documentDate",  label: "Fecha documento",     type: "date",   note: "Requerido para VÁLIDO" },
  { key: "dueDate",       label: "Fecha vencimiento",   type: "date"   },
  { key: "currency",      label: "Moneda",              type: "text",   placeholder: "COP" },
  { key: "totalAmount",   label: "Monto total",         type: "number", note: "Requerido para VÁLIDO" },
  { key: "subtotal",      label: "Subtotal",            type: "number" },
  { key: "taxAmount",     label: "Impuesto",            type: "number" },
  { key: "cufe",          label: "CUFE",                type: "text",   note: "Requerido para VÁLIDO", placeholder: "hex 96 chars…" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayOriginal(v: unknown): string {
  if (v == null || v === "") return "vacío";
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

function toInputValue(v: unknown, type: "text" | "number" | "date"): string {
  if (v == null) return "";
  if (type === "date" && typeof v === "string") return v.slice(0, 10);
  return String(v);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OverrideForm({
  documentId,
  organizationId,
  current,
  existingOverrides,
}: OverrideFormProps) {
  const router = useRouter();

  // Build initial form state from current effective values
  const initialState: Record<string, string> = {};
  for (const f of FIELD_DEFS) {
    const raw = current[f.key as keyof typeof current];
    initialState[f.key] = toInputValue(raw, f.type);
  }

  const [values, setValues]     = useState<Record<string, string>>(initialState);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<{ status: string; errors: string[]; warnings: string[] } | null>(null);

  function handleChange(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setResult(null);

    // Build body — include all 12 fields so the backend records any cleared values too
    const body: Record<string, unknown> = { organizationId };
    for (const f of FIELD_DEFS) {
      const raw = values[f.key];
      if (f.type === "number") {
        body[f.key] = raw === "" ? null : Number(raw);
      } else {
        body[f.key] = raw === "" ? null : raw;
      }
    }

    try {
      const res = await fetch(`/api/documents/${documentId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
      } else {
        setResult({
          status:   data.validationStatus,
          errors:   data.validationErrors   ?? [],
          warnings: data.validationWarnings ?? [],
        });
        router.refresh();
      }
    } catch {
      setError("Error de red — intente nuevamente");
    } finally {
      setSaving(false);
    }
  }

  const STATUS_COLOR: Record<string, string> = {
    VALID:            "#2e7d32",
    INCOMPLETE:       "#b71c1c",
    REVIEW_REQUIRED:  "#f57f17",
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Corrección manual</h2>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
        Corrija cualquier campo. Los valores originales se conservan. La validación se recalcula al guardar.
      </p>

      <form onSubmit={handleSubmit}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee" }}>
              <th style={{ textAlign: "left", padding: "4px 8px 6px 0", width: 180, fontWeight: 600, color: "#444" }}>Campo</th>
              <th style={{ textAlign: "left", padding: "4px 8px 6px",   fontWeight: 600, color: "#444" }}>Valor</th>
              <th style={{ textAlign: "left", padding: "4px 0  6px 8px", fontWeight: 600, color: "#444" }}>Valor extraído</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_DEFS.map((f) => {
              const ov      = existingOverrides[f.key];
              const isOverridden = !!ov;
              return (
                <tr key={f.key} style={{
                  borderBottom: "1px solid #f4f4f4",
                  background: isOverridden ? "#fffbf0" : "transparent",
                }}>
                  <td style={{ padding: "6px 8px 6px 0", verticalAlign: "middle" }}>
                    <span style={{ fontWeight: f.note ? 600 : 400 }}>{f.label}</span>
                    {isOverridden && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, fontWeight: 700,
                        color: "#b45309", background: "#fff3cd",
                        border: "1px solid #f0c040", borderRadius: 3,
                        padding: "0 4px",
                      }}>
                        MODIFICADO
                      </span>
                    )}
                    {f.note && !isOverridden && (
                      <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{f.note}</div>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", verticalAlign: "middle" }}>
                    <input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      step={f.type === "number" ? "any" : undefined}
                      value={values[f.key]}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      style={{
                        width: "100%",
                        maxWidth: f.key === "cufe" ? 340 : 260,
                        padding: "4px 7px",
                        border: `1px solid ${isOverridden ? "#f0c040" : "#ccc"}`,
                        borderRadius: 4,
                        fontSize: 13,
                        fontFamily: f.key === "cufe" ? "monospace" : "inherit",
                        background: isOverridden ? "#fffef5" : "white",
                      }}
                    />
                  </td>
                  <td style={{ padding: "6px 0 6px 8px", verticalAlign: "middle", fontSize: 12, color: "#777" }}>
                    {isOverridden ? (
                      <span title={`Modificado por ${ov.setBy} el ${ov.setAt}`}>
                        {displayOriginal(ov.originalValue)}
                        <span style={{ display: "block", fontSize: 10, color: "#aaa" }}>
                          {new Date(ov.setAt).toISOString().slice(0, 16).replace("T", " ")}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "#bbb", fontStyle: "italic" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "7px 18px",
              background: saving ? "#ccc" : "#1a1a1a",
              color: "white",
              border: "none",
              borderRadius: 5,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando…" : "Guardar correcciones"}
          </button>

          {error && (
            <span style={{ fontSize: 13, color: "#b71c1c" }}>{error}</span>
          )}

          {result && (
            <span style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLOR[result.status] ?? "#444" }}>
              ✓ Guardado — {validationLabel(result.status)}
              {result.errors.length > 0 && ` (${result.errors.length} error${result.errors.length > 1 ? "es" : ""})`}
              {result.warnings.length > 0 && result.errors.length === 0 && ` (${result.warnings.length} advertencia${result.warnings.length > 1 ? "s" : ""})`}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
