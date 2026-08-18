"use client";

/**
 * inventario-client.tsx
 *
 * COMERCIAL-INVENTARIO-CANONICAL-STATUS-INTEGRATION-01 — Client Component.
 *
 * The Inventory Control Center is the official owner of commercial inventory.
 * 04A3: Textile commercial = B01 only. Import = B24. B04 = WIP (never commercial).
 *
 * Tab structure:
 *   CASTILLITOS | LATIN_KIDS | IMPORTACION | SIN_CLASIFICAR | AGOTADOS | VAULT
 *
 * Jupiter Pets (EXTERNAL_EXCLUDED) counted but never rendered in any tab.
 * LOW_ACTIVITY_AVAILABLE stays in its line tab with "Baja actividad" signal.
 * VAULT shows dormant, archive-review, non-commercial, unknown references.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CommercialProductDrawer, ProductThumbnail } from "@/components/comercial/commercial-product-drawer";
import type { CommercialProductData } from "@/components/comercial/commercial-product-drawer";
import type {
  InventoryControlSnapshot,
  InventoryItem,
  InventoryOperationalState,
  SubgrupoCoverage,
  AccesorioBajaCantidad,
} from "@/lib/inventory/inventory-control-types";
import {
  CANONICAL_LINE_LABELS,
} from "@/lib/inventory/inventory-control-types";
import type {
  CanonicalInventorySnapshot,
  CanonicalInventoryItemStatus,
} from "@/lib/inventory/inventory-canonical-status-loader";
import type { PanelDestination, VaultSubcategory } from "@/lib/inventory/inventory-panel-destination";
import {
  VAULT_SUBCATEGORY_LABELS,
} from "@/lib/inventory/inventory-panel-destination";
import type { CommercialReferenceStatus } from "@/lib/inventory/commercial-reference-status";

// ── Date formatting (hydration-safe) ─────────────────────────────────────────

function formatDateTimeEsCoStable(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    })
    .replace(/\u00A0/g, " ")
    .replace(/\.\s*m\./g, (m) => m.replace(/\s+/g, "\u202F"));
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type FilterKey =
  | "todos"
  | "con_disponibilidad"
  | "cobertura_suficiente"
  | "bajo"
  | "subgrupos"
  | "accesorios_bajo";

// 04A5I: Agotados sub-filter for the AGOTADAS partition tab
type AgotadosFilterKey = "todos" | "agotados" | "sobrecomprometidos";

// 04A3: "Con disponibilidad" = disponibleReal > 0 (actual stock).
// "Cobertura suficiente" = threshold-based operationalState (was "Disponibles").
const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "todos",                label: "Todos" },
  { key: "con_disponibilidad",   label: "Con disponibilidad" },
  { key: "cobertura_suficiente", label: "Cobertura suficiente" },
  { key: "bajo",                 label: "Bajo" },
  // 04A5I: "Sin cobertura" removed — refs with disponibleReal <= 0 are exclusively in AGOTADAS tab
  { key: "subgrupos",            label: "Subgrupos" },
  { key: "accesorios_bajo",      label: "Acc. bajo" },
];

// 04A5I: Agotados sub-filter options
const AGOTADOS_FILTER_OPTIONS: { key: AgotadosFilterKey; label: string }[] = [
  { key: "todos",                label: "Todos" },
  { key: "agotados",            label: "Agotados (disp = 0)" },
  { key: "sobrecomprometidos",  label: "Sobrecomprometidos (disp < 0)" },
];

const STATE_COLORS: Record<InventoryOperationalState, string> = {
  disponible:          C.green,
  alta_disponibilidad: C.green,
  bajo:                C.amber,
  sin_cobertura:       C.red,
  critico:             C.red,
  recompra_futura:     C.amber,
  agotado:             C.red,
  con_produccion:      "#6366f1",
  sin_produccion:      C.red,
  pendiente_validar:   C.inkGhost,
};

const STATE_LABELS: Record<InventoryOperationalState, string> = {
  disponible:          "Disponible",
  alta_disponibilidad: "Alta disp.",
  bajo:                "Bajo",
  sin_cobertura:       "Sin cobertura",
  critico:             "Critico",
  recompra_futura:     "Recompra",
  agotado:             "Agotado",
  con_produccion:      "Con OP",
  sin_produccion:      "Sin OP",
  pendiente_validar:   "Sin umbral",
};

const COMMERCIAL_STATUS_LABELS: Record<CommercialReferenceStatus, string> = {
  ACTIVE_AVAILABLE: "Activo disponible",
  ACTIVE_NON_COMMERCIAL: "Activo no comercial",
  LOW_ACTIVITY_AVAILABLE: "Baja actividad disponible",
  LOW_ACTIVITY_NON_COMMERCIAL: "Baja actividad no comercial",
  DORMANT: "Dormante",
  ARCHIVE_REVIEW: "Revision de archivo",
  UNKNOWN: "Desconocido",
};

const COMMERCIAL_STATUS_COLORS: Record<CommercialReferenceStatus, string> = {
  ACTIVE_AVAILABLE: C.green,
  ACTIVE_NON_COMMERCIAL: C.amber,
  LOW_ACTIVITY_AVAILABLE: C.blueDark,
  LOW_ACTIVITY_NON_COMMERCIAL: C.amber,
  DORMANT: C.inkLight,
  ARCHIVE_REVIEW: C.red,
  UNKNOWN: C.inkGhost,
};

// Tab order for the main navigation
const TAB_ORDER: PanelDestination[] = [
  "CASTILLITOS",
  "LATIN_KIDS",
  "IMPORTACION",
  "SIN_CLASIFICAR",
  "AGOTADOS",
  "VAULT",
];

const TAB_LABELS: Record<PanelDestination, string> = {
  CASTILLITOS: "Castillitos",
  LATIN_KIDS: "Latin Kids",
  IMPORTACION: "Importacion",
  SIN_CLASIFICAR: "Sin clasificar",
  AGOTADOS: "Agotadas",
  VAULT: "Historico",
  EXTERNAL_EXCLUDED: "Externas",
};

const TAB_ICONS: Record<PanelDestination, string> = {
  CASTILLITOS: "\uD83D\uDC55",
  LATIN_KIDS: "\uD83D\uDC76",
  IMPORTACION: "\uD83D\uDCE6",
  SIN_CLASIFICAR: "\u2753",
  AGOTADOS: "\u2B55",
  VAULT: "\uD83D\uDDC4\uFE0F",
  EXTERNAL_EXCLUDED: "",
};

// Grid columns
const TEXTILE_GRID = "36px 120px 1fr 120px 80px 90px";
const ACCESSORY_GRID = "36px 100px 1fr 100px 70px 80px 80px";
const VAULT_GRID = "120px 1fr 100px 100px 100px 90px 120px";
// 04A5I: Enhanced AGOTADOS grid — Thumb | Ref | Desc | Linea | Existencia | Reservado | Disponible | Estado
const AGOTADOS_GRID = "36px 110px 1fr 90px 80px 80px 80px 90px";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  snapshot: InventoryControlSnapshot;
  canonicalSnapshot: CanonicalInventorySnapshot;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InventarioClient({ orgSlug, snapshot, canonicalSnapshot }: Props) {
  const [activeTab, setActiveTab] = useState<PanelDestination>("CASTILLITOS");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [expandedLines, setExpandedLines] = useState<Set<string>>(
    () => new Set(["CASTILLITOS"]),
  );
  const [pageMap, setPageMap] = useState<Record<string, number>>({});
  // 04A5H: Hierarchy expand state (cleared on tab switch)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  // 04A5I: Agotados sub-filter state
  const [agotadosFilter, setAgotadosFilter] = useState<AgotadosFilterKey>("todos");

  const { health, dataQuality, items, subgrupoCoverage, accesoriosBajaCantidad } = snapshot;
  const { panels, canonicalItems } = canonicalSnapshot;

  // ── Map canonical items to original items ──────────────────────────────
  // 04A5I: Moved before tabCounts/panelItems — both now need disponibleReal lookups
  const originalItemsByRef = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      map.set(item.reference, item);
    }
    return map;
  }, [items]);

  // ── Compute tab counts ─────────────────────────────────────────────────
  // 04A5I: Line tab badges show ONLY ACTIVE_AVAILABLE refs (disponibleReal > 0).
  // Refs with disponibleReal <= 0 are counted exclusively in AGOTADAS.
  // This guarantees zero intersection between line tabs and AGOTADAS.
  const tabCounts = useMemo(() => {
    const lineCounts: Record<string, number> = {};
    let agotadosCount = 0;
    for (const ci of canonicalItems) {
      if (ci.exclusionReason) continue; // skip EXTERNAL_EXCLUDED (Jupiter Pets)
      const orig = originalItemsByRef.get(ci.reference);
      const disp = orig?.disponibleReal ?? ci.originalItem?.disponibleReal ?? 0;
      if (disp > 0) {
        // 04A5I: ACTIVE_AVAILABLE — belongs to its line tab
        lineCounts[ci.canonicalLine] = (lineCounts[ci.canonicalLine] ?? 0) + 1;
      } else {
        // 04A5I: EXHAUSTED or OVERCOMMITTED — belongs to AGOTADAS exclusively
        agotadosCount++;
      }
    }
    const counts: Record<PanelDestination, number> = {
      CASTILLITOS: lineCounts["CASTILLITOS"] ?? 0,
      LATIN_KIDS: lineCounts["LATIN_KIDS"] ?? 0,
      IMPORTACION: lineCounts["IMPORTACION"] ?? 0,
      SIN_CLASIFICAR: lineCounts["SIN_CLASIFICAR"] ?? 0,
      AGOTADOS: agotadosCount,
      VAULT: panels.VAULT.length,
      EXTERNAL_EXCLUDED: panels.EXTERNAL_EXCLUDED.length,
    };
    return counts;
  }, [canonicalItems, panels, originalItemsByRef]);

  // ── Active panel items (filtered + searched) ───────────────────────────
  // 04A5I: Line tabs show ONLY ACTIVE_AVAILABLE refs (disponibleReal > 0).
  // AGOTADAS tab shows ALL canonical refs with disponibleReal <= 0, from ALL lines.
  // Zero intersection: a ref appears in exactly one place.

  const panelItems = useMemo(() => {
    if (activeTab === "VAULT") {
      let result = panels[activeTab];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter(
          ci => ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q),
        );
      }
      return result;
    }

    if (activeTab === "AGOTADOS") {
      // 04A5I: AGOTADAS = ALL canonical refs with disponibleReal <= 0, across ALL lines
      let result = canonicalItems.filter(ci => {
        if (ci.exclusionReason) return false;
        const orig = originalItemsByRef.get(ci.reference);
        const disp = orig?.disponibleReal ?? ci.originalItem?.disponibleReal ?? 0;
        return disp <= 0;
      });
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter(
          ci => ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q),
        );
      }
      return result;
    }

    // 04A5I: Line tab items = canonical B01 refs for this line WITH disponibleReal > 0 ONLY
    let result = canonicalItems.filter(ci => {
      if (ci.canonicalLine !== activeTab || ci.exclusionReason) return false;
      const orig = originalItemsByRef.get(ci.reference);
      const disp = orig?.disponibleReal ?? ci.originalItem?.disponibleReal ?? 0;
      return disp > 0; // 04A5I: ACTIVE_AVAILABLE partition
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        ci => ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [canonicalItems, panels, activeTab, search, originalItemsByRef]);

  // ── Cross-panel search hint (CANONICAL-INVENTORY-REFERENCE-LOOKUP-01) ──
  // When search yields 0 results in current tab, check OTHER tabs for an exact
  // normalized reference match. Partial matches are excluded to avoid false hints.
  const LINE_TABS = new Set<PanelDestination>(["CASTILLITOS", "LATIN_KIDS", "IMPORTACION", "SIN_CLASIFICAR"]);
  const crossPanelHint = useMemo(() => {
    if (!search.trim() || panelItems.length > 0) return null;
    const q = search.trim().toUpperCase().replace(/\s+/g, " ");
    if (!q) return null;
    const TAB_ORDER: PanelDestination[] = [
      "CASTILLITOS", "LATIN_KIDS", "IMPORTACION", "SIN_CLASIFICAR", "AGOTADOS", "VAULT",
    ];
    for (const tab of TAB_ORDER) {
      if (tab === activeTab || tab === "EXTERNAL_EXCLUDED") continue;
      // 04A5I: Line tabs use canonicalItems filtered to disponibleReal > 0;
      // AGOTADOS uses all canonical refs with disponibleReal <= 0
      const pool = LINE_TABS.has(tab)
        ? canonicalItems.filter(ci => {
            if (ci.canonicalLine !== tab || ci.exclusionReason) return false;
            const orig = originalItemsByRef.get(ci.reference);
            return (orig?.disponibleReal ?? 0) > 0;
          })
        : tab === "AGOTADOS"
        ? canonicalItems.filter(ci => {
            if (ci.exclusionReason) return false;
            const orig = originalItemsByRef.get(ci.reference);
            return (orig?.disponibleReal ?? 0) <= 0;
          })
        : panels[tab];
      const found = pool.find(ci => {
        const normRef = ci.reference.trim().toUpperCase().replace(/\s+/g, " ");
        return normRef === q;
      });
      if (found) return { tab, label: TAB_LABELS[tab], reference: found.reference };
    }
    return null;
  }, [search, panelItems.length, activeTab, canonicalItems, panels, originalItemsByRef]);

  // ── Filter active tab items by operational filter ─────────────────────
  const filteredPanelItems = useMemo(() => {
    if (activeTab === "VAULT" || activeTab === "AGOTADOS") return panelItems;

    let result = panelItems;
    switch (filter) {
      case "con_disponibilidad":
        // 04A3: actual disponible > 0 (real stock, not threshold-based)
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.disponibleReal > 0;
        });
        break;
      case "cobertura_suficiente":
        // 04A5: Pure threshold — CS: disponible B01 > 100, LT: disponible B01 > 200.
        // Refs with null threshold (pendiente_validar) are excluded.
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          if (!orig || orig.threshold == null) return false;
          return orig.disponibleReal > orig.threshold;
        });
        break;
      case "bajo":
        // 04A5: Below threshold but above zero — needs attention.
        // Refs with null threshold excluded (cannot evaluate coverage).
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          if (!orig || orig.threshold == null) return false;
          return orig.disponibleReal > 0 && orig.disponibleReal <= orig.threshold;
        });
        break;
      // 04A5I: "sin_cobertura" removed — those refs are exclusively in AGOTADAS tab
      case "accesorios_bajo":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.isAccessory && orig.disponibleReal > 0 && orig.disponibleReal < 10;
        });
        break;
      case "subgrupos":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.lineCategory === "textile";
        });
        break;
      default:
        break;
    }
    return result;
  }, [panelItems, filter, activeTab, originalItemsByRef]);

  // ── Grouped items for line-based tabs ─────────────────────────────────
  const sortedItems = useMemo(() => {
    const sorted = [...filteredPanelItems];
    sorted.sort((a, b) => {
      const origA = originalItemsByRef.get(a.reference);
      const origB = originalItemsByRef.get(b.reference);
      const ga = (origA?.grupoSag ?? "").localeCompare(origB?.grupoSag ?? "");
      if (ga !== 0) return ga;
      const sa = (origA?.subgrupoSag ?? "").localeCompare(origB?.subgrupoSag ?? "");
      if (sa !== 0) return sa;
      return a.reference.localeCompare(b.reference);
    });
    return sorted;
  }, [filteredPanelItems, originalItemsByRef]);

  // ── 04A5H+04A5I: Line-scoped canonical items (no filter, no search) ──
  // 04A5I: Only ACTIVE_AVAILABLE refs (disponibleReal > 0) enter the hierarchy
  const lineScopedCanonicalItems = useMemo(() => {
    if (activeTab === "VAULT" || activeTab === "AGOTADOS" || activeTab === "EXTERNAL_EXCLUDED") return [];
    return canonicalItems.filter(ci => {
      if (ci.canonicalLine !== activeTab || ci.exclusionReason) return false;
      const orig = originalItemsByRef.get(ci.reference);
      return (orig?.disponibleReal ?? ci.originalItem?.disponibleReal ?? 0) > 0;
    });
  }, [canonicalItems, activeTab, originalItemsByRef]);

  // ── 04A5H: Hierarchy tree (full, before filter/search) ────────────
  const hierarchyNodes = useMemo(() => {
    if (activeTab === "VAULT" || activeTab === "AGOTADOS") return [];
    return resolveInventoryHierarchy(activeTab as PanelDestination, lineScopedCanonicalItems, originalItemsByRef);
  }, [activeTab, lineScopedCanonicalItems, originalItemsByRef]);

  // ── 04A5H: Filtered hierarchy (with filter + search applied) ──────
  const filteredHierarchyResult = useMemo(() => {
    return filterHierarchy(hierarchyNodes, filter, search, originalItemsByRef);
  }, [hierarchyNodes, filter, search, originalItemsByRef]);

  // 04A5H: Hierarchy expand/collapse handlers
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const toggleSubgroup = useCallback((key: string) => {
    setExpandedSubgroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const expandAllHierarchy = useCallback(() => {
    setExpandedGroups(new Set(filteredHierarchyResult.nodes.map(g => g.key)));
    if (activeTab === "CASTILLITOS") {
      setExpandedSubgroups(new Set(
        filteredHierarchyResult.nodes.flatMap(g => g.children.map(c => c.key))
      ));
    }
  }, [filteredHierarchyResult, activeTab]);
  const collapseAllHierarchy = useCallback(() => {
    setExpandedGroups(new Set());
    setExpandedSubgroups(new Set());
  }, []);

  // ── Vault subcategory groups ──────────────────────────────────────────
  const vaultGroups = useMemo(() => {
    if (activeTab !== "VAULT") return new Map<VaultSubcategory, CanonicalInventoryItemStatus[]>();
    const map = new Map<VaultSubcategory, CanonicalInventoryItemStatus[]>();
    for (const ci of panelItems) {
      if (!ci.vaultSubcategory) continue;
      const list = map.get(ci.vaultSubcategory) ?? [];
      list.push(ci);
      map.set(ci.vaultSubcategory, list);
    }
    return map;
  }, [panelItems, activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleLine = (line: string) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  const getPage = (key: string) => pageMap[key] ?? 1;
  const setPage = (key: string, page: number) =>
    setPageMap(prev => ({ ...prev, [key]: page }));

  const switchTab = (tab: PanelDestination) => {
    setActiveTab(tab);
    setFilter("todos");
    setSearch("");
    setPageMap({});
    setExpandedGroups(new Set());    // 04A5H
    setExpandedSubgroups(new Set()); // 04A5H
    setAgotadosFilter("todos");      // 04A5I
  };

  // ── Drawer state + enrichment ────────────────────────────────────
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerCanonical, setDrawerCanonical] = useState<CanonicalInventoryItemStatus | null>(null);
  const [enrichment, setEnrichment] = useState<{
    categoria: string | null;
    precioDetal: number | null;
    precioMayorista: number | null;
    grupoSag: string | null;
    lineaSag: string | null;
    subgrupoSag: string | null;
    grupoId: number | null;
    lineaId: number | null;
    subgrupoId: number | null;
    costo: number | null;
    manejaTallaColor: boolean;
    barcode: string | null;
    description2: string | null;
    handlingUnit: string | null;
    createdAtSag: string | null;
    lastModifiedSag: string | null;
    lastPurchaseSag: string | null;
    lastSaleSag: string | null;
    tallas: string[];
    colores: string[];
    variantCount: number;
  } | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const enrichmentRef = useRef<string | null>(null);

  // 04A6B: Order reservation data for drawer
  const [reservation, setReservation] = useState<{
    reservadoAgentikPendiente: number;
    pendingOrders: Array<{
      orderId: string;
      consecutivo: number;
      customerName: string;
      qtyActive: number;
      orderStatus: string;
      syncState: string;
      sagOrderId: string | null;
      createdAt: string;
      variants: string[];
    }>;
    error: string | null;
  } | null>(null);

  // Build canonical lookup
  const canonicalByRef = useMemo(() => {
    const map = new Map<string, CanonicalInventoryItemStatus>();
    for (const ci of canonicalItems) {
      map.set(ci.reference, ci);
    }
    return map;
  }, [canonicalItems]);

  const openDrawer = useCallback((item: InventoryItem) => {
    setDrawerItem(item);
    setDrawerCanonical(canonicalByRef.get(item.reference) ?? null);
    setEnrichment(null);
    setReservation(null);
    setEnrichmentLoading(true);
    enrichmentRef.current = item.reference;
  }, [canonicalByRef]);

  const openDrawerFromCanonical = useCallback((ci: CanonicalInventoryItemStatus) => {
    const orig = ci.originalItem;
    setDrawerItem(orig);
    setDrawerCanonical(ci);
    setEnrichment(null);
    setReservation(null);
    setEnrichmentLoading(true);
    enrichmentRef.current = ci.reference;
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerItem(null);
    setDrawerCanonical(null);
    setEnrichment(null);
    setReservation(null);
    setEnrichmentLoading(false);
    enrichmentRef.current = null;
  }, []);

  // Fetch enrichment data when drawer opens
  useEffect(() => {
    if (!drawerItem) return;
    const ref = drawerItem.reference;
    let cancelled = false;

    (async () => {
      // Fetch enrichment + reservation in parallel
      const enrichmentPromise = fetch(
        `/api/orgs/${orgSlug}/comercial/inventario/product-detail?reference=${encodeURIComponent(ref)}`,
      ).then(r => r.ok ? r.json() : null).catch(() => null);

      const reservationPromise = fetch(
        `/api/orgs/${orgSlug}/comercial/inventario/order-reservations?reference=${encodeURIComponent(ref)}`,
      ).then(r => r.ok ? r.json() : null).catch(() => null);

      const [enrichmentJson, reservationJson] = await Promise.all([enrichmentPromise, reservationPromise]);

      if (cancelled || enrichmentRef.current !== ref) return;

      // Process enrichment
      if (enrichmentJson?.ok && enrichmentJson.detail) {
        const d = enrichmentJson.detail;
        setEnrichment({
          categoria: d.categoria ?? null,
          precioDetal: d.precioDetal ?? null,
          precioMayorista: d.precioMayorista ?? null,
          grupoSag: d.grupoSag ?? null,
          lineaSag: d.lineaSag ?? null,
          subgrupoSag: d.subgrupoSag ?? null,
          grupoId: d.grupoId ?? null,
          lineaId: d.lineaId ?? null,
          subgrupoId: d.subgrupoId ?? null,
          costo: d.costo ?? null,
          manejaTallaColor: d.manejaTallaColor ?? false,
          barcode: d.barcode ?? null,
          description2: d.description2 ?? null,
          handlingUnit: d.handlingUnit ?? null,
          createdAtSag: d.createdAtSag ?? null,
          lastModifiedSag: d.lastModifiedSag ?? null,
          lastPurchaseSag: d.lastPurchaseSag ?? null,
          lastSaleSag: d.lastSaleSag ?? null,
          tallas: d.tallas ?? [],
          colores: d.colores ?? [],
          variantCount: d.variantCount ?? 0,
        });
      }

      // Process reservation (04A6B)
      if (reservationJson?.ok) {
        setReservation({
          reservadoAgentikPendiente: reservationJson.reservadoAgentikPendiente ?? 0,
          pendingOrders: reservationJson.orders ?? [],
          error: reservationJson.error ?? null,
        });
      } else {
        setReservation({
          reservadoAgentikPendiente: 0,
          pendingOrders: [],
          error: "Reservas Agentik no verificadas",
        });
      }

      setEnrichmentLoading(false);
    })();

    return () => { cancelled = true; };
  }, [drawerItem, orgSlug]);

  const drawerProduct: CommercialProductData | null = useMemo(() => {
    if (!drawerItem) return null;

    // 04A6B: Compute operational reservation metrics
    const reservadoSag = drawerItem.pedidosPendientes ?? 0;
    const reservadoAgentikPendiente = reservation?.reservadoAgentikPendiente ?? 0;
    const reservadoOperativo = reservadoSag + reservadoAgentikPendiente;
    const disponibleParaPrometer = drawerItem.disponibleReal - reservadoAgentikPendiente;

    return {
      reference: drawerItem.reference,
      description: drawerItem.description,
      stateLabel: STATE_LABELS[drawerItem.operationalState],
      stateColor: STATE_COLORS[drawerItem.operationalState],
      disponible: drawerItem.disponibleReal,
      linea: drawerItem.subLinea,
      subGrupo: drawerItem.subGrupo,
      subgrupoSag: enrichment?.subgrupoSag ?? drawerItem.subgrupoSag,
      categoria: enrichment?.categoria ?? undefined,
      precioDetal: enrichment?.precioDetal ?? undefined,
      precioMayorista: enrichment?.precioMayorista ?? undefined,
      reservado: drawerItem.pedidosPendientes,
      totalStock: drawerItem.existenciaBodega01,
      lineCategory: drawerItem.lineCategory,
      isAccessory: drawerItem.isAccessory,
      enrichmentLoading,
      grupoSag: enrichment?.grupoSag ?? drawerItem.grupoSag,
      lineaSag: enrichment?.lineaSag,
      grupoId: enrichment?.grupoId,
      lineaId: enrichment?.lineaId,
      subgrupoId: enrichment?.subgrupoId,
      costo: enrichment?.costo,
      manejaTallaColor: enrichment?.manejaTallaColor,
      barcode: enrichment?.barcode,
      description2: enrichment?.description2,
      handlingUnit: enrichment?.handlingUnit ?? drawerItem.handlingUnit,
      createdAtSag: enrichment?.createdAtSag,
      lastModifiedSag: enrichment?.lastModifiedSag,
      lastPurchaseSag: enrichment?.lastPurchaseSag,
      lastSaleSag: enrichment?.lastSaleSag,
      tallas: enrichment?.tallas,
      colores: enrichment?.colores,
      variantCount: enrichment?.variantCount,
      productionInProcess: drawerItem.productionInProcess,
      // 04A6B: Order reservation fields
      reservadoAgentikPendiente,
      reservadoOperativo,
      disponibleParaPrometer,
      pendingOrders: reservation?.pendingOrders,
      reservationError: reservation?.error,
    };
  }, [drawerItem, enrichment, enrichmentLoading, reservation]);

  return (
    <div style={{ padding: S[6], maxWidth: 1200 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Inventario" },
        ]}
        title="Inventario"
        subtitle={`Centro de control comercial — ${items.length.toLocaleString("es-CO")} referencias`}
      />

      {/* ── KPI Strip ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: S[3],
        marginBottom: S[5],
      }}>
        <KpiCard
          label="Total referencias"
          value={items.length}
          detail="Referencias registradas"
          detailColor={C.inkGhost}
        />
        <KpiCard
          label="Disp. comercial"
          value={health.totalDisponibleBodega}
          suffix=" uds"
          detail="Inventario comercial disponible"
          detailColor={C.inkGhost}
        />
        <KpiCard
          label="Castillitos"
          value={health.totalCS}
          suffix=" uds"
          color={C.blueDark}
          detail="Disp. comercial"
          detailColor={C.inkGhost}
          onClick={() => switchTab("CASTILLITOS")}
        />
        <KpiCard
          label="Latin Kids"
          value={health.totalLT}
          suffix=" uds"
          color={C.blueDark}
          detail="Disp. comercial"
          detailColor={C.inkGhost}
          onClick={() => switchTab("LATIN_KIDS")}
        />
        <KpiCard
          label="Importacion"
          value={health.totalImportacion}
          suffix=" uds"
          color={C.blueDark}
          detail="Disp. comercial"
          detailColor={C.inkGhost}
          onClick={() => switchTab("IMPORTACION")}
        />
        {/* Addendum D1: "En proceso" KPI removed — uncertified data.
            Production has no progress tracking (CANTIDAD_PRODUCIDA=null for open orders).
            Will be re-added after INVENTORY_CANONICAL_TRUTH_VERIFIED with
            proper classification: Programado en ordenes abiertas / Produccion teorica. */}
      </div>

      {/* ── Sync Status Block ──────────────────────────────────────────── */}
      <SyncStatusBlock dataQuality={dataQuality} />

      {/* ── Tab Navigation ─────────────────────────────────────────────── */}
      <TabNavigation
        tabs={TAB_ORDER}
        activeTab={activeTab}
        tabCounts={tabCounts}
        onSwitch={switchTab}
      />

      {/* ── Filters + Search (only for line-based tabs) ─────────────── */}
      {activeTab !== "VAULT" && activeTab !== "AGOTADOS" && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: S[3],
          marginBottom: S[5],
          flexWrap: "wrap" as const,
        }}>
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
            {FILTER_OPTIONS.map(opt => {
              const active = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setFilter(opt.key); setPageMap({}); }}
                  className="ag-action-ghost"
                  style={{
                    fontFamily: T.mono,
                    fontSize: T.sz["2xs"],
                    padding: `4px ${S[3]}px`,
                    borderRadius: R.pill,
                    border: `1px solid ${active ? C.blueDark : C.line}`,
                    background: active ? C.blueDark : "transparent",
                    color: active ? "#fff" : C.inkMid,
                    cursor: "pointer",
                    fontWeight: active ? T.wt.semibold : T.wt.normal,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPageMap({}); }}
            placeholder="Buscar referencia o descripcion..."
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `6px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              flex: "1 1 200px",
              minWidth: 200,
              outline: "none",
            }}
          />

          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            flexShrink: 0,
          }}>
            {/* 04A5H: Use hierarchy ref count except for subgrupos filter */}
            {(filter === "subgrupos" ? filteredPanelItems.length : filteredHierarchyResult.visibleRefCount)} referencia{(filter === "subgrupos" ? filteredPanelItems.length : filteredHierarchyResult.visibleRefCount) !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Search for VAULT / AGOTADOS tabs ───────────────────────── */}
      {(activeTab === "VAULT" || activeTab === "AGOTADOS") && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: S[3],
          marginBottom: S[5],
        }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPageMap({}); }}
            placeholder="Buscar referencia o descripcion..."
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `6px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              flex: "1 1 200px",
              minWidth: 200,
              outline: "none",
            }}
          />
          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            flexShrink: 0,
          }}>
            {panelItems.length} referencia{panelItems.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Subgrupo view REPLACES table (Addendum F) ────────────── */}
      {filter === "subgrupos" && activeTab !== "VAULT" && activeTab !== "AGOTADOS" && subgrupoCoverage && subgrupoCoverage.length > 0 ? (
        <SubgrupoCoveragePanel
          coverage={subgrupoCoverage}
          items={sortedItems}
          originalItemsByRef={originalItemsByRef}
          onRowClick={openDrawerFromCanonical}
        />
      ) : activeTab !== "VAULT" && activeTab !== "AGOTADOS" ? (
        /* ── 04A5H: Hierarchical Tab Content (CASTILLITOS, LATIN_KIDS, IMPORTACION, SIN_CLASIFICAR) */
        <>
          {filteredHierarchyResult.nodes.length === 0 ? (
            <EmptyState
              message={
                search.trim()
                  ? `Sin resultados para "${search.trim()}"${crossPanelHint ? ` en ${TAB_LABELS[activeTab]}` : ""}`
                  : filter !== "todos"
                  ? `Sin referencias con estado "${FILTER_OPTIONS.find(o => o.key === filter)?.label}"`
                  : `Sin datos de inventario para ${TAB_LABELS[activeTab]}`
              }
              hint={
                crossPanelHint
                  ? `"${crossPanelHint.reference}" esta en el panel ${crossPanelHint.label}`
                  : dataQuality.freshnessLabel === "SIN_DATOS"
                  ? "Sincronice inventario desde SAG para ver datos"
                  : "Ajuste los filtros para ver referencias"
              }
            />
          ) : (
            <HierarchicalTable
              hierarchy={filteredHierarchyResult.nodes}
              lineProfile={activeTab}
              originalItemsByRef={originalItemsByRef}
              expandedGroups={expandedGroups}
              expandedSubgroups={expandedSubgroups}
              toggleGroup={toggleGroup}
              toggleSubgroup={toggleSubgroup}
              expandAll={expandAllHierarchy}
              collapseAll={collapseAllHierarchy}
              hasSearch={!!search.trim()}
              onRowClick={openDrawerFromCanonical}
            />
          )}
        </>
      ) : null}

      {/* ── AGOTADOS Tab Content ──────────────────────────────────── */}
      {activeTab === "AGOTADOS" && (
        <AgotadosTabContent
          items={panelItems}
          originalItemsByRef={originalItemsByRef}
          getPage={getPage}
          setPage={setPage}
          onRowClick={openDrawerFromCanonical}
          agotadosFilter={agotadosFilter}
          setAgotadosFilter={setAgotadosFilter}
        />
      )}

      {/* ── VAULT Tab Content ─────────────────────────────────────── */}
      {activeTab === "VAULT" && (
        <VaultTabContent
          groups={vaultGroups}
          expandedLines={expandedLines}
          toggleLine={toggleLine}
          getPage={getPage}
          setPage={setPage}
          onRowClick={openDrawerFromCanonical}
        />
      )}

      {/* ── Accessory Low Stock Detail ────────────────────────────── */}
      {filter === "accesorios_bajo" && activeTab === "IMPORTACION" && accesoriosBajaCantidad && accesoriosBajaCantidad.length > 0 && (
        <AccesorioBajaCantidadPanel items={accesoriosBajaCantidad} />
      )}

      {/* ── Commercial Product Drawer ─────────────────────────────── */}
      <CommercialProductDrawer
        open={drawerItem !== null}
        onClose={closeDrawer}
        product={drawerProduct}
      >
        {/* Canonical status section inside drawer */}
        {drawerCanonical && (
          <CanonicalStatusSection canonical={drawerCanonical} />
        )}
      </CommercialProductDrawer>
    </div>
  );
}

