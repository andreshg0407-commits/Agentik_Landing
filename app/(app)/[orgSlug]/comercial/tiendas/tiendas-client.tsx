"use client";

/**
 * Tiendas — Client Component.
 *
 * Store replenishment workspace: cards per store, detail drawer,
 * shortage table, suggestions, rules, copilot signals,
 * proposals tab, proposal detail drawer with approval flow.
 *
 * Sprint: COMERCIAL-TIENDAS-SURTIDO-01
 * Sprint: COMERCIAL-TIENDAS-TRANSFERENCIAS-04
 * Sprint: COMERCIAL-TIENDAS-NO-HARDCODE-05
 * Sprint: TIENDAS-POLICY-FOUNDATION-01
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { C, T, S, R, E, panel, panelHeader, dataRow } from "@/lib/ui/tokens";
import type {
  TiendasWorkspaceData,
  StoreCard,
  StoreShortage,
  ReplenishmentSuggestion,
  StoreReplenishmentRule,
  StoreCopilotSignal,
  StoreHealthStatus,
  ShortageSeverity,
  SuggestionType,
  ReplenishmentRuleType,
  ProviderMetadata,
} from "@/lib/comercial/tiendas/store-replenishment-types";
import type {
  StoreReplenishmentProposal,
  StoreReplenishmentProposalLine,
  ProposalStatus,
  ProposalLineType,
  ProposalCard,
  DuplicateCheckResult,
} from "@/lib/comercial/tiendas/store-transfer-types";
import type {
  StorePolicyRule,
  StorePolicy,
  StorePolicyScope,
  StoreProductClass,
  StoreSizeClass,
} from "@/lib/comercial/tiendas/store-policy-types";
import type {
  StoreNeed,
  NeedStatus,
  StoreNeedsSummary,
} from "@/lib/comercial/tiendas/store-needs-types";
import type {
  StoreReplenishmentSuggestion,
  SuggestedAction,
  StoreSuggestionsSummary,
} from "@/lib/comercial/tiendas/store-suggestions-types";
import type {
  StoreWarehouseGuide,
  StoreWarehouseGuideLine,
  GuideStatus,
  GuidePriority,
  GuideCard,
} from "@/lib/comercial/tiendas/store-guide-types";
import type {
  StoreAssortmentNeed,
  AssortmentCandidate,
  AssortmentNeedStatus,
  TextileCoverageAnalysis,
  TextileCoverageGap,
  TextileCoverageGapSeverity,
} from "@/lib/comercial/tiendas/assortment-types";
import { computeTextileCoverageKpi } from "@/lib/comercial/tiendas/textile-coverage-engine";
import { BUSINESS_LINES } from "@/lib/comercial/tiendas/store-business-lines";
import type { RuleMode } from "@/lib/comercial/tiendas/store-business-lines";

// ── Tab cache type (TIENDAS-DRAWER-PERFORMANCE-01) ──────────────────────────

type TabCacheData = {
  storeId: string;
  shortages?: { shortages: StoreShortage[]; assortmentNeeds: StoreAssortmentNeed[] };
  suggestions?: { suggestions: ReplenishmentSuggestion[]; assortmentNeeds: StoreAssortmentNeed[] };
  coverage?: { textileCoverage: TextileCoverageAnalysis[] };
  warehouse?: { mainStock: import("@/lib/comercial/tiendas/store-replenishment-types").MainWarehouseAvailability[] };
};
type TabCacheRef = React.MutableRefObject<TabCacheData>;

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:           string;
  orgId:             string;
  workspace:         TiendasWorkspaceData;
  signals:           StoreCopilotSignal[];
  providerMetadata:  ProviderMetadata;
}

// ── Status maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<StoreHealthStatus, string> = {
  ok:                "Saludable",
  requiere_surtido:  "Atencion",
  critica:           "Critica",
  sin_reglas:        "Sin reglas",
};

const STATUS_COLOR: Record<StoreHealthStatus, { bg: string; text: string; dot: string }> = {
  ok:                { bg: C.greenLight,  text: C.green,  dot: C.green },
  requiere_surtido:  { bg: C.amberLight,  text: C.amber,  dot: C.amber },
  critica:           { bg: C.redLight,    text: C.red,    dot: C.red },
  sin_reglas:        { bg: C.surface,     text: C.inkLight, dot: C.inkFaint },
};

const SEVERITY_LABEL: Record<ShortageSeverity, string> = {
  critical: "Critico",
  warning:  "Bajo minimo",
  normal:   "Normal",
};

const SEVERITY_COLOR: Record<ShortageSeverity, { bg: string; text: string }> = {
  critical: { bg: C.redLight,   text: C.red },
  warning:  { bg: C.amberLight, text: C.amber },
  normal:   { bg: C.greenLight, text: C.green },
};

const SUGGESTION_LABEL: Record<SuggestionType, string> = {
  exact_transfer:       "Transferir exacto",
  partial_transfer:     "Transferencia parcial",
  production_needed:    "Sin disponibilidad en bodega",
  substitute_available: "Alternativa secundaria",
};

const SUGGESTION_COLOR: Record<SuggestionType, { bg: string; text: string }> = {
  exact_transfer:       { bg: C.greenLight, text: C.green },
  partial_transfer:     { bg: C.amberLight, text: C.amber },
  production_needed:    { bg: C.blueLight,  text: C.blueDark },
  substitute_available: { bg: C.surfaceAlt, text: C.inkLight },
};

const RULE_TYPE_LABEL: Record<ReplenishmentRuleType, string> = {
  category:    "Por categoria",
  line:        "Por linea",
  reference:   "Por referencia",
  size_group:  "Por tamano",
  import_size: "Importacion / tamano",
};

const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  borrador:           "Borrador",
  en_revision:        "En revision",
  aprobado:           "Aprobado",
  rechazado:          "Rechazado",
  preparado_para_sag: "Preparado para SAG",
  enviado_sag:        "Enviado a SAG",
  error_sag:          "Error SAG",
  archivado:          "Archivado",
};

const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, { bg: string; text: string }> = {
  borrador:           { bg: C.surface,     text: C.inkMid },
  en_revision:        { bg: C.amberLight,  text: C.amber },
  aprobado:           { bg: C.greenLight,  text: C.green },
  rechazado:          { bg: C.redLight,    text: C.red },
  preparado_para_sag: { bg: C.blueLight,   text: C.blueDark },
  enviado_sag:        { bg: C.greenLight,  text: C.green },
  error_sag:          { bg: C.redLight,    text: C.red },
  archivado:          { bg: C.surface,     text: C.inkFaint },
};

const LINE_TYPE_LABEL: Record<ProposalLineType, string> = {
  transferencia_exacta:    "Transferencia exacta",
  transferencia_parcial:   "Transferencia parcial",
  produccion_sugerida:     "Produccion sugerida",
  alternativa_secundaria:  "Alternativa secundaria",
};

const LINE_TYPE_COLOR: Record<ProposalLineType, { bg: string; text: string }> = {
  transferencia_exacta:    { bg: C.greenLight, text: C.green },
  transferencia_parcial:   { bg: C.amberLight, text: C.amber },
  produccion_sugerida:     { bg: C.blueLight,  text: C.blueDark },
  alternativa_secundaria:  { bg: C.surface,    text: C.inkLight },
};

// ── API helpers ─────────────────────────────────────────────────────────────

async function proposalApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/proposals`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function tiendaApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

/** Lightweight store data loaded on drawer open (PERF-01) */
interface StoreSummaryData {
  store:    import("@/lib/comercial/tiendas/store-replenishment-types").StoreLocation;
  health:   import("@/lib/comercial/tiendas/store-replenishment-types").StoreHealthSummary;
  hasRules: boolean;
}

