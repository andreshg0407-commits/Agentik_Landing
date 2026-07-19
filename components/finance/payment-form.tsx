"use client";

/**
 * components/finance/payment-form.tsx
 *
 * Formulario de registro de cobro — Sprint 2.5 Treasury Hub.
 *
 * Props:
 *   orgSlug      — slug de la organización
 *   onSuccess    — callback cuando el cobro queda registrado
 *   prefillNit   — NIT pre-llenado (desde Cliente 360 o Cola de Cobranza)
 *   prefillName  — nombre pre-llenado
 *   openReceivables — facturas abiertas del cliente para conciliación inline
 *
 * Flujo UX:
 *   1. Operador ingresa cliente (NIT + nombre)
 *   2. Sistema muestra facturas abiertas del cliente (si hay)
 *   3. Operador ingresa monto, fecha, banco, método, referencia
 *   4. Operador selecciona qué factura(s) cubrir con este pago
 *   5. Submit → POST /api/orgs/[orgSlug]/finance/payments
 */

import { useState, useEffect, useCallback } from "react";
import { formatDateShort } from "@/lib/utils/formatDate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenReceivable {
  id:             string;
  invoiceNumber:  string | null;
  originalAmount: number;
  balanceDue:     number;
  dueDate:        string;
  daysOverdue:    number;
  agingBucket:    string;
  status:         string;
}

interface AllocationEntry {
  receivableId:    string;
  allocatedAmount: number;
}