// ── Line-Based Table ──────────────────────────────────────────────────────────

function LineBasedTable({
  items,
  originalItemsByRef,
  canonicalByRef,
  isAccessoryTab,
  getPage,
  setPage,
  tabKey,
  onRowClick,
}: {
  items: CanonicalInventoryItemStatus[];
  originalItemsByRef: Map<string, InventoryItem>;
  canonicalByRef: Map<string, CanonicalInventoryItemStatus>;
  isAccessoryTab: boolean;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  tabKey: string;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const page = getPage(tabKey);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
      marginBottom: S[4],
    }}>
      {/* Table Header */}
      {isAccessoryTab ? <AccessoryTableHeader /> : <TextileTableHeader />}

      {/* Rows */}
      {pageItems.map((ci, idx) => {
        const orig = originalItemsByRef.get(ci.reference);
        if (!orig) return null;
        const isLowActivity = ci.commercialReferenceStatus === "LOW_ACTIVITY_AVAILABLE";
        return isAccessoryTab ? (
          <AccessoryRow
            key={ci.reference}
            item={orig}
            even={idx % 2 === 0}
            onClick={() => onRowClick(ci)}
            lowActivity={isLowActivity}
          />
        ) : (
          <InventoryRow
            key={ci.reference}
            item={orig}
            even={idx % 2 === 0}
            onClick={() => onRowClick(ci)}
            lowActivity={isLowActivity}
          />
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: S[2],
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
        }}>
          <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage(tabKey, page - 1)} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            {page} / {totalPages}
          </span>
          <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(tabKey, page + 1)} />
        </div>
      )}
    </div>
  );
}

