"use client";

/**
 * Wholesale Order Wizard — Matrix-based product entry.
 *
 * Faster than a paper order pad: search reference → fill matrix → add all.
 *
 * Sprint: AGENTIK-NEW-ORDER-WHOLESALE-UX-01
 * Sprint: ORDER-CREATION-POLISH-01
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { C, T, S, R, panel } from "@/lib/ui/tokens";
import type {
  OrderLine,
  OrderHeader,
  OrderSummary,
  OrderValidationResult,
  OrderCopilotSignal,
  DeliveryMode,
  DiscountType,
} from "@/lib/comercial/pedidos/order-types";
import { computeOrderSummary } from "@/lib/comercial/pedidos/order-validation";
import type {
  OrderProductSearchResult,
  OrderProductVariant,
  OrderLineCandidate,
} from "@/lib/comercial/pedidos/order-product-types";
import { getCommercialStockState, isProductSellable } from "@/lib/comercial/pedidos/order-product-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellerOption {
  sellerId: string;
  sellerName: string;
  active: boolean;
}

interface CustomerSearchResult {
  customerCode: string;
  customerName: string;
  customerId: string;
  lastSellerName: string;
  lastChannel: string;
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string | null;
  city: string;
  sagCode: string;
}

interface Props {
  orgSlug: string;
  header: OrderHeader;
  lines: OrderLine[];
  onHeaderChange: (h: OrderHeader) => void;
  onAddLine: (c: OrderLineCandidate) => void;
  onUpdateLineQty: (id: string, qty: number) => void;
  onRemoveLine: (id: string) => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onClose: () => void;
  /** When true, wizard is editing an existing draft — changes save button label */
  isEditing?: boolean;
}

type WholesaleStep = "cliente" | "productos" | "resumen";

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  fontFamily: T.mono, fontSize: T.sz.sm, width: "100%",
  padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm,
  outline: "none", minHeight: 40,
};

const labelStyle = {
  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
  display: "block" as const, marginBottom: 2,
};