interface PaymentFormProps {
  orgSlug:          string;
  onSuccess?:       (paymentId: string) => void;
  onCancel?:        () => void;
  prefillNit?:      string;
  prefillName?:     string;
  openReceivables?: OpenReceivable[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(1) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const PAYMENT_METHODS = [
  { value: "TRANSFERENCIA",   label: "Transferencia bancaria" },
  { value: "CONSIGNACION",    label: "Consignación" },
  { value: "CHEQUE",          label: "Cheque" },
  { value: "EFECTIVO",        label: "Efectivo" },
  { value: "PSE",             label: "PSE" },
  { value: "TARJETA_CREDITO", label: "Tarjeta crédito" },
  { value: "TARJETA_DEBITO",  label: "Tarjeta débito" },
  { value: "OTRO",            label: "Otro" },
];

// ── Styles (inline — monospace system, consistent with Torre de Control) ──────

const BASE: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 13,
  color: "#1a1a1a",
};
const LABEL: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: "#4b5563",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  display: "block",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  fontFamily: "monospace",
  fontSize: 13,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "6px 10px",
  boxSizing: "border-box",
  background: "#fff",
  color: "#111",
};
const BTN_PRIMARY: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 13,
  fontWeight: 700,
  background: "#1a1a1a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "9px 20px",
  cursor: "pointer",
  letterSpacing: "0.02em",
};
const BTN_GHOST: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 13,
  background: "transparent",
  color: "#6b7280",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "9px 16px",
  cursor: "pointer",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentForm({
  orgSlug,
  onSuccess,
  onCancel,
  prefillNit  = "",
  prefillName = "",
  openReceivables = [],
}: PaymentFormProps) {
  // ── Form state
  const [customerNit,  setCustomerNit]  = useState(prefillNit);
  const [customerName, setCustomerName] = useState(prefillName);
  const [amount,       setAmount]       = useState("");
  const [paymentDate,  setPaymentDate]  = useState(today());
  const [bankName,     setBankName]     = useState("");
  const [paymentMethod,setMethod]       = useState("TRANSFERENCIA");
  const [reference,    setReference]    = useState("");
  const [notes,        setNotes]        = useState("");

  // ── Receivables & allocation
  const [receivables,  setReceivables]  = useState<OpenReceivable[]>(openReceivables);
  const [loadingRx,    setLoadingRx]    = useState(false);
  const [allocations,  setAllocations]  = useState<Record<string, string>>({}); // rxId → amount string

  // ── Submission
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  // ── Load open receivables when NIT changes (debounced 600ms)
  useEffect(() => {
    if (!customerNit || customerNit.length < 6) return;
    const t = setTimeout(async () => {
      setLoadingRx(true);
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/finance/payments?action=openReceivables&customerNit=${encodeURIComponent(customerNit)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.receivables)) {
            setReceivables(data.receivables);
          }
        }
      } catch (_) { /* silent */ }
      setLoadingRx(false);
    }, 600);
    return () => clearTimeout(t);
  }, [customerNit, orgSlug]);

  // ── Derived: total allocated
  const totalAllocated = Object.values(allocations)
    .reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const paymentAmt = parseFloat(amount) || 0;
  const unallocated = paymentAmt - totalAllocated;

  // ── Handlers
  const setAlloc = useCallback((rxId: string, val: string) => {
    setAllocations(prev => ({ ...prev, [rxId]: val }));
  }, []);

  const autoFillAlloc = useCallback((rx: OpenReceivable) => {
    const remaining = Math.max(0, unallocated + (parseFloat(allocations[rx.id]) || 0));
    const fill = Math.min(remaining, Number(rx.balanceDue));
    setAlloc(rx.id, fill.toFixed(0));
  }, [unallocated, allocations, setAlloc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) return setError("Ingresa el nombre del cliente");
    if (!amount || paymentAmt <= 0) return setError("Ingresa un monto válido");
    if (!paymentDate) return setError("Ingresa la fecha del pago");

    // Build allocations array (only entries with amount > 0)
    const allocArray = Object.entries(allocations)
      .map(([receivableId, v]) => ({ receivableId, allocatedAmount: parseFloat(v) || 0 }))
      .filter(a => a.allocatedAmount > 0);

    if (allocArray.length > 0) {
      const sumAlloc = allocArray.reduce((s, a) => s + a.allocatedAmount, 0);
      if (sumAlloc > paymentAmt + 0.5) {
        return setError(`Total conciliado ($${sumAlloc.toLocaleString("es-CO")}) supera el pago ($${paymentAmt.toLocaleString("es-CO")})`);
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/finance/payments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNit:   customerNit || null,
          customerName:  customerName.trim(),
          amount:        paymentAmt,
          paymentDate,
          bankName:      bankName || null,
          paymentMethod,
          reference:     reference || null,
          notes:         notes || null,
          allocations:   allocArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setSuccess(true);
      onSuccess?.(data.paymentId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar el cobro");
    } finally {
      setLoading(false);
    }
  };

  // ── Success state
  if (success) {
    return (
      <div style={{ ...BASE, textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Cobro registrado</div>
        <div style={{ color: "#6b7280", marginBottom: 20 }}>
          {fmtCOP(paymentAmt)} — {customerName}
        </div>
        <button style={BTN_GHOST} onClick={() => { setSuccess(false); setAmount(""); setAllocations({}); }}>
          Registrar otro cobro
        </button>
      </div>
    );
  }

  // ── Form
  return (
    <form onSubmit={handleSubmit} style={{ ...BASE, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── CLIENTE ── */}
      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          Cliente
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
          <div>
            <label style={LABEL}>NIT</label>
            <input
              style={INPUT} value={customerNit} onChange={e => setCustomerNit(e.target.value)}
              placeholder="900123456-1" autoComplete="off"
            />
          </div>
          <div>
            <label style={LABEL}>Nombre o razón social *</label>
            <input
              style={INPUT} value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente" required
            />
          </div>
        </div>
      </div>

      {/* ── COBRO ── */}
      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          Cobro recibido
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LABEL}>Valor recibido (COP) *</label>
            <input
              style={{ ...INPUT, fontWeight: 700 }}
              type="number" min="1" step="1"
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" required
            />
          </div>
          <div>
            <label style={LABEL}>Fecha del pago *</label>
            <input
              style={INPUT} type="date"
              value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              max={today()} required
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Banco</label>
            <input
              style={INPUT} value={bankName} onChange={e => setBankName(e.target.value)}
              placeholder="Bancolombia, Davivienda…"
            />
          </div>
          <div>
            <label style={LABEL}>Método</label>
            <select style={INPUT} value={paymentMethod} onChange={e => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LABEL}>Referencia bancaria</label>
            <input
              style={INPUT} value={reference} onChange={e => setReference(e.target.value)}
              placeholder="No. transacción / cheque"
            />
          </div>
        </div>
      </div>

      {/* ── CONCILIACIÓN ── */}
      {(receivables.length > 0 || loadingRx) && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <div style={{
            background: paymentAmt > 0 && Math.abs(unallocated) < 1 ? "#dcfce7" : "#fff7ed",
            borderBottom: "1px solid #e5e7eb",
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "#374151" }}>
              Conciliación con facturas
            </span>
            {paymentAmt > 0 && (
              <span style={{ fontFamily: "monospace", fontSize: 12, color: Math.abs(unallocated) < 1 ? "#16a34a" : "#d97706", fontWeight: 700 }}>
                {Math.abs(unallocated) < 1
                  ? "✓ Totalmente conciliado"
                  : `Sin conciliar: ${fmtCOP(Math.max(0, unallocated))}`}
              </span>
            )}
          </div>

          {loadingRx ? (
            <div style={{ padding: "14px 16px", color: "#9ca3af", fontSize: 12 }}>Cargando facturas…</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                    {["Factura", "Vencimiento", "DPD", "Saldo", "Aplicar"].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receivables.map((rx, i) => {
                    const dpd = rx.daysOverdue;
                    const dpdColor = dpd > 90 ? "#dc2626" : dpd > 30 ? "#d97706" : "#16a34a";
                    const balance = Number(rx.balanceDue);
                    return (
                      <tr key={rx.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>
                          {rx.invoiceNumber ?? rx.id.slice(-6)}
                        </td>
                        <td style={{ padding: "6px 10px", color: "#6b7280" }}>
                          {formatDateShort(rx.dueDate)}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <span style={{ color: dpdColor, fontWeight: 700 }}>
                            {dpd > 0 ? `+${dpd}d` : "Al día"}
                          </span>
                        </td>
                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>
                          {fmtCOP(balance)}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number" min="0" max={balance} step="1"
                              style={{ ...INPUT, width: 100, fontSize: 12 }}
                              value={allocations[rx.id] ?? ""}
                              onChange={e => setAlloc(rx.id, e.target.value)}
                              placeholder="0"
                            />
                            <button
                              type="button"
                              style={{ fontSize: 10, color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 4, padding: "3px 7px", cursor: "pointer", background: "#fff" }}
                              onClick={() => autoFillAlloc(rx)}
                            >
                              Auto
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── OBSERVACIONES ── */}
      <div>
        <label style={LABEL}>Observaciones</label>
        <textarea
          style={{ ...INPUT, resize: "vertical", minHeight: 60 }}
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notas adicionales del cobro…"
        />
      </div>

      {/* ── ERROR ── */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "10px 14px", color: "#dc2626", fontSize: 12 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── ACTIONS ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
        {onCancel && (
          <button type="button" style={BTN_GHOST} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
        )}
        <button type="submit" style={{ ...BTN_PRIMARY, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? "Registrando…" : `Registrar cobro${paymentAmt > 0 ? ` · ${fmtCOP(paymentAmt)}` : ""}`}
        </button>
      </div>

    </form>
  );
}
