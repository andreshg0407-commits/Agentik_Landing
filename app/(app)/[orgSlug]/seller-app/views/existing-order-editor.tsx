/**
 * Seller App — Existing Order Editor.
 *
 * Sprint: AGENTIK-SELLER-APP-EXISTING-ORDER-EDITOR-P0
 *
 * Dedicated editor for modifying an existing Agentik-native order.
 * NOT the create-order wizard. No steps, no progress bar, no customer
 * selection. Loads canonical order via getOrder, renders existing lines
 * with quantity editing, line removal, and product addition.
 *
 * Mental model: ORDER DETAIL → EDIT EXISTING ORDER
 * Save calls updateOrderDraft() via API update_draft action.
 * Delete calls deleteDraftOrder() via API delete_draft action.
 *
 * All business math stays server-side. React holds draft quantities
 * as presentation state only.
 */
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { SellerIcon, appCard, StatusChip } from "./seller-ui-kit";
import { fmtCOP, DetailSection } from "./seller-app-shared";

// ── Types ────────────────────────────────────────────────────────────────────

interface EditorLine {
  id: string;
  referenceCode: string;
  productName: string;
  size: string;
  color: string;
  colorName: string;
  quantity: number;
  originalQuantity: number;
  availableUnits: number | null;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl: string | null;
  isNew: boolean;
  markedForRemoval: boolean;
}

interface OrderHeader {
  customerId: string;
  customerName: string;
  customerCode: string;
  sellerId: string;
  sellerName: string;
  channel: string;
  notes: string;
  orderDate?: string;
}

interface OrderDetail {
  id: string;
  consecutivo: number;
  header: OrderHeader & {
    deliveryMode?: string;
    deliveryDate?: string | null;
    discountType?: string;
    discountValue?: number;
    customerNotes?: string;
    customerAddress?: string;
    customerCity?: string;
  };
  lines: Array<{
    id: string;
    referenceCode: string;
    productName: string;
    size: string;
    color: string;
    colorName?: string | null;
    quantity: number;
    availableUnits: number | null;
    unitPrice: number;
    lineTotal: number;
    removed: boolean;
    thumbnailUrl?: string | null;
  }>;
  status: string;
  origin: string;
  syncState: string;
  summary: {
    totalLines: number;
    activeLines: number;
    totalUnits: number;
    totalValue: number;
    uniqueReferences: number;
    discountAmount?: number;
    totalFinal?: number;
  };
  createdAt: string;
}

interface ProductSearchResult {
  referenceCode: string;
  productName: string;
  unitPrice: number;
  variants: Array<{
    variantId: string;
    size: string;
    color: string;
    availability: { availableUnits: number | null };
    inventoryStatus: string;
  }>;
  thumbnailUrl: string | null;
  availableQty: number | null;
  variantCount: number;
  inStock: boolean;
  inventoryStatus: string;
  description: string;
  categoryName: string;
  lineName: string;
}

interface ProposalLine {
  variantId: string;
  size: string;
  color: string;
  availableUnits: number;
  allocatedUnits: number;
}

interface AssortmentProposal {
  referenceCode: string;
  productName: string;
  requestedUnits: number;
  allocatedUnits: number;
  unallocatedUnits: number;
  fulfillable: boolean;
  lines: ProposalLine[];
  explanation: string;
}

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  listo_para_enviar: "Listo para enviar",
};

// ── Main Editor ──────────────────────────────────────────────────────────────