const requiredLabel = {
  ...labelStyle,
  color: C.ink,
  fontWeight: T.wt.semibold,
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function orderApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function productApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Matrix cell type ──────────────────────────────────────────────────────────

interface MatrixCell {
  color: string;
  size: string;
  quantity: number;
  available: number | null;
  variantId: string;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WholesaleOrderWizard({
  orgSlug, header, lines, onHeaderChange, onAddLine,
  onUpdateLineQty, onRemoveLine, onSaveDraft, onSubmit, onClose,
  isEditing,
}: Props) {
  const [step, setStep] = useState<WholesaleStep>("cliente");

  // ── Sellers ─────────────────────────────────────────────────────────────
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellersLoaded, setSellersLoaded] = useState(false);

  useEffect(() => {
    orderApi(orgSlug, { action: "list_sellers" }).then(data => {
      setSellers(data.sellers ?? []);
      setSellersLoaded(true);
    });
  }, [orgSlug]);

  // ── Client state ────────────────────────────────────────────────────────
  const [isTestClient, setIsTestClient] = useState(false);
  const [clientMode, setClientMode] = useState<"search" | "selected" | "manual">("search");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCustomerCity, setSelectedCustomerCity] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [missingSagCode, setMissingSagCode] = useState(false);

  // Validation rules differ by mode
  const clientValid = clientMode === "selected"
    ? Boolean(header.customerName.trim() && (header.customerId.trim() || header.customerCode.trim()) && header.sellerId.trim())
    : clientMode === "manual"
      ? Boolean(header.customerName.trim() && header.customerId.trim() && header.sellerId.trim() && manualCity.trim() && header.channel.trim())
      : false;

  function handleCustomerSearch(q: string) {
    setCustomerQuery(q);
    if (customerTimer.current) clearTimeout(customerTimer.current);
    if (!q.trim()) { setCustomerResults([]); return; }
    customerTimer.current = setTimeout(async () => {
      setCustomerSearching(true);
      const data = await orderApi(orgSlug, { action: "search_customers", query: q });
      setCustomerResults(data.customers ?? []);
      setCustomerSearching(false);
    }, 250);
  }

  function selectExistingCustomer(c: CustomerSearchResult) {
    const hasSag = Boolean(c.sagCode || c.customerCode);
    onHeaderChange({
      ...header,
      customerName: c.customerName,
      customerCode: c.sagCode || c.customerCode,
      customerId: c.customerId, // NIT
      sellerId: c.lastSellerName ? sellers.find(s => s.sellerName === c.lastSellerName)?.sellerId ?? "" : header.sellerId,
      sellerName: c.lastSellerName || header.sellerName,
      channel: c.lastChannel || header.channel,
    });
    setSelectedCustomerCity(c.city ?? "");
    setMissingSagCode(!hasSag);
    setClientMode("selected");
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function clearCustomer() {
    onHeaderChange({
      customerId: "", customerName: "", customerCode: "",
      sellerId: "", sellerName: "", channel: "", notes: "",
    });
    setClientMode("search");
    setMissingSagCode(false);
    setSelectedCustomerCity("");
  }

  // ── Product search ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OrderProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<OrderProductSearchResult | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ── Matrix state ────────────────────────────────────────────────────────
  const [matrixCells, setMatrixCells] = useState<MatrixCell[]>([]);
  const [matrixColors, setMatrixColors] = useState<string[]>([]);
  const [matrixSizes, setMatrixSizes] = useState<string[]>([]);

  // ── Feedback ────────────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  function handleSearch(q: string) {
    setSearchQuery(q);
    setSelectedProduct(null);
    setMatrixCells([]);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const data = await productApi(orgSlug, { action: "search", query: q });
      setSearchResults(data.products ?? []);
      setSearching(false);
    }, 300);
  }

  function selectProduct(p: OrderProductSearchResult) {
    // Guard: never open matrix for unsellable products (HIDE-NO-VARIANTS-01)
    if (!isProductSellable(p)) return;
    setSelectedProduct(p);
    setSearchResults([]);
    // Build matrix from variants
    const colors = [...new Set(p.variants.map(v => v.color).filter(Boolean))].sort();
    const sizes = [...new Set(p.variants.map(v => v.size).filter(Boolean))].sort();
    setMatrixColors(colors);
    setMatrixSizes(sizes);
    // Initialize cells
    const cells: MatrixCell[] = [];
    for (const color of colors) {
      for (const size of sizes) {
        const variant = p.variants.find(v => v.color === color && v.size === size);
        cells.push({
          color,
          size,
          quantity: 0,
          available: variant?.availability.availableUnits ?? null,
          variantId: variant?.variantId ?? "",
        });
      }
    }
    setMatrixCells(cells);
  }

  const [stockFeedback, setStockFeedback] = useState<string | null>(null);

  function updateCellQty(color: string, size: string, qty: number) {
    setMatrixCells(prev => prev.map(c => {
      if (c.color !== color || c.size !== size) return c;
      let clamped = Math.max(0, qty);
      // Auto-cap at available stock
      if (c.available !== null && clamped > c.available) {
        clamped = c.available;
        setStockFeedback(`Maximo disponible: ${c.available}`);
        setTimeout(() => setStockFeedback(null), 2000);
      }
      return { ...c, quantity: clamped };
    }));
  }

  function addMatrixToOrder() {
    if (!selectedProduct) return;
    const filled = matrixCells.filter(c => c.quantity > 0);
    if (filled.length === 0) return;

    for (const cell of filled) {
      onAddLine({
        referenceCode: selectedProduct.referenceCode,
        productName: selectedProduct.productName,
        size: cell.size,
        color: cell.color,
        quantity: cell.quantity,
        availableUnits: cell.available,
        unitPrice: selectedProduct.unitPrice,
        thumbnailUrl: selectedProduct.thumbnailUrl,
      });
    }

    const totalAdded = filled.reduce((s, c) => s + c.quantity, 0);
    showFeedback(`${filled.length} lineas agregadas · ${totalAdded} unidades`);

    // Reset for next reference
    setSelectedProduct(null);
    setMatrixCells([]);
    setSearchQuery("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && searchResults.length > 0) {
      // Select first sellable result (skip no-variant products)
      const first = searchResults.find(p => isProductSellable(p) && getCommercialStockState(p).shouldShowInSearch);
      if (first) selectProduct(first);
    }
  }

  // Cmd/Ctrl+Enter to add matrix quantities
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && selectedProduct && matrixTotal > 0) {
        e.preventDefault();
        addMatrixToOrder();
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  });

  // ── Computed ────────────────────────────────────────────────────────────
  const activeLines = lines.filter(l => !l.removed);
  const summary = computeOrderSummary(activeLines, {
    type:  header.discountType,
    value: header.discountValue,
  });
  const matrixTotal = matrixCells.reduce((s, c) => s + c.quantity, 0);
  const matrixOverStock = matrixCells.filter(c => c.quantity > 0 && c.available !== null && c.quantity > c.available);
  const canAdvanceToResumen = activeLines.length > 0 && clientValid
    && !activeLines.some(l => l.availableUnits !== null && l.quantity > l.availableUnits);

  // ── Steps ───────────────────────────────────────────────────────────────
  const steps: { key: WholesaleStep; label: string }[] = [
    { key: "cliente", label: "1. Cliente" },
    { key: "productos", label: "2. Productos" },
    { key: "resumen", label: "3. Resumen" },
  ];

  return (
    <div className="ag-order-wizard-overlay">
    <div className="ag-order-wizard-panel">
      {/* Header */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
        background: C.surfaceAlt, display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            Nuevo pedido mayorista
          </div>
          {header.customerName && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
              {header.customerName}
              {activeLines.length > 0 && ` · ${summary.totalUnits} uds · $${summary.totalValue.toLocaleString()}`}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
        }}>x</button>
      </div>

      {/* Step bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.line}` }}>
        {steps.map((s, i) => {
          const isActive = step === s.key;
          const done = (s.key === "cliente" && clientValid && step !== "cliente")
                    || (s.key === "productos" && activeLines.length > 0 && step === "resumen");
          return (
            <button key={s.key} onClick={() => {
              if (s.key === "productos" && !clientValid) return;
              if (s.key === "resumen" && (!clientValid || activeLines.length === 0)) return;
              setStep(s.key);
            }} style={{
              flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              padding: `${S[2]}px 0`, cursor: "pointer", border: "none",
              background: isActive ? C.blueDark : done ? C.greenLight : C.surface,
              color: isActive ? C.white : done ? C.green : C.inkMid,
              borderRight: i < steps.length - 1 ? `1px solid ${C.line}` : "none",
            }}>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4], display: "flex", gap: S[4] }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ═══ STEP 1: CLIENTE ═══════════════════════════════════════════ */}
          {step === "cliente" && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[3], maxWidth: 600 }}>

              {/* ── MODE: SEARCH (default) ─────────────────────────────── */}
              {clientMode === "search" && (
                <>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                    color: C.ink, textAlign: "center",
                  }}>
                    Buscar cliente
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                    textAlign: "center", marginBottom: S[1],
                  }}>
                    Busca por nombre, NIT o codigo SAG
                  </div>

                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={customerQuery}
                      onChange={e => handleCustomerSearch(e.target.value)}
                      placeholder="Ej: Almacenes El Sol, 900123, CLI-001"
                      autoFocus
                      style={{
                        ...inputStyle, fontSize: T.sz.base,
                        padding: `${S[3]}px ${S[4]}px`,
                        borderColor: C.blueDark, borderWidth: 2,
                      }}
                    />
                    {customerSearching && (
                      <span style={{
                        position: "absolute", right: S[3], top: "50%", transform: "translateY(-50%)",
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                      }}>
                        Buscando...
                      </span>
                    )}
                  </div>

                  {/* Search results */}
                  {customerResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                      {customerResults.map(c => (
                        <button
                          key={c.customerCode || c.customerId}
                          onClick={() => selectExistingCustomer(c)}
                          style={{
                            ...panel, padding: S[3], textAlign: "left", width: "100%",
                            cursor: "pointer", border: `1px solid ${C.line}`, background: C.white,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                              {c.customerName}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 1 }}>
                              {c.customerId ? `NIT ${c.customerId}` : ""}
                              {c.city ? ` · ${c.city}` : ""}
                              {c.lastSellerName ? ` · ${c.lastSellerName}` : ""}
                            </div>
                            <div style={{ display: "flex", gap: S[2], marginTop: 3 }}>
                              {c.sagCode && (
                                <span style={{
                                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                                  padding: "1px 5px", borderRadius: R.sm,
                                  background: C.greenLight, color: C.green,
                                }}>
                                  SAG: {c.sagCode}
                                </span>
                              )}
                              {c.totalOrders > 0 && (
                                <span style={{
                                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                                }}>
                                  {c.totalOrders} {c.totalOrders === 1 ? "pedido" : "pedidos"} · ${c.totalValue.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                            color: C.blueDark, padding: `${S[1]}px ${S[2]}px`,
                            background: C.blueLight, borderRadius: R.sm,
                            border: `1px solid ${C.blueBorder}`, flexShrink: 0,
                          }}>
                            Seleccionar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* No results */}
                  {customerQuery.trim().length > 2 && !customerSearching && customerResults.length === 0 && (
                    <div style={{
                      ...panel, padding: S[3], textAlign: "center",
                      borderLeft: `3px solid ${C.amber}`,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[1] }}>
                        No se encontro &quot;{customerQuery}&quot; en clientes registrados
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                        Busca por nombre, NIT o codigo. Los clientes vienen de CustomerProfile (SAG/CRM).
                      </div>
                    </div>
                  )}

                  {/* Create new — secondary action */}
                  <div style={{ textAlign: "center", marginTop: S[2] }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                      No encuentras el cliente?
                    </div>
                    <button onClick={() => setClientMode("manual")} style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                      background: "transparent", border: `1px solid ${C.blueBorder}`,
                      borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                      width: "100%",
                    }}>
                      + Crear cliente nuevo
                    </button>
                  </div>

                  {/* Test client option */}
                  <label style={{
                    display: "flex", alignItems: "center", gap: S[2], cursor: "pointer",
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    marginTop: S[1],
                  }}>
                    <input type="checkbox" checked={isTestClient}
                      onChange={e => setIsTestClient(e.target.checked)} />
                    CLIENTE PRUEBA / NO SINCRONIZAR SAG
                  </label>
                </>
              )}

              {/* ── MODE: SELECTED (existing customer) ─────────────────── */}
              {clientMode === "selected" && (
                <>
                  <div style={{
                    ...panel, padding: S[4], borderLeft: `3px solid ${C.green}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                          {header.customerName}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
                          {header.customerId ? `NIT ${header.customerId}` : ""}
                          {selectedCustomerCity ? ` · ${selectedCustomerCity}` : ""}
                        </div>
                        {header.customerCode && (
                          <div style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "1px 5px", borderRadius: R.sm, display: "inline-block",
                            background: C.greenLight, color: C.green, marginTop: 3,
                          }}>
                            SAG: {header.customerCode}
                          </div>
                        )}
                      </div>
                      <button onClick={clearCustomer} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                        background: "transparent", border: `1px solid ${C.line}`,
                        borderRadius: R.sm, padding: "3px 10px", cursor: "pointer",
                      }}>
                        Cambiar
                      </button>
                    </div>
                  </div>

                  {/* Missing SAG code warning */}
                  {missingSagCode && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
                      padding: `${S[2]}px ${S[3]}px`, background: C.amberLight,
                      borderRadius: R.sm, border: `1px solid ${C.amberBorder}`,
                    }}>
                      Cliente sin codigo SAG. Podras crear el pedido en Agentik, pero no enviarlo a SAG hasta completar el codigo.
                    </div>
                  )}

                  {/* Vendedor — pre-filled or select */}
                  <div>
                    <label style={requiredLabel}>Vendedor asignado *</label>
                    <select
                      value={header.sellerId}
                      onChange={e => {
                        const sel = sellers.find(s => s.sellerId === e.target.value);
                        onHeaderChange({
                          ...header,
                          sellerId: e.target.value,
                          sellerName: sel?.sellerName ?? e.target.value,
                        });
                      }}
                      style={{ ...inputStyle, background: C.white }}
                    >
                      <option value="">— Seleccionar vendedor —</option>
                      {sellers.map(s => (
                        <option key={s.sellerId} value={s.sellerId}>
                          {s.sellerName}{!s.active ? " (inactivo)" : ""}
                        </option>
                      ))}
                    </select>
                    {!header.sellerId && header.sellerName && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
                        Vendedor detectado: {header.sellerName}. Confirma en el selector.
                      </div>
                    )}
                  </div>

                  {/* Canal */}
                  <div>
                    <label style={labelStyle}>Canal</label>
                    <select
                      value={header.channel}
                      onChange={e => onHeaderChange({ ...header, channel: e.target.value })}
                      style={{ ...inputStyle, background: C.white }}
                    >
                      <option value="">— Canal —</option>
                      <option value="mayorista">Mayorista</option>
                      <option value="distribuidor">Distribuidor</option>
                      <option value="institucional">Institucional</option>
                      <option value="retail">Retail</option>
                    </select>
                  </div>

                  {/* Observaciones */}
                  <div>
                    <label style={labelStyle}>Observaciones</label>
                    <input type="text" value={header.notes}
                      onChange={e => onHeaderChange({ ...header, notes: e.target.value })}
                      placeholder="Notas adicionales" style={inputStyle} />
                  </div>

                  {/* Validation */}
                  {!clientValid && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                      padding: `${S[2]}px ${S[3]}px`, background: C.redLight, borderRadius: R.sm,
                    }}>
                      Selecciona un vendedor para continuar.
                    </div>
                  )}

                  {/* Next */}
                  <button
                    onClick={() => clientValid && setStep("productos")}
                    disabled={!clientValid}
                    className="ag-action-primary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                      color: C.white, background: clientValid ? C.blueDark : C.inkFaint,
                      border: "none", borderRadius: R.sm, padding: `${S[3]}px ${S[4]}px`,
                      cursor: clientValid ? "pointer" : "not-allowed", marginTop: S[2],
                    }}
                  >
                    Continuar a productos
                  </button>
                </>
              )}

              {/* ── MODE: MANUAL (new customer) ────────────────────────── */}
              {clientMode === "manual" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
                    }}>
                      Nuevo cliente
                    </div>
                    <button onClick={() => setClientMode("search")} style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                      background: "transparent", border: "none", cursor: "pointer",
                    }}>
                      Volver a buscar
                    </button>
                  </div>

                  {/* Test client toggle */}
                  <label style={{
                    display: "flex", alignItems: "center", gap: S[2], cursor: "pointer",
                    fontFamily: T.mono, fontSize: T.sz.xs, color: isTestClient ? C.amber : C.inkFaint,
                  }}>
                    <input type="checkbox" checked={isTestClient}
                      onChange={e => setIsTestClient(e.target.checked)} />
                    CLIENTE PRUEBA / NO SINCRONIZAR SAG
                  </label>

                  <div>
                    <label style={requiredLabel}>Nombre / Razon social *</label>
                    <input type="text" value={header.customerName}
                      onChange={e => onHeaderChange({ ...header, customerName: e.target.value })}
                      placeholder="Ej: Almacenes El Sol S.A.S" autoFocus style={inputStyle} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                    <div>
                      <label style={requiredLabel}>NIT *</label>
                      <input type="text" value={header.customerId}
                        onChange={e => onHeaderChange({ ...header, customerId: e.target.value })}
                        placeholder="Ej: 900.123.456-7" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Codigo SAG</label>
                      <input type="text" value={header.customerCode}
                        onChange={e => onHeaderChange({ ...header, customerCode: e.target.value })}
                        placeholder="Ej: CLI-001" style={inputStyle} />
                    </div>
                  </div>

                  {!header.customerCode && header.customerName && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
                      padding: `${S[2]}px ${S[3]}px`, background: C.amberLight,
                      borderRadius: R.sm, border: `1px solid ${C.amberBorder}`,
                    }}>
                      Cliente sin codigo SAG. Podras crear el pedido en Agentik, pero no enviarlo a SAG hasta completar el codigo.
                    </div>
                  )}

                  <div>
                    <label style={requiredLabel}>Vendedor asignado *</label>
                    <select
                      value={header.sellerId}
                      onChange={e => {
                        const sel = sellers.find(s => s.sellerId === e.target.value);
                        onHeaderChange({
                          ...header,
                          sellerId: e.target.value,
                          sellerName: sel?.sellerName ?? e.target.value,
                        });
                      }}
                      style={{ ...inputStyle, background: C.white }}
                    >
                      <option value="">— Seleccionar vendedor —</option>
                      {sellers.map(s => (
                        <option key={s.sellerId} value={s.sellerId}>
                          {s.sellerName}{!s.active ? " (inactivo)" : ""}
                        </option>
                      ))}
                    </select>
                    {sellersLoaded && sellers.length === 0 && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginTop: 2 }}>
                        No se encontraron vendedores registrados.
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                    <div>
                      <label style={requiredLabel}>Ciudad *</label>
                      <input type="text" value={manualCity}
                        onChange={e => setManualCity(e.target.value)}
                        placeholder="Ej: Bogota" style={inputStyle} />
                    </div>
                    <div>
                      <label style={requiredLabel}>Canal *</label>
                      <select
                        value={header.channel}
                        onChange={e => onHeaderChange({ ...header, channel: e.target.value })}
                        style={{ ...inputStyle, background: C.white }}
                      >
                        <option value="">— Canal —</option>
                        <option value="mayorista">Mayorista</option>
                        <option value="distribuidor">Distribuidor</option>
                        <option value="institucional">Institucional</option>
                        <option value="retail">Retail</option>
                      </select>
                    </div>
                  </div>

                  {isTestClient && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
                      padding: `${S[2]}px ${S[3]}px`, background: C.amberLight,
                      borderRadius: R.sm, border: `1px solid ${C.amberBorder}`,
                    }}>
                      Este pedido NO se sincronizara con SAG. Solo para pruebas.
                    </div>
                  )}

                  {!clientValid && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                      padding: `${S[2]}px ${S[3]}px`, background: C.redLight,
                      borderRadius: R.sm,
                    }}>
                      Completa nombre, NIT, vendedor, ciudad y canal para continuar.
                    </div>
                  )}

                  <button
                    onClick={() => clientValid && setStep("productos")}
                    disabled={!clientValid}
                    className="ag-action-primary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                      color: C.white, background: clientValid ? C.blueDark : C.inkFaint,
                      border: "none", borderRadius: R.sm, padding: `${S[3]}px ${S[4]}px`,
                      cursor: clientValid ? "pointer" : "not-allowed", marginTop: S[2],
                    }}
                  >
                    Continuar a productos
                  </button>
                </>
              )}

            </div>
          )}

          {/* ═══ STEP 2: PRODUCTOS — MATRIX ═══════════════════════════════ */}
          {step === "productos" && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>

              {/* Feedback toast */}
              {feedback && (
                <div style={{
                  padding: `${S[2]}px ${S[3]}px`, background: C.greenLight,
                  borderRadius: R.sm, border: `1px solid ${C.greenBorder}`,
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.green,
                }}>
                  {feedback}
                </div>
              )}

              {/* Search */}
              <div style={{ position: "relative" }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Buscar referencia... (Enter para seleccionar)"
                  autoFocus
                  style={{
                    ...inputStyle, fontSize: T.sz.base,
                    borderColor: C.blueDark, borderWidth: 2, minHeight: 48,
                  }}
                />
                {searching && (
                  <span style={{
                    position: "absolute", right: S[3], top: "50%", transform: "translateY(-50%)",
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                  }}>
                    Buscando...
                  </span>
                )}
              </div>

              {/* Search results — filtered by commercial stock state (HIDE-NO-VARIANTS-01) */}
              {searchResults.length > 0 && !selectedProduct && (() => {
                const isExactQuery = searchResults.length === 1
                  && searchResults[0].referenceCode.toLowerCase() === searchQuery.trim().toLowerCase();

                // Separate sellable from no-variant products
                const sellable: OrderProductSearchResult[] = [];
                const noVariantExact: OrderProductSearchResult[] = [];
                let productosOcultosSinVariantes = 0;

                for (const p of searchResults) {
                  const ss = getCommercialStockState(p);
                  if (!isProductSellable(p)) {
                    productosOcultosSinVariantes++;
                    // Only show no-variant products for exact reference match
                    if (isExactQuery) noVariantExact.push(p);
                  } else if (ss.shouldShowInSearch || isExactQuery) {
                    sellable.push(p);
                  } else {
                    // Zero-stock products hidden from general search
                  }
                }

                // Dev diagnostic (FASE 5)
                if (productosOcultosSinVariantes > 0) {
                  console.debug(`[pedidos] productosOcultosSinVariantes: ${productosOcultosSinVariantes}`);
                }

                if (sellable.length === 0 && noVariantExact.length === 0) return (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    padding: S[3], textAlign: "center",
                  }}>
                    Sin referencias con stock disponible
                  </div>
                );
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                    {/* Sellable products */}
                    {sellable.slice(0, 8).map(p => {
                      const ss = getCommercialStockState(p);
                      const badgeColor = ss.severity === "danger" ? C.red
                        : ss.severity === "warning" ? C.amber
                        : ss.severity === "neutral" ? C.inkFaint : C.green;
                      const badgeBg = ss.severity === "danger" ? C.redLight
                        : ss.severity === "warning" ? C.amberLight
                        : ss.severity === "neutral" ? C.surfaceAlt : C.greenLight;
                      const isOut = ss.state === "out";
                      return (
                        <button
                          key={p.referenceCode}
                          onClick={() => !isOut && selectProduct(p)}
                          disabled={isOut}
                          style={{
                            ...panel, padding: `${S[2]}px ${S[3]}px`, textAlign: "left", width: "100%",
                            cursor: isOut ? "not-allowed" : "pointer",
                            background: isOut ? C.surfaceAlt : C.white,
                            border: `1px solid ${C.line}`,
                            opacity: isOut ? 0.6 : 1,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                                {p.referenceCode}
                              </span>
                              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginLeft: S[2] }}>
                                {p.productName}
                              </span>
                            </div>
                            <span style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: "1px 6px", borderRadius: R.sm,
                              background: badgeBg, color: badgeColor, flexShrink: 0,
                            }}>
                              {ss.label}
                            </span>
                          </div>
                          <div style={{
                            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2,
                          }}>
                            <span style={{ color: badgeColor, fontWeight: T.wt.semibold }}>
                              {ss.helperText}
                            </span>
                            {" · "}
                            {p.variantCount} variantes
                            {" · "}
                            ${p.unitPrice.toLocaleString()} / ud
                          </div>
                        </button>
                      );
                    })}

                    {/* No-variant products — disabled, exact match only (FASE 2) */}
                    {noVariantExact.map(p => (
                      <div
                        key={p.referenceCode}
                        style={{
                          ...panel, padding: `${S[2]}px ${S[3]}px`, textAlign: "left", width: "100%",
                          background: C.surfaceAlt, border: `1px solid ${C.line}`,
                          opacity: 0.7, cursor: "not-allowed",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.inkMid }}>
                              {p.referenceCode}
                            </span>
                            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: S[2] }}>
                              {p.productName}
                            </span>
                          </div>
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "1px 6px", borderRadius: R.sm,
                            background: C.surfaceAlt, color: C.inkFaint, flexShrink: 0,
                            border: `1px solid ${C.line}`,
                          }}>
                            Pendiente variantes SAG
                          </span>
                        </div>
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2,
                        }}>
                          Producto importado desde SAG, sin tallas/colores disponibles en Agentik
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── PRODUCT MATRIX ─────────────────────────────────────────── */}
              {selectedProduct && matrixColors.length > 0 && matrixSizes.length > 0 && (
                <div style={{ ...panel, padding: S[3] }}>
                  {/* Product header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[3] }}>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                        {selectedProduct.productName}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                        {selectedProduct.referenceCode}
                        {" · "}
                        {selectedProduct.availableQty !== null
                          ? <span style={{ color: selectedProduct.availableQty > 10 ? C.green : selectedProduct.availableQty > 0 ? C.amber : C.red }}>
                              {selectedProduct.availableQty} uds disponibles
                            </span>
                          : <span style={{ color: C.inkFaint }}>sin datos de stock</span>}
                        {" · "}
                        {selectedProduct.variantCount} variantes
                        {" · "}
                        ${selectedProduct.unitPrice.toLocaleString()} / ud
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProduct(null); setSearchQuery(""); searchInputRef.current?.focus(); }}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                        background: "transparent", border: `1px solid ${C.line}`,
                        borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
                      }}>
                      Cambiar
                    </button>
                  </div>

                  {/* Stock warning banner (SCARCITY-01) */}
                  {(() => {
                    const ss = getCommercialStockState(selectedProduct);
                    if (ss.state === "available") return null;
                    const bannerColor =
                      ss.severity === "danger" ? C.red
                      : ss.severity === "warning" ? C.amber
                      : C.inkFaint;
                    return (
                      <div style={{
                        fontFamily: T.mono, fontSize: T.sz.xs,
                        padding: `${S[1]}px ${S[2]}px`, marginBottom: S[2],
                        borderRadius: R.sm,
                        background: ss.severity === "danger" ? `${C.red}10`
                          : ss.severity === "warning" ? `${C.amber}10`
                          : `${C.inkFaint}10`,
                        border: `1px solid ${bannerColor}20`,
                        color: bannerColor,
                      }}>
                        {ss.label} — {ss.helperText}
                      </div>
                    );
                  })()}

                  {/* Matrix table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%", borderCollapse: "collapse",
                      fontFamily: T.mono, fontSize: T.sz.xs,
                    }}>
                      <thead>
                        <tr>
                          <th style={{
                            textAlign: "left", padding: `${S[1]}px ${S[2]}px`,
                            fontWeight: T.wt.semibold, color: C.inkFaint,
                            borderBottom: `1px solid ${C.line}`,
                          }}>
                            Color / Talla
                          </th>
                          {matrixSizes.map(sz => (
                            <th key={sz} style={{
                              textAlign: "center", padding: `${S[1]}px ${S[1]}px`,
                              fontWeight: T.wt.semibold, color: C.ink, minWidth: 56,
                              borderBottom: `1px solid ${C.line}`,
                            }}>
                              {sz}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixColors.map(color => (
                          <tr key={color}>
                            <td style={{
                              padding: `${S[2]}px ${S[2]}px`, fontWeight: T.wt.semibold,
                              color: C.ink, borderBottom: `1px solid ${C.line}`,
                              whiteSpace: "nowrap",
                            }}>
                              {color}
                            </td>
                            {matrixSizes.map(size => {
                              const cell = matrixCells.find(c => c.color === color && c.size === size);
                              if (!cell) return <td key={size} />;
                              const noStock = cell.available !== null && cell.available <= 0;
                              const cellColor = noStock ? C.inkFaint
                                : cell.available !== null && cell.available <= 10 ? C.amber : C.green;
                              return (
                                <td key={size} style={{
                                  padding: `${S[1]}px`, textAlign: "center",
                                  borderBottom: `1px solid ${C.line}`,
                                }}>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={cell.available ?? undefined}
                                    value={cell.quantity || ""}
                                    disabled={noStock}
                                    onChange={e => updateCellQty(color, size, parseInt(e.target.value) || 0)}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        // Move to next input
                                        const next = (e.target as HTMLElement).closest("td")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null;
                                        if (next) next.focus();
                                        else if ((e.metaKey || e.ctrlKey) && matrixTotal > 0) addMatrixToOrder();
                                      }
                                    }}
                                    placeholder="0"
                                    style={{
                                      width: 52, height: 36, textAlign: "center",
                                      fontFamily: T.mono, fontSize: T.sz.sm,
                                      border: `1px solid ${cell.quantity > 0 ? C.blueDark : C.line}`,
                                      borderRadius: R.sm, outline: "none",
                                      background: noStock ? C.surfaceAlt : cell.quantity > 0 ? C.blueLight : C.white,
                                      color: noStock ? C.inkFaint : C.ink,
                                      fontWeight: cell.quantity > 0 ? T.wt.bold : T.wt.normal,
                                      cursor: noStock ? "not-allowed" : "text",
                                    }}
                                  />
                                  {/* Stock indicator: "disp. N" */}
                                  <div style={{
                                    fontFamily: T.mono, fontSize: "9px", marginTop: 1,
                                    color: cellColor,
                                  }}>
                                    {cell.available === null ? "\u2014"
                                      : noStock ? "sin stock"
                                      : `disp. ${cell.available}`}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Stock feedback */}
                  {stockFeedback && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
                      padding: `${S[1]}px ${S[2]}px`, background: C.amberLight,
                      borderRadius: R.sm, marginTop: S[2], textAlign: "center",
                    }}>
                      {stockFeedback}
                    </div>
                  )}

                  {/* Matrix footer: add button + summary */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    marginTop: S[3], paddingTop: S[2], borderTop: `1px solid ${C.line}`,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                      {matrixTotal > 0
                        ? <>
                            <strong>{matrixCells.filter(c => c.quantity > 0).length}</strong> combinaciones
                            {" · "}
                            <strong>{matrixTotal}</strong> unidades
                            {selectedProduct && (
                              <> · <strong>${(matrixTotal * selectedProduct.unitPrice).toLocaleString()}</strong></>
                            )}
                          </>
                        : "Digita cantidades en la matriz"}
                    </div>
                    <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                      <button
                        onClick={addMatrixToOrder}
                        disabled={matrixTotal === 0}
                        className="ag-action-primary"
                        style={{
                          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                          color: C.white,
                          background: matrixTotal > 0 ? C.blueDark : C.inkFaint,
                          border: "none", borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
                          cursor: matrixTotal > 0 ? "pointer" : "not-allowed",
                        }}
                      >
                        Agregar cantidades
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Single-variant product (no matrix needed) */}
              {selectedProduct && (matrixColors.length === 0 || matrixSizes.length === 0) && (
                <div style={{ ...panel, padding: S[3] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                    {selectedProduct.productName} ({selectedProduct.referenceCode})
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                    Producto sin variantes de talla/color. Agrega directamente.
                  </div>
                  <div style={{ display: "flex", gap: S[2], alignItems: "center", marginTop: S[2] }}>
                    <input
                      type="number"
                      min={1}
                      value={matrixTotal || ""}
                      onChange={e => {
                        const qty = parseInt(e.target.value) || 0;
                        setMatrixCells([{
                          color: selectedProduct.variants[0]?.color ?? "",
                          size: selectedProduct.variants[0]?.size ?? "",
                          quantity: qty,
                          available: selectedProduct.variants[0]?.availability.availableUnits ?? null,
                          variantId: selectedProduct.variants[0]?.variantId ?? "",
                        }]);
                      }}
                      placeholder="Cantidad"
                      style={{ ...inputStyle, width: 80, textAlign: "center" }}
                    />
                    <button onClick={() => {
                      const v = selectedProduct.variants[0];
                      if (!v || matrixTotal <= 0) return;
                      onAddLine({
                        referenceCode: selectedProduct.referenceCode,
                        productName: selectedProduct.productName,
                        size: v.size, color: v.color,
                        quantity: matrixTotal,
                        availableUnits: v.availability.availableUnits,
                        unitPrice: selectedProduct.unitPrice,
                        thumbnailUrl: selectedProduct.thumbnailUrl,
                      });
                      showFeedback(`Agregado: ${selectedProduct.productName} x${matrixTotal}`);
                      setSelectedProduct(null);
                      setMatrixCells([]);
                      setSearchQuery("");
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }} className="ag-action-primary" style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                      color: C.white, background: C.blueDark, border: "none",
                      borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                    }}>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Order lines grouped by reference ───────────────────────── */}
              {activeLines.length > 0 && (
                <OrderLinesGrouped
                  lines={activeLines}
                  onUpdateQty={onUpdateLineQty}
                  onRemove={onRemoveLine}
                  onEditRef={(refCode) => {
                    // Re-search the reference to reopen matrix
                    handleSearch(refCode);
                  }}
                />
              )}

              {/* Navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: S[3] }}>
                <button onClick={() => setStep("cliente")} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                  background: "transparent", border: `1px solid ${C.line}`,
                  borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                }}>
                  Volver a cliente
                </button>
                <button
                  onClick={() => canAdvanceToResumen && setStep("resumen")}
                  disabled={!canAdvanceToResumen}
                  className="ag-action-primary"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: C.white,
                    background: canAdvanceToResumen ? C.blueDark : C.inkFaint,
                    border: "none", borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`,
                    cursor: canAdvanceToResumen ? "pointer" : "not-allowed",
                  }}
                >
                  Ver resumen
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: RESUMEN ═══════════════════════════════════════════ */}
          {step === "resumen" && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
              {/* Client summary */}
              <div style={{ ...panel, padding: S[3], borderLeft: `3px solid ${C.blueDark}` }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                  {header.customerName}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
                  NIT: {header.customerId} · Vendedor: {header.sellerName}
                  {header.channel ? ` · ${header.channel}` : ""}
                  {selectedCustomerCity ? ` · ${selectedCustomerCity}` : ""}
                </div>
                {header.customerCode && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                    padding: "1px 5px", borderRadius: R.sm, display: "inline-block",
                    background: C.greenLight, color: C.green, marginTop: 3,
                  }}>
                    SAG: {header.customerCode}
                  </div>
                )}
                {missingSagCode && !isTestClient && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginTop: 3,
                  }}>
                    Sin codigo SAG — no se podra enviar a SAG
                  </div>
                )}
                {isTestClient && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                    color: C.amber, marginTop: S[1],
                  }}>
                    CLIENTE PRUEBA — NO SINCRONIZAR SAG
                  </div>
                )}
              </div>

              {/* Lines grouped */}
              <OrderLinesGrouped
                lines={activeLines}
                onUpdateQty={onUpdateLineQty}
                onRemove={onRemoveLine}
                onEditRef={(refCode) => { setStep("productos"); handleSearch(refCode); }}
              />

              {/* Totals */}
              <div style={{
                ...panel, padding: S[3],
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2],
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Referencias</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
                    {summary.uniqueReferences}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Unidades</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
                    {summary.totalUnits}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {(summary.discountAmount ?? 0) > 0 ? "Subtotal" : "Total"}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green }}>
                    ${summary.totalValue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Discount preview (if active) */}
              {(summary.discountAmount ?? 0) > 0 && (
                <div style={{
                  ...panel, padding: S[3],
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2],
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Subtotal</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
                      ${summary.totalValue.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>Descuento</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.red }}>
                      -${(summary.discountAmount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Total final</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green }}>
                      ${(summary.totalFinal ?? summary.totalValue).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Commercial conditions (ORDER-CREATION-POLISH-01) ─────── */}
              <div style={{ ...panel, padding: S[3] }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.ink, marginBottom: S[3],
                }}>
                  Condiciones comerciales
                </div>

                {/* 1. Delivery mode */}
                <div style={{ marginBottom: S[3] }}>
                  <div style={labelStyle}>Tipo de entrega</div>
                  <div style={{ display: "flex", gap: S[3] }}>
                    {(["immediate", "scheduled"] as DeliveryMode[]).map(mode => (
                      <label key={mode} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                      }}>
                        <input
                          type="radio"
                          name="deliveryMode"
                          checked={(header.deliveryMode ?? "immediate") === mode}
                          onChange={() => onHeaderChange({
                            ...header,
                            deliveryMode: mode,
                            deliveryDate: mode === "immediate" ? null : header.deliveryDate,
                          })}
                        />
                        {mode === "immediate" ? "Entrega inmediata" : "Entrega programada"}
                      </label>
                    ))}
                  </div>
                  {(header.deliveryMode === "scheduled") && (
                    <div style={{ marginTop: S[2] }}>
                      <div style={labelStyle}>Fecha compromiso</div>
                      <input
                        type="date"
                        value={header.deliveryDate ?? ""}
                        onChange={e => onHeaderChange({ ...header, deliveryDate: e.target.value || null })}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>

                {/* 2. Discount */}
                <div style={{ marginBottom: S[3] }}>
                  <div style={labelStyle}>Descuento</div>
                  <div style={{ display: "flex", gap: S[3], marginBottom: S[1] }}>
                    {(["percentage", "fixed"] as DiscountType[]).map(dt => (
                      <label key={dt} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                      }}>
                        <input
                          type="radio"
                          name="discountType"
                          checked={(header.discountType ?? "percentage") === dt}
                          onChange={() => onHeaderChange({ ...header, discountType: dt })}
                        />
                        {dt === "percentage" ? "Porcentaje" : "Valor fijo"}
                      </label>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={header.discountType === "fixed" ? 1000 : 1}
                    placeholder={header.discountType === "fixed" ? "Valor descuento" : "% descuento"}
                    value={header.discountValue ?? ""}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      onHeaderChange({ ...header, discountValue: v });
                    }}
                    style={{ ...inputStyle, maxWidth: 200 }}
                  />
                </div>

                {/* 3. Customer notes */}
                <div style={{ marginBottom: S[3] }}>
                  <div style={labelStyle}>Observaciones para cliente</div>
                  <textarea
                    value={header.customerNotes ?? ""}
                    onChange={e => onHeaderChange({ ...header, customerNotes: e.target.value })}
                    placeholder="Informacion visible para el cliente (ej: entregar despues del 15 de julio)"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                </div>

                {/* 4. Internal notes */}
                <div>
                  <div style={{ ...labelStyle, color: C.amber }}>Notas internas (solo Agentik)</div>
                  <textarea
                    value={header.internalNotes ?? ""}
                    onChange={e => onHeaderChange({ ...header, internalNotes: e.target.value })}
                    placeholder="Solo visible dentro de Agentik (ej: cliente estrategico, revisar cartera)"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" as const, borderColor: C.amberBorder || C.amber }}
                  />
                </div>
              </div>

              {/* Validation */}
              {!canAdvanceToResumen && (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                  padding: `${S[2]}px ${S[3]}px`, background: C.redLight, borderRadius: R.sm,
                }}>
                  Revisa: hay lineas con cantidades que exceden disponibilidad.
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
                <button onClick={() => setStep("productos")} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                  background: "transparent", border: `1px solid ${C.line}`,
                  borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                }}>
                  Editar productos
                </button>
                <button onClick={onSaveDraft} style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.blueDark, background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
                }}>
                  {isEditing ? "Actualizar borrador" : "Guardar borrador"}
                </button>
                <button onClick={onSubmit} className="ag-action-primary" style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                  color: C.white, background: C.blueDark, border: "none",
                  borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
                  flex: 1,
                }}>
                  Confirmar pedido
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR: Live summary ─────────────────────────────────── */}
        {step === "productos" && (
          <div style={{
            width: 200, flexShrink: 0,
            position: "sticky", top: 0, alignSelf: "flex-start",
          }}>
            <div style={{ ...panel, padding: S[3] }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.ink, marginBottom: S[2],
              }}>
                Resumen
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                <SummaryStat label="Referencias" value={summary.uniqueReferences} />
                <SummaryStat label="Unidades" value={summary.totalUnits} />
                <SummaryStat label="Subtotal" value={`$${summary.totalValue.toLocaleString()}`} color={C.green} />
              </div>
              {activeLines.some(l => l.availableUnits !== null && l.quantity > l.availableUnits) && (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                  marginTop: S[2], padding: `${S[1]}px ${S[2]}px`,
                  background: C.redLight, borderRadius: R.sm,
                }}>
                  Hay lineas que exceden stock
                </div>
              )}
              {/* Current matrix product preview */}
              {selectedProduct && matrixTotal > 0 && (
                <div style={{
                  marginTop: S[3], paddingTop: S[2], borderTop: `1px solid ${C.line}`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
                    Digitando
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                    {selectedProduct.referenceCode}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                    {matrixCells.filter(c => c.quantity > 0).length} comb · {matrixTotal} uds
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, fontWeight: T.wt.semibold }}>
                    ${(matrixTotal * selectedProduct.unitPrice).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ── OrderLinesGrouped ─────────────────────────────────────────────────────────

function OrderLinesGrouped({
  lines, onUpdateQty, onRemove, onEditRef,
}: {
  lines: OrderLine[];
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onEditRef: (refCode: string) => void;
}) {
  // Group by referenceCode
  const groups = new Map<string, { name: string; lines: OrderLine[] }>();
  for (const l of lines) {
    const g = groups.get(l.referenceCode);
    if (g) {
      g.lines.push(l);
    } else {
      groups.set(l.referenceCode, { name: l.productName, lines: [l] });
    }
  }

  return (
    <div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
        color: C.ink, marginBottom: S[2],
      }}>
        Lineas del pedido ({lines.length})
      </div>
      {[...groups.entries()].map(([refCode, group]) => {
        const groupUnits = group.lines.reduce((s, l) => s + l.quantity, 0);
        const groupValue = group.lines.reduce((s, l) => s + l.lineTotal, 0);
        return (
          <div key={refCode} style={{
            ...panel, padding: S[2], marginBottom: S[2],
          }}>
            {/* Reference header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: S[1],
            }}>
              <div>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  {group.name}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: S[2] }}>
                  {refCode}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {groupUnits} uds · ${groupValue.toLocaleString()}
                </span>
                <button onClick={() => onEditRef(refCode)} style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
                  background: "transparent", border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.sm, padding: "1px 6px", cursor: "pointer",
                }}>
                  Editar
                </button>
              </div>
            </div>
            {/* Lines within group */}
            {group.lines.map(l => {
              const overStock = l.availableUnits !== null && l.quantity > l.availableUnits;
              return (
                <div key={l.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: `${S[1]}px ${S[2]}px`,
                  borderTop: `1px solid ${C.line}`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                    <span style={{ fontWeight: T.wt.semibold }}>
                      {l.color}{l.color && l.size ? " " : ""}{l.size}
                    </span>
                    {overStock && (
                      <span style={{
                        marginLeft: S[1], fontSize: T.sz["2xs"], color: C.red,
                        fontWeight: T.wt.semibold,
                      }}>
                        (max: {l.availableUnits})
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                      color: overStock ? C.red : C.ink, minWidth: 30, textAlign: "right",
                    }}>
                      x{l.quantity}
                    </span>
                    <button onClick={() => onRemove(l.id)} style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                      background: "transparent", border: "none", cursor: "pointer",
                      padding: "0 4px",
                    }}>
                      x
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── SummaryStat ───────────────────────────────────────────────────────────────

function SummaryStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: color ?? C.ink }}>
        {value}
      </span>
    </div>
  );
}
