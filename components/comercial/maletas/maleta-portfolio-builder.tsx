"use client";

/**
 * MaletaPortfolioBuilder — Canonical inventory browser for maleta construction.
 *
 * Consumes InventoryItem[] from the canonical portfolio API.
 * Does NOT query SAG, CCS, or PIL directly.
 * Does NOT duplicate classification or availability logic.
 *
 * Navigation: Line -> Grupo/Tamano -> Subgrupo -> Referencias -> Variantes
 * Selection: reference + productId + quantity + availability snapshot
 *
 * Sprint: COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { InventoryItem, CanonicalLine, InventoryDataQuality } from "@/lib/inventory/inventory-control-types";
import { CANONICAL_LINE_LABELS, CANONICAL_LINE_ORDER } from "@/lib/inventory/inventory-control-types";
import type { MaletaSelectionItem } from "@/lib/comercial/maletas/vendor-bag-types";

// ── Props ────────────────────────────────────────────────────────────────────

interface MaletaPortfolioBuilderProps {
  orgSlug: string;
  onSelectionChange?: (items: MaletaSelectionItem[]) => void;
  onClose?: () => void;
}

// ── Internal types ───────────────────────────────────────────────────────────

/** Mirrors MaletaSelectionItem — only FK + operational assignment data. */
interface DraftItem {
  inventoryItemId: string;
  variantId?: string | null;
  assignedQty: number;
  snapshotAt: string;
}

type GroupKey = string; // grupoSag or handlingUnit

// ── Component ────────────────────────────────────────────────────────────────