export function ExistingOrderEditor({
  orderId,
  orgSlug,
  orgId,
  onClose,
  onDeleted,
}: {
  orderId: string;
  orgSlug: string;
  orgId: string;
  onClose: (updatedOrderId?: string) => void;
  onDeleted: () => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasChangesRef = useRef(false);

  // Load canonical order from server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get", orderId }),
        });
        if (r.ok && !cancelled) {
          const data = await r.json();
          if (data.order) {
            setOrder(data.order);
            setNotes(data.order.header?.notes ?? "");
            setLines(
              data.order.lines
                .filter((l: OrderDetail["lines"][number]) => !l.removed)
                .map((l: OrderDetail["lines"][number]) => ({
                  id: l.id,
                  referenceCode: l.referenceCode,
                  productName: l.productName,
                  size: l.size,
                  color: l.color,
                  colorName: l.colorName ?? l.color,
                  quantity: l.quantity,
                  originalQuantity: l.quantity,
                  availableUnits: l.availableUnits,
                  unitPrice: l.unitPrice,
                  lineTotal: l.quantity * l.unitPrice,
                  thumbnailUrl: l.thumbnailUrl ?? null,
                  isNew: false,
                  markedForRemoval: false,
                })),
            );
          }
        }
      } catch { /* degrade silently */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug, orderId]);

  // Track changes
  useEffect(() => {
    if (!order) return;
    const originalNotes = order.header?.notes ?? "";
    const notesChanged = notes !== originalNotes;
    const linesChanged = lines.some(l =>
      l.isNew || l.markedForRemoval || l.quantity !== l.originalQuantity,
    );
    hasChangesRef.current = notesChanged || linesChanged;
  }, [lines, notes, order]);

  const handleUpdateQuantity = useCallback((lineId: string, delta: number) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const newQty = Math.max(1, l.quantity + delta);
      return { ...l, quantity: newQty, lineTotal: newQty * l.unitPrice };
    }));
  }, []);

  const handleSetQuantity = useCallback((lineId: string, qty: number) => {
    if (qty < 1) return;
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, quantity: qty, lineTotal: qty * l.unitPrice } : l,
    ));
  }, []);

  const handleRemoveLine = useCallback((lineId: string) => {
    setLines(prev => {
      const line = prev.find(l => l.id === lineId);
      if (!line) return prev;
      if (line.isNew) return prev.filter(l => l.id !== lineId);
      return prev.map(l => l.id === lineId ? { ...l, markedForRemoval: true } : l);
    });
  }, []);

  const handleUndoRemove = useCallback((lineId: string) => {
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, markedForRemoval: false } : l,
    ));
  }, []);

  const handleRemoveAllForRef = useCallback((refCode: string) => {
    if (!window.confirm(`¿Eliminar todas las lineas de ${refCode}?`)) return;
    setLines(prev => prev.map(l => {
      if (l.referenceCode !== refCode) return l;
      if (l.isNew) return { ...l, markedForRemoval: true };
      return { ...l, markedForRemoval: true };
    }).filter(l => !(l.isNew && l.markedForRemoval)));
  }, []);

  const handleAddNewLines = useCallback((newLines: EditorLine[]) => {
    setLines(prev => {
      let updated = [...prev];
      for (const nl of newLines) {
        const existing = updated.find(l =>
          !l.markedForRemoval &&
          l.referenceCode === nl.referenceCode &&
          l.size === nl.size &&
          l.color === nl.color,
        );
        if (existing) {
          updated = updated.map(l =>
            l.id === existing.id
              ? { ...l, quantity: l.quantity + nl.quantity, lineTotal: (l.quantity + nl.quantity) * l.unitPrice }
              : l,
          );
        } else {
          updated.push(nl);
        }
      }
      return updated;
    });
    setShowAddProducts(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!order) return;
    setSaving(true);
    setSaveError(null);

    const activeLines = lines.filter(l => !l.markedForRemoval);
    if (activeLines.length === 0) {
      setSaveError("El pedido debe tener al menos una linea.");
      setSaving(false);
      return;
    }

    const header = {
      customerId: order.header.customerId,
      customerName: order.header.customerName,
      customerCode: order.header.customerCode,
      sellerId: order.header.sellerId,
      sellerName: order.header.sellerName,
      channel: order.header.channel,
      notes,
      orderDate: order.header.orderDate,
    };

    const apiLines = activeLines.map(l => ({
      id: l.isNew ? undefined : l.id,
      referenceCode: l.referenceCode,
      productName: l.productName,
      size: l.size,
      color: l.color,
      colorName: l.colorName,
      quantity: l.quantity,
      availableUnits: l.availableUnits,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      removed: false,
      comment: "",
      thumbnailUrl: l.thumbnailUrl,
    }));

    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_draft",
          orderId: order.id,
          header,
          lines: apiLines,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setSaveError(err.error ?? `Error ${r.status}`);
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose(order.id);
    } catch {
      setSaveError("Error de conexion. Intente nuevamente.");
      setSaving(false);
    }
  }, [order, lines, notes, orgSlug, onClose]);

  const handleDelete = useCallback(async () => {
    if (!order) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_draft", orderId: order.id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setSaveError(err.error ?? "No se pudo eliminar el pedido.");
        setDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }
      setDeleting(false);
      onDeleted();
    } catch {
      setSaveError("Error de conexion.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [order, orgSlug, onDeleted]);

  const handleCancel = useCallback(() => {
    if (hasChangesRef.current) {
      if (!window.confirm("Tiene cambios sin guardar. ¿Desea salir?")) return;
    }
    onClose();
  }, [onClose]);

  // Derived totals (presentation only — final authority is server)
  const activeLines = useMemo(() => lines.filter(l => !l.markedForRemoval), [lines]);
  const removedLines = useMemo(() => lines.filter(l => l.markedForRemoval && !l.isNew), [lines]);
  const draftTotal = useMemo(() => activeLines.reduce((s, l) => s + l.lineTotal, 0), [activeLines]);
  const draftUnits = useMemo(() => activeLines.reduce((s, l) => s + l.quantity, 0), [activeLines]);

  // Group active lines by reference for display
  const groupedLines = useMemo(() => {
    const groups: Array<{ refCode: string; productName: string; thumbnailUrl: string | null; lines: EditorLine[] }> = [];
    for (const line of activeLines) {
      let group = groups.find(g => g.refCode === line.referenceCode);
      if (!group) {
        group = { refCode: line.referenceCode, productName: line.productName, thumbnailUrl: line.thumbnailUrl, lines: [] };
        groups.push(group);
      }
      group.lines.push(line);
    }
    return groups;
  }, [activeLines]);

  if (loading) {
    return (
      <div style={{ padding: S[4], textAlign: "center" }}>
        <div style={{ fontSize: T.sz.md, color: C.inkLight, padding: `${S[10]}px 0` }}>
          Cargando pedido...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: S[4], textAlign: "center" }}>
        <div style={{ fontSize: T.sz.md, color: C.inkLight, padding: `${S[10]}px 0` }}>
          No se pudo cargar el pedido.
        </div>
        <button
          onClick={() => onClose()}
          style={{
            padding: `${S[2]}px ${S[4]}px`, background: C.blueDark, color: C.white,
            border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
            cursor: "pointer", marginTop: S[3],
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  // Product add sub-view
  if (showAddProducts) {
    return (
      <div style={{ padding: S[4] }}>
        <button
          onClick={() => setShowAddProducts(false)}
          style={{
            display: "flex", alignItems: "center", gap: S[1],
            background: "none", border: "none", cursor: "pointer",
            color: C.blueDark, fontSize: T.sz.md, fontWeight: T.wt.semibold, fontFamily: T.mono,
            padding: `${S[2]}px 0`, minHeight: 44, marginBottom: S[2], touchAction: "manipulation",
          }}
        >
          <SellerIcon name="back" size={17} color={C.blueDark} /> Volver al editor
        </button>
        <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep, marginBottom: S[3] }}>
          Agregar productos
        </div>
        <AddProductsPanel
          orgSlug={orgSlug}
          onAddLines={handleAddNewLines}
        />
      </div>
    );
  }

  const sc = STATUS_LABELS[order.status] ? { label: STATUS_LABELS[order.status] } : { label: order.status };

  return (
    <div style={{ padding: S[4] }}>
      {/* Cancel / back to detail */}
      <button
        onClick={handleCancel}
        style={{
          display: "flex", alignItems: "center", gap: S[1],
          background: "none", border: "none", cursor: "pointer",
          color: C.blueDark, fontSize: T.sz.md, fontWeight: T.wt.semibold, fontFamily: T.mono,
          padding: `${S[2]}px 0`, minHeight: 44, marginBottom: S[1], touchAction: "manipulation",
        }}
      >
        <SellerIcon name="back" size={17} color={C.blueDark} /> Pedido #{order.consecutivo}
      </button>

      {/* Editor header */}
      <div style={{ ...appCard, padding: S[4], marginBottom: S[3] }}>
        <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep, marginBottom: S[1] }}>
          Editar pedido #{order.consecutivo}
        </div>
        <div style={{ fontSize: T.sz.sm, color: C.inkMid }}>
          {order.header.customerName}
        </div>
        <div style={{ display: "flex", gap: S[3], marginTop: S[2], fontSize: T.sz.xs, color: C.inkLight }}>
          <span>{sc.label}</span>
          <span>{draftUnits} uds</span>
          <span style={{ fontWeight: T.wt.bold, color: C.ink }}>{fmtCOP(draftTotal)}</span>
        </div>
      </div>

      {/* Error banner */}
      {saveError && (
        <div style={{
          padding: S[3], background: C.redLight, border: `1px solid ${C.redBorder}`,
          borderRadius: R.md, marginBottom: S[3], fontSize: T.sz.sm, color: C.redDark,
        }}>
          {saveError}
        </div>
      )}

      {/* Existing lines — grouped by reference */}
      <div style={{ marginBottom: S[3] }}>
        <div style={{
          fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.inkMid,
          textTransform: "uppercase" as const, letterSpacing: "0.03em",
          marginBottom: S[2],
        }}>
          Productos ({activeLines.length} lineas)
        </div>

        {groupedLines.map(group => (
          <div
            key={group.refCode}
            style={{
              ...appCard,
              padding: S[3],
              marginBottom: S[2],
            }}
          >
            {/* Reference header */}
            <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: S[2] }}>
              {group.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={group.thumbnailUrl} alt=""
                  style={{
                    width: 40, height: 40, borderRadius: R.sm,
                    objectFit: "cover", flexShrink: 0, border: `1px solid ${C.line}`,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.md, color: C.ink }}>
                  {group.refCode}
                </div>
                <div style={{
                  fontSize: T.sz.xs, color: C.inkLight,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {group.productName}
                </div>
              </div>
              {group.lines.length > 1 && (
                <button
                  onClick={() => handleRemoveAllForRef(group.refCode)}
                  title={`Eliminar todas las lineas de ${group.refCode}`}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`, border: "none",
                    background: "transparent", cursor: "pointer",
                    fontSize: T.sz.xs, color: C.red, fontFamily: T.mono,
                    fontWeight: T.wt.medium, touchAction: "manipulation",
                  }}
                >
                  Quitar todas
                </button>
              )}
            </div>

            {/* Variant lines with quantity controls */}
            {group.lines.map(line => (
              <div
                key={line.id}
                style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[2]}px 0`,
                  borderTop: `1px solid ${C.lineSubtle}`,
                }}
              >
                {/* Variant label */}
                <div style={{ flex: 1, minWidth: 0, fontSize: T.sz.sm }}>
                  <span style={{ color: C.ink, fontWeight: T.wt.medium }}>
                    {line.colorName ?? line.color}
                  </span>
                  {line.size && (
                    <span style={{ color: C.inkLight }}> / {line.size}</span>
                  )}
                </div>

                {/* Quantity controls */}
                <div style={{
                  display: "flex", alignItems: "center",
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                }}>
                  <button
                    onClick={() => handleUpdateQuantity(line.id, -1)}
                    disabled={line.quantity <= 1}
                    aria-label="Menos"
                    style={{
                      width: 36, height: 36, border: "none", background: "transparent",
                      cursor: line.quantity > 1 ? "pointer" : "default", fontFamily: T.mono,
                      fontSize: T.sz.lg, color: line.quantity > 1 ? C.ink : C.inkLight,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      touchAction: "manipulation",
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={e => {
                      const n = parseInt(e.target.value);
                      if (n > 0) handleSetQuantity(line.id, n);
                    }}
                    style={{
                      width: 42, textAlign: "center", border: "none", fontFamily: T.mono,
                      fontSize: 16, outline: "none", background: "transparent",
                      padding: 0,
                    }}
                  />
                  <button
                    onClick={() => handleUpdateQuantity(line.id, 1)}
                    aria-label="Mas"
                    style={{
                      width: 36, height: 36, border: "none", background: "transparent",
                      cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.lg, color: C.ink,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      touchAction: "manipulation",
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Remove line */}
                <button
                  onClick={() => handleRemoveLine(line.id)}
                  aria-label={`Eliminar linea ${line.colorName ?? line.color} ${line.size}`}
                  style={{
                    width: 36, height: 36, border: "none", background: "transparent",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0, touchAction: "manipulation",
                  }}
                >
                  <SellerIcon name="trash" size={16} color={C.red} />
                </button>
              </div>
            ))}
          </div>
        ))}

        {/* Removed lines (undo available) */}
        {removedLines.length > 0 && (
          <div style={{
            marginTop: S[2], padding: S[3], background: C.surfaceAlt,
            borderRadius: R.md, border: `1px solid ${C.line}`,
          }}>
            <div style={{ fontSize: T.sz.xs, color: C.inkLight, fontWeight: T.wt.semibold, marginBottom: S[1] }}>
              Lineas eliminadas ({removedLines.length})
            </div>
            {removedLines.map(l => (
              <div key={l.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: `${S[1]}px 0`, fontSize: T.sz.xs, color: C.inkLight,
              }}>
                <span>{l.referenceCode} — {l.colorName ?? l.color}{l.size ? ` / ${l.size}` : ""} x{l.quantity}</span>
                <button
                  onClick={() => handleUndoRemove(l.id)}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    color: C.blueDark, fontFamily: T.mono, fontSize: T.sz.xs,
                    fontWeight: T.wt.semibold, touchAction: "manipulation",
                  }}
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add products button */}
      <button
        onClick={() => setShowAddProducts(true)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
          width: "100%", minHeight: 48, padding: `${S[3]}px ${S[4]}px`,
          background: C.white, color: C.blueDark, border: `1.5px solid ${C.blueBorder}`,
          borderRadius: 14, fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold,
          cursor: "pointer", touchAction: "manipulation", marginBottom: S[4],
        }}
      >
        <SellerIcon name="plus" size={18} color={C.blueDark} />
        Agregar productos
      </button>

      {/* Notes */}
      <DetailSection title="Notas">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Observaciones del pedido..."
          rows={3}
          style={{
            width: "100%", padding: S[2], border: `1px solid ${C.line}`,
            borderRadius: R.sm, fontFamily: T.mono, fontSize: 16,
            resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
      </DetailSection>

      {/* Save CTA */}
      <button
        onClick={handleSave}
        disabled={saving || activeLines.length === 0}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
          width: "100%", minHeight: 52, padding: `${S[3]}px ${S[4]}px`,
          background: saving ? C.inkLight : C.blueDark,
          color: C.white, border: "none", borderRadius: 14,
          fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
          cursor: saving ? "default" : "pointer",
          boxShadow: saving ? "none" : E.md,
          touchAction: "manipulation", marginBottom: S[4],
          opacity: activeLines.length === 0 ? 0.5 : 1,
        }}
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>

      {/* Delete order (destructive zone) */}
      <div style={{
        borderTop: `1px solid ${C.line}`, paddingTop: S[4], marginTop: S[2],
      }}>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: S[2],
              width: "100%", minHeight: 48, padding: `${S[3]}px ${S[4]}px`,
              background: "transparent", color: C.red,
              border: `1.5px solid ${C.red}`,
              borderRadius: 14, fontFamily: T.mono, fontSize: T.sz.md,
              fontWeight: T.wt.semibold, cursor: "pointer", touchAction: "manipulation",
            }}
          >
            <SellerIcon name="trash" size={16} color={C.red} />
            Eliminar pedido
          </button>
        ) : (
          <div style={{
            padding: S[4], background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: 14,
          }}>
            <div style={{
              fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.redDark,
              marginBottom: S[2],
            }}>
              ¿Eliminar este pedido?
            </div>
            <div style={{ fontSize: T.sz.sm, color: C.redDark, marginBottom: S[3], lineHeight: 1.5 }}>
              Esta accion eliminara el pedido de Agentik. No se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: S[2] }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{
                  flex: 1, minHeight: 44, padding: `${S[2]}px`,
                  background: C.white, color: C.ink, border: `1px solid ${C.line}`,
                  borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: T.wt.semibold, cursor: "pointer", touchAction: "manipulation",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, minHeight: 44, padding: `${S[2]}px`,
                  background: C.red, color: C.white, border: "none",
                  borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: T.wt.bold, cursor: deleting ? "default" : "pointer",
                  touchAction: "manipulation",
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Products Panel ───────────────────────────────────────────────────────
// Contained product search + variant selection that returns lines to the editor.
// Reuses the same API endpoints as the create wizard.

function AddProductsPanel({
  orgSlug,
  onAddLines,
}: {
  orgSlug: string;
  onAddLines: (lines: EditorLine[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductSearchResult["variants"]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", query: query.trim(), limit: 20 }),
        });
        if (r.ok) {
          const { products } = await r.json();
          setResults(products ?? []);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, orgSlug]);

  const handleExpandProduct = useCallback(async (refCode: string) => {
    if (expandedRef === refCode) { setExpandedRef(null); return; }
    setExpandedRef(refCode);
    setLoadingVariants(true);
    setVariants([]);
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "variants", referenceCode: refCode }),
      });
      if (r.ok) {
        const { variants: v } = await r.json();
        setVariants(v ?? []);
      }
    } catch { /* ignore */ }
    setLoadingVariants(false);
  }, [expandedRef, orgSlug]);

  const handleAddVariant = useCallback((product: ProductSearchResult, variant: ProductSearchResult["variants"][number], qty: number) => {
    onAddLines([{
      id: `new-${product.referenceCode}-${variant.size}-${variant.color}-${Date.now()}`,
      referenceCode: product.referenceCode,
      productName: product.productName,
      size: variant.size,
      color: variant.color,
      colorName: variant.color,
      quantity: qty,
      originalQuantity: 0,
      availableUnits: variant.availability.availableUnits,
      unitPrice: product.unitPrice,
      lineTotal: qty * product.unitPrice,
      thumbnailUrl: product.thumbnailUrl,
      isNew: true,
      markedForRemoval: false,
    }]);
  }, [onAddLines]);

  const handleAddBatch = useCallback((product: ProductSearchResult, batchLines: Array<{ variant: ProductSearchResult["variants"][number]; qty: number }>) => {
    onAddLines(batchLines.map(bl => ({
      id: `new-${product.referenceCode}-${bl.variant.size}-${bl.variant.color}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      referenceCode: product.referenceCode,
      productName: product.productName,
      size: bl.variant.size,
      color: bl.variant.color,
      colorName: bl.variant.color,
      quantity: bl.qty,
      originalQuantity: 0,
      availableUnits: bl.variant.availability.availableUnits,
      unitPrice: product.unitPrice,
      lineTotal: bl.qty * product.unitPrice,
      thumbnailUrl: product.thumbnailUrl,
      isNew: true,
      markedForRemoval: false,
    })));
  }, [onAddLines]);

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar referencia o nombre..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{
          width: "100%", padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
          borderRadius: R.md, fontFamily: T.mono, fontSize: 16, background: C.white,
          outline: "none", boxSizing: "border-box", marginBottom: S[3],
        }}
      />

      {searching && (
        <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>Buscando...</div>
      )}

      {results.length === 0 && query.trim().length >= 2 && !searching && (
        <div style={{ padding: S[4], textAlign: "center", color: C.inkLight, fontSize: T.sz.md }}>
          Sin resultados
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {results.map(p => (
          <AddProductCard
            key={p.referenceCode}
            product={p}
            orgSlug={orgSlug}
            isExpanded={expandedRef === p.referenceCode}
            variants={expandedRef === p.referenceCode ? variants : []}
            loadingVariants={expandedRef === p.referenceCode && loadingVariants}
            onExpand={() => handleExpandProduct(p.referenceCode)}
            onAddVariant={(v, qty) => handleAddVariant(p, v, qty)}
            onAddBatch={(batchLines) => handleAddBatch(p, batchLines)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Add Product Card with auto/manual modes ──────────────────────────────────

function AddProductCard({
  product,
  orgSlug,
  isExpanded,
  variants,
  loadingVariants,
  onExpand,
  onAddVariant,
  onAddBatch,
}: {
  product: ProductSearchResult;
  orgSlug: string;
  isExpanded: boolean;
  variants: ProductSearchResult["variants"];
  loadingVariants: boolean;
  onExpand: () => void;
  onAddVariant: (v: ProductSearchResult["variants"][number], qty: number) => void;
  onAddBatch: (lines: Array<{ variant: ProductSearchResult["variants"][number]; qty: number }>) => void;
}) {
  const stockColor = product.inventoryStatus === "high" ? C.green
    : product.inventoryStatus === "medium" ? C.amberDark
    : product.inventoryStatus === "low" ? C.red
    : C.inkLight;

  const stockLabel = product.inventoryStatus === "high" ? "Disponible"
    : product.inventoryStatus === "medium" ? "Stock medio"
    : product.inventoryStatus === "low" ? "Ultimas uds"
    : product.inventoryStatus === "out" ? "Agotado" : "Sin datos";

  const sellable = product.variantCount > 0;

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [autoQty, setAutoQty] = useState<number>(0);
  const [proposal, setProposal] = useState<AssortmentProposal | null>(null);
  const [distributing, setDistributing] = useState(false);

  async function handleAutoDistribute() {
    if (autoQty <= 0) return;
    setDistributing(true);
    setProposal(null);
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_assortment",
          referenceCode: product.referenceCode,
          requestedUnits: autoQty,
        }),
      });
      if (r.ok) {
        const { proposal: p } = await r.json();
        setProposal(p ?? null);
      }
    } catch { /* degrade silently */ }
    setDistributing(false);
  }

  function handleAcceptProposal() {
    if (!proposal) return;
    const batchLines: Array<{ variant: ProductSearchResult["variants"][number]; qty: number }> = [];
    for (const pl of proposal.lines) {
      if (pl.allocatedUnits <= 0) continue;
      const v = variants.find(vr => vr.variantId === pl.variantId);
      if (v) batchLines.push({ variant: v, qty: pl.allocatedUnits });
    }
    onAddBatch(batchLines);
    setProposal(null);
    setAutoQty(0);
  }

  const selected = variants.find(v => v.variantId === selectedVariant);

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 16,
      overflow: "hidden", boxShadow: E.sm,
    }}>
      <button onClick={onExpand} disabled={!sellable} style={{
        display: "flex", width: "100%", textAlign: "left", padding: S[3],
        border: "none", background: "transparent", cursor: sellable ? "pointer" : "default",
        fontFamily: T.mono, gap: S[3], alignItems: "center", minHeight: 72,
        opacity: sellable ? 1 : 0.5, touchAction: "manipulation",
      }}>
        {product.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.thumbnailUrl} alt="" loading="lazy" style={{
            width: 56, height: 56, objectFit: "cover", borderRadius: 12, flexShrink: 0,
            background: C.surfaceAlt,
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
            {product.referenceCode}
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {product.productName}
          </div>
          <div style={{ display: "flex", gap: S[2], marginTop: 2, alignItems: "center" }}>
            <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
              {fmtCOP(product.unitPrice)}
            </span>
            <span style={{ fontSize: T.sz.xs, color: stockColor }}>
              {stockLabel}
              {product.availableQty !== null ? ` (${product.availableQty})` : ""}
            </span>
          </div>
        </div>
        <span aria-hidden style={{ flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          <SellerIcon name="chevronRight" size={17} color={C.inkGhost} />
        </span>
      </button>

      {isExpanded && (
        <div style={{ padding: `0 ${S[3]}px ${S[3]}px`, borderTop: `1px solid ${C.lineSubtle}` }}>
          {loadingVariants && (
            <div style={{ padding: S[3], textAlign: "center", fontSize: T.sz.xs, color: C.inkLight }}>
              Cargando tallas...
            </div>
          )}
          {!loadingVariants && variants.length === 0 && (
            <div style={{ padding: S[3], textAlign: "center", fontSize: T.sz.xs, color: C.inkLight }}>
              Sin variantes disponibles
            </div>
          )}
          {!loadingVariants && variants.length > 0 && (
            <div style={{ paddingTop: S[2] }}>
              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 0, marginBottom: S[3], borderRadius: R.md, overflow: "hidden", border: `1px solid ${C.line}` }}>
                <button onClick={() => setMode("auto")} style={{
                  flex: 1, padding: `${S[2]}px 0`, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  border: "none", cursor: "pointer",
                  background: mode === "auto" ? C.blueDark : C.white,
                  color: mode === "auto" ? C.white : C.inkMid,
                }}>
                  Surtido automatico
                </button>
                <button onClick={() => setMode("manual")} style={{
                  flex: 1, padding: `${S[2]}px 0`, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  border: "none", borderLeft: `1px solid ${C.line}`, cursor: "pointer",
                  background: mode === "manual" ? C.blueDark : C.white,
                  color: mode === "manual" ? C.white : C.inkMid,
                }}>
                  Seleccion manual
                </button>
              </div>

              {/* Auto mode */}
              {mode === "auto" && (
                <div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
                    Ingresa la cantidad total y se distribuira entre tallas con stock
                  </div>
                  <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: S[3] }}>
                    <input
                      type="number" min={1} value={autoQty || ""}
                      onChange={e => { setAutoQty(parseInt(e.target.value) || 0); setProposal(null); }}
                      placeholder="Cantidad"
                      style={{
                        flex: 1, padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
                        borderRadius: R.md, fontFamily: T.mono, fontSize: 16, background: C.white,
                        outline: "none", boxSizing: "border-box", textAlign: "center",
                      }}
                    />
                    <button
                      onClick={handleAutoDistribute}
                      disabled={autoQty <= 0 || distributing}
                      style={{
                        padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.sm,
                        fontWeight: T.wt.semibold, border: "none", borderRadius: R.md,
                        cursor: autoQty > 0 && !distributing ? "pointer" : "default",
                        background: autoQty > 0 && !distributing ? C.blueDark : C.surfaceAlt,
                        color: autoQty > 0 && !distributing ? C.white : C.inkLight,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {distributing ? "..." : "Distribuir"}
                    </button>
                  </div>
                  {proposal && (
                    <div style={{ marginBottom: S[3] }}>
                      <div style={{
                        padding: `${S[1]}px ${S[2]}px`, marginBottom: S[2], borderRadius: R.sm,
                        fontFamily: T.mono, fontSize: T.sz.xs,
                        background: proposal.fulfillable ? `${C.green}10` : `${C.amber}10`,
                        color: proposal.fulfillable ? C.green : C.amberDark,
                        border: `1px solid ${proposal.fulfillable ? C.green : C.amber}20`,
                      }}>
                        {proposal.explanation}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {proposal.lines.filter(l => l.allocatedUnits > 0).map(l => (
                          <div key={l.variantId} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: `${S[1]}px ${S[2]}px`, background: C.surfaceAlt, borderRadius: R.sm,
                            fontFamily: T.mono, fontSize: T.sz.xs,
                          }}>
                            <span style={{ fontWeight: T.wt.semibold, color: C.ink }}>
                              {l.size}{l.color ? `/${l.color}` : ""}
                            </span>
                            <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                              <span style={{ color: C.inkMid }}>{l.allocatedUnits} uds</span>
                              <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>de {l.availableUnits} disp</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {proposal.unallocatedUnits > 0 && (
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark,
                          marginTop: S[1], padding: `${S[1]}px ${S[2]}px`,
                        }}>
                          {proposal.unallocatedUnits} uds sin asignar por inventario insuficiente
                        </div>
                      )}
                      <button
                        onClick={handleAcceptProposal}
                        style={{
                          width: "100%", marginTop: S[3], padding: `${S[3]}px 0`,
                          background: C.blueDark, color: C.white, border: "none",
                          borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
                          fontWeight: T.wt.bold, cursor: "pointer",
                        }}
                      >
                        Agregar al pedido ({proposal.allocatedUnits} uds)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Manual mode */}
              {mode === "manual" && (
                <>
                  <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2], fontWeight: T.wt.medium }}>
                    Seleccionar talla y color:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: S[2] }}>
                    {variants.filter(v => v.size || v.color).map(v => {
                      const isSelected = selectedVariant === v.variantId;
                      const available = v.availability.availableUnits;
                      const isOut = available !== null && available <= 0;
                      return (
                        <button
                          key={v.variantId}
                          onClick={() => { if (!isOut) { setSelectedVariant(v.variantId); setQuantity(1); } }}
                          disabled={isOut}
                          style={{
                            padding: `${S[1]}px ${S[2]}px`, fontSize: T.sz.xs,
                            border: `1px solid ${isSelected ? C.blueDark : C.line}`,
                            borderRadius: R.sm, fontFamily: T.mono, cursor: isOut ? "default" : "pointer",
                            background: isSelected ? C.blueLight : isOut ? C.surfaceAlt : C.white,
                            color: isOut ? C.inkLight : isSelected ? C.blueDark : C.ink,
                            opacity: isOut ? 0.5 : 1,
                          }}
                        >
                          {v.size}{v.color ? `/${v.color}` : ""}
                          {available !== null ? ` (${available})` : ""}
                        </button>
                      );
                    })}
                  </div>
                  {selected && (
                    <div style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: S[2] }}>
                      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: R.md }}>
                        <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{
                          width: 32, height: 32, border: "none", background: "transparent",
                          cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.lg, color: C.ink,
                        }}>-</button>
                        <input
                          type="number" value={quantity}
                          onChange={e => { const n = parseInt(e.target.value); if (n > 0) setQuantity(n); }}
                          style={{
                            width: 40, textAlign: "center", border: "none", fontFamily: T.mono,
                            fontSize: 16, outline: "none", background: "transparent",
                          }}
                        />
                        <button onClick={() => setQuantity(q => q + 1)} style={{
                          width: 32, height: 32, border: "none", background: "transparent",
                          cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.lg, color: C.ink,
                        }}>+</button>
                      </div>
                      <button
                        onClick={() => { onAddVariant(selected, quantity); setSelectedVariant(null); setQuantity(1); }}
                        style={{
                          flex: 1, padding: `${S[2]}px ${S[3]}px`, background: C.blueDark, color: C.white,
                          border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.sm,
                          fontWeight: T.wt.semibold, cursor: "pointer",
                        }}
                      >
                        Agregar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
