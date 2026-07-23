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
  DeliveryScope,
} from "@/lib/comercial/pedidos/order-types";
import { evaluateAutoSizeDistribution } from "@/lib/comercial/pedidos/order-decision-engine";
import { CASTILLITOS_ORDER_POLICY_PACK_CONFIG } from "@/lib/comercial/pedidos/order-policy-pack-config";
import type { SizeInventorySnapshot } from "@/lib/comercial/pedidos/order-decision-types";
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
  customerId: string;   // NIT
  city: string;
  sagCode: string;
  profileId: string;
  address: string;
  sellerName: string;
  sellerId: string;
  sagReadiness: string;
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

/**
 * Stock state for a single matrix cell (size × color).
 * WIZARD-IMPROVEMENTS-01: enhanced with operational inventory fields.
 *
 * States:
 *   available      — operationalAvailableQty > 10
 *   low_stock      — 0 < operationalAvailableQty <= 10
 *   no_stock       — operationalAvailableQty === 0 (or physicalQty === 0)
 *   unknown        — physicalQty is null (not synced)
 *   reserved       — reservedQty > 0 (shown as info, not blocking)
 */
type MatrixCellState = "available" | "low_stock" | "no_stock" | "unknown" | "reserved_full";

interface MatrixCell {
  color: string;
  size: string;
  /** Assigned quantity (editable by user) */
  quantity: number;
  /** Physical stock from SAG snapshot — null = not synced */
  physicalQty: number | null;
  /** Units reserved by other orders (Agentik reservations) */
  reservedQty: number;
  /** Operational available = physical - reserved - salesAssigned - pendingTransfers */
  operationalAvailableQty: number | null;
  /** Legacy field — kept for compatibility, equals operationalAvailableQty ?? physicalQty */
  available: number | null;
  variantId: string;
  /** Computed cell state for visual differentiation */
  cellState: MatrixCellState;
}

