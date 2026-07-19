"use client";

/**
 * components/finance/register-payment-button.tsx
 *
 * Botón "Registrar cobro" que abre un <dialog> con el PaymentForm.
 * Diseñado para embeberse en tablas de cobranza (server components).
 *
 * On success: router.refresh() para que la página refleje el cambio.
 */

import { useState, useRef, useCallback } from "react";
import { useRouter }  from "next/navigation";
import PaymentForm    from "@/components/finance/payment-form";

interface Props {
  orgSlug:      string;
  customerNit?: string;
  customerName: string;
  /** Override label, default "Registrar cobro" */
  label?: string;
  variant?: "primary" | "outline" | "ghost";
}

const STYLES: Record<string, React.CSSProperties> = {
  primary: {
    fontFamily:  "monospace",
    fontSize:    11,
    fontWeight:  700,
    background:  "#16a34a",
    color:       "#fff",
    border:      "none",
    borderRadius: 5,
    padding:     "5px 10px",
    cursor:      "pointer",
    letterSpacing: "0.03em",
    whiteSpace:  "nowrap",
  },
  outline: {
    fontFamily:  "monospace",
    fontSize:    11,
    fontWeight:  700,
    background:  "#f0fdf4",
    color:       "#15803d",
    border:      "1px solid #86efac",
    borderRadius: 5,
    padding:     "4px 10px",
    cursor:      "pointer",
    whiteSpace:  "nowrap",
  },
  ghost: {
    fontFamily:  "monospace",
    fontSize:    11,
    background:  "transparent",
    color:       "#6b7280",
    border:      "1px solid #e5e7eb",
    borderRadius: 5,
    padding:     "4px 10px",
    cursor:      "pointer",
    whiteSpace:  "nowrap",
  },
};

export default function RegisterPaymentButton({
  orgSlug,
  customerNit,
  customerName,
  label   = "Registrar cobro",
  variant = "outline",
}: Props) {
  const [open, setOpen]       = useState(false);
  const dialogRef             = useRef<HTMLDialogElement>(null);
  const router                = useRouter();

  const handleOpen = useCallback(() => {
    setOpen(true);
    setTimeout(() => dialogRef.current?.showModal(), 0);
  }, []);

  const handleClose = useCallback(() => {
    dialogRef.current?.close();
    setOpen(false);
  }, []);

  const handleSuccess = useCallback((paymentId: string) => {
    // Small delay so the success state in the form is visible briefly
    setTimeout(() => {
      handleClose();
      router.refresh();
    }, 1200);
  }, [handleClose, router]);

  return (
    <>
      <button style={STYLES[variant]} onClick={handleOpen}>
        💵 {label}
      </button>

      {/* Native <dialog> — no external deps, works in all modern browsers */}
      <dialog
        ref={dialogRef}
        style={{
          fontFamily:  "monospace",
          border:      "1.5px solid #1a1a1a",
          borderRadius: 10,
          padding:     0,
          maxWidth:    680,
          width:       "95vw",
          maxHeight:   "92vh",
          overflowY:   "auto",
          boxShadow:   "0 20px 60px rgba(0,0,0,0.18)",
        }}
        onClick={e => {
          // Close on backdrop click
          if (e.target === dialogRef.current) handleClose();
        }}
        onCancel={handleClose}
      >
        {/* Modal header */}
        <div style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "space-between",
          padding:       "14px 20px",
          borderBottom:  "1px solid #e5e7eb",
          position:      "sticky",
          top:           0,
          background:    "#fff",
          zIndex:        1,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>
              Registrar cobro
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              {customerName}{customerNit ? ` · NIT ${customerNit}` : ""}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: "transparent", border: "none",
              cursor: "pointer", fontSize: 18, color: "#9ca3af",
              padding: "4px 8px", borderRadius: 4,
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px" }}>
          {open && (
            <PaymentForm
              orgSlug={orgSlug}
              prefillNit={customerNit}
              prefillName={customerName}
              onSuccess={handleSuccess}
              onCancel={handleClose}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
