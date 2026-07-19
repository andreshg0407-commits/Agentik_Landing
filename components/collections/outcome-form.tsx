"use client";

/**
 * components/collections/outcome-form.tsx
 *
 * Inline outcome recording form for a collection task.
 *
 * Used in:
 *   - Collections queue (per-row outcome button)
 *   - Customer 360 collections section (inline on task cards)
 *
 * On submit: POSTs to /api/orgs/[orgSlug]/collections/outcome and refreshes.
 */

import { useState } from "react";
import type { OutcomeType, ContactChannel } from "@/lib/collections/outcomes-types";
import { OUTCOME_LABELS, OUTCOME_ICONS } from "@/lib/collections/outcomes-types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OutcomeFormProps {
  orgSlug:       string;
  taskId?:       string;   // optional — API creates a task if omitted
  customerSlug:  string;
  customerName:  string;
  currentDpd:    number;
  overdueAmount: number;
  /** Called after successful outcome recording */
  onDone?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const OUTCOME_ORDER: OutcomeType[] = [
  "PAID",
  "PARTIAL_PAYMENT",
  "PROMISE_TO_PAY",
  "IN_NEGOTIATION",
  "NO_CONTACT",
  "BROKEN_PROMISE",
  "DISPUTE",
  "ESCALATED",
];

const OUTCOME_COLOR: Record<OutcomeType, { bg: string; text: string; border: string }> = {
  PAID:             { bg: "#f0fdf4", text: "#14532d", border: "#bbf7d0" },
  PARTIAL_PAYMENT:  { bg: "#f0fdf4", text: "#14532d", border: "#bbf7d0" },
  PROMISE_TO_PAY:   { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  IN_NEGOTIATION:   { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  NO_CONTACT:       { bg: "#fafafa", text: "#374151", border: "#e5e7eb" },
  BROKEN_PROMISE:   { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  DISPUTE:          { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  ESCALATED:        { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function OutcomeForm({
  orgSlug, taskId, customerSlug, customerName,
  currentDpd, overdueAmount, onDone,
}: OutcomeFormProps) {
  const [open,          setOpen]          = useState(false);
  const [selectedType,  setSelectedType]  = useState<OutcomeType | null>(null);
  const [channel,       setChannel]       = useState<ContactChannel>("call");
  const [notes,         setNotes]         = useState("");
  const [promiseDate,   setPromiseDate]   = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [done,          setDone]          = useState(false);

  const requiresPromise  = selectedType === "PROMISE_TO_PAY";
  const requiresPartial  = selectedType === "PARTIAL_PAYMENT";

  async function submit() {
    if (!selectedType) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/collections/outcome`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...(taskId ? { taskId } : {}),
          customerSlug,
          customerName,
          currentDpd,
          overdueAmount,
          outcome: {
            outcomeType:   selectedType,
            channel,
            notes:         notes || undefined,
            promiseDate:   requiresPromise  && promiseDate   ? promiseDate   : undefined,
            promiseAmount: requiresPromise  && promiseAmount ? Number(promiseAmount) : undefined,
            partialAmount: requiresPartial  && partialAmount ? Number(partialAmount) : undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Error al registrar resultado");
      }

      setDone(true);
      onDone?.();
    } catch (err: any) {
      setError(err.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, color: "#14532d",
        background: "#f0fdf4", border: "1px solid #bbf7d0",
        borderRadius: 4, padding: "2px 8px",
      }}>
        ✓ Registrado
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11, fontWeight: 700, color: "#7c3aed",
          background: "#f5f3ff", border: "1px solid #ddd6fe",
          borderRadius: 4, padding: "3px 10px", cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        Registrar resultado
      </button>
    );
  }

  return (
    <div style={{
      border: "1px solid #e5e7eb", borderRadius: 8,
      background: "#fff", padding: 14,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      minWidth: 280,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Resultado del contacto
        </span>
        <button onClick={() => setOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16 }}>
          ×
        </button>
      </div>

      {/* Outcome selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 10 }}>
        {OUTCOME_ORDER.map(ot => {
          const c       = OUTCOME_COLOR[ot];
          const selected = selectedType === ot;
          return (
            <button
              key={ot}
              onClick={() => setSelectedType(ot)}
              style={{
                background: selected ? c.bg : "#fafafa",
                color:      selected ? c.text : "#374151",
                border:     `1px solid ${selected ? c.border : "#e5e7eb"}`,
                borderRadius: 5,
                padding:    "5px 8px",
                cursor:     "pointer",
                fontSize:   11,
                fontWeight: selected ? 700 : 400,
                textAlign:  "left",
                fontFamily: "monospace",
                transition: "all 0.1s",
              }}
            >
              {OUTCOME_ICONS[ot]} {OUTCOME_LABELS[ot]}
            </button>
          );
        })}
      </div>

      {/* Channel */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
          Canal de contacto
        </label>
        <select
          value={channel}
          onChange={e => setChannel(e.target.value as ContactChannel)}
          style={{
            width: "100%", fontSize: 12, padding: "4px 8px",
            border: "1px solid #d1d5db", borderRadius: 4,
            background: "#fff", fontFamily: "monospace",
          }}
        >
          <option value="call">📞 Llamada</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="email">✉️ Email</option>
          <option value="in_person">🤝 Presencial</option>
        </select>
      </div>

      {/* Promise date (PROMISE_TO_PAY) */}
      {requiresPromise && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
              Fecha prometida *
            </label>
            <input
              type="date"
              value={promiseDate}
              onChange={e => setPromiseDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "monospace" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
              Monto prometido (COP)
            </label>
            <input
              type="number"
              value={promiseAmount}
              onChange={e => setPromiseAmount(e.target.value)}
              placeholder="Ej: 5000000"
              style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "monospace" }}
            />
          </div>
        </div>
      )}

      {/* Partial amount (PARTIAL_PAYMENT) */}
      {requiresPartial && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
            Monto pagado (COP) *
          </label>
          <input
            type="number"
            value={partialAmount}
            onChange={e => setPartialAmount(e.target.value)}
            placeholder="Ej: 2500000"
            style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontFamily: "monospace" }}
          />
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", display: "block", marginBottom: 3 }}>
          Notas (opcional)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Observaciones del contacto…"
          rows={2}
          style={{
            width: "100%", fontSize: 12, padding: "4px 8px",
            border: "1px solid #d1d5db", borderRadius: 4,
            resize: "none", fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{error}</div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          onClick={() => setOpen(false)}
          style={{
            fontSize: 11, color: "#6b7280", background: "#fff",
            border: "1px solid #d1d5db", borderRadius: 4,
            padding: "4px 12px", cursor: "pointer", fontFamily: "monospace",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={!selectedType || loading}
          style={{
            fontSize: 11, fontWeight: 700,
            color:      !selectedType ? "#9ca3af" : "#fff",
            background: !selectedType ? "#f3f4f6" : "#7c3aed",
            border:     "none", borderRadius: 4,
            padding:    "4px 14px", cursor: selectedType ? "pointer" : "default",
            fontFamily: "monospace",
          }}
        >
          {loading ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