async function configApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/warehouse-config`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// ── Warehouse config types (client-side mirror) ─────────────────────────────

interface WarehouseConfig {
  id:               string;
  storeName:        string;
  sagWarehouseCode: string;
  city:             string;
  responsibleName:  string;
  storeType:        "tienda" | "outlet" | "punto_venta";
  isMainWarehouse:  boolean;
  active:           boolean;
  source:           "sag" | "admin_config";
}

const STORE_TYPE_LABEL: Record<WarehouseConfig["storeType"], string> = {
  tienda:      "Tienda",
  outlet:      "Outlet",
  punto_venta: "Punto de venta",
};

// ── Store state machine (COMERCIAL-TIENDAS-ENTERPRISE-05) ───────────────────
//
// Two independent dimensions:
//   A) Administrative — owned by Agentik, never affected by integrations
//   B) Operational    — owned by SAG / external sync
//
// The UI always shows both. Config never disappears because of sync state.

// A) Administrative state
type StoreAdminState = "configurada" | "deshabilitada";

const ADMIN_BADGE: Record<StoreAdminState, { label: string; bg: string; text: string }> = {
  configurada:   { label: "Configurada",   bg: C.blueLight, text: C.blueDark },
  deshabilitada: { label: "Deshabilitada", bg: C.surface,   text: C.inkFaint },
};

function deriveAdminState(store: import("@/lib/comercial/tiendas/store-replenishment-types").StoreLocation): StoreAdminState {
  return store.status === "cerrada" ? "deshabilitada" : "configurada";
}

// B) Operational sync state
type StoreSyncState = "nunca_sincronizada" | "sincronizada" | "error_sincronizacion";

const SYNC_BADGE: Record<StoreSyncState, { label: string; bg: string; text: string; dot: string }> = {
  nunca_sincronizada:   { label: "Nunca sincronizada",     bg: C.amberLight, text: C.amber, dot: C.amber },
  sincronizada:         { label: "Sincronizada",           bg: C.greenLight, text: C.green, dot: C.green },
  error_sincronizacion: { label: "Error de sincronizacion", bg: C.redLight,   text: C.red,   dot: C.red },
};

function deriveStoreSyncState(store: import("@/lib/comercial/tiendas/store-replenishment-types").StoreLocation): StoreSyncState {
  if (store.lastSyncAt !== null) return "sincronizada";
  return "nunca_sincronizada";
}

// ── Main component ───────────────────────────────────────────────────────────

type WorkspaceView = "tiendas" | "necesidades" | "sugerencias" | "guias" | "propuestas";

export function TiendasClient({ orgSlug, workspace, signals, providerMetadata }: Props) {
  const [selectedStore, setSelectedStore] = useState<StoreSummaryData | null>(null);
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [activeTab, setActiveTab]         = useState<"inventario" | "faltantes" | "sugerencias" | "cobertura_textil" | "reglas" | "bodega">("inventario");
  const [syncMsg, setSyncMsg]             = useState<string | null>(null);

  // ── Tab data cache (TIENDAS-DRAWER-PERFORMANCE-01) ───────────────────────
  // Persists tab data across tab switches so returning to a tab is instant.
  // Cache is keyed by storeId — cleared when a different store opens.
  const tabCacheRef = useRef<TabCacheData>({ storeId: "" });

  // Workspace view toggle
  const [view, setView] = useState<WorkspaceView>("tiendas");

  // Proposals state
  const [proposals, setProposals]                 = useState<ProposalCard[]>([]);
  const [proposalsLoaded, setProposalsLoaded]     = useState(false);
  const [selectedProposal, setSelectedProposal]   = useState<StoreReplenishmentProposal | null>(null);
  const [proposalDrawerOpen, setProposalDrawerOpen] = useState(false);

  // Duplicate dialog
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
  const [pendingCreate, setPendingCreate]   = useState<{
    storeId: string; storeName: string; sourceCode: string; sourceName: string;
    targetCode: string; suggestions: ReplenishmentSuggestion[];
  } | null>(null);

  // Needs state
  const [needs, setNeeds]                       = useState<StoreNeed[]>([]);
  const [needsSummaries, setNeedsSummaries]     = useState<StoreNeedsSummary[]>([]);
  const [needsLoaded, setNeedsLoaded]           = useState(false);
  const [needsLoading, setNeedsLoading]         = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions]               = useState<StoreReplenishmentSuggestion[]>([]);
  const [suggestionsSummaries, setSuggestionsSummaries] = useState<StoreSuggestionsSummary[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded]   = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Guides state
  const [guideCards, setGuideCards]               = useState<GuideCard[]>([]);
  const [guidesLoaded, setGuidesLoaded]           = useState(false);
  const [guidesLoading, setGuidesLoading]         = useState(false);
  const [selectedGuide, setSelectedGuide]         = useState<StoreWarehouseGuide | null>(null);
  const [guideDrawerOpen, setGuideDrawerOpen]     = useState(false);

  // Warehouse config state
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [configs, setConfigs]                   = useState<WarehouseConfig[]>([]);
  const [configsLoaded, setConfigsLoaded]       = useState(false);

  // Feedback message
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 5000);
  }

  async function openStore(storeId: string) {
    setDrawerOpen(true);
    setActiveTab("inventario");
    setSelectedStore(null);
    // Clear tab cache for new store (TIENDAS-DRAWER-PERFORMANCE-01)
    tabCacheRef.current = { storeId };
    const t0 = performance.now();
    try {
      const data = await tiendaApi(orgSlug, { action: "store_summary", storeId });
      if (data.summary) setSelectedStore(data.summary);
    } catch {
      // Summary load failed — drawer shows empty state
    }
    if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
      console.log(`[TIENDAS_PERF] drawer_open_ms=${Math.round(performance.now() - t0)}`);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedStore(null);
  }

  function handleSyncSag() {
    setSyncMsg("Sincronizacion SAG en proceso. Recarga la pagina para ver datos actualizados.");
    setTimeout(() => setSyncMsg(null), 5000);
  }

  // Warehouse config
  async function loadConfigs() {
    const data = await configApi(orgSlug, { action: "list" });
    setConfigs(data.configs ?? []);
    setConfigsLoaded(true);
  }

  async function openConfigDrawer() {
    if (!configsLoaded) await loadConfigs();
    setConfigDrawerOpen(true);
  }

  async function handleSaveConfig(cfg: Omit<WarehouseConfig, "id" | "source"> & { id?: string }) {
    await configApi(orgSlug, { action: "save", ...cfg });
    await loadConfigs();
    showFeedback("Configuracion de bodega guardada.");
  }

  async function handleToggleConfig(configId: string) {
    await configApi(orgSlug, { action: "toggle_active", configId });
    await loadConfigs();
  }

  // Load proposals
  const loadProposals = useCallback(async () => {
    const data = await proposalApi(orgSlug, { action: "list" });
    setProposals(data.proposals ?? []);
    setProposalsLoaded(true);
  }, [orgSlug]);

  async function switchToProposals() {
    setView("propuestas");
    if (!proposalsLoaded) await loadProposals();
  }

  async function switchToNeeds() {
    setView("necesidades");
    if (!needsLoaded && !needsLoading) {
      setNeedsLoading(true);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/needs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        });
        const data = await res.json();
        setNeeds(data.needs ?? []);
        setNeedsSummaries(data.summaries ?? []);
        setNeedsLoaded(true);
      } catch {
        showFeedback("Error al cargar necesidades.");
      } finally {
        setNeedsLoading(false);
      }
    }
  }

  async function switchToSuggestions() {
    setView("sugerencias");
    if (!suggestionsLoaded && !suggestionsLoading) {
      setSuggestionsLoading(true);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        });
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setSuggestionsSummaries(data.summaries ?? []);
        setSuggestionsLoaded(true);
      } catch {
        showFeedback("Error al cargar sugerencias.");
      } finally {
        setSuggestionsLoading(false);
      }
    }
  }

  async function switchToGuides() {
    setView("guias");
    if (!guidesLoaded && !guidesLoading) {
      setGuidesLoading(true);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        });
        const data = await res.json();
        setGuideCards(data.guides ?? []);
        setGuidesLoaded(true);
      } catch {
        showFeedback("Error al cargar guias.");
      } finally {
        setGuidesLoading(false);
      }
    }
  }

  async function handleGenerateGuides() {
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      showFeedback(`${data.count ?? 0} guias generadas.`);
      // Reload
      const res2 = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load" }),
      });
      const data2 = await res2.json();
      setGuideCards(data2.guides ?? []);
    } catch {
      showFeedback("Error al generar guias.");
    }
  }

  async function openGuideDetail(guideId: string) {
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", guideId }),
      });
      const data = await res.json();
      if (data.guide) {
        setSelectedGuide(data.guide);
        setGuideDrawerOpen(true);
      }
    } catch {
      showFeedback("Error al cargar guia.");
    }
  }

  async function handleGuideAction(guideId: string, action: "approve" | "cancel" | "execute") {
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, guideId }),
      });
      const data = await res.json();
      if (data.guide) {
        setSelectedGuide(data.guide);
        showFeedback(
          action === "approve" ? "Guia aprobada." :
          action === "cancel" ? "Guia cancelada." :
          "Guia marcada como ejecutada.",
        );
        // Refresh list
        const res2 = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/guides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "load" }),
        });
        const data2 = await res2.json();
        setGuideCards(data2.guides ?? []);
      } else if (data.error) {
        showFeedback(data.error);
      }
    } catch {
      showFeedback("Error en la accion.");
    }
  }

  // Create proposal (with duplicate check)
  async function handleCreateProposal(summary: StoreSummaryData) {
    // Load suggestions on demand for proposal creation (PERF-01)
    const sugData = await tiendaApi(orgSlug, { action: "store_suggestions", storeId: summary.store.id });
    const suggestions: ReplenishmentSuggestion[] = sugData.suggestions ?? [];

    if (suggestions.length === 0) {
      showFeedback("No hay sugerencias para crear una propuesta.");
      return;
    }

    // Check for duplicates first
    const check = await proposalApi(orgSlug, {
      action:  "check_duplicate",
      storeId: summary.store.id,
    });

    if (check.hasDuplicate) {
      setDuplicateCheck(check);
      setPendingCreate({
        storeId:     summary.store.id,
        storeName:   summary.store.name,
        sourceCode:  workspace.mainWarehouseCode,
        sourceName:  workspace.mainWarehouseName,
        targetCode:  summary.store.sagWarehouseCode,
        suggestions,
      });
      return;
    }

    await doCreateProposal(
      summary.store.id, summary.store.name,
      workspace.mainWarehouseCode, workspace.mainWarehouseName,
      summary.store.sagWarehouseCode, suggestions,
    );
  }

  async function doCreateProposal(
    storeId: string, storeName: string,
    sourceCode: string, sourceName: string,
    targetCode: string, suggestions: ReplenishmentSuggestion[],
  ) {
    const data = await proposalApi(orgSlug, {
      action: "create",
      storeId, storeName,
      sourceWarehouseCode: sourceCode,
      sourceWarehouseName: sourceName,
      targetWarehouseCode: targetCode,
      suggestions,
      createdBy: "usuario",
    });

    if (data.proposal) {
      showFeedback("Propuesta creada. Puedes revisarla antes de enviarla a SAG.");
      setProposalsLoaded(false); // force reload
      setSelectedProposal(data.proposal);
      setProposalDrawerOpen(true);
      setDrawerOpen(false);
    }
  }

  function handleDuplicateAction(action: "open" | "create_new" | "cancel") {
    if (action === "open" && duplicateCheck?.existingProposal) {
      openProposalById(duplicateCheck.existingProposal.id);
    } else if (action === "create_new" && pendingCreate) {
      doCreateProposal(
        pendingCreate.storeId, pendingCreate.storeName,
        pendingCreate.sourceCode, pendingCreate.sourceName,
        pendingCreate.targetCode, pendingCreate.suggestions,
      );
    }
    setDuplicateCheck(null);
    setPendingCreate(null);
  }

  async function openProposalById(id: string) {
    const data = await proposalApi(orgSlug, { action: "get", proposalId: id });
    if (data.proposal) {
      setSelectedProposal(data.proposal);
      setProposalDrawerOpen(true);
      setDrawerOpen(false);
    }
  }

  async function handleProposalAction(proposalId: string, action: string) {
    const data = await proposalApi(orgSlug, { action, proposalId });
    if (data.proposal) {
      setSelectedProposal(data.proposal);
      setProposalsLoaded(false);
      if (action === "archive") {
        showFeedback("Propuesta archivada.");
        setProposalDrawerOpen(false);
      } else {
        const statusLabel = PROPOSAL_STATUS_LABEL[data.proposal.status as ProposalStatus] ?? data.proposal.status;
        showFeedback(`Propuesta actualizada: ${statusLabel}`);
      }
    }
  }

  async function handleUpdateLine(
    proposalId: string, lineId: string,
    updates: { transferUnits?: number; productionUnits?: number; comment?: string; removed?: boolean },
  ) {
    const data = await proposalApi(orgSlug, {
      action: "update_line", proposalId, lineId, ...updates,
    });
    if (data.proposal) {
      setSelectedProposal(data.proposal);
      setProposalsLoaded(false);
    }
  }

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/pipeline` },
          { label: "Tiendas" },
        ]}
        title="Tiendas"
        subtitle="Controla surtido, faltantes y transferencias sugeridas por tienda."
        status={workspace.stores.some(s => s.status === "critica") ? "critical"
              : workspace.stores.some(s => s.status === "requiere_surtido") ? "warning"
              : "ok"}
        statusLabel={`${workspace.stores.length} tiendas`}
      />

      {/* Data source + provider metadata indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3],
        marginBottom: S[4], flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "2px 8px", borderRadius: R.pill,
          background: providerMetadata.connected ? C.greenLight : C.amberLight,
          color:      providerMetadata.connected ? C.green : C.amber,
          border:     `1px solid ${providerMetadata.connected ? C.greenBorder : C.amberBorder}`,
        }}>
          {providerMetadata.connected ? "SAG conectado" : "Sin conexion SAG"}
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"],
          padding: "2px 8px", borderRadius: R.pill,
          background: providerMetadata.kind === "demo" ? C.surface : C.blueLight,
          color:      providerMetadata.kind === "demo" ? C.inkFaint : C.blueDark,
          border:     `1px solid ${providerMetadata.kind === "demo" ? C.line : C.blueBorder}`,
        }}>
          {providerMetadata.label}
        </span>
        {providerMetadata.variantSupport && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"],
            padding: "2px 6px", borderRadius: R.pill,
            background: C.greenLight, color: C.green,
            border: `1px solid ${C.greenBorder}`,
          }}>
            Variantes activas
          </span>
        )}
        {providerMetadata.lastReadAt ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            Ultima lectura: {formatTimeAgo(providerMetadata.lastReadAt)}
          </span>
        ) : providerMetadata.kind !== "demo" ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber }}>
            Sin datos sincronizados
          </span>
        ) : null}
        <button
          onClick={handleSyncSag}
          className="ag-action-secondary"
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.blueDark, background: C.blueLight,
            border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
            padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", marginLeft: "auto",
          }}
        >
          Sincronizar SAG
        </button>
      </div>

      {/* Feedback messages */}
      {(syncMsg || feedbackMsg) && (
        <div style={{
          ...panel, padding: `${S[2]}px ${S[4]}px`, marginBottom: S[3],
          background: C.blueLight, borderColor: C.blueBorder,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark,
        }}>
          {syncMsg || feedbackMsg}
        </div>
      )}

      {/* View toggle: Tiendas | Propuestas + Configurar bodegas */}
      <div style={{
        display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center",
      }}>
        {(["tiendas", "necesidades", "sugerencias", "guias", "propuestas"] as WorkspaceView[]).map(v => {
          const viewLabel: Record<WorkspaceView, string> = {
            tiendas: "Tiendas", necesidades: "Necesidades",
            sugerencias: "Sugerencias", guias: "Guias", propuestas: "Propuestas",
          };
          const viewHandler = () => {
            if (v === "propuestas") switchToProposals();
            else if (v === "necesidades") switchToNeeds();
            else if (v === "sugerencias") switchToSuggestions();
            else if (v === "guias") switchToGuides();
            else setView("tiendas");
          };
          return (
            <button
              key={v}
              onClick={viewHandler}
              className="ag-action-secondary"
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer",
                background: view === v ? C.blueDark : C.surface,
                color:      view === v ? C.white : C.inkMid,
                border:     `1px solid ${view === v ? C.blueDark : C.line}`,
              }}
            >
              {viewLabel[v]}
            </button>
          );
        })}
        <button
          onClick={openConfigDrawer}
          className="ag-action-secondary"
          style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer",
            background: C.surface, color: C.inkMid,
            border: `1px solid ${C.line}`, marginLeft: "auto",
          }}
        >
          Configurar bodegas
        </button>
      </div>

      {/* No stores — show configuration prompt, never hide the workspace */}
      {view === "tiendas" && workspace.stores.length === 0 && (
        <div style={{
          ...panel, padding: S[6], textAlign: "center",
          background: C.amberLight, borderColor: C.amberBorder,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.amber, marginBottom: S[2] }}>
            Sin tiendas configuradas
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[3] }}>
            {providerMetadata.connected
              ? "SAG esta conectado pero no se encontraron bodegas mapeadas como tiendas. Configura las bodegas para activar este modulo."
              : "Configura las bodegas manualmente. Cuando SAG se conecte, las tiendas se enriqueceran con datos de inventario automaticamente."}
          </div>
          <button
            onClick={openConfigDrawer}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.white, background: C.blueDark, border: "none",
              borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}
          >
            Configurar bodegas
          </button>
        </div>
      )}

      {/* Copilot signals */}
      {view === "tiendas" && signals.length > 0 && (
        <div style={{ marginBottom: S[5], display: "flex", flexDirection: "column", gap: S[2] }}>
          {signals.map((sig, i) => (
            <div key={i} style={{
              ...panel,
              padding:    `${S[2]}px ${S[4]}px`,
              display:    "flex",
              alignItems: "center",
              gap:        S[2],
              background: sig.type === "critical_shortage" ? C.redLight
                        : sig.type === "transfer_ready" ? C.greenLight
                        : sig.type === "opportunity_available" ? C.amberLight
                        : C.surface,
              borderColor: sig.type === "critical_shortage" ? C.redBorder
                         : sig.type === "transfer_ready" ? C.greenBorder
                         : sig.type === "opportunity_available" ? C.amberBorder
                         : C.line,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, background: C.white, padding: "2px 6px",
                borderRadius: R.sm, border: `1px solid ${C.blueBorder}`,
              }}>David</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
                {sig.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* TIENDAS VIEW — Store cards grid */}
      {view === "tiendas" && (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap:                 S[4],
        }}>
          {workspace.stores.map(card => (
            <StoreCardView key={card.store.id} card={card} onOpen={() => openStore(card.store.id)} onSyncSag={handleSyncSag} />
          ))}
        </div>
      )}

      {/* NECESIDADES VIEW */}
      {view === "necesidades" && (
        <NeedsView
          needs={needs}
          summaries={needsSummaries}
          loading={needsLoading}
          loaded={needsLoaded}
        />
      )}

      {/* SUGERENCIAS VIEW */}
      {view === "sugerencias" && (
        <SuggestionsMotorView
          suggestions={suggestions}
          summaries={suggestionsSummaries}
          loading={suggestionsLoading}
          loaded={suggestionsLoaded}
        />
      )}

      {/* GUIAS VIEW */}
      {view === "guias" && (
        <GuidesView
          guideCards={guideCards}
          loading={guidesLoading}
          loaded={guidesLoaded}
          onOpenGuide={openGuideDetail}
          onGenerate={handleGenerateGuides}
        />
      )}

      {/* Guide detail drawer */}
      {guideDrawerOpen && selectedGuide && (
        <GuideDetailDrawer
          guide={selectedGuide}
          onClose={() => { setGuideDrawerOpen(false); setSelectedGuide(null); }}
          onAction={handleGuideAction}
        />
      )}

      {/* PROPUESTAS VIEW */}
      {view === "propuestas" && (
        <ProposalsListView
          proposals={proposals}
          onOpenProposal={openProposalById}
        />
      )}

      {/* Store detail drawer */}
      {drawerOpen && !selectedStore && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 520,
          background: C.surface, borderLeft: `1px solid ${C.line}`,
          zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
        }}>
          Cargando detalle...
        </div>
      )}
      {drawerOpen && selectedStore && (
        <StoreDetailDrawer
          orgSlug={orgSlug}
          summary={selectedStore}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={closeDrawer}
          onCreateProposal={() => handleCreateProposal(selectedStore)}
          onViewProposals={() => { closeDrawer(); switchToProposals(); }}
          tabCacheRef={tabCacheRef}
        />
      )}

      {/* Proposal detail drawer */}
      {proposalDrawerOpen && selectedProposal && (
        <ProposalDetailDrawer
          proposal={selectedProposal}
          onClose={() => { setProposalDrawerOpen(false); setSelectedProposal(null); }}
          onAction={handleProposalAction}
          onUpdateLine={handleUpdateLine}
        />
      )}

      {/* Duplicate check dialog */}
      {duplicateCheck && duplicateCheck.hasDuplicate && (
        <DuplicateDialog
          existing={duplicateCheck.existingProposal!}
          onAction={handleDuplicateAction}
        />
      )}

      {/* Warehouse config drawer */}
      {configDrawerOpen && (
        <WarehouseConfigDrawer
          configs={configs}
          onClose={() => setConfigDrawerOpen(false)}
          onSave={handleSaveConfig}
          onToggle={handleToggleConfig}
        />
      )}
    </div>
  );
}

// ── Store Card ───────────────────────────────────────────────────────────────

function StoreCardView({ card, onOpen, onSyncSag }: { card: StoreCard; onOpen: () => void; onSyncSag: () => void }) {
  const { store, health, status } = card;
  const syncState = deriveStoreSyncState(store);
  const synced    = syncState === "sincronizada";
  const syncBdg   = SYNC_BADGE[syncState];

  // Health badge only when synced (real data)
  const healthBdg = synced ? STATUS_COLOR[status] : null;

  return (
    <div style={{
      ...panel, display: "flex", flexDirection: "column", minHeight: 240,
    }}>
      {/* Header — always shows full admin identity */}
      <div style={{ ...panelHeader, flexDirection: "column", alignItems: "stretch", gap: S[2] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            {store.name}
          </div>
          {/* Sync state badge — always visible */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[1],
            padding: "3px 8px", borderRadius: R.pill,
            background: syncBdg.bg, border: `1px solid ${syncBdg.text}20`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncBdg.dot }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: syncBdg.text }}>
              {syncBdg.label}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            Bodega SAG: {store.sagWarehouseCode}{store.city ? ` · ${store.city}` : ""}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Responsable: {store.responsibleName || "Sin asignar"}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: synced ? C.inkFaint : C.amber }}>
            Ultima sincronizacion: {synced ? formatTimeAgo(store.lastSyncAt!) : "Nunca"}
          </div>
        </div>
        {/* Health badge only when synced (real data, not invented) */}
        {healthBdg && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: S[1],
            padding: "2px 8px", borderRadius: R.pill, alignSelf: "flex-start",
            background: healthBdg.bg, border: `1px solid ${healthBdg.text}20`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: healthBdg.dot }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: healthBdg.text }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        )}
      </div>

      {/* Metrics — real data or "—" */}
      <div style={{ padding: S[4], flex: 1, display: "flex", flexDirection: "column", gap: S[3] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Cobertura</span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
            color: synced
              ? (health.coveragePercent < 0 ? C.inkLight
                : health.coveragePercent >= 85 ? C.green
                : health.coveragePercent >= 60 ? C.amber : C.red)
              : C.inkFaint,
          }}>
            {synced ? (health.coveragePercent < 0 ? "Sin reglas" : `${health.coveragePercent}%`) : "\u2014"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Inventario activo" value={synced ? health.activeItemCount : null} color={C.blueDark} suffix=" refs" />
          <MetricBox label="Cobertura subgrupos" value={synced && health.hasRules ? (health.subgroupCoveragePercent < 0 ? null : health.subgroupCoveragePercent) : null} color={synced && health.hasRules && health.subgroupCoveragePercent >= 90 ? C.green : synced && health.hasRules && health.subgroupCoveragePercent >= 70 ? C.amber : C.red} suffix="%" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Oportunidades surtido" value={synced && health.hasRules ? health.replenishmentOpportunities : null} color={health.hasRules && health.replenishmentOpportunities > 0 ? C.amber : C.green} suffix="" />
          <MetricBox label="Transferencias" value={synced && health.hasRules ? health.exactTransferSuggestions : null} color={C.blueDark} suffix=" pendientes" />
        </div>
      </div>

      {/* Footer — Ver tienda always, Sincronizar SAG when unsynced */}
      <div style={{
        padding: `${S[2]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`,
        display: "flex", gap: S[2], alignItems: "center",
      }}>
        <button onClick={onOpen} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
          color: C.white, background: C.blueDark, border: "none",
          borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
        }}>
          Ver tienda
        </button>
        {!synced && (
          <button onClick={onSyncSag} className="ag-action-secondary" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            color: C.blueDark, background: C.blueLight,
            border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
            padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Sincronizar SAG
          </button>
        )}
      </div>
    </div>
  );
}

// ── Metric box ───────────────────────────────────────────────────────────────

function MetricBox({ label, value, color, suffix }: { label: string; value: number | null; color: string; suffix: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: value !== null ? color : C.inkFaint }}>
        {value !== null
          ? <>{value}<span style={{ fontSize: T.sz["2xs"], fontWeight: T.wt.normal, color: C.inkFaint }}>{suffix}</span></>
          : "\u2014"}
      </div>
    </div>
  );
}

// ── Proposals List View ──────────────────────────────────────────────────────