function computeCellState(cell: Pick<MatrixCell, "physicalQty" | "operationalAvailableQty">): MatrixCellState {
  if (cell.physicalQty === null || cell.physicalQty === undefined) return "unknown";
  const avail = cell.operationalAvailableQty ?? cell.physicalQty;
  if (avail <= 0) return "no_stock";
  if (avail <= 10) return "low_stock";
  return "available";
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
  const [selectedCustomerAddress, setSelectedCustomerAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [missingSagCode, setMissingSagCode] = useState(false);

  // Auto-distribution state (WIZARD-IMPROVEMENTS-01)
  const [autoDistributeQty, setAutoDistributeQty] = useState<number>(0);

  // Validation: seller NOT required (warning only per FOUNDATION-01)
  const clientValid = clientMode === "selected"
    ? Boolean(header.customerName.trim() && (header.customerId.trim() || header.customerCode.trim()))
    : clientMode === "manual"
      ? Boolean(header.customerName.trim() && header.customerId.trim() && manualCity.trim() && header.channel.trim())
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
      // Auto-assign seller from canonical profile (WIZARD-IMPROVEMENTS-01)
      sellerId: c.sellerId || header.sellerId,
      sellerName: c.sellerName || header.sellerName,
      channel: header.channel,
      // Address from canonical service
      customerAddress: c.address || "",
      customerCity: c.city || "",
    });
    setSelectedCustomerCity(c.city ?? "");
    setSelectedCustomerAddress(c.address ?? "");
    setMissingSagCode(!hasSag);
    setClientMode("selected");
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function clearCustomer() {
    onHeaderChange({
      customerId: "", customerName: "", customerCode: "",
      sellerId: "", sellerName: "", channel: "", notes: "",
      customerAddress: "", customerCity: "",
    });
    setClientMode("search");
    setMissingSagCode(false);
    setSelectedCustomerCity("");
    setSelectedCustomerAddress("");
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
    // Initialize cells with operational inventory data
    const cells: MatrixCell[] = [];
    for (const color of colors) {
      for (const size of sizes) {
        const variant = p.variants.find(v => v.color === color && v.size === size);
        const physicalQty = variant?.availability.availableUnits ?? null;
        // TODO: When operational inventory API is wired, populate reservedQty from snapshot
        // For now, reservedQty = 0 (product API does not yet include reservation data)
        const reservedQty = 0;
        const operationalAvailableQty = physicalQty !== null ? Math.max(0, physicalQty - reservedQty) : null;
        const cell: MatrixCell = {
          color,
          size,
          quantity: 0,
          physicalQty,
          reservedQty,
          operationalAvailableQty,
          available: operationalAvailableQty ?? physicalQty,
          variantId: variant?.variantId ?? "",
          cellState: "available",
        };
        cell.cellState = computeCellState(cell);
        cells.push(cell);
      }
    }
    setMatrixCells(cells);
  }

  const [stockFeedback, setStockFeedback] = useState<string | null>(null);

  function updateCellQty(color: string, size: string, qty: number) {
    setMatrixCells(prev => prev.map(c => {
      if (c.color !== color || c.size !== size) return c;
      // Enforce: no negatives, no decimals
      let clamped = Math.max(0, Math.floor(qty));
      // Enforce: no assignment on unknown stock
      if (c.cellState === "unknown" && clamped > 0) {
        setStockFeedback("No se puede asignar sobre stock desconocido");
        setTimeout(() => setStockFeedback(null), 2000);
        return c;
      }
      // Enforce: cap at operational availability
      const maxAvail = c.operationalAvailableQty ?? c.available;
      if (maxAvail !== null && clamped > maxAvail) {
        clamped = maxAvail;
        setStockFeedback(`Maximo disponible operacional: ${maxAvail}`);
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

  // ── Auto-distribute by sizes (WIZARD-IMPROVEMENTS-01) ──────────────────
  function handleAutoDistribute() {
    if (!selectedProduct || autoDistributeQty <= 0) return;

    // Build SizeInventorySnapshot from current matrix — aggregate across all colors
    // Skip unknown stock cells (no auto-assignment on unknown)
    const sizeMap = new Map<string, number>();
    for (const cell of matrixCells) {
      if (cell.cellState === "unknown") continue; // Never auto-distribute on unknown stock
      const avail = cell.operationalAvailableQty ?? cell.available;
      if (avail === null || avail <= 0) continue;
      const curr = sizeMap.get(cell.size) ?? 0;
      sizeMap.set(cell.size, curr + avail);
    }

    const snapshot: SizeInventorySnapshot = {
      referenceCode: selectedProduct.referenceCode,
      productName: selectedProduct.productName,
      sizes: [...sizeMap.entries()].map(([size, avail]) => ({
        size,
        sizeName: size,
        availableUnits: avail,
      })),
    };

    const result = evaluateAutoSizeDistribution(
      selectedProduct.referenceCode,
      selectedProduct.productName,
      autoDistributeQty,
      snapshot,
      CASTILLITOS_ORDER_POLICY_PACK_CONFIG,
    );

    // Apply distribution to matrix cells
    // For each size, distribute proportionally across colors.
    // Uses stable index lookup (size+color) — never indexOf by object reference.
    setMatrixCells(prev => {
      const newCells = [...prev];

      // Build index: "size\0color" → position in newCells
      const cellIndex = new Map<string, number>();
      for (let i = 0; i < newCells.length; i++) {
        cellIndex.set(`${newCells[i].size}\0${newCells[i].color}`, i);
      }

      for (const entry of result.distribution) {
        if (entry.allocatedUnits <= 0) continue;
        // Find eligible cell indices for this size (have stock, not unknown)
        const eligibleIndices: number[] = [];
        for (let i = 0; i < newCells.length; i++) {
          const c = newCells[i];
          if (c.size === entry.size && c.cellState !== "unknown"
            && (c.operationalAvailableQty ?? c.available ?? 0) > 0) {
            eligibleIndices.push(i);
          }
        }
        if (eligibleIndices.length === 0) continue;

        // Split allocated units across colors for this size
        let remaining = entry.allocatedUnits;
        const perColor = Math.floor(remaining / eligibleIndices.length);

        for (const idx of eligibleIndices) {
          const c = newCells[idx];
          const cellAvail = c.operationalAvailableQty ?? c.available ?? 0;
          const alloc = Math.min(perColor || remaining, cellAvail, remaining);
          newCells[idx] = { ...c, quantity: alloc };
          remaining -= alloc;
        }

        // Distribute remainder
        if (remaining > 0) {
          for (const idx of eligibleIndices) {
            if (remaining <= 0) break;
            const c = newCells[idx];
            const cellAvail = c.operationalAvailableQty ?? c.available ?? 0;
            const canAdd = Math.min(remaining, cellAvail - c.quantity);
            if (canAdd > 0) {
              newCells[idx] = { ...c, quantity: c.quantity + canAdd };
              remaining -= canAdd;
            }
          }
        }
      }
      return newCells;
    });

    const msg = result.totalAllocated === autoDistributeQty
      ? `Distribuidas ${result.totalAllocated} uds en ${result.distribution.filter(d => d.allocatedUnits > 0).length} tallas`
      : `Distribuidas ${result.totalAllocated} de ${autoDistributeQty} uds (inventario insuficiente)`;
    showFeedback(msg);
    setAutoDistributeQty(0);
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
  // No discount for new orders (WIZARD-IMPROVEMENTS-01)
  const summary = computeOrderSummary(activeLines);
  const matrixTotal = matrixCells.reduce((s, c) => s + c.quantity, 0);
  const matrixOverStock = matrixCells.filter(c => c.quantity > 0 && c.available !== null && c.quantity > c.available);

  // Delivery scope metrics
  const totalRequested = autoDistributeQty > 0 ? autoDistributeQty : summary.totalUnits;
  const totalAssigned = summary.totalUnits;
  const totalShortfall = Math.max(0, totalRequested - totalAssigned);
  const coveragePercent = totalRequested > 0 ? Math.round((totalAssigned / totalRequested) * 100) : 100;
  const hasShortfall = totalShortfall > 0;
  const deliveryScope = header.deliveryScope ?? "full";

  // FULL: blocks confirmation when shortfall exists
  // PARTIAL: allows confirming available quantity
  const hasOverStock = activeLines.some(l => l.availableUnits !== null && l.quantity > l.availableUnits);
  const canAdvanceToResumen = activeLines.length > 0 && clientValid && !hasOverStock;
  const canConfirmOrder = canAdvanceToResumen
    && (deliveryScope === "partial" || !hasShortfall);

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
                              {c.sellerName ? ` · ${c.sellerName}` : ""}
                            </div>
                            {c.address && (
                              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                                {c.address}
                              </div>
                            )}
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
                              {c.sagReadiness === "SAG_SUBMISSION_READY" && (
                                <span style={{
                                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                                  padding: "1px 5px", borderRadius: R.sm,
                                  background: C.greenLight, color: C.green,
                                }}>
                                  Listo SAG
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
                        {/* Address display (WIZARD-IMPROVEMENTS-01) */}
                        {selectedCustomerAddress && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
                            {selectedCustomerAddress}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: S[2], marginTop: 3 }}>
                          {header.customerCode && (
                            <span style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: "1px 5px", borderRadius: R.sm,
                              background: C.greenLight, color: C.green,
                            }}>
                              SAG: {header.customerCode}
                            </span>
                          )}
                          {/* Seller badge — auto-assigned, not required */}
                          {header.sellerName ? (
                            <span style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: "1px 5px", borderRadius: R.sm,
                              background: C.blueLight, color: C.blueDark,
                            }}>
                              Vendedor: {header.sellerName}
                            </span>
                          ) : (
                            <span style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: "1px 5px", borderRadius: R.sm,
                              background: C.amberLight, color: C.amber,
                            }}>
                              Sin vendedor asignado
                            </span>
                          )}
                        </div>
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

                  {/* Seller override — optional, collapsible */}
                  <div>
                    <label style={labelStyle}>Vendedor (opcional — cambiar si necesario)</label>
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
                      <option value="">— Sin vendedor —</option>
                      {sellers.map(s => (
                        <option key={s.sellerId} value={s.sellerId}>
                          {s.sellerName}{!s.active ? " (inactivo)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Canal — only Mayorista / Detal (WIZARD-IMPROVEMENTS-01) */}
                  <div>
                    <label style={labelStyle}>Canal</label>
                    <select
                      value={header.channel}
                      onChange={e => onHeaderChange({ ...header, channel: e.target.value })}
                      style={{ ...inputStyle, background: C.white }}
                    >
                      <option value="">— Canal —</option>
                      <option value="mayorista">Mayorista</option>
                      <option value="detal">Detal</option>
                    </select>
                  </div>

                  {/* Observaciones */}
                  <div>
                    <label style={labelStyle}>Observaciones</label>
                    <input type="text" value={header.notes}
                      onChange={e => onHeaderChange({ ...header, notes: e.target.value })}
                      placeholder="Notas adicionales" style={inputStyle} />
                  </div>

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
                        <option value="detal">Detal</option>
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

                  {/* Auto-distribute (WIZARD-IMPROVEMENTS-01) */}
                  <div style={{
                    display: "flex", gap: S[2], alignItems: "center",
                    padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.line}`, marginBottom: S[2],
                  }}>
                    <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, whiteSpace: "nowrap" }}>
                      Cantidad total:
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={autoDistributeQty || ""}
                      onChange={e => setAutoDistributeQty(parseInt(e.target.value) || 0)}
                      placeholder="Ej: 100"
                      style={{ ...inputStyle, width: 100, textAlign: "center", minHeight: 32, padding: `${S[1]}px ${S[2]}px` }}
                    />
                    <button
                      onClick={handleAutoDistribute}
                      disabled={autoDistributeQty <= 0}
                      className="ag-action-secondary"
                      style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                        color: autoDistributeQty > 0 ? C.blueDark : C.inkFaint,
                        background: autoDistributeQty > 0 ? C.blueLight : C.surface,
                        border: `1px solid ${autoDistributeQty > 0 ? C.blueBorder : C.line}`,
                        borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`,
                        cursor: autoDistributeQty > 0 ? "pointer" : "not-allowed",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Distribuir por tallas
                    </button>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      Distribuye equilibradamente entre tallas con stock
                    </span>
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

                  {/* Matrix table — enhanced with operational inventory (WIZARD-IMPROVEMENTS-01) */}
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
                            borderBottom: `2px solid ${C.line}`,
                          }}>
                            Color / Talla
                          </th>
                          {matrixSizes.map(sz => (
                            <th key={sz} style={{
                              textAlign: "center", padding: `${S[1]}px ${S[1]}px`,
                              fontWeight: T.wt.semibold, color: C.ink, minWidth: 80,
                              borderBottom: `2px solid ${C.line}`,
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
                              whiteSpace: "nowrap", verticalAlign: "top",
                            }}>
                              {color}
                            </td>
                            {matrixSizes.map(size => {
                              const cell = matrixCells.find(c => c.color === color && c.size === size);
                              if (!cell) return <td key={size} />;
                              const isUnknown = cell.cellState === "unknown";
                              const isNoStock = cell.cellState === "no_stock";
                              const isLow = cell.cellState === "low_stock";
                              const isDisabled = isNoStock || isUnknown;

                              const stateColor = isUnknown ? C.inkFaint
                                : isNoStock ? C.red
                                : isLow ? C.amber
                                : C.green;
                              const stateBg = isUnknown ? C.surfaceAlt
                                : isNoStock ? `${C.red}08`
                                : isLow ? `${C.amber}08`
                                : "transparent";

                              const operAvail = cell.operationalAvailableQty;

                              return (
                                <td key={size} style={{
                                  padding: `${S[1]}px`, textAlign: "center",
                                  borderBottom: `1px solid ${C.line}`,
                                  background: stateBg,
                                  verticalAlign: "top",
                                }}>
                                  {/* Quantity input */}
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={operAvail ?? undefined}
                                    value={cell.quantity || ""}
                                    disabled={isDisabled}
                                    onChange={e => updateCellQty(color, size, parseInt(e.target.value) || 0)}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const next = (e.target as HTMLElement).closest("td")?.nextElementSibling?.querySelector("input") as HTMLInputElement | null;
                                        if (next) next.focus();
                                        else if ((e.metaKey || e.ctrlKey) && matrixTotal > 0) addMatrixToOrder();
                                      }
                                    }}
                                    placeholder={isUnknown ? "\u2014" : "0"}
                                    style={{
                                      width: 52, height: 32, textAlign: "center",
                                      fontFamily: T.mono, fontSize: T.sz.sm,
                                      border: `1px solid ${cell.quantity > 0 ? C.blueDark : C.line}`,
                                      borderRadius: R.sm, outline: "none",
                                      background: isDisabled ? C.surfaceAlt : cell.quantity > 0 ? C.blueLight : C.white,
                                      color: isDisabled ? C.inkFaint : C.ink,
                                      fontWeight: cell.quantity > 0 ? T.wt.bold : T.wt.normal,
                                      cursor: isDisabled ? "not-allowed" : "text",
                                    }}
                                  />
                                  {/* Stock detail: physical / reserved / available */}
                                  <div style={{
                                    fontFamily: T.mono, fontSize: "8px", marginTop: 2,
                                    lineHeight: 1.3, color: C.inkFaint,
                                  }}>
                                    {isUnknown ? (
                                      <span style={{ color: C.inkFaint }}>sin datos</span>
                                    ) : (
                                      <>
                                        <div style={{ color: stateColor, fontWeight: T.wt.semibold }}>
                                          {isNoStock ? "sin stock"
                                            : `disp. ${operAvail ?? cell.available}`}
                                        </div>
                                        {cell.reservedQty > 0 && (
                                          <div style={{ color: C.amber }}>
                                            res. {cell.reservedQty}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Matrix allocation summary strip */}
                  {matrixTotal > 0 && (
                    <div style={{
                      display: "flex", gap: S[3], padding: `${S[2]}px ${S[3]}px`,
                      background: C.surface, borderRadius: R.sm, marginTop: S[2],
                      fontFamily: T.mono, fontSize: T.sz.xs,
                    }}>
                      <div>
                        <span style={{ color: C.inkFaint }}>Asignado: </span>
                        <span style={{ fontWeight: T.wt.bold, color: C.ink }}>{matrixTotal}</span>
                      </div>
                      {autoDistributeQty > 0 && matrixTotal < autoDistributeQty && (
                        <>
                          <div>
                            <span style={{ color: C.inkFaint }}>Solicitado: </span>
                            <span style={{ fontWeight: T.wt.bold, color: C.ink }}>{autoDistributeQty}</span>
                          </div>
                          <div>
                            <span style={{ color: C.inkFaint }}>Faltante: </span>
                            <span style={{ fontWeight: T.wt.bold, color: C.red }}>
                              {autoDistributeQty - matrixTotal}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: C.inkFaint }}>Cobertura: </span>
                            <span style={{
                              fontWeight: T.wt.bold,
                              color: matrixTotal >= autoDistributeQty ? C.green : C.amber,
                            }}>
                              {Math.round((matrixTotal / autoDistributeQty) * 100)}%
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

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
                        const physQty = selectedProduct.variants[0]?.availability.availableUnits ?? null;
                        const cell: MatrixCell = {
                          color: selectedProduct.variants[0]?.color ?? "",
                          size: selectedProduct.variants[0]?.size ?? "",
                          quantity: qty,
                          physicalQty: physQty,
                          reservedQty: 0,
                          operationalAvailableQty: physQty,
                          available: physQty,
                          variantId: selectedProduct.variants[0]?.variantId ?? "",
                          cellState: computeCellState({ physicalQty: physQty, operationalAvailableQty: physQty }),
                        };
                        setMatrixCells([cell]);
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
                  NIT: {header.customerId}
                  {header.sellerName ? ` · Vendedor: ${header.sellerName}` : " · Sin vendedor"}
                  {header.channel ? ` · ${header.channel}` : ""}
                  {selectedCustomerCity ? ` · ${selectedCustomerCity}` : ""}
                </div>
                {selectedCustomerAddress && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
                    {selectedCustomerAddress}
                  </div>
                )}
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

              {/* Totals + delivery fulfillment (WIZARD-IMPROVEMENTS-01) */}
              <div style={{
                ...panel, padding: S[3],
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[2],
              }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Referencias</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
                    {summary.uniqueReferences}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Asignado</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
                    {totalAssigned} uds
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {hasShortfall ? "Faltante" : "Cobertura"}
                  </div>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                    color: hasShortfall ? C.red : C.green,
                  }}>
                    {hasShortfall ? `${totalShortfall} uds` : "100%"}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    Valor total
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green }}>
                    ${summary.totalValue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Delivery scope — type of fulfillment */}
              <div style={{ ...panel, padding: S[3] }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.ink, marginBottom: S[3],
                }}>
                  Condiciones de despacho
                </div>

                {/* Delivery scope selector */}
                <div style={{ marginBottom: S[3] }}>
                  <div style={labelStyle}>Tipo de entrega</div>
                  <div style={{ display: "flex", gap: S[3] }}>
                    {(["full", "partial"] as DeliveryScope[]).map(scope => (
                      <label key={scope} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                      }}>
                        <input
                          type="radio"
                          name="deliveryScope"
                          checked={deliveryScope === scope}
                          onChange={() => onHeaderChange({ ...header, deliveryScope: scope })}
                        />
                        {scope === "full" ? "Despacho completo" : "Despacho parcial"}
                      </label>
                    ))}
                  </div>
                </div>

                {/* FULL + shortfall = blocked */}
                {deliveryScope === "full" && hasShortfall && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                    padding: `${S[2]}px ${S[3]}px`, background: C.redLight, borderRadius: R.sm,
                    border: `1px solid ${C.red}20`, marginBottom: S[2],
                  }}>
                    Despacho completo requiere que total asignado ({totalAssigned}) sea igual a total solicitado ({totalRequested}).
                    Faltan {totalShortfall} unidades. Cambia a despacho parcial o ajusta cantidades.
                  </div>
                )}

                {/* PARTIAL info */}
                {deliveryScope === "partial" && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                    padding: `${S[2]}px ${S[3]}px`, background: C.surface, borderRadius: R.sm,
                    marginBottom: S[2],
                  }}>
                    Despacho parcial: se enviara lo disponible ({totalAssigned} uds).
                    {hasShortfall ? ` Los ${totalShortfall} faltantes quedan pendientes de revision.` : ""}
                    {" No se promete backorder automatico."}
                  </div>
                )}

                {/* Delivery summary strip */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[2],
                  padding: `${S[2]}px`, background: C.surfaceAlt, borderRadius: R.sm,
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: C.inkFaint }}>Solicitado</div>
                    <div style={{ fontWeight: T.wt.bold, color: C.ink }}>{totalRequested}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: C.inkFaint }}>Asignado</div>
                    <div style={{ fontWeight: T.wt.bold, color: C.ink }}>{totalAssigned}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: C.inkFaint }}>Faltante</div>
                    <div style={{ fontWeight: T.wt.bold, color: hasShortfall ? C.red : C.green }}>
                      {totalShortfall}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: C.inkFaint }}>Cobertura</div>
                    <div style={{ fontWeight: T.wt.bold, color: coveragePercent >= 100 ? C.green : C.amber }}>
                      {coveragePercent}%
                    </div>
                  </div>
                </div>

                {/* Tipo de entrega badge */}
                <div style={{ marginTop: S[2] }}>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                    padding: "2px 8px", borderRadius: R.sm,
                    background: deliveryScope === "full" ? C.greenLight : C.amberLight,
                    color: deliveryScope === "full" ? C.green : C.amber,
                  }}>
                    {deliveryScope === "full" ? "DESPACHO COMPLETO" : "DESPACHO PARCIAL"}
                  </span>
                </div>
              </div>

              {/* Customer / internal notes */}
              <div style={{ ...panel, padding: S[3] }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.ink, marginBottom: S[3],
                }}>
                  Observaciones
                </div>
                <div style={{ marginBottom: S[3] }}>
                  <div style={labelStyle}>Observaciones para cliente</div>
                  <textarea
                    value={header.customerNotes ?? ""}
                    onChange={e => onHeaderChange({ ...header, customerNotes: e.target.value })}
                    placeholder="Informacion visible para el cliente (ej: entregar despues del 15 de julio)"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                </div>
                <div>
                  <div style={{ ...labelStyle, color: C.amber }}>Notas internas (solo Agentik)</div>
                  <textarea
                    value={header.internalNotes ?? ""}
                    onChange={e => onHeaderChange({ ...header, internalNotes: e.target.value })}
                    placeholder="Solo visible dentro de Agentik (ej: cliente estrategico, revisar cartera)"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" as const, borderColor: C.amberBorder || C.amber }}
                  />
                </div>
              </div>

              {/* Validation messages */}
              {hasOverStock && (
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
                <button
                  onClick={() => canConfirmOrder && onSubmit()}
                  disabled={!canConfirmOrder}
                  className="ag-action-primary"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: C.white,
                    background: canConfirmOrder ? C.blueDark : C.inkFaint,
                    border: "none", borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`,
                    cursor: canConfirmOrder ? "pointer" : "not-allowed",
                    flex: 1,
                  }}
                >
                  {!canConfirmOrder && deliveryScope === "full" && hasShortfall
                    ? "Faltantes impiden despacho completo"
                    : "Confirmar pedido"}
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