export function MaletaPortfolioBuilder({
  orgSlug,
  onSelectionChange,
  onClose,
}: MaletaPortfolioBuilderProps) {
  // ── Data loading ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [dataQuality, setDataQuality] = useState<InventoryDataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Selection state ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState<Map<string, DraftItem>>(new Map());

  // ── Navigation state ─────────────────────────────────────────────────────
  const [expandedLine, setExpandedLine] = useState<CanonicalLine | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedSubgroup, setExpandedSubgroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Fetch portfolio ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/maletas/portfolio`);
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setItems(data.items ?? []);
          setDataQuality(data.dataQuality ?? null);
        } else {
          setError(data.error ?? "Error al cargar inventario");
        }
      } catch {
        if (!cancelled) setError("Error de conexion");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgSlug]);

  // ── Hierarchy ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.reference.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        (i.subgrupoSag ?? "").toLowerCase().includes(q) ||
        (i.grupoSag ?? "").toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  const byLine = useMemo(() => {
    const map = new Map<CanonicalLine, InventoryItem[]>();
    for (const item of filtered) {
      const line = item.canonicalLine;
      if (line === "SIN_CLASIFICAR") continue; // excluded
      const list = map.get(line) ?? [];
      list.push(item);
      map.set(line, list);
    }
    return map;
  }, [filtered]);

  // Group items within a line by grupoSag (textile) or handlingUnit (import)
  const getGroupsForLine = useCallback(
    (line: CanonicalLine): Map<GroupKey, InventoryItem[]> => {
      const lineItems = byLine.get(line) ?? [];
      const map = new Map<GroupKey, InventoryItem[]>();
      for (const item of lineItems) {
        const key =
          line === "IMPORTACION"
            ? item.handlingUnit ?? "SIN_TAMANO"
            : item.grupoSag ?? "SIN_GRUPO";
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
      return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    },
    [byLine],
  );

  // Subgroups within a group
  const getSubgroupsForGroup = useCallback(
    (line: CanonicalLine, group: GroupKey): Map<string, InventoryItem[]> => {
      const groups = getGroupsForLine(line);
      const groupItems = groups.get(group) ?? [];
      const map = new Map<string, InventoryItem[]>();
      for (const item of groupItems) {
        const key = item.subgrupoSag || "SIN_SUBGRUPO";
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
      return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
    },
    [getGroupsForLine],
  );

  // ── Selection handlers ───────────────────────────────────────────────────

  const isSelected = useCallback((ref: string) => draft.has(ref), [draft]);

  const toggleItem = useCallback(
    (item: InventoryItem) => {
      setDraft((prev) => {
        const next = new Map(prev);
        if (next.has(item.reference)) {
          next.delete(item.reference);
        } else {
          // Prevent adding if no availability
          if (item.disponibleReal <= 0) return prev;
          next.set(item.reference, {
            inventoryItemId: item.reference,
            assignedQty: 1,
            snapshotAt: new Date().toISOString(),
          });
        }
        return next;
      });
    },
    [],
  );

  const updateQty = useCallback(
    (ref: string, qty: number, disponibleReal: number) => {
      setDraft((prev) => {
        const existing = prev.get(ref);
        if (!existing) return prev;
        // Enforce: 1 <= qty <= disponibleReal (live from InventoryItem, never cached)
        const clamped = Math.max(1, Math.min(qty, disponibleReal));
        const next = new Map(prev);
        next.set(ref, { ...existing, assignedQty: clamped });
        return next;
      });
    },
    [],
  );

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const selItems: MaletaSelectionItem[] = [...draft.values()].map((d) => ({
        inventoryItemId: d.inventoryItemId,
        variantId: d.variantId,
        assignedQty: d.assignedQty,
        snapshotAt: d.snapshotAt,
      }));
      onSelectionChange(selItems);
    }
  }, [draft, onSelectionChange]);

  // ── Coverage stats ───────────────────────────────────────────────────────

  const coverageStats = useMemo(() => {
    const stats = new Map<
      CanonicalLine,
      { totalRefs: number; selectedRefs: number; groups: Set<string>; subgroups: Set<string> }
    >();
    for (const [line, lineItems] of byLine) {
      const groups = new Set<string>();
      const subgroups = new Set<string>();
      let selectedRefs = 0;
      for (const item of lineItems) {
        if (item.grupoSag) groups.add(item.grupoSag);
        subgroups.add(item.subgrupoSag);
        if (draft.has(item.reference)) selectedRefs++;
      }
      stats.set(line, {
        totalRefs: lineItems.length,
        selectedRefs,
        groups,
        subgroups,
      });
    }
    return stats;
  }, [byLine, draft]);

  // ── Render ───────────────────────────────────────────────────────────────

  const draftCount = draft.size;
  const totalQty = [...draft.values()].reduce((s, d) => s + d.assignedQty, 0);

  if (loading) {
    return (
      <div style={{ padding: S[5], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        Cargando inventario canonico...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: S[5], fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: `${S[3]} ${S[4]}`,
          borderBottom: `1px solid ${C.line}`,
          background: C.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: S[3],
        }}
      >
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
            Seleccion de inventario
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
            {items.length} refs elegibles
            {dataQuality && ` · ${dataQuality.freshnessLabel}`}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkLight,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: `${S[1]} ${S[2]}`,
            }}
          >
            Cerrar
          </button>
        )}
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: `${S[2]} ${S[4]}`, borderBottom: `1px solid ${C.line}` }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar referencia, descripcion, grupo o subgrupo..."
          style={{
            width: "100%",
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            padding: `${S[2]} ${S[3]}`,
            border: `1px solid ${C.line}`,
            borderRadius: R.sm,
            outline: "none",
            color: C.ink,
            background: C.surface,
          }}
        />
      </div>

      {/* ── Navigation tree ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: `${S[2]} 0` }}>
        {CANONICAL_LINE_ORDER.filter((l) => l !== "SIN_CLASIFICAR").map((line) => {
          const lineItems = byLine.get(line);
          if (!lineItems || lineItems.length === 0) return null;

          const isLineExpanded = expandedLine === line;
          const groups = getGroupsForLine(line);
          const stats = coverageStats.get(line);

          return (
            <div key={line}>
              {/* Line header */}
              <button
                onClick={() => setExpandedLine(isLineExpanded ? null : line)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${S[2]} ${S[4]}`,
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  fontWeight: 600,
                  color: C.ink,
                  background: isLineExpanded ? C.blueDark + "08" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left" as const,
                }}
              >
                <span>
                  {isLineExpanded ? "\u25BE" : "\u25B8"}{" "}
                  {CANONICAL_LINE_LABELS[line]}
                </span>
                <span style={{ color: C.inkLight, fontWeight: 400 }}>
                  {lineItems.length} refs
                  {stats && stats.selectedRefs > 0 && (
                    <span style={{ color: C.blueDark, marginLeft: S[2] }}>
                      {stats.selectedRefs} sel
                    </span>
                  )}
                </span>
              </button>

              {/* Groups within line */}
              {isLineExpanded &&
                [...groups.entries()].map(([groupKey, groupItems]) => {
                  const groupFullKey = `${line}::${groupKey}`;
                  const isGroupExpanded = expandedGroup === groupFullKey;
                  const subgroups = getSubgroupsForGroup(line, groupKey);
                  const selectedInGroup = groupItems.filter((i) =>
                    draft.has(i.reference),
                  ).length;

                  return (
                    <div key={groupFullKey}>
                      {/* Group header */}
                      <button
                        onClick={() =>
                          setExpandedGroup(isGroupExpanded ? null : groupFullKey)
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: `${S[1]} ${S[4]} ${S[1]} ${S[6]}`,
                          fontFamily: T.mono,
                          fontSize: T.sz.xs,
                          color: C.ink,
                          background: isGroupExpanded
                            ? C.blueDark + "06"
                            : "transparent",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left" as const,
                        }}
                      >
                        <span>
                          {isGroupExpanded ? "\u25BE" : "\u25B8"}{" "}
                          {line === "IMPORTACION" ? `Tamano: ${groupKey}` : groupKey}
                        </span>
                        <span style={{ color: C.inkLight, fontWeight: 400 }}>
                          {groupItems.length}
                          {selectedInGroup > 0 && (
                            <span style={{ color: C.blueDark, marginLeft: S[1] }}>
                              ({selectedInGroup})
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Subgroups within group */}
                      {isGroupExpanded &&
                        [...subgroups.entries()].map(
                          ([sgKey, sgItems]) => {
                            const sgFullKey = `${groupFullKey}::${sgKey}`;
                            const isSgExpanded = expandedSubgroup === sgFullKey;
                            const selectedInSg = sgItems.filter((i) =>
                              draft.has(i.reference),
                            ).length;

                            return (
                              <div key={sgFullKey}>
                                {/* Subgroup header */}
                                <button
                                  onClick={() =>
                                    setExpandedSubgroup(
                                      isSgExpanded ? null : sgFullKey,
                                    )
                                  }
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: `${S[1]} ${S[4]} ${S[1]} ${S[8]}`,
                                    fontFamily: T.mono,
                                    fontSize: 10,
                                    color: C.ink,
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    textAlign: "left" as const,
                                  }}
                                >
                                  <span>
                                    {isSgExpanded ? "\u25BE" : "\u25B8"} {sgKey}
                                  </span>
                                  <span
                                    style={{
                                      color: C.inkLight,
                                      fontWeight: 400,
                                    }}
                                  >
                                    {sgItems.length}
                                    {selectedInSg > 0 && (
                                      <span
                                        style={{
                                          color: C.blueDark,
                                          marginLeft: S[1],
                                        }}
                                      >
                                        ({selectedInSg})
                                      </span>
                                    )}
                                  </span>
                                </button>

                                {/* References */}
                                {isSgExpanded && (
                                  <div style={{ padding: `0 ${S[4]} 0 ${S[10]}` }}>
                                    {sgItems
                                      .sort(
                                        (a, b) =>
                                          b.disponibleReal - a.disponibleReal,
                                      )
                                      .map((item) => (
                                        <ReferenceRow
                                          key={item.reference}
                                          item={item}
                                          selected={isSelected(item.reference)}
                                          draftQty={
                                            draft.get(item.reference)
                                              ?.assignedQty ?? 0
                                          }
                                          onToggle={() => toggleItem(item)}
                                          onQtyChange={(q) =>
                                            updateQty(item.reference, q, item.disponibleReal)
                                          }
                                        />
                                      ))}
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* ── Selection summary footer ───────────────────────────────────────── */}
      <div
        style={{
          padding: `${S[3]} ${S[4]}`,
          borderTop: `1px solid ${C.line}`,
          background: C.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
          <strong>{draftCount}</strong> refs seleccionadas
          {" \u00B7 "}
          <strong>{totalQty}</strong> unidades
        </div>
        {draftCount > 0 && (
          <button
            onClick={() => setDraft(new Map())}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.red,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: `${S[1]} ${S[2]}`,
            }}
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

// ── ReferenceRow ──────────────────────────────────────────────────────────────

function ReferenceRow({
  item,
  selected,
  draftQty,
  onToggle,
  onQtyChange,
}: {
  item: InventoryItem;
  selected: boolean;
  draftQty: number;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 90px 1fr 60px 50px 50px 70px",
        alignItems: "center",
        gap: S[1],
        padding: `${S[1]} 0`,
        borderBottom: `1px solid ${C.line}22`,
        background: selected ? C.blueDark + "08" : "transparent",
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        style={{ width: 14, height: 14, cursor: "pointer" }}
      />

      {/* Reference */}
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          fontWeight: 600,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}
      >
        {item.reference}
      </span>

      {/* Description */}
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}
      >
        {item.description}
      </span>

      {/* Disponible */}
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          color: item.disponibleReal > 0 ? C.green : C.red,
          textAlign: "right" as const,
        }}
      >
        {item.disponibleReal}
      </span>

      {/* Variants info */}
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 9,
          color: C.inkFaint,
          textAlign: "center" as const,
        }}
        title={`${item.sizes.length} tallas, ${item.colors.length} colores`}
      >
        {item.variantCount > 0
          ? `${item.sizes.length}T ${item.colors.length}C`
          : "\u2014"}
      </span>

      {/* Reservado */}
      <span
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          color: C.inkFaint,
          textAlign: "right" as const,
        }}
      >
        {item.pedidosPendientes > 0 ? item.pedidosPendientes : "\u2014"}
      </span>

      {/* Qty input (only when selected) */}
      {selected ? (
        <input
          type="number"
          min={1}
          max={item.disponibleReal}
          value={draftQty}
          onChange={(e) => onQtyChange(parseInt(e.target.value, 10) || 1)}
          style={{
            width: "100%",
            fontFamily: T.mono,
            fontSize: 10,
            padding: `2px ${S[1]}`,
            border: `1px solid ${C.line}`,
            borderRadius: R.sm,
            textAlign: "right" as const,
            color: C.ink,
          }}
        />
      ) : (
        <span />
      )}
    </div>
  );
}