function ProposalsListView({
  proposals,
  onOpenProposal,
}: {
  proposals:      ProposalCard[];
  onOpenProposal: (id: string) => void;
}) {
  if (proposals.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        ...panel, padding: S[8], textAlign: "center",
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[2] }}>
          Sin propuestas
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Crea una propuesta de surtido desde la vista de tienda para comenzar.
        </div>
      </div>
    );
  }

  return (
    <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        ...panelHeader, fontSize: T.sz.xs, fontFamily: T.mono,
        fontWeight: T.wt.semibold, color: C.inkLight,
      }}>
        <span style={{ flex: 2 }}>Tienda</span>
        <span style={{ width: 100, textAlign: "center" }}>Estado</span>
        <span style={{ width: 60, textAlign: "right" }}>Lineas</span>
        <span style={{ width: 80, textAlign: "right" }}>Transferir</span>
        <span style={{ width: 80, textAlign: "right" }}>Producir</span>
        <span style={{ width: 80, textAlign: "right" }}>Fecha</span>
        <span style={{ width: 70, textAlign: "center" }}>Accion</span>
      </div>

      {proposals.map(p => {
        const sc = PROPOSAL_STATUS_COLOR[p.status];
        return (
          <div key={p.id} className="ag-op-row" style={{
            ...dataRow, fontSize: T.sz.sm, fontFamily: T.mono,
          }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{p.storeName}</div>
            </div>
            <span style={{ width: 100, textAlign: "center" }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill,
                background: sc.bg, color: sc.text,
              }}>
                {PROPOSAL_STATUS_LABEL[p.status]}
              </span>
            </span>
            <span style={{ width: 60, textAlign: "right", color: C.ink }}>{p.activeLines}</span>
            <span style={{ width: 80, textAlign: "right", color: C.green, fontWeight: T.wt.semibold }}>
              {p.transferUnits} uds
            </span>
            <span style={{ width: 80, textAlign: "right", color: C.blueDark, fontWeight: T.wt.semibold }}>
              {p.productionUnits} uds
            </span>
            <span style={{ width: 80, textAlign: "right", color: C.inkFaint }}>
              {formatTimeAgo(p.createdAt)}
            </span>
            <span style={{ width: 70, textAlign: "center" }}>
              <button onClick={() => onOpenProposal(p.id)} className="ag-action-secondary" style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, background: C.blueLight,
                border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                padding: "2px 8px", cursor: "pointer",
              }}>
                Revisar
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Store Detail Drawer ──────────────────────────────────────────────────────

function StoreDetailDrawer({
  orgSlug,
  summary,
  activeTab,
  onTabChange,
  onClose,
  onCreateProposal,
  onViewProposals,
  tabCacheRef,
}: {
  orgSlug:          string;
  summary:          StoreSummaryData;
  tabCacheRef:      TabCacheRef;
  activeTab:        "inventario" | "faltantes" | "sugerencias" | "cobertura_textil" | "reglas" | "bodega";
  onTabChange:      (t: "inventario" | "faltantes" | "sugerencias" | "cobertura_textil" | "reglas" | "bodega") => void;
  onClose:          () => void;
  onCreateProposal: () => void;
  onViewProposals:  () => void;
}) {
  const { store, health, hasRules } = summary;
  const syncState = deriveStoreSyncState(store);
  const synced    = syncState === "sincronizada";

  const healthStatus: StoreHealthStatus = !hasRules ? "sin_reglas"
    : health.criticalShortages > 0 ? "critica"
    : health.warningShortages > 0 ? "requiere_surtido"
    : "ok";

  type DrawerTab = "inventario" | "faltantes" | "sugerencias" | "cobertura_textil" | "reglas" | "bodega";
  const tabs: { key: DrawerTab; label: string }[] = [
    { key: "inventario",        label: "Inventario" },
    { key: "faltantes",         label: "Faltantes" },
    { key: "sugerencias",       label: "Sugerencias" },
    { key: "cobertura_textil",  label: "Cobertura textil" },
    { key: "reglas",            label: "Reglas de surtido" },
    { key: "bodega",            label: "Bodega principal" },
  ];

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "100vw",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header — admin identity always visible */}
      <div style={{ padding: S[4], borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              {store.name}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                Bodega SAG: {store.sagWarehouseCode}{store.city ? ` · ${store.city}` : ""}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                Responsable: {store.responsibleName || "Sin asignar"}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: synced ? C.inkFaint : C.amber }}>
                Ultima sincronizacion: {synced ? formatTimeAgo(store.lastSyncAt!) : "Nunca"}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
          }}>x</button>
        </div>

        {/* Dual state badges: sync + health (when available) */}
        <div style={{ display: "flex", gap: S[2], marginTop: S[3], alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            padding: "2px 8px", borderRadius: R.pill,
            background: SYNC_BADGE[syncState].bg, color: SYNC_BADGE[syncState].text,
          }}>
            {SYNC_BADGE[syncState].label}
          </span>
          {synced && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.pill,
              background: STATUS_COLOR[healthStatus].bg, color: STATUS_COLOR[healthStatus].text,
            }}>
              {STATUS_LABEL[healthStatus]}
            </span>
          )}
        </div>

        {/* Metrics — real data or "—" */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3] }}>
          <MiniStat label="Inventario activo" value={synced ? String(health.activeItemCount) : "\u2014"}
            color={synced ? C.blueDark : C.inkFaint} />
          <MiniStat label="Cobertura subgrupos" value={synced && hasRules ? `${health.subgroupsCovered}/${health.subgroupsExpected}` : "\u2014"}
            color={synced && hasRules ? (health.subgroupCoveragePercent >= 90 ? C.green : health.subgroupCoveragePercent >= 70 ? C.amber : C.red) : C.inkFaint} />
          <MiniStat label="Oportunidades" value={synced && hasRules ? String(health.replenishmentOpportunities) : "\u2014"}
            color={synced && hasRules ? (health.replenishmentOpportunities > 0 ? C.amber : C.green) : C.inkFaint} />
          <MiniStat label="Transferencias" value={synced && hasRules ? String(health.exactTransferSuggestions) : "\u2014"}
            color={synced && hasRules ? C.blueDark : C.inkFaint} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, background: C.white }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)} style={{
            flex: 1, padding: `${S[2]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: activeTab === tab.key ? T.wt.semibold : T.wt.normal,
            color: activeTab === tab.key ? C.blueDark : C.inkLight,
            background: activeTab === tab.key ? C.blueLight : "transparent",
            border: "none",
            borderBottom: activeTab === tab.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
            cursor: "pointer",
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sync-aware David signals */}
      {!synced && (
        <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surface }}>
          {[
            "Estoy esperando la primera sincronizacion con SAG para analizar esta tienda.",
            "Una vez reciba inventario podre sugerir traslados desde bodega principal.",
            "La configuracion de la tienda ya esta lista.",
          ].map((msg, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: S[2],
              marginBottom: i < 2 ? S[1] : 0,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                color: C.blueDark, background: C.white, padding: "1px 5px",
                borderRadius: R.sm, border: `1px solid ${C.blueBorder}`,
              }}>David</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab content — lazy load + cross-tab cache (TIENDAS-DRAWER-PERFORMANCE-01) */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4] }}>
        {activeTab === "inventario"       && <InventarioTab orgSlug={orgSlug} storeId={store.id} storeName={store.name} warehouseCode={store.sagWarehouseCode} hasSyncData={synced} />}
        {activeTab === "faltantes"        && <ShortagesTab orgSlug={orgSlug} storeId={store.id} hasSyncData={synced} hasRules={hasRules} tabCacheRef={tabCacheRef} />}
        {activeTab === "sugerencias"      && <SuggestionsTab orgSlug={orgSlug} storeId={store.id} onCreateProposal={onCreateProposal} hasSyncData={synced} hasRules={hasRules} tabCacheRef={tabCacheRef} />}
        {activeTab === "cobertura_textil" && <TextileCoverageTab orgSlug={orgSlug} storeId={store.id} hasSyncData={synced} hasRules={hasRules} tabCacheRef={tabCacheRef} />}
        {activeTab === "reglas"           && <PolicyTab orgSlug={orgSlug} storeId={store.id} storeName={store.name} />}
        {activeTab === "bodega"           && <MainWarehouseTab orgSlug={orgSlug} hasSyncData={synced} tabCacheRef={tabCacheRef} />}
      </div>

      {/* Footer actions */}
      <div style={{
        padding: S[4], borderTop: `1px solid ${C.line}`,
        display: "flex", gap: S[2], flexWrap: "wrap",
      }}>
        {hasRules && (
          <button onClick={onCreateProposal} className="ag-action-primary" style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.white, background: C.blueDark, border: "none",
            borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Crear propuesta de surtido
          </button>
        )}
        <button onClick={onViewProposals} className="ag-action-secondary" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.blueDark, background: C.blueLight,
          border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
          padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          Ver propuestas
        </button>
      </div>
    </div>
  );
}

// ── Shortages Tab ────────────────────────────────────────────────────────────

function ShortagesTab({ orgSlug, storeId, hasSyncData, hasRules, tabCacheRef }: { orgSlug: string; storeId: string; hasSyncData: boolean; hasRules?: boolean; tabCacheRef: TabCacheRef }) {
  // Use cache if available (TIENDAS-DRAWER-PERFORMANCE-01)
  const cached = tabCacheRef.current.storeId === storeId ? tabCacheRef.current.shortages : undefined;
  const [shortages, setShortages]         = useState<StoreShortage[]>(cached?.shortages ?? []);
  const [assortmentNeeds, setAssortmentNeeds] = useState<StoreAssortmentNeed[]>(cached?.assortmentNeeds ?? []);
  const [loaded, setLoaded]   = useState(!!cached);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasSyncData || !hasRules || loaded || loading) return;
    setLoading(true);
    const t0 = performance.now();
    tiendaApi(orgSlug, { action: "store_shortages", storeId })
      .then(data => {
        const result = { shortages: data.shortages ?? [], assortmentNeeds: data.assortmentNeeds ?? [] };
        setShortages(result.shortages);
        setAssortmentNeeds(result.assortmentNeeds);
        // Persist to cross-tab cache
        if (tabCacheRef.current.storeId === storeId) tabCacheRef.current.shortages = result;
        setLoaded(true);
        if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
          console.log(`[TIENDAS_PERF] shortages_ms=${Math.round(performance.now() - t0)}`);
        }
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, [orgSlug, storeId, hasSyncData, hasRules, loaded, loading]);

  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>Cargando faltantes...</div>;
  }

  // Ruleless mode: no shortages calculable
  if (hasSyncData && !hasRules) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Esta tienda no tiene reglas de surtido configuradas. Sin reglas, Agentik no sabe que deberia tener esta tienda y no puede calcular faltantes. Configure reglas en la pestana &quot;Reglas de surtido&quot; para activar el analisis.
      </div>
    );
  }

  // Prefer assortment-based view (grouped by subgroup/sizeClass)
  if (assortmentNeeds.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        {assortmentNeeds.map((need, i) => {
          const statusColor = NEED_STATUS_COLOR[need.status];
          const label = need.ruleType === "textile_subgroup"
            ? (need.line ? `${need.line} / ${need.subgroup}` : need.subgroup ?? "—")
            : `${NEED_CLASS_LABEL[need.productClass] ?? need.productClass} ${NEED_SIZE_LABEL[need.sizeClass ?? "medium"] ?? need.sizeClass}`;
          const unitLabel = need.ruleType === "textile_subgroup" ? "refs" : "uds";
          return (
            <div key={i} style={{ ...panel, padding: S[3], borderLeft: `3px solid ${statusColor.text}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: "2px 6px", borderRadius: R.pill, background: statusColor.bg, color: statusColor.text,
                }}>
                  {ASSORTMENT_STATUS_LABEL[need.status]}
                </span>
              </div>
              <div style={{ display: "flex", gap: S[4], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                <span>Actual: <strong style={{ color: C.ink }}>{need.currentCoverage} {unitLabel}</strong></span>
                <span>Minimo: <strong style={{ color: C.inkMid }}>{need.minRequired} {unitLabel}</strong></span>
                <span>Faltan: <strong style={{ color: C.red }}>{need.missingQty} {unitLabel}</strong></span>
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                padding: `${S[1]}px ${S[2]}px`, background: statusColor.bg, borderRadius: R.sm, marginTop: S[2],
              }}>
                {need.message}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: legacy reference-based view
  if (shortages.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        {hasSyncData
          ? "Sin faltantes de surtido. Todas las categorias cubren los minimos."
          : "Aun no existen datos sincronizados para esta tienda. Los faltantes se calcularan con la primera sincronizacion SAG."}
      </div>
    );
  }

  return (
    <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        ...panelHeader, fontSize: T.sz.xs, fontFamily: T.mono,
        fontWeight: T.wt.semibold, color: C.inkLight,
      }}>
        <span style={{ flex: 2 }}>Producto</span>
        <span style={{ flex: 1 }}>Talla</span>
        <span style={{ flex: 1 }}>Color</span>
        <span style={{ width: 50, textAlign: "right" }}>Actual</span>
        <span style={{ width: 50, textAlign: "right" }}>Min</span>
        <span style={{ width: 50, textAlign: "right" }}>Faltan</span>
        <span style={{ width: 70, textAlign: "center" }}>Estado</span>
      </div>
      {shortages.map((s, i) => {
        const sv = SEVERITY_COLOR[s.severity];
        return (
          <div key={i} className="ag-op-row" style={{ ...dataRow, fontSize: T.sz.sm, fontFamily: T.mono }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{s.productName}</div>
              <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{s.referenceCode}</div>
            </div>
            <span style={{ flex: 1, color: C.inkMid }}>{s.size}</span>
            <span style={{ flex: 1, color: C.inkMid }}>{s.color}</span>
            <span style={{ width: 50, textAlign: "right", color: C.ink, fontWeight: T.wt.semibold }}>{s.currentUnits}</span>
            <span style={{ width: 50, textAlign: "right", color: C.inkLight }}>{s.minUnits}</span>
            <span style={{ width: 50, textAlign: "right", color: C.red, fontWeight: T.wt.bold }}>{s.missingUnits}</span>
            <span style={{ width: 70, textAlign: "center" }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill, background: sv.bg, color: sv.text,
              }}>
                {SEVERITY_LABEL[s.severity]}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ASSORTMENT_STATUS_LABEL: Record<AssortmentNeedStatus, string> = {
  out:       "Sin surtido",
  low:       "Bajo surtido",
  ok:        "Cubierto",
  overstock: "Sobrestock",
};
const NEED_STATUS_COLOR: Record<AssortmentNeedStatus, { bg: string; text: string }> = {
  out:       { bg: C.redLight,    text: C.red },
  low:       { bg: C.amberLight,  text: C.amber },
  ok:        { bg: C.greenLight,  text: C.green },
  overstock: { bg: C.blueLight,   text: C.blueDark },
};
const NEED_CLASS_LABEL: Record<string, string> = {
  textile:   "Textil",
  bulky:     "Voluminosos",
  accessory: "Accesorios",
  other:     "Productos",
};
const NEED_SIZE_LABEL: Record<string, string> = {
  small:     "pequenos",
  medium:    "medianos",
  large:     "grandes",
  oversized: "extra grandes",
};

// ── Suggestions Tab ──────────────────────────────────────────────────────────

function SuggestionsTab({
  orgSlug,
  storeId,
  onCreateProposal,
  hasSyncData,
  hasRules,
  tabCacheRef,
}: {
  orgSlug:          string;
  storeId:          string;
  onCreateProposal: () => void;
  hasSyncData:      boolean;
  hasRules?:        boolean;
  tabCacheRef:      TabCacheRef;
}) {
  const cached = tabCacheRef.current.storeId === storeId ? tabCacheRef.current.suggestions : undefined;
  const [suggestions, setSuggestions]         = useState<ReplenishmentSuggestion[]>(cached?.suggestions ?? []);
  const [assortmentNeeds, setAssortmentNeeds] = useState<StoreAssortmentNeed[]>(cached?.assortmentNeeds ?? []);
  const [loaded, setLoaded]   = useState(!!cached);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasSyncData || !hasRules || loaded || loading) return;
    setLoading(true);
    const t0 = performance.now();
    tiendaApi(orgSlug, { action: "store_suggestions", storeId })
      .then(data => {
        const result = { suggestions: data.suggestions ?? [], assortmentNeeds: data.assortmentNeeds ?? [] };
        setSuggestions(result.suggestions);
        setAssortmentNeeds(result.assortmentNeeds);
        if (tabCacheRef.current.storeId === storeId) tabCacheRef.current.suggestions = result;
        setLoaded(true);
        if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
          console.log(`[TIENDAS_PERF] suggestions_ms=${Math.round(performance.now() - t0)}`);
        }
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, [orgSlug, storeId, hasSyncData, hasRules, loaded, loading]);

  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>Cargando sugerencias...</div>;
  }

  // Ruleless mode: no suggestions calculable
  if (hasSyncData && !hasRules) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Sin reglas de surtido configuradas no es posible generar sugerencias de reposicion. Configure reglas en la pestana &quot;Reglas de surtido&quot; para recibir sugerencias basadas en datos reales.
      </div>
    );
  }

  // Prefer assortment-based view (grouped by need with candidates)
  if (assortmentNeeds.length > 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        <button onClick={onCreateProposal} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
          color: C.white, background: C.blueDark, border: "none",
          borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          alignSelf: "flex-start",
        }}>
          Crear propuesta de surtido
        </button>
        {assortmentNeeds.map((need, i) => {
          const statusColor = NEED_STATUS_COLOR[need.status];
          const label = need.ruleType === "textile_subgroup"
            ? (need.line ? `${need.line} / ${need.subgroup}` : need.subgroup ?? "—")
            : `${NEED_CLASS_LABEL[need.productClass] ?? need.productClass} ${NEED_SIZE_LABEL[need.sizeClass ?? "medium"] ?? need.sizeClass}`;
          const unitLabel = need.ruleType === "textile_subgroup" ? "referencias" : "unidades";
          return (
            <div key={i} style={{ ...panel, padding: S[3], borderLeft: `3px solid ${statusColor.text}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  {label}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: "2px 6px", borderRadius: R.pill, background: statusColor.bg, color: statusColor.text,
                }}>
                  {ASSORTMENT_STATUS_LABEL[need.status]}
                </span>
              </div>
              <div style={{ display: "flex", gap: S[4], marginBottom: S[2], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                <span>Actual: <strong style={{ color: C.ink }}>{need.currentCoverage} {unitLabel}</strong></span>
                <span>Ideal: <strong style={{ color: C.inkMid }}>{need.idealRequired}</strong></span>
                <span>Faltan: <strong style={{ color: C.red }}>{need.missingQty} {unitLabel}</strong></span>
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                padding: `${S[1]}px ${S[2]}px`, background: statusColor.bg, borderRadius: R.sm, marginBottom: S[2],
              }}>
                {need.message}
              </div>
              {need.candidates.length > 0 && (
                <div style={{ padding: `${S[2]}px ${S[2]}px`, background: C.surface, borderRadius: R.sm }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, marginBottom: S[1] }}>
                    Candidatos en bodega principal
                  </div>
                  {need.candidates.map((c, j) => (
                    <div key={j} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: 2,
                      padding: `2px ${S[1]}px`, borderRadius: R.sm,
                      background: j % 2 === 0 ? "transparent" : C.surfaceAlt,
                    }}>
                      <span>
                        <strong style={{ color: C.ink }}>{c.referenceCode}</strong> · {c.productName}
                      </span>
                      <span style={{ color: C.green, fontWeight: T.wt.semibold }}>
                        {c.availableMainWarehouseQty} uds
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {need.candidates.length === 0 && (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                  padding: `${S[1]}px ${S[2]}px`, background: C.surface, borderRadius: R.sm,
                }}>
                  Sin candidato disponible en bodega principal. Requiere revision comercial.
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: legacy reference-based suggestions
  if (suggestions.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        {hasSyncData
          ? "Sin sugerencias de surtido. Todas las categorias cubren los minimos."
          : "Aun no existen datos sincronizados para esta tienda. Las sugerencias de surtido se generaran con la primera sincronizacion SAG."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <button onClick={onCreateProposal} className="ag-action-primary" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
        color: C.white, background: C.blueDark, border: "none",
        borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
        alignSelf: "flex-start",
      }}>
        Crear propuesta de surtido
      </button>
      {suggestions.map((s, i) => {
        const sc = SUGGESTION_COLOR[s.suggestionType];
        return (
          <div key={i} style={{ ...panel, padding: S[3], borderLeft: `3px solid ${sc.text}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                {s.referenceCode} · {s.size} · {s.color}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill, background: sc.bg, color: sc.text,
              }}>
                {SUGGESTION_LABEL[s.suggestionType]}
              </span>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[1] }}>
              {s.productName}
            </div>
            <div style={{ display: "flex", gap: S[4], marginBottom: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                Faltan: <strong style={{ color: C.red }}>{s.missingUnits} uds</strong>
              </span>
              {s.suggestedTransferUnits > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  Enviar: <strong style={{ color: C.green }}>{s.suggestedTransferUnits} uds</strong>
                </span>
              )}
              {s.productionSuggestedUnits > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  Sin disponibilidad: <strong style={{ color: C.inkFaint }}>{s.productionSuggestedUnits} uds</strong>
                </span>
              )}
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
              padding: `${S[1]}px ${S[2]}px`, background: sc.bg, borderRadius: R.sm,
            }}>
              {s.message}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stock Lookup Panel ──────────────────────────────────────────────────────