// ── Agotados Tab Content ──────────────────────────────────────────────────────

// 04A5I: Enhanced AGOTADAS tab — exclusive partition for refs with disponibleReal <= 0
function AgotadosTabContent({
  items,
  originalItemsByRef,
  getPage,
  setPage,
  onRowClick,
  agotadosFilter,
  setAgotadosFilter,
}: {
  items: CanonicalInventoryItemStatus[];
  originalItemsByRef: Map<string, InventoryItem>;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
  agotadosFilter: AgotadosFilterKey;
  setAgotadosFilter: (f: AgotadosFilterKey) => void;
}) {
  // 04A5I: Sub-filter: agotados (disp = 0) vs sobrecomprometidos (disp < 0)
  const filteredItems = useMemo(() => {
    if (agotadosFilter === "todos") return items;
    return items.filter(ci => {
      const orig = originalItemsByRef.get(ci.reference);
      const disp = orig?.disponibleReal ?? 0;
      if (agotadosFilter === "agotados") return disp === 0;
      if (agotadosFilter === "sobrecomprometidos") return disp < 0;
      return true;
    });
  }, [items, agotadosFilter, originalItemsByRef]);

  const page = getPage("AGOTADOS_TAB");
  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pageItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 04A5I: Partition counts for display
  const partitionCounts = useMemo(() => {
    let exhausted = 0;
    let overcommitted = 0;
    for (const ci of items) {
      const orig = originalItemsByRef.get(ci.reference);
      const disp = orig?.disponibleReal ?? 0;
      if (disp === 0) exhausted++;
      else if (disp < 0) overcommitted++;
    }
    return { total: items.length, exhausted, overcommitted };
  }, [items, originalItemsByRef]);

  if (items.length === 0) {
    return (
      <EmptyState
        message="Sin referencias agotadas"
        hint="Todas las referencias tienen unidades disponibles"
      />
    );
  }

  const AGOTADOS_HEADERS = ["", "Referencia", "Descripcion", "Linea", "Existencia", "Reservado", "Disponible", "Estado"];

  return (
    <div>
      {/* 04A5I: Partition summary strip */}
      <div style={{
        display: "flex",
        gap: S[4],
        marginBottom: S[3],
        padding: `${S[2]}px 0`,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
          Total: {partitionCounts.total}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
          Agotados: {partitionCounts.exhausted}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber }}>
          Sobrecomprometidos: {partitionCounts.overcommitted}
        </span>
      </div>

      {/* 04A5I: Sub-filter pills */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" as const }}>
        {AGOTADOS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={agotadosFilter === opt.key ? "ag-action-primary" : "ag-action-ghost"}
            onClick={() => { setAgotadosFilter(opt.key); setPage("AGOTADOS_TAB", 1); }}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              padding: `4px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${agotadosFilter === opt.key ? C.blueDark : C.line}`,
              background: agotadosFilter === opt.key ? C.blueDark : "transparent",
              color: agotadosFilter === opt.key ? C.surface : C.inkMid,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{
        border: `1px solid ${C.line}`,
        borderRadius: R.sm,
        overflow: "hidden",
        marginBottom: S[4],
      }}>
        {/* 04A5I: Enhanced header — Existencia, Reservado, Disponible, Estado */}
        <div className="ag-op-row" style={{
          display: "grid",
          gridTemplateColumns: AGOTADOS_GRID,
          gap: S[2],
          padding: `${S[2]}px ${S[4]}px`,
          background: C.surfaceAlt ?? C.surface,
          borderBottom: `1px solid ${C.line}`,
        }}>
          {AGOTADOS_HEADERS.map((h, i) => (
            <span key={`${h}-${i}`} style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              color: C.inkLight,
              textTransform: "uppercase" as const,
              textAlign: i >= 4 ? "right" as const : "left" as const,
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        {pageItems.map((ci, idx) => {
          const orig = originalItemsByRef.get(ci.reference) ?? ci.originalItem;
          return (
            <AgotadoRow key={ci.reference} item={orig} even={idx % 2 === 0} onClick={() => onRowClick(ci)} />
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: S[2],
            padding: `${S[3]}px ${S[4]}px`,
            borderTop: `1px solid ${C.line}`,
          }}>
            <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage("AGOTADOS_TAB", page - 1)} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
              {page} / {totalPages} ({filteredItems.length} refs)
            </span>
            <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage("AGOTADOS_TAB", page + 1)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vault Tab Content ─────────────────────────────────────────────────────────

function VaultTabContent({
  groups,
  expandedLines,
  toggleLine,
  getPage,
  setPage,
  onRowClick,
}: {
  groups: Map<VaultSubcategory, CanonicalInventoryItemStatus[]>;
  expandedLines: Set<string>;
  toggleLine: (key: string) => void;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const entries = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) {
    return (
      <EmptyState
        message="Sin referencias en historico"
        hint="Todas las referencias estan activas y disponibles"
      />
    );
  }

  return (
    <div>
      {entries.map(([subcategory, items]) => {
        const key = `VAULT_${subcategory}`;
        const expanded = expandedLines.has(key);
        const page = getPage(key);
        const totalPages = Math.ceil(items.length / PAGE_SIZE);
        const pageItems = expanded ? items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

        return (
          <div key={subcategory} style={{ marginBottom: S[3] }}>
            {/* Subcategory Header */}
            <button
              onClick={() => toggleLine(key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${S[3]}px ${S[4]}px`,
                background: `${C.ink}04`,
                border: `1px solid ${C.line}`,
                borderRadius: expanded ? `${R.sm}px ${R.sm}px 0 0` : R.sm,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  color: C.inkGhost,
                  width: 16,
                  textAlign: "center" as const,
                }}>
                  {expanded ? "\u25BE" : "\u25B8"}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.sm,
                  fontWeight: T.wt.bold,
                  color: C.inkMid,
                }}>
                  {VAULT_SUBCATEGORY_LABELS[subcategory]}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz["2xs"],
                  color: C.inkLight,
                }}>
                  {items.length} referencia{items.length !== 1 ? "s" : ""}
                </span>
              </div>
            </button>

            {/* Expanded Table */}
            {expanded && (
              <div style={{
                border: `1px solid ${C.line}`,
                borderTop: "none",
                borderRadius: `0 0 ${R.sm}px ${R.sm}px`,
                overflow: "hidden",
              }}>
                {/* Table Header */}
                <div className="ag-op-row" style={{
                  display: "grid",
                  gridTemplateColumns: VAULT_GRID,
                  gap: S[2],
                  padding: `${S[2]}px ${S[4]}px`,
                  background: C.surfaceAlt ?? C.surface,
                  borderBottom: `1px solid ${C.line}`,
                }}>
                  {["Referencia", "Descripcion", "Linea", "Estado", "Disponible", "En proceso", "Accion"].map((h, i) => (
                    <span key={`${h}-${i}`} style={{
                      fontFamily: T.mono,
                      fontSize: T.sz["2xs"],
                      fontWeight: T.wt.semibold,
                      color: C.inkLight,
                      textTransform: "uppercase" as const,
                      textAlign: i >= 4 ? "center" as const : "left" as const,
                    }}>
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                {pageItems.map((ci, idx) => (
                  <VaultRow key={ci.reference} ci={ci} even={idx % 2 === 0} onClick={() => onRowClick(ci)} />
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: S[2],
                    padding: `${S[3]}px ${S[4]}px`,
                    borderTop: `1px solid ${C.line}`,
                  }}>
                    <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage(key, page - 1)} />
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      {page} / {totalPages}
                    </span>
                    <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(key, page + 1)} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Vault Row ─────────────────────────────────────────────────────────────────

function VaultRow({ ci, even, onClick }: { ci: CanonicalInventoryItemStatus; even: boolean; onClick: () => void }) {
  const statusColor = COMMERCIAL_STATUS_COLORS[ci.commercialReferenceStatus];
  const statusLabel = COMMERCIAL_STATUS_LABELS[ci.commercialReferenceStatus];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: VAULT_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      {/* Reference */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {ci.reference}
      </span>

      {/* Description */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {ci.description}
      </span>

      {/* Canonical Line */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
      }}>
        {CANONICAL_LINE_LABELS[ci.canonicalLine]}
      </span>

      {/* Commercial Status */}
      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: statusColor,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: statusColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {statusLabel}
      </span>

      {/* Compatible commercial stock */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: ci.compatibleCommercialStock > 0 ? C.ink : C.inkGhost,
        textAlign: "center" as const,
      }}>
        {ci.compatibleCommercialStock > 0 ? ci.compatibleCommercialStock.toLocaleString("es-CO") : "\u2014"}
      </span>

      {/* Other stock (production + staging + container) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: C.inkGhost,
        textAlign: "center" as const,
      }}>
        {(ci.totalProductionStock + ci.totalStagingStock + ci.totalContainerStock) > 0
          ? (ci.totalProductionStock + ci.totalStagingStock + ci.totalContainerStock).toLocaleString("es-CO")
          : "\u2014"}
      </span>

      {/* Action label */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.blueDark,
        textAlign: "center" as const,
      }}>
        {ci.vaultActionLabel ?? "\u2014"}
      </span>
    </div>
  );
}

// ── Canonical Status Section (Drawer) ─────────────────────────────────────────

function CanonicalStatusSection({ canonical }: { canonical: CanonicalInventoryItemStatus }) {
  const statusColor = COMMERCIAL_STATUS_COLORS[canonical.commercialReferenceStatus];
  const statusLabel = COMMERCIAL_STATUS_LABELS[canonical.commercialReferenceStatus];

  return (
    <div style={{
      padding: `${S[4]}px 0`,
      borderTop: `1px solid ${C.line}`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.bold,
        color: C.ink,
        marginBottom: S[3],
        textTransform: "uppercase" as const,
      }}>
        Estado comercial
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
        <DrawerField label="Estado" value={statusLabel} valueColor={statusColor} />
        <DrawerField label="Linea" value={CANONICAL_LINE_LABELS[canonical.canonicalLine]} />
        <DrawerField
          label="Disp. comercial"
          value={canonical.compatibleCommercialStock > 0 ? canonical.compatibleCommercialStock.toLocaleString("es-CO") : "\u2014"}
        />
        <DrawerField
          label="En produccion"
          value={canonical.totalProductionStock > 0 ? canonical.totalProductionStock.toLocaleString("es-CO") : "\u2014"}
        />
        {canonical.lastRelevantActivityAt && (
          <DrawerField
            label="Ultima actividad"
            value={formatDateTimeEsCoStable(canonical.lastRelevantActivityAt)}
          />
        )}
        {canonical.inactivityDays !== null && (
          <DrawerField
            label="Dias inactivo"
            value={`${canonical.inactivityDays}`}
            valueColor={canonical.inactivityDays > 365 ? C.red : canonical.inactivityDays > 180 ? C.amber : C.ink}
          />
        )}
        <DrawerField label="Ubicacion" value={TAB_LABELS[canonical.panelDestination]} />
        {canonical.vaultSubcategory && (
          <DrawerField label="Subcategoria" value={VAULT_SUBCATEGORY_LABELS[canonical.vaultSubcategory]} />
        )}
      </div>

    </div>
  );
}

function DrawerField({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        textTransform: "uppercase" as const,
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: valueColor ?? C.ink,
        fontWeight: T.wt.semibold,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, color, suffix, detail, detailColor, onClick,
}: {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
  detail?: string;
  detailColor?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="ag-kpi-card"
      onClick={onClick}
      style={{
        padding: `${S[4]}px ${S[4]}px`,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: R.sm,
        boxShadow: E.xs,
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.blueDark; } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.line; } : undefined}
    >
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        marginBottom: S[1],
        textTransform: "uppercase" as const,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xl"],
        fontWeight: T.wt.bold,
        color: color ?? C.ink,
        lineHeight: 1,
      }}>
        {value.toLocaleString("es-CO")}{suffix ?? ""}
      </div>
      {detail && (
        <div style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: detailColor ?? C.inkFaint,
          marginTop: S[1],
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

// ── Tab Navigation (single-line, horizontally scrollable) ──────────────────

function TabNavigation({
  tabs,
  activeTab,
  tabCounts,
  onSwitch,
}: {
  tabs: PanelDestination[];
  activeTab: PanelDestination;
  tabCounts: Record<PanelDestination, number>;
  onSwitch: (tab: PanelDestination) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? 180 : -180, behavior: "smooth" });
  };

  return (
    <div style={{
      position: "relative" as const,
      marginBottom: S[5],
    }}>
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          aria-label="Desplazar pestanas a la izquierda"
          style={{
            position: "absolute" as const,
            left: 0,
            top: 0,
            bottom: 2,
            width: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(90deg, ${C.surface} 60%, transparent)`,
            border: "none",
            cursor: "pointer",
            zIndex: 2,
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            color: C.inkMid,
          }}
        >
          {"\u25C0"}
        </button>
      )}

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="ag-hide-scrollbar"
        style={{
          display: "flex",
          gap: S[2],
          borderBottom: `2px solid ${C.line}`,
          paddingBottom: 0,
          overflowX: "auto" as const,
        }}
      >
        {tabs.map(tab => {
          const active = activeTab === tab;
          const count = tabCounts[tab];
          const icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              onClick={() => onSwitch(tab)}
              style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: active ? T.wt.bold : T.wt.semibold,
                padding: `${S[3]}px ${S[4]}px`,
                borderRadius: `${R.md}px ${R.md}px 0 0`,
                border: "none",
                borderBottom: active ? `3px solid ${C.blueDark}` : "3px solid transparent",
                background: active ? `${C.blueDark}0C` : "transparent",
                color: active ? C.blueDark : C.inkMid,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: S[2],
                marginBottom: -2,
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: T.sz.sm }}>{icon}</span>
              <span>{TAB_LABELS[tab]}</span>
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.bold,
                color: active ? C.blueDark : C.inkLight,
                background: active ? `${C.blueDark}14` : `${C.ink}08`,
                padding: "2px 6px",
                borderRadius: R.pill,
                lineHeight: 1.2,
              }}>
                {count.toLocaleString("es-CO")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          aria-label="Desplazar pestanas a la derecha"
          style={{
            position: "absolute" as const,
            right: 0,
            top: 0,
            bottom: 2,
            width: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(270deg, ${C.surface} 60%, transparent)`,
            border: "none",
            cursor: "pointer",
            zIndex: 2,
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            color: C.inkMid,
          }}
        >
          {"\u25B6"}
        </button>
      )}
    </div>
  );
}

// ── Sync Status Block ────────────────────────────────────────────────────────

function SyncStatusBlock({ dataQuality }: { dataQuality: InventoryControlSnapshot["dataQuality"] }) {
  const isStale = dataQuality.freshnessLabel === "SIN_DATOS" || dataQuality.freshnessLabel === "DESACTUALIZADO";
  const dotColor = isStale ? C.amber : C.green;

  // Format date in human-readable LATAM style
  let dateLabel = "";
  if (dataQuality.snapshotAt) {
    const d = new Date(dataQuality.snapshotAt);
    const datePart = d.toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Bogota",
    });
    const timePart = d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    });
    dateLabel = `${datePart} \u00B7 ${timePart}`;
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: S[3],
      marginBottom: S[5],
      padding: `${S[2]}px 0`,
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: dotColor,
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: isStale ? C.amber : C.inkMid,
      }}>
        {isStale ? "Desactualizado" : "Actualizado"}
      </span>
      {dateLabel && (
        <span
          suppressHydrationWarning
          style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
          }}
        >
          {dateLabel}
        </span>
      )}
    </div>
  );
}

// ── Table Headers ────────────────────────────────────────────────────────────

function TextileTableHeader() {
  const headers = ["", "Referencia", "Descripcion", "Subgrupo", "Disp. comercial", "Estado"];
  const centerAligned = new Set([4]);
  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: TEXTILE_GRID,
      gap: S[2],
      padding: `${S[2]}px ${S[4]}px`,
      background: C.surfaceAlt ?? C.surface,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {headers.map((h, i) => (
        <span key={`${h}-${i}`} style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.semibold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          textAlign: centerAligned.has(i) ? "center" as const : "left" as const,
        }}>
          {h}
        </span>
      ))}
    </div>
  );
}

function AccessoryTableHeader() {
  const headers = ["", "Referencia", "Descripcion", "Subgrupo", "Tamano", "Disp. comercial", "Estado"];
  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: ACCESSORY_GRID,
      gap: S[2],
      padding: `${S[2]}px ${S[4]}px`,
      background: C.surfaceAlt ?? C.surface,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {headers.map((h, i) => (
        <span key={`${h}-${i}`} style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.semibold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          textAlign: i >= 4 ? "center" as const : "left" as const,
        }}>
          {h}
        </span>
      ))}
    </div>
  );
}

// ── Textile Row ──────────────────────────────────────────────────────────────

function InventoryRow({ item, even, onClick, lowActivity }: {
  item: InventoryItem;
  even: boolean;
  onClick: () => void;
  lowActivity?: boolean;
}) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: TEXTILE_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.reference}
        </span>
        {lowActivity && (
          <span style={{
            fontFamily: T.mono,
            fontSize: 9,
            color: C.blueDark,
            padding: "1px 4px",
            borderRadius: R.sm,
            background: `${C.blueDark}10`,
            flexShrink: 0,
          }}>
            BA
          </span>
        )}
      </div>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.subgrupoSag}
      </span>

      <span
        style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
          textAlign: "center" as const,
        }}
        title="Disponible comercial — inventario fisico terminado para surtido y venta"
      >
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      {item.productionInProcess > 0 && (
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.amber,
          textAlign: "center" as const,
        }} title="Producto en proceso — no disponible para surtido">
          {item.productionInProcess.toLocaleString("es-CO")} en proc.
        </span>
      )}

      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: stateColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: stateColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {stateLabel}
      </span>
    </div>
  );
}

// ── Accessory Row ────────────────────────────────────────────────────────────

function AccessoryRow({ item, even, onClick, lowActivity }: {
  item: InventoryItem;
  even: boolean;
  onClick: () => void;
  lowActivity?: boolean;
}) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: ACCESSORY_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.reference}
        </span>
        {lowActivity && (
          <span style={{
            fontFamily: T.mono,
            fontSize: 9,
            color: C.blueDark,
            padding: "1px 4px",
            borderRadius: R.sm,
            background: `${C.blueDark}10`,
            flexShrink: 0,
          }}>
            BA
          </span>
        )}
      </div>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.subgrupoSag !== "ACCESORIO" ? item.subgrupoSag : "\u2014"}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        textAlign: "center" as const,
      }}>
        {item.handlingUnit ?? "\u2014"}
      </span>

      <span
        style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
          textAlign: "center" as const,
        }}
        title="Disponible comercial — inventario fisico terminado para surtido y venta"
      >
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: stateColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: stateColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {stateLabel}
      </span>
    </div>
  );
}

// ── Agotado Row ──────────────────────────────────────────────────────────────

// 04A5I: Enhanced AgotadoRow — shows Existencia, Reservado, Disponible, Estado
function AgotadoRow({ item, even, onClick }: { item: InventoryItem; even: boolean; onClick: () => void }) {
  const disp = item.disponibleReal;
  const onHand = item.onHandReal ?? 0;
  const reserved = item.reservedReal ?? 0;
  // 04A5I: Partition state — EXHAUSTED (disp = 0) vs OVERCOMMITTED (disp < 0)
  const isOvercommitted = disp < 0;
  const partitionLabel = isOvercommitted ? "Sobrecompr." : "Agotado";
  const partitionColor = isOvercommitted ? C.amber : C.red;

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: AGOTADOS_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: C.blueDark,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.reference}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {CANONICAL_LINE_LABELS[item.canonicalLine]}
      </span>

      {/* 04A5I: Existencia (onHand) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: onHand > 0 ? C.ink : C.inkGhost,
        textAlign: "right" as const,
      }}>
        {onHand > 0 ? onHand.toLocaleString() : "\u2014"}
      </span>

      {/* 04A5I: Reservado */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: reserved > 0 ? C.amber : C.inkGhost,
        textAlign: "right" as const,
      }}>
        {reserved > 0 ? reserved.toLocaleString() : "\u2014"}
      </span>

      {/* 04A5I: Disponible (negative = overcommitted) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: disp < 0 ? C.red : C.inkGhost,
        textAlign: "right" as const,
      }}>
        {disp < 0 ? `(${Math.abs(disp).toLocaleString()})` : disp === 0 ? "0" : disp.toLocaleString()}
      </span>

      {/* 04A5I: Partition state badge */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: partitionColor,
        fontWeight: T.wt.semibold,
        textAlign: "right" as const,
      }}>
        {partitionLabel}
      </span>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

function PagButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        padding: `4px ${S[3]}px`,
        borderRadius: R.sm,
        border: `1px solid ${C.line}`,
        background: "transparent",
        color: disabled ? C.inkGhost : C.blueDark,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ── 04A5H: Hierarchy Types and Resolver ──────────────────────────────────────

/**
 * HierarchyGroup — Node in the line-specific inventory hierarchy.
 *
 * For CS (3-level): grupo → subgrupo → refs. Top-level has children[], no items.
 * For LT (2-level): subgrupo → refs. Top-level has items[], no children.
 * For IMP (2-level): tamaño → refs. Uses handlingUnit field.
 * For SIN (2-level): dimension bucket → refs.
 *
 * Invariants (04A5H-F):
 *   refCount = items.length (leaf) or SUM(children.refCount) (parent)
 *   availability = SUM(descendant disponibleReal)
 *   refsWithAvail = COUNT(descendants where disponibleReal > 0)
 */
interface HierarchyGroup {
  key: string;
  label: string;
  items: CanonicalInventoryItemStatus[];
  children: HierarchyGroup[];
  refCount: number;
  availability: number;
  refsWithAvail: number;
}

function computeGroupAggregates(
  items: CanonicalInventoryItemStatus[],
  children: HierarchyGroup[],
  originalItemsByRef: Map<string, InventoryItem>,
): { refCount: number; availability: number; refsWithAvail: number } {
  if (children.length > 0) {
    return {
      refCount: children.reduce((s, c) => s + c.refCount, 0),
      availability: children.reduce((s, c) => s + c.availability, 0),
      refsWithAvail: children.reduce((s, c) => s + c.refsWithAvail, 0),
    };
  }
  return {
    refCount: items.length,
    availability: items.reduce((s, ci) => {
      const orig = originalItemsByRef.get(ci.reference);
      return s + (orig?.disponibleReal ?? 0);
    }, 0),
    refsWithAvail: items.filter(ci => {
      const orig = originalItemsByRef.get(ci.reference);
      return orig != null && orig.disponibleReal > 0;
    }).length,
  };
}

function makeHGroup(
  key: string, label: string,
  items: CanonicalInventoryItemStatus[],
  children: HierarchyGroup[],
  originalItemsByRef: Map<string, InventoryItem>,
): HierarchyGroup {
  const agg = computeGroupAggregates(items, children, originalItemsByRef);
  return { key, label, items, children, ...agg };
}

/**
 * resolveInventoryHierarchy — Line-profile-specific hierarchy resolver (04A5H-A).
 * Prohibited: universal groupBy by subgrupo.
 */
function resolveInventoryHierarchy(
  lineProfile: PanelDestination,
  lineScopedItems: CanonicalInventoryItemStatus[],
  originalItemsByRef: Map<string, InventoryItem>,
): HierarchyGroup[] {
  switch (lineProfile) {
    case "CASTILLITOS":
      return buildCastillitosHierarchy(lineScopedItems, originalItemsByRef);
    case "LATIN_KIDS":
      return buildLatinKidsHierarchy(lineScopedItems, originalItemsByRef);
    case "IMPORTACION":
      return buildImportacionHierarchy(lineScopedItems, originalItemsByRef);
    case "SIN_CLASIFICAR":
      return buildSinClasificarHierarchy(lineScopedItems, originalItemsByRef);
    default:
      return [];
  }
}

// ── CASTILLITOS: GRUPO → SUBGRUPO → REFS (3 levels) ──
function buildCastillitosHierarchy(
  items: CanonicalInventoryItemStatus[],
  orig: Map<string, InventoryItem>,
): HierarchyGroup[] {
  const grupoMap = new Map<string, Map<string, CanonicalInventoryItemStatus[]>>();
  for (const ci of items) {
    const o = orig.get(ci.reference);
    const grupo = o?.grupoSag ?? "Sin grupo";
    const sg = o?.subgrupoSag ?? "Sin subgrupo";
    if (!grupoMap.has(grupo)) grupoMap.set(grupo, new Map());
    const sgMap = grupoMap.get(grupo)!;
    if (!sgMap.has(sg)) sgMap.set(sg, []);
    sgMap.get(sg)!.push(ci);
  }
  return [...grupoMap.entries()]
    .map(([grupo, sgMap]) => {
      const children = [...sgMap.entries()]
        .map(([sg, refs]) => makeHGroup(`S::${grupo}::${sg}`, sg, refs, [], orig))
        .sort((a, b) => a.label.localeCompare(b.label));
      return makeHGroup(`G::${grupo}`, grupo, [], children, orig);
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── LATIN KIDS: SUBGRUPO → REFS (2 levels, no grupo) ──
function buildLatinKidsHierarchy(
  items: CanonicalInventoryItemStatus[],
  orig: Map<string, InventoryItem>,
): HierarchyGroup[] {
  const sgMap = new Map<string, CanonicalInventoryItemStatus[]>();
  for (const ci of items) {
    const o = orig.get(ci.reference);
    const sg = o?.subgrupoSag ?? "Sin subgrupo";
    if (!sgMap.has(sg)) sgMap.set(sg, []);
    sgMap.get(sg)!.push(ci);
  }
  return [...sgMap.entries()]
    .map(([sg, refs]) => makeHGroup(`G::${sg}`, sg, refs, [], orig))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── IMPORTACION: TAMAÑO → REFS (2 levels, uses handlingUnit) ──
function buildImportacionHierarchy(
  items: CanonicalInventoryItemStatus[],
  orig: Map<string, InventoryItem>,
): HierarchyGroup[] {
  const sizeMap = new Map<string, CanonicalInventoryItemStatus[]>();
  for (const ci of items) {
    const o = orig.get(ci.reference);
    const size = o?.handlingUnit ?? "Sin tamano";
    if (!sizeMap.has(size)) sizeMap.set(size, []);
    sizeMap.get(size)!.push(ci);
  }
  return [...sizeMap.entries()]
    .map(([sz, refs]) => makeHGroup(`G::${sz}`, sz, refs, [], orig))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── SIN CLASIFICAR: DIMENSION FALTANTE → REFS (2 levels) ──
function buildSinClasificarHierarchy(
  items: CanonicalInventoryItemStatus[],
  orig: Map<string, InventoryItem>,
): HierarchyGroup[] {
  const dimMap = new Map<string, CanonicalInventoryItemStatus[]>();
  for (const ci of items) {
    const o = orig.get(ci.reference);
    let dim = "Sin clasificar";
    if (!o?.grupoSag && !o?.subgrupoSag) dim = "Sin grupo ni subgrupo";
    else if (!o?.grupoSag) dim = "Sin grupo";
    else dim = o.grupoSag;
    if (!dimMap.has(dim)) dimMap.set(dim, []);
    dimMap.get(dim)!.push(ci);
  }
  return [...dimMap.entries()]
    .map(([d, refs]) => makeHGroup(`G::${d}`, d, refs, [], orig))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── 04A5H: Hierarchy filter (filter + search → pruned tree) ────────────────

function isRefPassesFilter(
  ci: CanonicalInventoryItemStatus,
  filter: FilterKey,
  originalItemsByRef: Map<string, InventoryItem>,
): boolean {
  if (filter === "todos" || filter === "subgrupos") return true;
  const orig = originalItemsByRef.get(ci.reference);
  if (!orig) return false;
  switch (filter) {
    case "con_disponibilidad": return orig.disponibleReal > 0;
    case "cobertura_suficiente": return orig.threshold != null && orig.disponibleReal > orig.threshold;
    case "bajo": return orig.threshold != null && orig.disponibleReal > 0 && orig.disponibleReal <= orig.threshold;
    // 04A5I: "sin_cobertura" removed — those refs are exclusively in AGOTADAS tab
    case "accesorios_bajo": return orig.isAccessory && orig.disponibleReal > 0 && orig.disponibleReal < 10;
    default: return true;
  }
}

function filterHierarchy(
  nodes: HierarchyGroup[],
  filter: FilterKey,
  search: string,
  originalItemsByRef: Map<string, InventoryItem>,
): { nodes: HierarchyGroup[]; visibleRefCount: number } {
  const q = search.trim().toLowerCase();
  let totalRefs = 0;

  const matchesSearch = (text: string) => !q || text.toLowerCase().includes(q);
  const refMatchesSearch = (ci: CanonicalInventoryItemStatus) =>
    !q || ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q);

  const filtered = nodes
    .map(group => {
      const groupMatch = matchesSearch(group.label);

      if (group.children.length > 0) {
        // 3-level (CS): filter children, then children's items
        const visibleChildren = group.children
          .map(child => {
            const childMatch = matchesSearch(child.label);
            const visibleItems = child.items.filter(ci =>
              isRefPassesFilter(ci, filter, originalItemsByRef) &&
              (groupMatch || childMatch || refMatchesSearch(ci))
            );
            if (visibleItems.length === 0) return null;
            return makeHGroup(child.key, child.label, visibleItems, [], originalItemsByRef);
          })
          .filter((c): c is HierarchyGroup => c !== null);
        if (visibleChildren.length === 0) return null;
        const parent = makeHGroup(group.key, group.label, [], visibleChildren, originalItemsByRef);
        totalRefs += parent.refCount;
        return parent;
      }

      // 2-level (LT, IMP, SIN)
      const visibleItems = group.items.filter(ci =>
        isRefPassesFilter(ci, filter, originalItemsByRef) &&
        (groupMatch || refMatchesSearch(ci))
      );
      if (visibleItems.length === 0) return null;
      const leaf = makeHGroup(group.key, group.label, visibleItems, [], originalItemsByRef);
      totalRefs += leaf.refCount;
      return leaf;
    })
    .filter((g): g is HierarchyGroup => g !== null);

  return { nodes: filtered, visibleRefCount: totalRefs };
}

// ── 04A5H: HierarchicalTable Component ──────────────────────────────────────

const HIERARCHY_REF_GRID = "36px 110px 1fr 100px 80px 100px";

function HierarchicalTable({
  hierarchy,
  lineProfile,
  originalItemsByRef,
  expandedGroups,
  expandedSubgroups,
  toggleGroup,
  toggleSubgroup,
  expandAll,
  collapseAll,
  hasSearch,
  onRowClick,
}: {
  hierarchy: HierarchyGroup[];
  lineProfile: PanelDestination;
  originalItemsByRef: Map<string, InventoryItem>;
  expandedGroups: Set<string>;
  expandedSubgroups: Set<string>;
  toggleGroup: (key: string) => void;
  toggleSubgroup: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  hasSearch: boolean;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const is3Level = lineProfile === "CASTILLITOS";
  const anyExpanded = expandedGroups.size > 0 || expandedSubgroups.size > 0;

  return (
    <div className="ag-op-table" style={{
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
      marginBottom: S[4],
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: S[3],
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>
          {TAB_LABELS[lineProfile]}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
          {hierarchy.length} {is3Level ? "grupos" : lineProfile === "IMPORTACION" ? "tamanos" : "subgrupos"}
        </span>
        <div style={{ flex: 1 }} />
        {!anyExpanded && (
          <button onClick={expandAll} className="ag-action-ghost" style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `3px ${S[2]}px`,
            borderRadius: R.sm, border: `1px solid ${C.line}`,
            background: "transparent", color: C.inkMid, cursor: "pointer",
          }}>
            Expandir todos
          </button>
        )}
        {anyExpanded && (
          <button onClick={collapseAll} className="ag-action-ghost" style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `3px ${S[2]}px`,
            borderRadius: R.sm, border: `1px solid ${C.line}`,
            background: "transparent", color: C.inkMid, cursor: "pointer",
          }}>
            Recoger todos
          </button>
        )}
      </div>

      {/* Groups */}
      {hierarchy.map((group, gIdx) => {
        // Auto-expand on search
        const isGroupExpanded = hasSearch || expandedGroups.has(group.key);

        return (
          <div key={group.key}>
            {/* Group header row */}
            <HierarchyGroupHeader
              group={group}
              expanded={isGroupExpanded}
              toggle={() => toggleGroup(group.key)}
              level={1}
              even={gIdx % 2 === 0}
            />

            {isGroupExpanded && is3Level && group.children.map((sub, sIdx) => {
              const isSubExpanded = hasSearch || expandedSubgroups.has(sub.key);
              return (
                <div key={sub.key}>
                  {/* Subgroup header */}
                  <HierarchyGroupHeader
                    group={sub}
                    expanded={isSubExpanded}
                    toggle={() => toggleSubgroup(sub.key)}
                    level={2}
                    even={sIdx % 2 === 0}
                  />
                  {/* Subgroup refs */}
                  {isSubExpanded && (
                    <HierarchyRefBlock
                      items={sub.items}
                      originalItemsByRef={originalItemsByRef}
                      level={3}
                      onRowClick={onRowClick}
                    />
                  )}
                </div>
              );
            })}

            {isGroupExpanded && !is3Level && (
              <HierarchyRefBlock
                items={group.items}
                originalItemsByRef={originalItemsByRef}
                level={2}
                onRowClick={onRowClick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Group Header Row ────────────────────────────────────────────────────────

function HierarchyGroupHeader({
  group,
  expanded,
  toggle,
  level,
  even,
}: {
  group: HierarchyGroup;
  expanded: boolean;
  toggle: () => void;
  level: 1 | 2 | 3;
  even: boolean;
}) {
  const indent = level === 1 ? S[4] : level === 2 ? S[6] : S[8];
  const isParent = group.children.length > 0;

  return (
    <div
      className="ag-op-row"
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: S[3],
        padding: `${S[2]}px ${S[4]}px ${S[2]}px ${indent}px`,
        background: level === 1 ? (even ? `${C.ink}04` : "transparent") : `${C.blueDark}03`,
        borderBottom: `1px solid ${C.line}22`,
        cursor: "pointer",
      }}
    >
      {/* Chevron */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
        width: 16, textAlign: "center" as const,
      }}>
        {expanded ? "\u25BC" : "\u25B6"}
      </span>

      {/* Label */}
      <span style={{
        fontFamily: T.mono,
        fontSize: level === 1 ? T.sz.sm : T.sz.xs,
        fontWeight: level === 1 ? T.wt.bold : T.wt.semibold,
        color: C.ink,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {group.label}
      </span>

      {/* Ref count */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
        minWidth: 60, textAlign: "right" as const,
      }}>
        {group.refCount} ref{group.refCount !== 1 ? "s" : ""}
      </span>

      {/* Availability sum */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: group.availability > 0 ? C.ink : C.inkGhost,
        minWidth: 80, textAlign: "right" as const,
      }}>
        {group.availability > 0 ? group.availability.toLocaleString("es-CO") + " uds" : "\u2014"}
      </span>

      {/* Refs with availability */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
        minWidth: 80, textAlign: "right" as const,
      }}>
        {group.refsWithAvail}/{group.refCount} con disp.
      </span>

      {/* Expand indicator */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
        width: 16, textAlign: "center" as const,
      }}>
        {expanded ? "\u2212" : "+"}
      </span>
    </div>
  );
}

// ── Reference Block (items within a leaf group) ─────────────────────────────

function HierarchyRefBlock({
  items,
  originalItemsByRef,
  level,
  onRowClick,
}: {
  items: CanonicalInventoryItemStatus[];
  originalItemsByRef: Map<string, InventoryItem>;
  level: 2 | 3;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const indent = level === 2 ? S[6] : S[8];

  return (
    <div style={{ background: `${C.blueDark}02` }}>
      {/* Ref column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: HIERARCHY_REF_GRID,
        gap: S[2],
        padding: `${S[1]}px ${S[4]}px ${S[1]}px ${indent}px`,
        borderBottom: `1px solid ${C.line}22`,
      }}>
        <span />
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase" as const }}>Referencia</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase" as const }}>Descripcion</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase" as const, textAlign: "right" as const }}>Disp. comercial</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase" as const, textAlign: "right" as const }}>Reservado</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase" as const, textAlign: "left" as const }}>Estado</span>
      </div>

      {/* Ref rows */}
      {items.map(ci => {
        const orig = originalItemsByRef.get(ci.reference);
        if (!orig) return null;
        const disp = orig.disponibleReal;
        const reserved = orig.reservedReal;
        const sColor = STATE_COLORS[orig.operationalState] ?? C.inkGhost;

        return (
          <div
            key={ci.reference}
            className="ag-op-row"
            onClick={() => onRowClick(ci)}
            style={{
              display: "grid",
              gridTemplateColumns: HIERARCHY_REF_GRID,
              gap: S[2],
              padding: `${S[1]}px ${S[4]}px ${S[1]}px ${indent}px`,
              borderBottom: `1px solid ${C.line}11`,
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ProductThumbnail reference={ci.reference} size={24} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.blueDark }}>
              {ci.reference}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {orig.description}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              color: disp <= 0 ? C.red : C.ink, textAlign: "right" as const,
            }}>
              {disp > 0 ? disp.toLocaleString("es-CO") : disp < 0 ? `(${Math.abs(disp).toLocaleString("es-CO")})` : "\u2014"}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textAlign: "right" as const }}>
              {reserved > 0 ? reserved.toLocaleString("es-CO") : "\u2014"}
            </span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              color: sColor, display: "flex", alignItems: "center", gap: 3,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sColor, display: "inline-block", flexShrink: 0 }} />
              {STATE_LABELS[orig.operationalState] ?? "\u2014"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Subgrupo Coverage Panel ─────────────────────────────────────────────────

/**
 * SubgrupoCoveragePanel — Hierarchical subgroup table (04A4).
 * REPLACES the main table when "Subgrupos" filter is active.
 * All accordions start collapsed. Click row or chevron to expand references.
 *
 * Main headers:  SUBGRUPO | LINEA | REFERENCIAS | DISP. COMERCIAL | REFS. CON DISP. | ESTADO | ACCION
 * Child headers: REFERENCIA | DESCRIPCION | DISP. COMERCIAL | RESERVADO | EN PRODUCCION | ESTADO
 */

const SG_GRID = "28px 1fr 90px 80px 120px 100px 120px 40px";
const SG_REF_GRID = "40px 110px 1fr 100px 90px 100px 110px";

function SubgrupoCoveragePanel({
  coverage,
  items,
  originalItemsByRef,
  onRowClick,
}: {
  coverage: SubgrupoCoverage[];
  items?: CanonicalInventoryItemStatus[];
  originalItemsByRef?: Map<string, InventoryItem>;
  onRowClick?: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sgSearch, setSgSearch] = useState("");

  const stateColor: Record<string, string> = {
    cubierto: C.green,
    riesgo: C.amber,
    sin_cobertura: C.red,
  };
  const stateLabel: Record<string, string> = {
    cubierto: "Cubierto",
    riesgo: "En riesgo",
    sin_cobertura: "Sin cobertura",
  };

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(filteredCoverage.map(sg => sg.subgrupoSag)));
  };
  const collapseAll = () => setExpanded(new Set());

  // Filter subgroups by search
  const filteredCoverage = useMemo(() => {
    if (!sgSearch.trim()) return coverage;
    const q = sgSearch.toLowerCase();
    return coverage.filter(sg =>
      sg.subgrupoSag.toLowerCase().includes(q) ||
      sg.subLinea.toLowerCase().includes(q)
    );
  }, [coverage, sgSearch]);

  // Group items by subgrupo for expansion
  const itemsBySubgrupo = useMemo(() => {
    if (!items || !originalItemsByRef) return new Map<string, CanonicalInventoryItemStatus[]>();
    const map = new Map<string, CanonicalInventoryItemStatus[]>();
    for (const ci of items) {
      const orig = originalItemsByRef.get(ci.reference);
      if (!orig) continue;
      const sg = orig.subgrupoSag ?? orig.subGrupo ?? "";
      const list = map.get(sg) ?? [];
      list.push(ci);
      map.set(sg, list);
    }
    return map;
  }, [items, originalItemsByRef]);

  const thStyle = {
    fontFamily: T.mono,
    fontSize: T.sz["2xs"],
    fontWeight: T.wt.bold,
    color: C.inkMid,
    textTransform: "uppercase" as const,
    letterSpacing: "0.03em",
    padding: `${S[2]}px 0`,
    whiteSpace: "nowrap" as const,
  };

  return (
    <div className="ag-op-table" style={{
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
    }}>
      {/* Toolbar */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
        display: "flex",
        alignItems: "center",
        gap: S[3],
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.bold,
          color: C.ink,
        }}>
          Inventario por subgrupo
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
        }}>
          {filteredCoverage.length} subgrupos
        </span>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          value={sgSearch}
          onChange={e => setSgSearch(e.target.value)}
          placeholder="Buscar subgrupo..."
          style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            padding: `3px ${S[2]}px`,
            borderRadius: R.sm,
            border: `1px solid ${C.line}`,
            background: C.surface,
            color: C.ink,
            width: 180,
            outline: "none",
          }}
        />
        {expanded.size < filteredCoverage.length && (
          <button
            onClick={expandAll}
            className="ag-action-ghost"
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              padding: `3px ${S[2]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: "transparent",
              color: C.inkMid,
              cursor: "pointer",
            }}
          >
            Expandir todos
          </button>
        )}
        {expanded.size > 0 && (
          <button
            onClick={collapseAll}
            className="ag-action-ghost"
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              padding: `3px ${S[2]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: "transparent",
              color: C.inkMid,
              cursor: "pointer",
            }}
          >
            Recoger todos
          </button>
        )}
      </div>

      {/* ── Column headers ─────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: SG_GRID,
        gap: S[2],
        padding: `0 ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        background: C.surface,
      }}>
        <span />
        <span style={{ ...thStyle, textAlign: "left" }}>Subgrupo</span>
        <span style={{ ...thStyle, textAlign: "left" }}>Linea</span>
        <span style={{ ...thStyle, textAlign: "right" }}>Refs.</span>
        <span style={{ ...thStyle, textAlign: "right" }}>Disp. comercial</span>
        <span style={{ ...thStyle, textAlign: "right" }}>Refs. con disp.</span>
        <span style={{ ...thStyle, textAlign: "left" }}>Estado</span>
        <span />
      </div>

      {/* ── Accordion rows ─────────────────────────────────────── */}
      {filteredCoverage.map((sg, idx) => {
        const sc = stateColor[sg.estado] ?? C.inkGhost;
        const isOpen = expanded.has(sg.subgrupoSag);
        const sgItems = itemsBySubgrupo.get(sg.subgrupoSag) ?? [];

        return (
          <div key={sg.subgrupoSag} role="row">
            {/* Subgroup summary row */}
            <div
              className="ag-op-row"
              role="button"
              aria-expanded={isOpen}
              tabIndex={0}
              onClick={() => toggle(sg.subgrupoSag)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(sg.subgrupoSag); } }}
              style={{
                display: "grid",
                gridTemplateColumns: SG_GRID,
                gap: S[2],
                padding: `${S[2]}px ${S[4]}px`,
                background: idx % 2 === 0 ? C.surface : "transparent",
                borderBottom: `1px solid ${C.line}22`,
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              {/* Chevron */}
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                color: C.inkLight,
                textAlign: "center" as const,
                transition: "transform 0.15s ease",
              }}>
                {isOpen ? "\u25BC" : "\u25B6"}
              </span>
              {/* Subgrupo name */}
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: T.wt.semibold,
                color: C.ink,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}>
                {sg.subgrupoSag}
              </span>
              {/* Linea */}
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkMid,
                textAlign: "left" as const,
              }}>
                {sg.subLinea}
              </span>
              {/* Refs */}
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, textAlign: "right" as const }}>
                {sg.referenciasActivas}
              </span>
              {/* Disp. comercial */}
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: sg.unidadesDisponibles > 0 ? C.ink : C.inkGhost, textAlign: "right" as const }}>
                {sg.unidadesDisponibles > 0 ? sg.unidadesDisponibles.toLocaleString("es-CO") : "\u2014"}
              </span>
              {/* Refs. con disp. (tallasDisponibles = proxy for refs with disponibilidad > 0) */}
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, textAlign: "right" as const }}>
                {sg.tallasDisponibles}
              </span>
              {/* Estado badge */}
              <span className="ag-op-status" style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.semibold,
                color: sc,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: sc, display: "inline-block", flexShrink: 0,
                }} />
                {stateLabel[sg.estado] ?? sg.estado}
              </span>
              {/* Action hint */}
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkGhost,
                textAlign: "center" as const,
              }}>
                {isOpen ? "\u2212" : "+"}
              </span>
            </div>

            {/* ── Expanded reference sub-table ──────────────────── */}
            {isOpen && (
              <div style={{
                background: `${C.blueDark}04`,
                borderBottom: `1px solid ${C.line}33`,
              }}>
                {/* Reference column headers */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: SG_REF_GRID,
                  gap: S[2],
                  padding: `${S[1]}px ${S[4]}px ${S[1]}px ${S[5]}px`,
                  borderBottom: `1px solid ${C.line}22`,
                }}>
                  <span />
                  <span style={{ ...thStyle, textAlign: "left", fontSize: T.sz["2xs"] }}>Referencia</span>
                  <span style={{ ...thStyle, textAlign: "left", fontSize: T.sz["2xs"] }}>Descripcion</span>
                  <span style={{ ...thStyle, textAlign: "right", fontSize: T.sz["2xs"] }}>Disp. comercial</span>
                  <span style={{ ...thStyle, textAlign: "right", fontSize: T.sz["2xs"] }}>Reservado</span>
                  <span style={{ ...thStyle, textAlign: "right", fontSize: T.sz["2xs"] }}>En produccion</span>
                  <span style={{ ...thStyle, textAlign: "left", fontSize: T.sz["2xs"] }}>Estado</span>
                </div>

                {sgItems.length === 0 ? (
                  <div style={{
                    padding: `${S[3]}px ${S[5]}px`,
                    fontFamily: T.mono,
                    fontSize: T.sz["2xs"],
                    color: C.inkGhost,
                    fontStyle: "italic",
                  }}>
                    Sin referencias en este subgrupo para el panel actual
                  </div>
                ) : (
                  sgItems.map(ci => {
                    const orig = originalItemsByRef?.get(ci.reference);
                    if (!orig) return null;
                    const disp = orig.disponibleReal;
                    const reserved = orig.reservedReal; // SAG RESERVADO is the sole authority (04A3R2 ADDENDUM)
                    const production = orig.productionInProcess;
                    const sColor = STATE_COLORS[orig.operationalState] ?? C.inkGhost;
                    return (
                      <div
                        key={ci.reference}
                        className="ag-op-row"
                        onClick={() => onRowClick?.(ci)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: SG_REF_GRID,
                          gap: S[2],
                          padding: `${S[1]}px ${S[4]}px ${S[1]}px ${S[5]}px`,
                          borderBottom: `1px solid ${C.line}11`,
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <span />
                        {/* Referencia */}
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.blueDark }}>
                          {ci.reference}
                        </span>
                        {/* Descripcion */}
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {orig.description ?? "\u2014"}
                        </span>
                        {/* Disp. comercial */}
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: disp <= 0 ? C.red : C.ink, textAlign: "right" as const }}>
                          {disp > 0 ? disp.toLocaleString("es-CO") : disp < 0 ? `(${Math.abs(disp).toLocaleString("es-CO")})` : "\u2014"}
                        </span>
                        {/* Reservado */}
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textAlign: "right" as const }}>
                          {reserved > 0 ? reserved.toLocaleString("es-CO") : "\u2014"}
                        </span>
                        {/* En produccion */}
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: production > 0 ? "#6366f1" : C.inkGhost, textAlign: "right" as const }}>
                          {production > 0 ? production.toLocaleString("es-CO") : orig.hasActiveProduction ? "Con OP" : "\u2014"}
                        </span>
                        {/* Estado badge */}
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                          color: sColor, display: "flex", alignItems: "center", gap: 3,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: sColor, display: "inline-block", flexShrink: 0 }} />
                          {STATE_LABELS[orig.operationalState] ?? "\u2014"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Accessory Low Stock Panel ───────────────────────────────────────────────

function AccesorioBajaCantidadPanel({ items }: { items: AccesorioBajaCantidad[] }) {
  const stateColor: Record<string, string> = {
    suficiente: C.green,
    bajo: C.amber,
    critico: C.red,
  };
  const stateLabel: Record<string, string> = {
    suficiente: "Suficiente",
    bajo: "Bajo",
    critico: "Critico",
  };

  return (
    <div style={{
      marginTop: S[5],
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
    }}>
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.bold,
          color: C.ink,
        }}>
          Accesorios con baja cantidad
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
          marginLeft: S[3],
        }}>
          {items.length} categorias
        </span>
      </div>

      <div className="ag-op-row" style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px 100px 100px",
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {["Categoria", "Refs", "Uds disponibles", "Estado"].map((h, i) => (
          <span key={h} style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            color: C.inkLight,
            textTransform: "uppercase" as const,
            textAlign: i >= 1 && i <= 2 ? "center" as const : "left" as const,
          }}>
            {h}
          </span>
        ))}
      </div>

      {items.map((acc, idx) => {
        const sc = stateColor[acc.estado] ?? C.inkGhost;
        return (
          <div key={acc.categoria} className="ag-op-row" style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 100px 100px",
            gap: S[2],
            padding: `${S[2]}px ${S[4]}px`,
            background: idx % 2 === 0 ? C.surface : "transparent",
            borderBottom: `1px solid ${C.line}22`,
            alignItems: "center",
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: C.ink,
            }}>
              {acc.categoria}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkMid,
              textAlign: "center" as const,
            }}>
              {acc.referenciasActivas}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: acc.unidadesDisponibles <= 0 ? C.red : C.ink,
              textAlign: "center" as const,
            }}>
              {acc.unidadesDisponibles > 0 ? acc.unidadesDisponibles.toLocaleString("es-CO") : "\u2014"}
            </span>
            <span className="ag-op-status" style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              color: sc,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: sc,
                display: "inline-block",
                flexShrink: 0,
              }} />
              {stateLabel[acc.estado] ?? acc.estado}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div style={{
      padding: `${S[8]}px ${S[6]}px`,
      textAlign: "center" as const,
      background: C.surface,
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.sm,
        color: C.inkMid,
        marginBottom: S[2],
      }}>
        {message}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
      }}>
        {hint}
      </div>
    </div>
  );
}