function StockLookupPanel({
  results,
  loading,
  reference,
}: {
  results: Array<{
    storeName: string; warehouseCode: string; referenceCode: string;
    size: string; color: string; currentUnits: number; isMainWarehouse: boolean;
  }>;
  loading: boolean;
  reference: string;
}) {
  if (loading) {
    return (
      <div style={{
        ...panel, margin: `0 0 ${S[1]}px 0`, padding: S[3],
        background: C.surface, borderColor: C.blueBorder,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          Buscando {reference} en otras ubicaciones...
        </span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{
        ...panel, margin: `0 0 ${S[1]}px 0`, padding: S[3],
        background: C.surface, borderColor: C.line,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          No se encontro {reference} en otras ubicaciones.
        </span>
      </div>
    );
  }

  const mainWh = results.filter(r => r.isMainWarehouse);
  const stores = results.filter(r => !r.isMainWarehouse);

  return (
    <div style={{
      ...panel, margin: `0 0 ${S[1]}px 0`, padding: S[3],
      background: C.surface, borderColor: C.blueBorder,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
        Disponibilidad de {reference}
      </div>
      {mainWh.length > 0 && (
        <div style={{ marginBottom: stores.length > 0 ? S[2] : 0 }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
            Bodega principal
          </div>
          {mainWh.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: T.sz.xs, marginBottom: 1 }}>
              <span style={{ color: C.inkMid }}>{r.size || "\u2014"} / {r.color || "\u2014"}</span>
              <span style={{ fontWeight: T.wt.semibold, color: r.currentUnits > 0 ? C.green : C.red }}>
                {r.currentUnits} uds
              </span>
            </div>
          ))}
        </div>
      )}
      {stores.length > 0 && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
            Otras tiendas
          </div>
          {stores.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: T.sz.xs, marginBottom: 1 }}>
              <span style={{ color: C.inkMid }}>{r.storeName} · {r.size || "\u2014"}/{r.color || "\u2014"}</span>
              <span style={{ fontWeight: T.wt.semibold, color: r.currentUnits > 0 ? C.green : C.red }}>
                {r.currentUnits} uds
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inventario Tab ──────────────────────────────────────────────────────────

interface InventoryItem {
  referenceCode: string;
  productName: string;
  size: string;
  color: string;
  currentUnits: number;
  category: string;
  line: string;
}

function InventarioTab({
  orgSlug,
  storeId,
  storeName: _storeName,
  warehouseCode,
  hasSyncData,
}: {
  orgSlug: string;
  storeId: string;
  storeName: string;
  warehouseCode: string;
  hasSyncData: boolean;
}) {
  const PAGE_SIZE = 50;
  const [items, setItems]     = useState<InventoryItem[]>([]);
  const [total, setTotal]     = useState(0);
  const [offset, setOffset]   = useState(0);
  const [loaded, setLoaded]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeOnly, setActiveOnly]   = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stock lookup state
  const [lookupRef, setLookupRef]           = useState<string | null>(null);
  const [lookupResults, setLookupResults]   = useState<Array<{
    storeName: string; warehouseCode: string; referenceCode: string;
    size: string; color: string; currentUnits: number; isMainWarehouse: boolean;
  }>>([]);
  const [lookupLoading, setLookupLoading]   = useState(false);

  // Server-side paginated load (TIENDAS-DRAWER-PERFORMANCE-01)
  const loadInventory = useCallback(async (searchVal: string, offsetVal: number, activeOnlyVal: boolean) => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "store_inventory", storeId, warehouseCode,
          limit: PAGE_SIZE, offset: offsetVal,
          search: searchVal || undefined,
          activeOnly: activeOnlyVal,
        }),
      });
      const data = await res.json();
      setItems(data.inventory ?? []);
      setTotal(data.total ?? (data.inventory ?? []).length);
      setLoaded(true);
      if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
        console.log(`[TIENDAS_PERF] inventory_ms=${Math.round(performance.now() - t0)}`);
      }
    } catch {
      setError("No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, storeId, warehouseCode]);

  // Debounced search (300ms)
  const handleSearchInput = useCallback((val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setOffset(0);
    }, 300);
  }, []);

  // Reload on search/offset/activeOnly change
  useEffect(() => {
    if (!hasSyncData) return;
    loadInventory(search, offset, activeOnly);
  }, [hasSyncData, search, offset, activeOnly, loadInventory]);

  const handleLookup = useCallback(async (ref: string) => {
    if (lookupRef === ref) { setLookupRef(null); return; }
    setLookupRef(ref);
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stock_lookup", query: ref }),
      });
      const data = await res.json();
      setLookupResults(data.results ?? []);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  }, [lookupRef]);

  if (!hasSyncData) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        El inventario se mostrara con la primera sincronizacion SAG.
      </div>
    );
  }

  if (loading && !loaded) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Cargando inventario...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, textAlign: "center", padding: S[8] }}>
        {error}
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      {/* Controls strip */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar referencia, producto, talla o color..."
          value={searchInput}
          onChange={e => handleSearchInput(e.target.value)}
          style={{
            flex: 1, minWidth: 200, fontFamily: T.mono, fontSize: T.sz.xs,
            padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`,
            borderRadius: R.sm, background: C.white, color: C.ink,
          }}
        />
        <label style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
          display: "flex", alignItems: "center", gap: S[1], cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={!activeOnly}
            onChange={e => { setActiveOnly(!e.target.checked); setOffset(0); }}
            style={{ cursor: "pointer" }}
          />
          Incluir agotados
        </label>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          {total} variantes
        </span>
      </div>

      {items.length === 0 ? (
        <div className="ag-empty-state" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
          textAlign: "center", padding: S[8],
        }}>
          {search ? "Sin resultados para esta busqueda." : "Sin variantes en inventario."}
        </div>
      ) : (
        <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{
            ...panelHeader, fontSize: T.sz.xs, fontFamily: T.mono,
            fontWeight: T.wt.semibold, color: C.inkLight,
          }}>
            <span style={{ flex: 2 }}>Referencia</span>
            <span style={{ flex: 1 }}>Talla</span>
            <span style={{ flex: 1 }}>Color</span>
            <span style={{ width: 70, textAlign: "right" }}>Uds</span>
          </div>
          {items.map((it, i) => (
            <div key={i}>
              <div
                className="ag-op-row"
                onClick={() => handleLookup(it.referenceCode)}
                style={{
                  ...dataRow, fontSize: T.sz.sm, fontFamily: T.mono, cursor: "pointer",
                  background: lookupRef === it.referenceCode ? C.blueLight : undefined,
                }}
              >
                <span style={{ flex: 2, fontWeight: T.wt.medium, color: C.ink }}>{it.referenceCode}</span>
                <span style={{ flex: 1, color: C.inkMid }}>{it.size || "\u2014"}</span>
                <span style={{ flex: 1, color: C.inkMid }}>{it.color || "\u2014"}</span>
                <span style={{
                  width: 70, textAlign: "right", fontWeight: T.wt.semibold,
                  color: it.currentUnits > 0 ? C.green : C.red,
                }}>
                  {it.currentUnits}
                </span>
              </div>
              {lookupRef === it.referenceCode && (
                <StockLookupPanel results={lookupResults} loading={lookupLoading} reference={it.referenceCode} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center", gap: S[2],
          marginTop: S[3], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
        }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
              border: `1px solid ${C.line}`, borderRadius: R.sm,
              background: offset === 0 ? C.surface : C.white,
              color: offset === 0 ? C.inkFaint : C.ink, cursor: offset === 0 ? "default" : "pointer",
            }}
          >
            Anterior
          </button>
          <span>{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={currentPage >= totalPages}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
              border: `1px solid ${C.line}`, borderRadius: R.sm,
              background: currentPage >= totalPages ? C.surface : C.white,
              color: currentPage >= totalPages ? C.inkFaint : C.ink,
              cursor: currentPage >= totalPages ? "default" : "pointer",
            }}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

// ── Rules Tab (legacy — kept for type compatibility) ─────────────────────────

function RulesTab({ rules, storeId }: { rules: StoreReplenishmentRule[]; storeId: string }) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[3] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          Reglas de surtido
        </span>
        <button onClick={() => setShowCreate(!showCreate)} className="ag-action-secondary" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
          background: C.blueLight, border: `1px solid ${C.blueBorder}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          {showCreate ? "Cancelar" : "+ Nueva regla"}
        </button>
      </div>
      {showCreate && <CreateRuleStub storeId={storeId} onClose={() => setShowCreate(false)} />}
      {rules.length === 0 ? (
        <div className="ag-empty-state" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
          textAlign: "center", padding: S[8],
        }}>
          Sin reglas configuradas para esta tienda.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {rules.map(rule => (
            <div key={rule.id} style={{ ...panel, padding: S[3], opacity: rule.active ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
                    {rule.appliesTo}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
                    {RULE_TYPE_LABEL[rule.ruleType]} · Min: {rule.minUnits} uds · Ideal: {rule.idealUnits} uds
                  </div>
                </div>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: "2px 6px", borderRadius: R.pill,
                  background: rule.active ? C.greenLight : C.surface,
                  color: rule.active ? C.green : C.inkFaint,
                  border: `1px solid ${rule.active ? C.greenBorder : C.line}`,
                }}>
                  {rule.active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRuleStub({ storeId: _storeId, onClose }: { storeId: string; onClose: () => void }) {
  return (
    <div style={{
      ...panel, padding: S[4], marginBottom: S[3],
      background: C.blueLight, borderColor: C.blueBorder,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
        Nueva regla de surtido
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[3] }}>
        Accion preparada para integracion SAG.
      </div>
      <div style={{ display: "flex", gap: S[2] }}>
        <StubButton label="Guardar regla" />
        <button onClick={onClose} className="ag-action-ghost" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
          background: "transparent", border: `1px solid ${C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Textile Coverage Tab ─────────────────────────────────────────────────────

const TEX_SEVERITY_LABEL: Record<TextileCoverageGapSeverity, string> = {
  critica:   "Critica",
  alta:      "Alta",
  media:     "Media",
  baja:      "Baja",
  saludable: "Saludable",
};
const TEX_SEVERITY_COLOR: Record<TextileCoverageGapSeverity, { bg: string; text: string }> = {
  critica:   { bg: C.redLight,    text: C.red },
  alta:      { bg: C.amberLight,  text: C.amber },
  media:     { bg: C.amberLight,  text: C.amber },
  baja:      { bg: C.blueLight,   text: C.blueDark },
  saludable: { bg: C.greenLight,  text: C.green },
};
const MATCH_LABEL: Record<string, string> = {
  exact:          "Exacto",
  same_size:      "Misma talla",
  same_subgroup:  "Mismo subgrupo",
};

function TextileCoverageTab({ orgSlug, storeId, hasSyncData, hasRules, tabCacheRef }: {
  orgSlug:     string;
  storeId:     string;
  hasSyncData: boolean;
  hasRules?:   boolean;
  tabCacheRef: TabCacheRef;
}) {
  const cached = tabCacheRef.current.storeId === storeId ? tabCacheRef.current.coverage : undefined;
  const [analyses, setAnalyses] = useState<TextileCoverageAnalysis[]>(cached?.textileCoverage ?? []);
  const [loaded, setLoaded]     = useState(!!cached);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!hasSyncData || !hasRules || loaded || loading) return;
    setLoading(true);
    const t0 = performance.now();
    tiendaApi(orgSlug, { action: "store_textile_coverage", storeId })
      .then(data => {
        const result = { textileCoverage: data.textileCoverage ?? [] };
        setAnalyses(result.textileCoverage);
        if (tabCacheRef.current.storeId === storeId) tabCacheRef.current.coverage = result;
        setLoaded(true);
        if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
          console.log(`[TIENDAS_PERF] coverage_ms=${Math.round(performance.now() - t0)}`);
        }
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, [orgSlug, storeId, hasSyncData, hasRules, loaded, loading]);

  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>Cargando cobertura textil...</div>;
  }

  if (hasSyncData && !hasRules) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Sin reglas de surtido configuradas. La cobertura de tallas y colores requiere reglas activas para generar inteligencia operativa.
      </div>
    );
  }

  if (!hasSyncData) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Aun no existen datos sincronizados. La cobertura textil se calculara con la primera sincronizacion SAG.
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        No se encontraron subgrupos textiles en el inventario de esta tienda.
      </div>
    );
  }

  const kpi = computeTextileCoverageKpi(analyses);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Aggregate KPI strip */}
      {kpi && (
        <div style={{ ...panel, padding: S[3], display: "flex", gap: S[4], alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>Cobertura talla/color global</div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
              color: kpi.overallPercent >= 85 ? C.green : kpi.overallPercent >= 70 ? C.amber : C.red,
            }}>
              {kpi.overallPercent}%
            </div>
          </div>
          <div style={{ display: "flex", gap: S[3] }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Combinaciones</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.ink }}>{kpi.coveredCombinations}/{kpi.expectedCombinations}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tallas</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.ink }}>{kpi.sizeCoveragePercent}%</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Colores</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.ink }}>{kpi.colorCoveragePercent}%</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Huecos</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: kpi.gapCount > 0 ? C.red : C.green }}>{kpi.gapCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Per-subgroup cards */}
      {analyses.map((a, i) => {
        const sevColor = TEX_SEVERITY_COLOR[a.severity];
        const label = a.line ? `${a.line} / ${a.subgroup}` : a.subgroup;
        return (
          <div key={i} style={{ ...panel, padding: S[3], borderLeft: `3px solid ${sevColor.text}` }}>
            {/* Subgroup header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                {label}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill, background: sevColor.bg, color: sevColor.text,
              }}>
                {TEX_SEVERITY_LABEL[a.severity]} · {a.overallCoveragePercent}%
              </span>
            </div>

            {/* Coverage metrics */}
            <div style={{ display: "flex", gap: S[4], marginBottom: S[2], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, flexWrap: "wrap" }}>
              <span>Combinaciones: <strong style={{ color: C.ink }}>{a.coveredCombinations}/{a.expectedCombinations}</strong> ({a.combinationCoveragePercent}%)</span>
              <span>Tallas: <strong style={{ color: C.ink }}>{a.coveredSizes.length}/{a.expectedSizes.length}</strong> ({a.sizeCoveragePercent}%)</span>
              <span>Colores: <strong style={{ color: C.ink }}>{a.coveredColors.length}/{a.expectedColors.length}</strong> ({a.colorCoveragePercent}%)</span>
            </div>

            {/* Missing sizes */}
            {a.missingSizes.length > 0 && (
              <div style={{ marginBottom: S[1] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Tallas faltantes: </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: T.wt.semibold }}>
                  {a.missingSizes.join(", ")}
                </span>
              </div>
            )}

            {/* Missing colors */}
            {a.missingColors.length > 0 && (
              <div style={{ marginBottom: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Colores faltantes: </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: T.wt.semibold }}>
                  {a.missingColors.join(", ")}
                </span>
              </div>
            )}

            {/* Gaps with candidates */}
            {a.gaps.length > 0 && (
              <div style={{ background: C.surface, borderRadius: R.sm, padding: S[2], marginTop: S[1] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkFaint, marginBottom: S[1] }}>
                  Huecos de surtido ({a.gaps.length})
                </div>
                {a.gaps.slice(0, 10).map((gap, j) => (
                  <div key={j} style={{
                    padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm,
                    background: j % 2 === 0 ? "transparent" : C.surfaceAlt,
                    marginBottom: 2,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                        Talla <strong>{gap.size}</strong> · Color <strong>{gap.color}</strong>
                      </span>
                      <span style={{
                        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                        color: C.red,
                      }}>
                        {gap.currentQty} uds
                      </span>
                    </div>
                    {gap.candidates.length > 0 && (
                      <div style={{ marginTop: 2, marginLeft: S[2] }}>
                        {gap.candidates.slice(0, 3).map((c, k) => (
                          <div key={k} style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span>
                              <strong style={{ color: C.ink }}>{c.referenceCode}</strong> · {c.productName} · {c.size}/{c.color}
                            </span>
                            <span style={{ display: "flex", gap: S[1], alignItems: "center" }}>
                              <span style={{
                                fontSize: T.sz["2xs"], padding: "1px 4px", borderRadius: R.sm,
                                background: c.matchLevel === "exact" ? C.greenLight : c.matchLevel === "same_size" ? C.amberLight : C.surfaceAlt,
                                color: c.matchLevel === "exact" ? C.green : c.matchLevel === "same_size" ? C.amber : C.inkFaint,
                              }}>
                                {MATCH_LABEL[c.matchLevel]}
                              </span>
                              <span style={{ color: C.green, fontWeight: T.wt.semibold }}>{c.availableMainWarehouseQty} uds</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {gap.candidates.length === 0 && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2, marginLeft: S[2] }}>
                        Sin candidato disponible en bodega principal
                      </div>
                    )}
                  </div>
                ))}
                {a.gaps.length > 10 && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center", marginTop: S[1] }}>
                    +{a.gaps.length - 10} huecos adicionales
                  </div>
                )}
              </div>
            )}

            {a.gaps.length === 0 && a.severity === "saludable" && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, padding: `${S[1]}px 0` }}>
                Cobertura completa de tallas y colores.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Policy Tab ──────────────────────────────────────────────────────────────

// ── Simplified rule labels (TIENDAS-RULES-SIMPLIFICATION-01) ────────────────

const SIZE_CLASS_LABEL: Record<StoreSizeClass, string> = {
  small:     "Pequeno",
  medium:    "Mediano",
  large:     "Grande",
  oversized: "Extra grande",
};

/**
 * Derive a human-readable label for a StorePolicyRule.
 * New simplified rules → clean label. Legacy rules → "Regla legacy" prefix.
 */
function describeRule(rule: StorePolicyRule): { title: string; detail: string; isLegacy: boolean } {
  // Textile: scope=line_subgroup or line, productClass=textile
  if (rule.productClass === "textile" && (rule.scope === "line_subgroup" || rule.scope === "line")) {
    const line = rule.line || "Todas las lineas";
    const sg = rule.subgroup || "Todos los subgrupos";
    return {
      title: `Textil · ${line}`,
      detail: `Subgrupo: ${sg} · Min ${rule.minQty} / Ideal ${rule.idealQty} / Max ${rule.maxQty} por talla/color`,
      isLegacy: false,
    };
  }

  // Accesorios / Importacion: scope=class_size, coverageStrategy=SIZE
  if ((rule.productClass === "accessory" || rule.productClass === "bulky") && rule.scope === "class_size") {
    const sz = rule.sizeClass ? SIZE_CLASS_LABEL[rule.sizeClass] ?? rule.sizeClass : "—";
    return {
      title: `Accesorios / Importacion · ${sz}`,
      detail: `Min ${rule.minQty} / Ideal ${rule.idealQty} / Max ${rule.maxQty} unidades`,
      isLegacy: false,
    };
  }

  // Legacy rule
  const scopeLabel = rule.scope ?? "—";
  const classLabel = rule.productClass ?? "—";
  return {
    title: `Regla legacy · ${scopeLabel} · ${classLabel}`,
    detail: `Min ${rule.minQty} / Ideal ${rule.idealQty} / Max ${rule.maxQty}`
      + (rule.line ? ` · Linea: ${rule.line}` : "")
      + (rule.subgroup ? ` · Subgrupo: ${rule.subgroup}` : "")
      + (rule.sizeClass ? ` · Tamano: ${SIZE_CLASS_LABEL[rule.sizeClass]}` : "")
      + (rule.referenceCode ? ` · Ref: ${rule.referenceCode}` : ""),
    isLegacy: true,
  };
}

interface RuleCatalog {
  lines:           Array<{ value: string; label: string }>;
  subgroupsByLine: Record<string, Array<{ value: string; label: string }>>;
  productClasses:  Array<{ value: string; label: string }>;
  sizeClasses:     Array<{ value: string; label: string }>;
}

function PolicyTab({ orgSlug, storeId, storeName }: { orgSlug: string; storeId: string; storeName: string }) {
  const [policyRules, setPolicyRules] = useState<StorePolicyRule[]>([]);
  const [loaded, setLoaded]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [catalog, setCatalog]         = useState<RuleCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const policyApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/orgs/${orgSlug}/comercial/tiendas/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [orgSlug]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await policyApi({ action: "get_for_store", storeId });
      setPolicyRules(data.policy?.rules ?? []);
      setLoaded(true);
    } catch {
      setError("No se pudieron cargar las politicas.");
    } finally {
      setLoading(false);
    }
  }, [storeId, policyApi]);

  const loadCatalog = useCallback(async () => {
    if ((catalog && catalog.lines.length > 0) || catalogLoading) return;
    setCatalogLoading(true);
    try {
      const data = await policyApi({ action: "rule_catalog" });
      setCatalog(data.catalog ?? null);
    } catch {
      // Catalog unavailable — form will show empty state
    } finally {
      setCatalogLoading(false);
    }
  }, [catalog, catalogLoading, policyApi]);

  // Load on mount
  if (!loaded && !loading) { loadRules(); }

  const handleAddRule = async (rule: Omit<StorePolicyRule, "id" | "storeId">) => {
    try {
      const data = await policyApi({ action: "add_rule", storeId, storeName, rule });
      if (data.error) {
        setError(data.error);
        return;
      }
      setPolicyRules(data.policy?.rules ?? []);
      setShowAdd(false);
    } catch {
      setError("Error al guardar la regla.");
    }
  };

  const handleRemoveRule = async (ruleId: string) => {
    try {
      const data = await policyApi({ action: "remove_rule", storeId, ruleId });
      setPolicyRules(data.policy?.rules ?? []);
    } catch {
      setError("Error al eliminar la regla.");
    }
  };

  const handleShowAdd = () => {
    if (!showAdd) loadCatalog();
    setShowAdd(!showAdd);
  };

  if (loading && !loaded) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Cargando politicas...
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, marginBottom: S[2] }}>{error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[3] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          Reglas de surtido
        </span>
        <button onClick={handleShowAdd} className="ag-action-secondary" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
          background: C.blueLight, border: `1px solid ${C.blueBorder}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          {showAdd ? "Cancelar" : "+ Nueva regla"}
        </button>
      </div>

      {showAdd && <AddPolicyRuleForm catalog={catalog} catalogLoading={catalogLoading} onSave={handleAddRule} onCancel={() => setShowAdd(false)} />}

      {policyRules.length === 0 ? (
        <div className="ag-empty-state" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
          textAlign: "center", padding: S[8],
        }}>
          Sin reglas configuradas. Se usan valores por defecto.
          <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
            Textil: min 1 / ideal 1 / max 2 por talla/color · Accesorios: min 1 / ideal 2 / max 4 por tamano
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {policyRules.map(rule => {
            const desc = describeRule(rule);
            return (
              <div key={rule.id} style={{ ...panel, padding: S[3], opacity: rule.active ? 1 : 0.5, borderLeft: desc.isLegacy ? `3px solid ${C.amber}` : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
                      {desc.title}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
                      {desc.detail}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: S[1], alignItems: "center" }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "2px 6px", borderRadius: R.pill,
                      background: rule.active ? C.greenLight : C.surface,
                      color: rule.active ? C.green : C.inkFaint,
                      border: `1px solid ${rule.active ? C.greenBorder : C.line}`,
                    }}>
                      {rule.active ? "Activa" : "Inactiva"}
                    </span>
                    <button onClick={() => handleRemoveRule(rule.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    }}>x</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Accessory size class rows ────────────────────────────────────────────────

const IMPORTACION_SIZE_ROWS: Array<{ sizeClass: StoreSizeClass; label: string; defaultMin: number; defaultIdeal: number; defaultMax: number }> = [
  { sizeClass: "small",  label: "Pequeno",  defaultMin: 6, defaultIdeal: 8,  defaultMax: 10 },
  { sizeClass: "medium", label: "Mediano",  defaultMin: 4, defaultIdeal: 6,  defaultMax: 8 },
  { sizeClass: "large",  label: "Grande",   defaultMin: 1, defaultIdeal: 2,  defaultMax: 3 },
];

function AddPolicyRuleForm({
  catalog,
  catalogLoading,
  onSave,
  onCancel,
}: {
  catalog:        RuleCatalog | null;
  catalogLoading: boolean;
  onSave: (rule: Omit<StorePolicyRule, "id" | "storeId">) => void;
  onCancel: () => void;
}) {
  // ── Rule mode (textile / accessory_import) ──────────────────────────────
  const [mode, setMode] = useState<RuleMode>("textile");

  // ── Textile fields ──────────────────────────────────────────────────────
  const textileLines = BUSINESS_LINES.filter(l => l.ruleMode === "textile");
  const [lineId, setLineId]             = useState(textileLines[0]?.id ?? "");
  const [subgroupMode, setSubgroupMode] = useState<"all" | "selected">("all");
  const [selectedSubgroups, setSelectedSubgroups] = useState<string[]>([]);
  const [minQty, setMinQty]             = useState(1);
  const [idealQty, setIdealQty]         = useState(2);
  const [maxQty, setMaxQty]             = useState(3);

  // ── Accesorios / Importacion fields (one row per size class) ───────────
  const [impRows, setImpRows] = useState(() =>
    IMPORTACION_SIZE_ROWS.map(r => ({ ...r, enabled: true })),
  );

  const updateImpRow = (idx: number, field: "enabled" | "defaultMin" | "defaultIdeal" | "defaultMax", value: number | boolean) => {
    setImpRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  // ── Catalog-driven subgroups for selected textile line ──────────────────
  const lineLabel = textileLines.find(l => l.id === lineId)?.label ?? lineId;
  const availableSubgroups = catalog?.subgroupsByLine[lineLabel] ?? catalog?.subgroupsByLine[lineId] ?? [];

  const handleLineChange = (val: string) => {
    setLineId(val);
    setSelectedSubgroups([]);
    setSubgroupMode("all");
  };

  const toggleSubgroup = (sg: string) => {
    setSelectedSubgroups(prev =>
      prev.includes(sg) ? prev.filter(s => s !== sg) : [...prev, sg],
    );
  };

  // ── Styles ──────────────────────────────────────────────────────────────
  const inputStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
    color: C.ink, width: "100%",
  };
  const selectStyle = { ...inputStyle, cursor: "pointer" as const };
  const labelStyle = {
    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
    marginBottom: 2, display: "block" as const,
  };
  const chipStyle = (active: boolean) => ({
    fontFamily: T.mono, fontSize: T.sz["2xs"], cursor: "pointer" as const,
    padding: `2px ${S[2]}px`, borderRadius: R.pill, border: "none",
    background: active ? C.blueDark : C.surface,
    color: active ? C.white : C.inkLight,
  });

  // ── Submit handlers ─────────────────────────────────────────────────────
  const handleSubmitTextile = () => {
    const resolvedLine = textileLines.find(l => l.id === lineId)?.label ?? lineId;
    if (subgroupMode === "all") {
      onSave({
        scope: "line_subgroup",
        productClass: "textile",
        line: resolvedLine,
        subgroup: undefined,
        minQty, idealQty, maxQty,
        allowReplacement: false,
        allowProductionSignal: false,
        allowMainWarehouseTransfer: true,
        priority: 10,
        active: true,
        coverageStrategy: "SUBGROUP",
      });
    } else {
      for (const sg of selectedSubgroups) {
        const sgLabel = availableSubgroups.find(s => s.value === sg)?.label ?? sg;
        onSave({
          scope: "line_subgroup",
          productClass: "textile",
          line: resolvedLine,
          subgroup: sgLabel,
          minQty, idealQty, maxQty,
          allowReplacement: false,
          allowProductionSignal: false,
          allowMainWarehouseTransfer: true,
          priority: 10,
          active: true,
          coverageStrategy: "SUBGROUP",
        });
      }
    }
  };

  const handleSubmitAccessoryImport = () => {
    for (const row of impRows) {
      if (!row.enabled) continue;
      onSave({
        scope: "class_size",
        productClass: "accessory",
        sizeClass: row.sizeClass,
        minQty: row.defaultMin,
        idealQty: row.defaultIdeal,
        maxQty: row.defaultMax,
        allowReplacement: false,
        allowProductionSignal: false,
        allowMainWarehouseTransfer: true,
        priority: 10,
        active: true,
        coverageStrategy: "SIZE",
      });
    }
  };

  const handleSubmit = () => {
    if (mode === "textile") handleSubmitTextile();
    else handleSubmitAccessoryImport();
  };

  // ── Empty catalog ───────────────────────────────────────────────────────
  if (!catalogLoading && catalog && catalog.lines.length === 0) {
    return (
      <div style={{ ...panel, padding: S[4], marginBottom: S[3], background: C.surface, borderColor: C.line }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center" }}>
          No se encontraron lineas/subgrupos sincronizados desde SAG.
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "center", marginTop: S[1] }}>
          Las reglas de surtido requieren datos de producto sincronizados.
        </div>
        <div style={{ textAlign: "center", marginTop: S[2] }}>
          <button onClick={onCancel} className="ag-action-ghost" style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
            background: "transparent", border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
          }}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (catalogLoading) {
    return (
      <div style={{ ...panel, padding: S[4], marginBottom: S[3], background: C.blueLight, borderColor: C.blueBorder }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center" }}>
          Cargando catalogo de productos...
        </div>
      </div>
    );
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const canSubmit = mode === "textile"
    ? (lineId && (subgroupMode === "all" || selectedSubgroups.length > 0) && minQty >= 0 && idealQty >= minQty && maxQty >= idealQty)
    : impRows.some(r => r.enabled);

  return (
    <div style={{ ...panel, padding: S[4], marginBottom: S[3], background: C.blueLight, borderColor: C.blueBorder }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
        Nueva regla de surtido
      </div>

      {/* Mode selector */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3] }}>
        <button onClick={() => setMode("textile")} style={chipStyle(mode === "textile")}>
          Textil
        </button>
        <button onClick={() => setMode("accessory_import")} style={chipStyle(mode === "accessory_import")}>
          Accesorios / Importacion
        </button>
      </div>

      {/* ── Textile form ──────────────────────────────────────────────── */}
      {mode === "textile" && (
        <>
          <div style={{ marginBottom: S[2] }}>
            <label style={labelStyle}>Linea</label>
            <select value={lineId} onChange={e => handleLineChange(e.target.value)} style={selectStyle}>
              {textileLines.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: S[2] }}>
            <label style={labelStyle}>Subgrupos</label>
            <div style={{ display: "flex", gap: S[1], marginBottom: S[1] }}>
              <button onClick={() => setSubgroupMode("all")} style={chipStyle(subgroupMode === "all")}>
                Todos los subgrupos
              </button>
              <button onClick={() => setSubgroupMode("selected")} style={chipStyle(subgroupMode === "selected")}>
                Seleccionar
              </button>
            </div>
          </div>

          {subgroupMode === "selected" && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: S[2] }}>
              {availableSubgroups.length === 0 ? (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  No hay subgrupos sincronizados para {lineLabel}.
                </div>
              ) : (
                availableSubgroups.map(sg => (
                  <button key={sg.value} onClick={() => toggleSubgroup(sg.value)} style={chipStyle(selectedSubgroups.includes(sg.value))}>
                    {sg.label}
                  </button>
                ))
              )}
            </div>
          )}

          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
            Cantidad por talla/color en tienda:
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2], marginBottom: S[3] }}>
            <div>
              <label style={labelStyle}>Min</label>
              <input type="number" value={minQty} onChange={e => setMinQty(Number(e.target.value))} min={0} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ideal</label>
              <input type="number" value={idealQty} onChange={e => setIdealQty(Number(e.target.value))} min={0} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Max</label>
              <input type="number" value={maxQty} onChange={e => setMaxQty(Number(e.target.value))} min={0} style={inputStyle} />
            </div>
          </div>
        </>
      )}

      {/* ── Accesorios / Importacion form (sizes) ────────────────────── */}
      {mode === "accessory_import" && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[2] }}>
            Cantidad por tamano de producto en tienda:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2], marginBottom: S[3] }}>
            {impRows.map((row, idx) => (
              <div key={row.sizeClass} style={{
                ...panel, padding: S[2],
                opacity: row.enabled ? 1 : 0.4,
                display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", gap: S[2], alignItems: "center",
              }}>
                <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, display: "flex", gap: 4, alignItems: "center", cursor: "pointer", minWidth: 80 }}>
                  <input type="checkbox" checked={row.enabled} onChange={e => updateImpRow(idx, "enabled", e.target.checked)} />
                  {row.label}
                </label>
                <div>
                  <label style={labelStyle}>Min</label>
                  <input type="number" value={row.defaultMin} onChange={e => updateImpRow(idx, "defaultMin", Number(e.target.value))} min={0} disabled={!row.enabled} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Ideal</label>
                  <input type="number" value={row.defaultIdeal} onChange={e => updateImpRow(idx, "defaultIdeal", Number(e.target.value))} min={0} disabled={!row.enabled} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Max</label>
                  <input type="number" value={row.defaultMax} onChange={e => updateImpRow(idx, "defaultMax", Number(e.target.value))} min={0} disabled={!row.enabled} style={inputStyle} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: S[2] }}>
        <button onClick={handleSubmit} disabled={!canSubmit} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.white, background: canSubmit ? C.blueDark : C.inkFaint, border: "none",
          borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: canSubmit ? "pointer" : "default",
        }}>
          {mode === "textile" ? "Guardar regla textil" : "Guardar reglas accesorios / importacion"}
        </button>
        <button onClick={onCancel} className="ag-action-ghost" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
          background: "transparent", border: `1px solid ${C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Needs View (TIENDAS-INVENTORY-02) ────────────────────────────────────────

const NEED_STATUS_LABEL: Record<NeedStatus, string> = {
  out:       "Agotado",
  low:       "Bajo",
  healthy:   "Saludable",
  overstock: "Sobrestock",
};

const NEED_STATUS_STYLE: Record<NeedStatus, { bg: string; text: string }> = {
  out:       { bg: C.redLight,    text: C.red },
  low:       { bg: C.amberLight,  text: C.amber },
  healthy:   { bg: C.greenLight,  text: C.green },
  overstock: { bg: C.blueLight,   text: C.blueDark },
};

function NeedsView({
  needs,
  summaries,
  loading,
  loaded,
}: {
  needs:     StoreNeed[];
  summaries: StoreNeedsSummary[];
  loading:   boolean;
  loaded:    boolean;
}) {
  const [filterStore, setFilterStore]   = useState<string>("");
  const [filterLine, setFilterLine]     = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<NeedStatus | "">("");

  if (loading && !loaded) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Calculando necesidades de surtido...
      </div>
    );
  }

  if (loaded && needs.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Sin datos de inventario para calcular necesidades. Sincroniza con SAG primero.
      </div>
    );
  }

  // Unique values for filters
  const storeOptions = [...new Set(needs.map(n => n.storeName))].sort();
  const lineOptions  = [...new Set(needs.map(n => n.line).filter(Boolean))].sort();

  // Apply filters
  const filtered = needs.filter(n => {
    if (filterStore && n.storeName !== filterStore) return false;
    if (filterLine && n.line !== filterLine) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    return true;
  });

  // Only show non-healthy by default unless filtering
  const displayNeeds = filterStatus
    ? filtered
    : filtered.filter(n => n.status !== "healthy");

  const actionableCount = needs.filter(n => n.status === "out" || n.status === "low").length;

  const selectStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
    color: C.ink, cursor: "pointer" as const,
  };

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: "flex", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
        <NeedMiniStat label="Agotados" value={needs.filter(n => n.status === "out").length} color={C.red} />
        <NeedMiniStat label="Bajos" value={needs.filter(n => n.status === "low").length} color={C.amber} />
        <NeedMiniStat label="Saludables" value={needs.filter(n => n.status === "healthy").length} color={C.green} />
        <NeedMiniStat label="Sobrestock" value={needs.filter(n => n.status === "overstock").length} color={C.blueDark} />
        <NeedMiniStat label="Accionables" value={actionableCount} color={C.ink} />
      </div>

      {/* Store summaries */}
      {summaries.length > 0 && (
        <div style={{ display: "flex", gap: S[2], marginBottom: S[4], flexWrap: "wrap" }}>
          {summaries.slice(0, 6).map(s => (
            <button key={s.storeId} onClick={() => setFilterStore(s.storeName === filterStore ? "" : s.storeName)}
              style={{
                ...panel, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                background: filterStore === s.storeName ? C.blueLight : C.white,
                borderColor: filterStore === s.storeName ? C.blueBorder : C.line,
                minWidth: 140,
              }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {s.storeName}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 2 }}>
                {s.outCount > 0 && <span style={{ color: C.red }}>{s.outCount} agot</span>}
                {s.outCount > 0 && s.lowCount > 0 && " · "}
                {s.lowCount > 0 && <span style={{ color: C.amber }}>{s.lowCount} bajo</span>}
                {s.outCount === 0 && s.lowCount === 0 && <span style={{ color: C.green }}>OK</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={selectStyle}>
          <option value="">Todas las tiendas</option>
          {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterLine} onChange={e => setFilterLine(e.target.value)} style={selectStyle}>
          <option value="">Todas las lineas</option>
          {lineOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as NeedStatus | "")} style={selectStyle}>
          <option value="">Solo pendientes</option>
          <option value="out">Agotado</option>
          <option value="low">Bajo</option>
          <option value="healthy">Saludable</option>
          <option value="overstock">Sobrestock</option>
        </select>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, alignSelf: "center" }}>
          {displayNeeds.length} de {needs.length}
        </span>
      </div>

      {/* Needs table */}
      <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="ag-op-row" style={{
          display: "grid",
          gridTemplateColumns: "50px 1fr 120px 70px 70px 60px 60px 60px 80px 80px",
          gap: S[2], padding: `${S[2]}px ${S[3]}px`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          color: C.inkLight, borderBottom: `1px solid ${C.line}`, background: C.surface,
        }}>
          <span>Prio</span>
          <span>Producto</span>
          <span>Tienda</span>
          <span>Talla</span>
          <span>Color</span>
          <span>Tienda</span>
          <span>Bodega</span>
          <span>Necesita</span>
          <span>Estado</span>
          <span>Politica</span>
        </div>

        {/* Rows */}
        {displayNeeds.slice(0, 100).map((n, i) => {
          const ss = NEED_STATUS_STYLE[n.status];
          return (
            <div key={`${n.storeId}-${n.referenceCode}-${n.size}-${n.color}-${i}`} className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: "50px 1fr 120px 70px 70px 60px 60px 60px 80px 80px",
              gap: S[2], padding: `${S[2]}px ${S[3]}px`,
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
              borderBottom: `1px solid ${C.line}`,
              background: n.status === "out" ? `${C.redLight}40` : n.status === "low" ? `${C.amberLight}40` : "transparent",
            }}>
              <span style={{ fontWeight: T.wt.semibold, color: n.priorityScore >= 100 ? C.red : n.priorityScore >= 50 ? C.amber : C.inkLight }}>
                {n.priorityScore}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: T.wt.medium }}>{n.referenceCode}</span>
                {" "}
                <span style={{ color: C.inkLight }}>{n.productName}</span>
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.storeName}
              </span>
              <span>{n.size || "\u2014"}</span>
              <span>{n.color || "\u2014"}</span>
              <span style={{ fontWeight: T.wt.semibold, color: n.currentStoreQty === 0 ? C.red : C.ink }}>
                {n.currentStoreQty}
              </span>
              <span style={{ color: n.mainWarehouseQty > 0 ? C.green : C.inkFaint }}>
                {n.mainWarehouseQty}
              </span>
              <span style={{ fontWeight: T.wt.semibold, color: n.neededQty > 0 ? C.blueDark : C.inkFaint }}>
                {n.neededQty > 0 ? n.neededQty : "\u2014"}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill,
                background: ss.bg, color: ss.text,
                textAlign: "center",
              }}>
                {NEED_STATUS_LABEL[n.status]}
              </span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {n.policySource === "global_default" ? "default" : n.policySource.replace(/_/g, " ")}
              </span>
            </div>
          );
        })}

        {displayNeeds.length > 100 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            textAlign: "center", padding: S[3],
          }}>
            Mostrando 100 de {displayNeeds.length} necesidades
          </div>
        )}

        {displayNeeds.length === 0 && (
          <div className="ag-empty-state" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            textAlign: "center", padding: S[6],
          }}>
            {filterStatus || filterStore || filterLine
              ? "Sin resultados con los filtros seleccionados."
              : "Todas las variantes estan en rango saludable."}
          </div>
        )}
      </div>
    </div>
  );
}

function NeedMiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{label}</div>
    </div>
  );
}

// ── Suggestions Motor View ───────────────────────────────────────────────────

const ACTION_LABEL: Record<SuggestedAction, string> = {
  transfer_full:    "Transferir completo",
  transfer_partial: "Transferir parcial",
  find_replacement: "Buscar reemplazo",
  no_action:        "Sin accion",
  overstock_review: "Revisar sobrestock",
};

const ACTION_STYLE: Record<SuggestedAction, { bg: string; text: string }> = {
  transfer_full:    { bg: C.greenLight,  text: C.green },
  transfer_partial: { bg: C.amberLight,  text: C.amber },
  find_replacement: { bg: C.blueLight,   text: C.blueDark },
  no_action:        { bg: C.surface,     text: C.inkFaint },
  overstock_review: { bg: C.redLight,    text: C.red },
};

function SuggestionsMotorView({
  suggestions,
  summaries,
  loading,
  loaded,
}: {
  suggestions: StoreReplenishmentSuggestion[];
  summaries:   StoreSuggestionsSummary[];
  loading:     boolean;
  loaded:      boolean;
}) {
  const [filterStore, setFilterStore]   = useState<string>("");
  const [filterAction, setFilterAction] = useState<SuggestedAction | "">("");
  const [expandedRow, setExpandedRow]   = useState<string | null>(null);

  if (loading && !loaded) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Calculando sugerencias de reposicion...
      </div>
    );
  }

  if (loaded && suggestions.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        Sin datos para generar sugerencias. Sincroniza con SAG primero.
      </div>
    );
  }

  // Counts by action
  const transferFullCount    = suggestions.filter(s => s.suggestedAction === "transfer_full").length;
  const transferPartialCount = suggestions.filter(s => s.suggestedAction === "transfer_partial").length;
  const findReplacementCount = suggestions.filter(s => s.suggestedAction === "find_replacement").length;
  const overstockReviewCount = suggestions.filter(s => s.suggestedAction === "overstock_review").length;
  const totalTransferUnits   = suggestions.reduce((sum, s) => sum + s.transferQty, 0);

  const storeOptions = [...new Set(suggestions.map(s => s.storeName))].sort();

  // Filter — hide no_action by default
  const filtered = suggestions.filter(s => {
    if (filterStore && s.storeName !== filterStore) return false;
    if (filterAction && s.suggestedAction !== filterAction) return false;
    return true;
  });

  const displaySuggestions = filterAction
    ? filtered
    : filtered.filter(s => s.suggestedAction !== "no_action");

  const selectStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
    color: C.ink, cursor: "pointer" as const,
  };

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: "flex", gap: S[3], marginBottom: S[4], flexWrap: "wrap" }}>
        <NeedMiniStat label="Transferir completo" value={transferFullCount} color={C.green} />
        <NeedMiniStat label="Transferir parcial" value={transferPartialCount} color={C.amber} />
        <NeedMiniStat label="Buscar reemplazo" value={findReplacementCount} color={C.blueDark} />
        <NeedMiniStat label="Revisar sobrestock" value={overstockReviewCount} color={C.red} />
        <NeedMiniStat label="Uds a transferir" value={totalTransferUnits} color={C.ink} />
      </div>

      {/* Store summaries */}
      {summaries.length > 0 && (
        <div style={{ display: "flex", gap: S[2], marginBottom: S[4], flexWrap: "wrap" }}>
          {summaries.slice(0, 6).map(s => (
            <button key={s.storeId} onClick={() => setFilterStore(s.storeName === filterStore ? "" : s.storeName)}
              style={{
                ...panel, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                background: filterStore === s.storeName ? C.blueLight : C.white,
                borderColor: filterStore === s.storeName ? C.blueBorder : C.line,
                minWidth: 140,
              }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
                {s.storeName}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: 2 }}>
                {s.transferFullCount > 0 && <span style={{ color: C.green }}>{s.transferFullCount} transfer</span>}
                {s.transferFullCount > 0 && s.findReplacementCount > 0 && " · "}
                {s.findReplacementCount > 0 && <span style={{ color: C.blueDark }}>{s.findReplacementCount} reemp</span>}
                {s.transferFullCount === 0 && s.findReplacementCount === 0 && <span style={{ color: C.inkFaint }}>OK</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={selectStyle}>
          <option value="">Todas las tiendas</option>
          {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value as SuggestedAction | "")} style={selectStyle}>
          <option value="">Solo accionables</option>
          <option value="transfer_full">Transferir completo</option>
          <option value="transfer_partial">Transferir parcial</option>
          <option value="find_replacement">Buscar reemplazo</option>
          <option value="overstock_review">Revisar sobrestock</option>
          <option value="no_action">Sin accion</option>
        </select>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, alignSelf: "center" }}>
          {displaySuggestions.length} de {suggestions.length}
        </span>
      </div>

      {/* Suggestions table */}
      <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="ag-op-row" style={{
          display: "grid",
          gridTemplateColumns: "50px 1fr 120px 70px 70px 60px 60px 120px 90px",
          gap: S[2], padding: `${S[2]}px ${S[3]}px`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          color: C.inkLight, borderBottom: `1px solid ${C.line}`, background: C.surface,
        }}>
          <span>Prio</span>
          <span>Producto</span>
          <span>Tienda</span>
          <span>Talla</span>
          <span>Color</span>
          <span>Transfer</span>
          <span>Conf.</span>
          <span>Accion</span>
          <span>Estado</span>
        </div>

        {/* Rows */}
        {displaySuggestions.slice(0, 100).map((s, i) => {
          const as = ACTION_STYLE[s.suggestedAction];
          const rowKey = `${s.suggestionId}-${i}`;
          const isExpanded = expandedRow === rowKey;
          const hasReplacements = s.suggestedAction === "find_replacement"
            && s.replacementCandidates && s.replacementCandidates.length > 0;
          return (
            <div key={rowKey}>
              <div
                className="ag-op-row"
                onClick={() => hasReplacements ? setExpandedRow(isExpanded ? null : rowKey) : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "50px 1fr 120px 70px 70px 60px 60px 120px 90px",
                  gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                  borderBottom: `1px solid ${C.line}`,
                  cursor: hasReplacements ? "pointer" : "default",
                  background: s.suggestedAction === "transfer_full" ? `${C.greenLight}40`
                    : s.suggestedAction === "find_replacement" ? `${C.blueLight}40`
                    : s.suggestedAction === "overstock_review" ? `${C.redLight}40`
                    : "transparent",
                }}
              >
                <span style={{ fontWeight: T.wt.semibold, color: s.priorityScore >= 100 ? C.red : s.priorityScore >= 50 ? C.amber : C.inkLight }}>
                  {s.priorityScore}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: T.wt.medium }}>{s.referenceCode}</span>
                  {" "}
                  <span style={{ color: C.inkLight }}>{s.productName}</span>
                  {hasReplacements && (
                    <span style={{ color: C.blueDark, marginLeft: S[1], fontSize: T.sz["2xs"] }}>
                      {isExpanded ? "▼" : "▶"} {s.replacementCandidates!.length} reemplazos
                    </span>
                  )}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.storeName}
                </span>
                <span>{s.size || "\u2014"}</span>
                <span>{s.color || "\u2014"}</span>
                <span style={{ fontWeight: T.wt.semibold, color: s.transferQty > 0 ? C.green : C.inkFaint }}>
                  {s.transferQty > 0 ? s.transferQty : "\u2014"}
                </span>
                <span style={{ fontSize: T.sz["2xs"], color: s.confidence === "high" ? C.green : s.confidence === "medium" ? C.amber : C.inkFaint }}>
                  {s.confidence === "high" ? "Alta" : s.confidence === "medium" ? "Media" : "Baja"}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: "2px 6px", borderRadius: R.pill,
                  background: as.bg, color: as.text,
                  textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {ACTION_LABEL[s.suggestedAction]}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  color: s.needStatus === "out" ? C.red : s.needStatus === "low" ? C.amber : C.inkFaint,
                }}>
                  {NEED_STATUS_LABEL[s.needStatus]}
                </span>
              </div>

              {/* Expanded replacement candidates */}
              {isExpanded && hasReplacements && (
                <div style={{
                  background: `${C.blueLight}60`, padding: `${S[2]}px ${S[4]}px ${S[3]}px`,
                  borderBottom: `1px solid ${C.blueBorder}`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.blueDark, marginBottom: S[2] }}>
                    Candidatos de reemplazo
                  </div>
                  {s.replacementCandidates!.map((c, ci) => (
                    <div key={ci} style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr 80px 70px 60px 80px 1fr",
                      gap: S[2], padding: `${S[1]}px 0`,
                      fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
                      borderBottom: ci < s.replacementCandidates!.length - 1 ? `1px solid ${C.line}` : "none",
                    }}>
                      <span style={{ color: C.inkLight, fontWeight: T.wt.semibold }}>{ci + 1}.</span>
                      <span style={{ fontWeight: T.wt.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.referenceCode} — {c.productName}
                      </span>
                      <span style={{ color: c.mainWarehouseQty >= 21 ? C.green : c.mainWarehouseQty >= 6 ? C.amber : C.inkFaint }}>
                        {c.mainWarehouseQty} uds
                      </span>
                      <span style={{ fontWeight: T.wt.semibold }}>
                        {c.matchScore} pts
                      </span>
                      <span style={{
                        color: c.matchConfidence === "high" ? C.green : c.matchConfidence === "medium" ? C.amber : C.inkFaint,
                      }}>
                        {c.matchConfidence === "high" ? "Alta" : c.matchConfidence === "medium" ? "Media" : "Baja"}
                      </span>
                      <span style={{ color: C.inkLight }}>
                        {c.priceDeltaPercent != null ? `${c.priceDeltaPercent}% precio` : "\u2014"}
                      </span>
                      <span style={{ color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.matchReasons.join(". ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {displaySuggestions.length > 100 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            textAlign: "center", padding: S[3],
          }}>
            Mostrando 100 de {displaySuggestions.length} sugerencias
          </div>
        )}

        {displaySuggestions.length === 0 && (
          <div className="ag-empty-state" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            textAlign: "center", padding: S[6],
          }}>
            {filterAction || filterStore
              ? "Sin resultados con los filtros seleccionados."
              : "Todas las variantes estan en rango saludable — sin sugerencias pendientes."}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Guides View ─────────────────────────────────────────────────────────────

const GUIDE_STATUS_LABEL: Record<GuideStatus, string> = {
  draft: "Borrador", approved: "Aprobada", executed: "Ejecutada", cancelled: "Cancelada",
};
const GUIDE_STATUS_STYLE: Record<GuideStatus, { bg: string; text: string }> = {
  draft:     { bg: C.amberLight, text: C.amber },
  approved:  { bg: C.blueLight,  text: C.blueDark },
  executed:  { bg: C.greenLight, text: C.green },
  cancelled: { bg: C.surface,    text: C.inkFaint },
};
const GUIDE_PRIORITY_LABEL: Record<GuidePriority, string> = {
  critica: "Critica", alta: "Alta", media: "Media", baja: "Baja",
};
const GUIDE_PRIORITY_COLOR: Record<GuidePriority, string> = {
  critica: C.red, alta: C.amber, media: C.blueDark, baja: C.inkFaint,
};

function GuidesView({
  guideCards, loading, loaded, onOpenGuide, onGenerate,
}: {
  guideCards: GuideCard[];
  loading:   boolean;
  loaded:    boolean;
  onOpenGuide: (id: string) => void;
  onGenerate:  () => void;
}) {
  const [filterStatus, setFilterStatus] = useState<GuideStatus | "">("");
  const [filterStore, setFilterStore]   = useState<string>("");

  if (loading && !loaded) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>
        Cargando guias de bodega...
      </div>
    );
  }

  const storeOptions = [...new Set(guideCards.map(g => g.storeName))].sort();
  const filtered = guideCards.filter(g => {
    if (filterStatus && g.status !== filterStatus) return false;
    if (filterStore && g.storeName !== filterStore) return false;
    return true;
  });

  const selectStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`,
    border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.white,
    color: C.ink, cursor: "pointer" as const,
  };

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center" }}>
        <button
          onClick={onGenerate}
          className="ag-action-primary"
          style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            color: C.white, background: C.blueDark, border: "none",
            borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
          }}
        >
          Generar guias
        </button>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as GuideStatus | "")} style={selectStyle}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="approved">Aprobada</option>
          <option value="executed">Ejecutada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={selectStyle}>
          <option value="">Todas las tiendas</option>
          {storeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          {filtered.length} guias
        </span>
      </div>

      {guideCards.length === 0 && loaded && (
        <div className="ag-empty-state" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
          textAlign: "center", padding: S[8],
        }}>
          Sin guias de bodega. Usa &quot;Generar guias&quot; para crear propuestas de surtido desde las sugerencias actuales.
        </div>
      )}

      {/* Guide cards table */}
      {filtered.length > 0 && (
        <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
          <div className="ag-op-row" style={{
            display: "grid",
            gridTemplateColumns: "90px 1fr 80px 80px 80px 100px",
            gap: S[2], padding: `${S[2]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            color: C.inkLight, borderBottom: `1px solid ${C.line}`, background: C.surface,
          }}>
            <span>Numero</span>
            <span>Tienda</span>
            <span>Lineas</span>
            <span>Unidades</span>
            <span>Prioridad</span>
            <span>Estado</span>
          </div>
          {filtered.map(g => {
            const ss = GUIDE_STATUS_STYLE[g.status];
            return (
              <div
                key={g.id}
                className="ag-op-row"
                onClick={() => onOpenGuide(g.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 80px 80px 80px 100px",
                  gap: S[2], padding: `${S[2]}px ${S[3]}px`,
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                  borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: T.wt.semibold, color: C.blueDark }}>{g.guideNumber}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.storeName}</span>
                <span>{g.totalLines}</span>
                <span style={{ fontWeight: T.wt.semibold }}>{g.totalUnits}</span>
                <span style={{ color: GUIDE_PRIORITY_COLOR[g.priority], fontWeight: T.wt.semibold }}>
                  {GUIDE_PRIORITY_LABEL[g.priority]}
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: "2px 6px", borderRadius: R.pill,
                  background: ss.bg, color: ss.text, textAlign: "center",
                }}>
                  {GUIDE_STATUS_LABEL[g.status]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Guide Detail Drawer ─────────────────────────────────────────────────────

function GuideDetailDrawer({
  guide, onClose, onAction,
}: {
  guide:    StoreWarehouseGuide;
  onClose:  () => void;
  onAction: (guideId: string, action: "approve" | "cancel" | "execute") => void;
}) {
  const ss = GUIDE_STATUS_STYLE[guide.status];

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 640,
      background: C.white, borderLeft: `1px solid ${C.line}`,
      boxShadow: E.lg, zIndex: 100, overflow: "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[4]}px ${S[5]}px`, borderBottom: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            {guide.guideNumber}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            {guide.storeName}
          </div>
        </div>
        <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            padding: "4px 10px", borderRadius: R.pill,
            background: ss.bg, color: ss.text,
          }}>
            {GUIDE_STATUS_LABEL[guide.status]}
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: GUIDE_PRIORITY_COLOR[guide.priority],
          }}>
            {GUIDE_PRIORITY_LABEL[guide.priority]}
          </span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight,
          }}>✕</button>
        </div>
      </div>

      {/* Executive summary */}
      <div style={{
        padding: `${S[3]}px ${S[5]}px`, background: C.blueLight,
        borderBottom: `1px solid ${C.blueBorder}`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.blueDark, marginBottom: S[1] }}>
          Resumen ejecutivo
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.5 }}>
          {guide.summary.executiveSummary}
        </div>
      </div>

      {/* Actions */}
      {guide.status === "draft" && (
        <div style={{ padding: `${S[3]}px ${S[5]}px`, display: "flex", gap: S[2], borderBottom: `1px solid ${C.line}` }}>
          <button
            onClick={() => onAction(guide.id, "approve")}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.white, background: C.green, border: "none",
              borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}
          >
            Aprobar guia
          </button>
          <button
            onClick={() => onAction(guide.id, "cancel")}
            className="ag-action-secondary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`,
              borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}
          >
            Cancelar guia
          </button>
        </div>
      )}

      {guide.status === "approved" && (
        <div style={{ padding: `${S[3]}px ${S[5]}px`, display: "flex", gap: S[2], borderBottom: `1px solid ${C.line}` }}>
          <button
            onClick={() => onAction(guide.id, "execute")}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.white, background: C.blueDark, border: "none",
              borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}
          >
            Marcar ejecutada
          </button>
        </div>
      )}

      {/* Lines table */}
      <div style={{ flex: 1, padding: `${S[3]}px ${S[5]}px`, overflow: "auto" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkLight, marginBottom: S[2] }}>
          Lineas ({guide.totalLines})
        </div>
        <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
          <div className="ag-op-row" style={{
            display: "grid",
            gridTemplateColumns: "1fr 70px 70px 60px 60px 1fr",
            gap: S[2], padding: `${S[2]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
            color: C.inkLight, borderBottom: `1px solid ${C.line}`, background: C.surface,
          }}>
            <span>Producto</span>
            <span>Talla</span>
            <span>Color</span>
            <span>Cant.</span>
            <span>Disp.</span>
            <span>Accion</span>
          </div>
          {guide.lines.map(l => (
            <div key={l.id} className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 70px 60px 60px 1fr",
              gap: S[2], padding: `${S[2]}px ${S[3]}px`,
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
              borderBottom: `1px solid ${C.line}`,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: T.wt.medium }}>{l.referenceCode}</span>
                {" "}
                <span style={{ color: C.inkLight }}>{l.productName}</span>
                {l.replacementReferenceCode && (
                  <span style={{ color: C.blueDark, fontSize: T.sz["2xs"] }}>
                    {" → "}{l.replacementReferenceCode}
                  </span>
                )}
              </span>
              <span>{l.size || "\u2014"}</span>
              <span>{l.color || "\u2014"}</span>
              <span style={{ fontWeight: T.wt.semibold, color: l.requestedQty > 0 ? C.ink : C.inkFaint }}>
                {l.requestedQty > 0 ? l.requestedQty : "\u2014"}
              </span>
              <span style={{ color: l.availableMainWarehouseQty > 0 ? C.green : C.inkFaint }}>
                {l.availableMainWarehouseQty}
              </span>
              <span style={{ fontSize: T.sz["2xs"], color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.reason}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Audit trail */}
      {guide.audit.length > 0 && (
        <div style={{ padding: `${S[3]}px ${S[5]}px`, borderTop: `1px solid ${C.line}` }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkLight, marginBottom: S[1] }}>
            Historial
          </div>
          {guide.audit.map((a, i) => (
            <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: 2 }}>
              {a.timestamp.split("T")[0]} — {a.action} por {a.userId}
              {a.note ? ` — ${a.note}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Warehouse Tab ───────────────────────────────────────────────────────

function MainWarehouseTab({ orgSlug, hasSyncData, tabCacheRef }: { orgSlug: string; hasSyncData: boolean; tabCacheRef: TabCacheRef }) {
  const cached = tabCacheRef.current.warehouse;
  const [stock, setStock]     = useState<import("@/lib/comercial/tiendas/store-replenishment-types").MainWarehouseAvailability[]>(cached?.mainStock ?? []);
  const [loaded, setLoaded]   = useState(!!cached);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    if (!hasSyncData || loaded || loading) return;
    setLoading(true);
    const t0 = performance.now();
    tiendaApi(orgSlug, { action: "store_main_warehouse" })
      .then(data => {
        const result = { mainStock: data.mainStock ?? [] };
        setStock(result.mainStock);
        tabCacheRef.current.warehouse = result;
        setLoaded(true);
        if (typeof window !== "undefined" && (window as any).__TIENDAS_PERF_LOG) {
          console.log(`[TIENDAS_PERF] warehouse_ms=${Math.round(performance.now() - t0)}`);
        }
      })
      .catch(() => setLoaded(true))
      .finally(() => setLoading(false));
  }, [orgSlug, hasSyncData, loaded, loading]);

  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[8] }}>Cargando bodega principal...</div>;
  }

  if (stock.length === 0) {
    return (
      <div className="ag-empty-state" style={{
        fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
        textAlign: "center", padding: S[8],
      }}>
        {hasSyncData
          ? "Sin datos de bodega principal."
          : "Los niveles de bodega principal se mostraran con la primera sincronizacion SAG."}
      </div>
    );
  }

  // Client-side search + render cap (TIENDAS-DRAWER-PERFORMANCE-01)
  const filtered = search.trim()
    ? stock.filter(s =>
        s.referenceCode.toLowerCase().includes(search.toLowerCase()) ||
        s.size.toLowerCase().includes(search.toLowerCase()) ||
        s.color.toLowerCase().includes(search.toLowerCase())
      )
    : stock;

  return (
    <div>
      {/* Search + summary */}
      <div style={{ display: "flex", gap: S[3], marginBottom: S[3], alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar referencia, talla o color..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, fontFamily: T.mono, fontSize: T.sz.xs,
            padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`,
            borderRadius: R.sm, background: C.white, color: C.ink,
          }}
        />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          {filtered.length} variantes
        </span>
      </div>
      <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{
          ...panelHeader, fontSize: T.sz.xs, fontFamily: T.mono,
          fontWeight: T.wt.semibold, color: C.inkLight,
        }}>
          <span style={{ flex: 1 }}>Referencia</span>
          <span style={{ flex: 1 }}>Talla</span>
          <span style={{ flex: 1 }}>Color</span>
          <span style={{ width: 70, textAlign: "right" }}>Disponible</span>
          <span style={{ width: 70, textAlign: "right" }}>Reservado</span>
        </div>
        {filtered.slice(0, 200).map((s, i) => (
          <div key={i} className="ag-op-row" style={{ ...dataRow, fontSize: T.sz.sm, fontFamily: T.mono }}>
            <span style={{ flex: 1, fontWeight: T.wt.medium, color: C.ink }}>{s.referenceCode}</span>
            <span style={{ flex: 1, color: C.inkMid }}>{s.size}</span>
            <span style={{ flex: 1, color: C.inkMid }}>{s.color}</span>
            <span style={{
              width: 70, textAlign: "right", fontWeight: T.wt.semibold,
              color: s.availableUnits > 0 ? C.green : C.red,
            }}>
              {s.availableUnits}
            </span>
            <span style={{ width: 70, textAlign: "right", color: s.reservedUnits > 0 ? C.amber : C.inkFaint }}>
              {s.reservedUnits}
            </span>
          </div>
        ))}
        {filtered.length > 200 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
            textAlign: "center", padding: S[3],
          }}>
            Mostrando 200 de {filtered.length} variantes. Use el buscador para filtrar.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Proposal Detail Drawer ──────────────────────────────────────────────────

function ProposalDetailDrawer({
  proposal,
  onClose,
  onAction,
  onUpdateLine,
}: {
  proposal:     StoreReplenishmentProposal;
  onClose:      () => void;
  onAction:     (proposalId: string, action: string) => void;
  onUpdateLine: (proposalId: string, lineId: string, updates: {
    transferUnits?: number; productionUnits?: number; comment?: string; removed?: boolean;
  }) => void;
}) {
  const { summary, status } = proposal;
  const sc = PROPOSAL_STATUS_COLOR[status];
  const activeLines = proposal.lines.filter(l => !l.removed);

  // David signals for this proposal
  const davidSignals = buildProposalDavidSignals(proposal);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 620, maxWidth: "100vw",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 51, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: S[4], borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              Propuesta de surtido
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
              {proposal.storeName} · Bodega: {proposal.sourceWarehouseName}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.pill, background: sc.bg, color: sc.text,
            }}>
              {PROPOSAL_STATUS_LABEL[status]}
            </span>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
            }}>x</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3], flexWrap: "wrap" }}>
          <MiniStat label="Lineas activas" value={String(summary.activeLines)} color={C.ink} />
          <MiniStat label="Transferencia exacta" value={`${summary.exactTransferUnits} uds`} color={C.green} />
          <MiniStat label="Transferencia parcial" value={`${summary.partialTransferUnits} uds`} color={C.amber} />
          <MiniStat label="Produccion" value={`${summary.productionUnits} uds`} color={C.blueDark} />
          {summary.alternativeUnits > 0 && (
            <MiniStat label="Alternativas" value={`${summary.alternativeUnits} uds`} color={C.inkLight} />
          )}
        </div>
      </div>

      {/* David signals */}
      {davidSignals.length > 0 && (
        <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surface }}>
          {davidSignals.map((msg, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: S[2],
              marginBottom: i < davidSignals.length - 1 ? S[1] : 0,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                color: C.blueDark, background: C.white, padding: "1px 5px",
                borderRadius: R.sm, border: `1px solid ${C.blueBorder}`,
              }}>David</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Prepared for SAG message */}
      {status === "preparado_para_sag" && (
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, background: C.blueLight,
          borderBottom: `1px solid ${C.blueBorder}`,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark,
        }}>
          Lista para integracion SAG. El envio se habilitara cuando la conexion SAG este activa.
        </div>
      )}

      {/* Lines */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4] }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[3] }}>
          Lineas ({activeLines.length} activas de {proposal.lines.length})
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {proposal.lines.map(line => (
            <ProposalLineRow
              key={line.id}
              line={line}
              editable={status === "borrador"}
              onUpdate={(updates) => onUpdateLine(proposal.id, line.id, updates)}
            />
          ))}
        </div>
      </div>

      {/* Action footer */}
      <div style={{
        padding: S[4], borderTop: `1px solid ${C.line}`,
        display: "flex", gap: S[2], flexWrap: "wrap",
      }}>
        <ProposalActions
          status={status}
          proposalId={proposal.id}
          onAction={onAction}
        />
      </div>
    </div>
  );
}

// ── Proposal Line Row ───────────────────────────────────────────────────────

function ProposalLineRow({
  line,
  editable,
  onUpdate,
}: {
  line:     StoreReplenishmentProposalLine;
  editable: boolean;
  onUpdate: (updates: { transferUnits?: number; productionUnits?: number; comment?: string; removed?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [transferVal, setTransferVal] = useState(String(line.transferUnits));
  const [productionVal, setProductionVal] = useState(String(line.productionUnits));
  const [commentVal, setCommentVal] = useState(line.comment);

  const ltc = LINE_TYPE_COLOR[line.lineType];

  if (line.removed) {
    return (
      <div style={{
        ...panel, padding: S[3], opacity: 0.4,
        borderLeft: `3px solid ${C.inkFaint}`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
          {line.referenceCode} · {line.size} · {line.color} — Eliminada
        </div>
        {editable && (
          <button onClick={() => onUpdate({ removed: false })} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
            background: "none", border: "none", cursor: "pointer", marginTop: S[1],
          }}>
            Restaurar linea
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      ...panel, padding: S[3], borderLeft: `3px solid ${ltc.text}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {line.referenceCode} · {line.size} · {line.color}
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "2px 6px", borderRadius: R.pill, background: ltc.bg, color: ltc.text,
        }}>
          {LINE_TYPE_LABEL[line.lineType]}
        </span>
      </div>

      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
        {line.productName}
      </div>

      {/* Quantities */}
      <div style={{ display: "flex", gap: S[4], fontFamily: T.mono, fontSize: T.sz.xs, marginBottom: S[1] }}>
        <span style={{ color: C.inkLight }}>
          Faltante: <strong style={{ color: C.red }}>{line.missingUnits} uds</strong>
        </span>
        <span style={{ color: C.inkLight }}>
          Disponible bodega: <strong style={{ color: C.ink }}>{line.availableInMain} uds</strong>
        </span>
      </div>
      <div style={{ display: "flex", gap: S[4], fontFamily: T.mono, fontSize: T.sz.xs }}>
        <span style={{ color: C.inkLight }}>
          Transferir: <strong style={{ color: C.green }}>{line.transferUnits} uds</strong>
        </span>
        <span style={{ color: C.inkLight }}>
          Producir: <strong style={{ color: C.blueDark }}>{line.productionUnits} uds</strong>
        </span>
      </div>

      {line.comment && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
          marginTop: S[1], fontStyle: "italic",
        }}>
          Nota: {line.comment}
        </div>
      )}

      {/* Edit controls */}
      {editable && !editing && (
        <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
          <button onClick={() => setEditing(true)} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
            background: C.blueLight, border: `1px solid ${C.blueBorder}`,
            borderRadius: R.sm, padding: "2px 8px", cursor: "pointer",
          }}>
            Ajustar
          </button>
          <button onClick={() => onUpdate({ removed: true })} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
            background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: R.sm, padding: "2px 8px", cursor: "pointer",
          }}>
            Eliminar
          </button>
        </div>
      )}

      {editable && editing && (
        <div style={{
          marginTop: S[2], padding: S[2], background: C.surface,
          borderRadius: R.sm, display: "flex", flexDirection: "column", gap: S[2],
        }}>
          <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
            <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, width: 90 }}>Transferir:</label>
            <input
              type="number"
              min={0}
              value={transferVal}
              onChange={e => setTransferVal(e.target.value)}
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, width: 70,
                padding: "2px 6px", border: `1px solid ${C.line}`, borderRadius: R.sm,
              }}
            />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>uds</span>
          </div>
          <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
            <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, width: 90 }}>Producir:</label>
            <input
              type="number"
              min={0}
              value={productionVal}
              onChange={e => setProductionVal(e.target.value)}
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, width: 70,
                padding: "2px 6px", border: `1px solid ${C.line}`, borderRadius: R.sm,
              }}
            />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>uds</span>
          </div>
          <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
            <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, width: 90 }}>Comentario:</label>
            <input
              type="text"
              value={commentVal}
              onChange={e => setCommentVal(e.target.value)}
              placeholder="Nota opcional"
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, flex: 1,
                padding: "2px 6px", border: `1px solid ${C.line}`, borderRadius: R.sm,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: S[2] }}>
            <button onClick={() => {
              onUpdate({
                transferUnits:   Math.max(0, parseInt(transferVal) || 0),
                productionUnits: Math.max(0, parseInt(productionVal) || 0),
                comment:         commentVal,
              });
              setEditing(false);
            }} className="ag-action-primary" style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.white, background: C.blueDark, border: "none",
              borderRadius: R.sm, padding: "2px 10px", cursor: "pointer",
            }}>
              Guardar
            </button>
            <button onClick={() => setEditing(false)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
              background: "none", border: `1px solid ${C.line}`,
              borderRadius: R.sm, padding: "2px 8px", cursor: "pointer",
            }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Proposal Actions ────────────────────────────────────────────────────────

function ProposalActions({
  status,
  proposalId,
  onAction,
}: {
  status:     ProposalStatus;
  proposalId: string;
  onAction:   (proposalId: string, action: string) => void;
}) {
  const btn = (label: string, action: string, primary = false) => (
    <button
      key={action}
      onClick={() => onAction(proposalId, action)}
      className={primary ? "ag-action-primary" : "ag-action-secondary"}
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color:      primary ? C.white : C.blueDark,
        background: primary ? C.blueDark : C.blueLight,
        border:     primary ? "none" : `1px solid ${C.blueBorder}`,
        borderRadius: R.sm,
        padding:    `${S[1]}px ${S[3]}px`,
        cursor:     "pointer",
      }}
    >
      {label}
    </button>
  );

  const ghostBtn = (label: string, action: string) => (
    <button
      key={action}
      onClick={() => onAction(proposalId, action)}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
        background: "transparent", border: `1px solid ${C.line}`,
        borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  switch (status) {
    case "borrador":
      return <>
        {btn("Enviar a revision", "submit_for_review", true)}
        {ghostBtn("Archivar", "archive")}
      </>;
    case "en_revision":
      return <>
        {btn("Aprobar", "approve", true)}
        {btn("Rechazar", "reject")}
        {ghostBtn("Volver a borrador", "return_to_draft")}
      </>;
    case "aprobado":
      return <>
        {btn("Preparar para SAG", "prepare_for_sag", true)}
        {ghostBtn("Volver a borrador", "return_to_draft")}
      </>;
    case "preparado_para_sag":
      return (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark }}>
          Lista para integracion SAG.
        </span>
      );
    case "rechazado":
      return <>
        {ghostBtn("Volver a borrador", "return_to_draft")}
        {ghostBtn("Archivar", "archive")}
      </>;
    default:
      return null;
  }
}

// ── David signals for proposal ──────────────────────────────────────────────

function buildProposalDavidSignals(proposal: StoreReplenishmentProposal): string[] {
  const signals: string[] = [];
  const { summary } = proposal;

  if (summary.exactTransferUnits > 0) {
    signals.push(
      `Esta propuesta cubre ${summary.exactTransferUnits} unidades exactas desde bodega principal.`,
    );
  }

  if (summary.productionUnits > 0) {
    signals.push(
      `${summary.productionUnits} unidades no tienen existencia y se sugieren para produccion.`,
    );
  }

  const alternatives = proposal.lines.filter(l => !l.removed && l.lineType === "alternativa_secundaria");
  if (alternatives.length > 0) {
    signals.push(
      `Hay ${alternatives.length} alternativas secundarias. Revisalas antes de aprobar.`,
    );
  }

  if (signals.length === 0 && proposal.lines.length > 0) {
    signals.push("No se modifican colores ni tallas automaticamente.");
  }

  return signals.slice(0, 3);
}

// ── Duplicate Dialog ────────────────────────────────────────────────────────

function DuplicateDialog({
  existing,
  onAction,
}: {
  existing: ProposalCard;
  onAction: (action: "open" | "create_new" | "cancel") => void;
}) {
  const sc = PROPOSAL_STATUS_COLOR[existing.status];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        ...panel, width: 440, maxWidth: "90vw", padding: S[5],
        background: C.white, boxShadow: E.lg,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[3] }}>
          Ya existe una propuesta activa
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[3] }}>
          Ya existe una propuesta activa para esta tienda.
        </div>

        <div style={{
          ...panel, padding: S[3], marginBottom: S[4],
          borderLeft: `3px solid ${sc.text}`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
            {existing.storeName}
          </div>
          <div style={{ display: "flex", gap: S[3], marginTop: S[1] }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 6px", borderRadius: R.pill, background: sc.bg, color: sc.text,
            }}>
              {PROPOSAL_STATUS_LABEL[existing.status]}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {existing.activeLines} lineas · {formatTimeAgo(existing.createdAt)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
          <button onClick={() => onAction("open")} className="ag-action-primary" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            color: C.white, background: C.blueDark, border: "none",
            borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Abrir existente
          </button>
          <button onClick={() => onAction("create_new")} className="ag-action-secondary" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            color: C.blueDark, background: C.blueLight,
            border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
            padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Crear nueva version
          </button>
          <button onClick={() => onAction("cancel")} className="ag-action-ghost" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            background: "transparent", border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Warehouse Config Drawer ──────────────────────────────────────────────────

function WarehouseConfigDrawer({
  configs,
  onClose,
  onSave,
  onToggle,
}: {
  configs:  WarehouseConfig[];
  onClose:  () => void;
  onSave:   (cfg: Omit<WarehouseConfig, "id" | "source"> & { id?: string }) => void;
  onToggle: (configId: string) => void;
}) {
  const [editing, setEditing] = useState<WarehouseConfig | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "100vw",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 52, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: S[4], borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              Configuracion de bodegas
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
              Mapea bodegas SAG a tiendas operativas.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
          }}>x</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4] }}>
        {/* Add button */}
        {!creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.white, background: C.blueDark, border: "none",
              borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
              marginBottom: S[4],
            }}
          >
            + Nueva bodega
          </button>
        )}

        {/* Create form */}
        {creating && (
          <WarehouseConfigForm
            onSave={(cfg) => { onSave(cfg); setCreating(false); }}
            onCancel={() => setCreating(false)}
          />
        )}

        {/* Edit form */}
        {editing && (
          <WarehouseConfigForm
            initial={editing}
            onSave={(cfg) => { onSave({ ...cfg, id: editing.id }); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        )}

        {/* Config list */}
        {configs.length === 0 && !creating ? (
          <div className="ag-empty-state" style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            textAlign: "center", padding: S[8],
          }}>
            Sin bodegas configuradas. Agrega una bodega para vincularla a una tienda.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {configs.map(cfg => (
              <div key={cfg.id} style={{
                ...panel, padding: S[3], opacity: cfg.active ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                      {cfg.storeName}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
                      Bodega SAG: {cfg.sagWarehouseCode} · {cfg.city || "Sin ciudad"}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                      {cfg.responsibleName || "Sin responsable"} · {STORE_TYPE_LABEL[cfg.storeType]}
                      {cfg.isMainWarehouse && " · Bodega principal"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: S[1] }}>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "2px 6px", borderRadius: R.pill,
                      background: cfg.active ? C.greenLight : C.surface,
                      color: cfg.active ? C.green : C.inkFaint,
                      border: `1px solid ${cfg.active ? C.greenBorder : C.line}`,
                    }}>
                      {cfg.active ? "Activa" : "Inactiva"}
                    </span>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      padding: "2px 6px", borderRadius: R.pill,
                      background: C.surface, color: C.inkFaint, border: `1px solid ${C.line}`,
                    }}>
                      {cfg.source === "sag" ? "Origen SAG" : "Configuracion administrativa"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
                  <button
                    onClick={() => { setEditing(cfg); setCreating(false); }}
                    className="ag-action-secondary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                      background: C.blueLight, border: `1px solid ${C.blueBorder}`,
                      borderRadius: R.sm, padding: "2px 8px", cursor: "pointer",
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onToggle(cfg.id)}
                    className="ag-action-ghost"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs,
                      color: cfg.active ? C.amber : C.green,
                      background: "transparent", border: `1px solid ${C.line}`,
                      borderRadius: R.sm, padding: "2px 8px", cursor: "pointer",
                    }}
                  >
                    {cfg.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Warehouse Config Form ───────────────────────────────────────────────────

function WarehouseConfigForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WarehouseConfig;
  onSave:   (cfg: Omit<WarehouseConfig, "id" | "source">) => void;
  onCancel: () => void;
}) {
  const [storeName, setStoreName]               = useState(initial?.storeName ?? "");
  const [sagWarehouseCode, setSagWarehouseCode] = useState(initial?.sagWarehouseCode ?? "");
  const [city, setCity]                         = useState(initial?.city ?? "");
  const [responsibleName, setResponsibleName]   = useState(initial?.responsibleName ?? "");
  const [storeType, setStoreType]               = useState<WarehouseConfig["storeType"]>(initial?.storeType ?? "tienda");
  const [isMainWarehouse, setIsMainWarehouse]   = useState(initial?.isMainWarehouse ?? false);
  const [active, setActive]                     = useState(initial?.active ?? true);

  const canSave = storeName.trim().length > 0 && sagWarehouseCode.trim().length > 0;

  const inputStyle = {
    fontFamily: T.mono, fontSize: T.sz.sm, width: "100%",
    padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm,
  };

  const labelStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
    display: "block" as const, marginBottom: 2,
  };

  return (
    <div style={{
      ...panel, padding: S[4], marginBottom: S[4],
      background: C.blueLight, borderColor: C.blueBorder,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[3] }}>
        {initial ? "Editar bodega" : "Nueva bodega"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        <div>
          <label style={labelStyle}>Nombre tienda *</label>
          <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)}
            placeholder="Ej: Tienda Centro" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Codigo bodega SAG *</label>
          <input type="text" value={sagWarehouseCode} onChange={e => setSagWarehouseCode(e.target.value)}
            placeholder="Ej: BOD-T01" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <div>
            <label style={labelStyle}>Ciudad</label>
            <input type="text" value={city} onChange={e => setCity(e.target.value)}
              placeholder="Ej: Bogota" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Responsable</label>
            <input type="text" value={responsibleName} onChange={e => setResponsibleName(e.target.value)}
              placeholder="Ej: Maria Lopez" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={storeType} onChange={e => setStoreType(e.target.value as WarehouseConfig["storeType"])}
              style={inputStyle}>
              <option value="tienda">Tienda</option>
              <option value="outlet">Outlet</option>
              <option value="punto_venta">Punto de venta</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2], paddingTop: S[3] }}>
            <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, display: "flex", alignItems: "center", gap: S[1], cursor: "pointer" }}>
              <input type="checkbox" checked={isMainWarehouse} onChange={e => setIsMainWarehouse(e.target.checked)} />
              Bodega principal
            </label>
            <label style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, display: "flex", alignItems: "center", gap: S[1], cursor: "pointer" }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Activa
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: S[2], marginTop: S[4] }}>
        <button
          onClick={() => {
            if (!canSave) return;
            onSave({ storeName: storeName.trim(), sagWarehouseCode: sagWarehouseCode.trim(), city, responsibleName, storeType, isMainWarehouse, active });
          }}
          disabled={!canSave}
          className="ag-action-primary"
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.white, background: canSave ? C.blueDark : C.inkFaint,
            border: "none", borderRadius: R.sm,
            padding: `${S[1]}px ${S[3]}px`, cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          Guardar
        </button>
        <button onClick={onCancel} className="ag-action-ghost" style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
          background: "transparent", border: `1px solid ${C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>{value}</div>
    </div>
  );
}

function StubButton({ label }: { label: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <button onClick={() => setClicked(true)} className="ag-action-secondary" style={{
      fontFamily: T.mono, fontSize: T.sz.xs,
      color: clicked ? C.inkLight : C.blueDark,
      background: clicked ? C.surface : C.blueLight,
      border: `1px solid ${clicked ? C.line : C.blueBorder}`,
      borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
      cursor: clicked ? "default" : "pointer",
    }}>
      {clicked ? "Accion preparada para integracion SAG." : label}
    </button>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}
