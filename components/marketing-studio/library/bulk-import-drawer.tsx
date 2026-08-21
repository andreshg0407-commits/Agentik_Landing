/**
 * components/marketing-studio/library/bulk-import-drawer.tsx
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-F-R1 — Bulk Import Drawer
 *
 * 5-step stepper flow:
 *   1. Connection — verify/initiate Google Drive OAuth
 *   2. Root       — admin selects tenant root folder via visual picker
 *   3. Folders    — browse and multi-select folder(s) to scan within root
 *   4. Scan       — paginated BFS scan with server-side analysis
 *   5. Results    — KPIs + filterable table + CSV/JSON download
 *
 * States: DISCONNECTED → CONNECTING → CONNECTED_NO_ROOT → READY →
 *         TOKEN_EXPIRED → RECONNECT_REQUIRED → ERROR
 *
 * ZERO WRITES to assets/products/R2.
 * Allowed writes: OAuth connection config, tenantRoot config only.
 * Import CTA permanently disabled — assetIngestionAllowed=false.
 */

"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { C, T, S, R, E }   from "@/lib/ui/tokens";
import { MS_CTA }           from "@/lib/marketing-studio/ms-design-system";
import type {
  DryRunResult,
  DryRunSummary,
  DryRunFileDetail,
  DryRunStatus,
  AssetTypeClassification,
  ScanPageResult,
  DryRunCompleteness,
} from "@/lib/marketing-studio/bulk-import/drive-dry-run-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawerStep =
  | "connection"   // step 1: verify/initiate Drive OAuth
  | "root"         // step 2: admin selects tenant root folder
  | "folders"      // step 3: browse & pick folder(s) to scan
  | "scanning"     // step 4: paginated scan in progress
  | "results";     // step 5: dry-run complete

type ConnectionState =
  | "CHECKING"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED_NO_ROOT"
  | "READY"
  | "TOKEN_EXPIRED"
  | "ERROR";

interface DriveStatusResponse {
  connected:            boolean;
  tenantRootConfigured: boolean;
  tenantRootFolderName: string | null;
  tenantRootFolderId:   string | null;
  accountEmail:         string | null;
}

interface BrowseFolder {
  id:   string;
  name: string;
}

interface BrowseBreadcrumb {
  id:   string;
  name: string;
}

interface BrowseResponse {
  folderId:      string;
  folderName:    string;
  folders:       BrowseFolder[];
  fileCount:     number;
  nextPageToken: string | null;
  breadcrumb:    BrowseBreadcrumb[];
  mode?:         string;
}

interface BulkImportDrawerProps {
  orgSlug:        string;
  organizationId: string;
  onClose:        () => void;
}

/** BFS queue item for folder scanning */
interface FolderQueueItem {
  id:        string;
  name:      string;
  path:      string;
  pageToken: string | null;
}

// ── Status labels ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DryRunStatus, { label: string; color: string }> = {
  READY:              { label: "Listo para importar", color: C.green  },
  DUPLICATE_DRIVE_FILE: { label: "Duplicado (Drive ID)", color: C.amber },
  DUPLICATE_CHECKSUM: { label: "Duplicado (checksum)", color: C.amber },
  UNSUPPORTED_MIME:   { label: "Tipo no soportado",   color: C.red   },
  FILE_TOO_LARGE:     { label: "Demasiado grande",    color: C.red   },
  NO_REF_EXTRACTED:   { label: "Sin referencia",      color: C.red   },
  REF_NOT_FOUND:      { label: "Ref. no encontrada",  color: C.red   },
  AMBIGUOUS_REF:      { label: "Ref. ambigua",        color: C.amber },
  PRODUCT_NOT_ACTIVE: { label: "Producto inactivo",   color: C.red   },
  HERO_ALREADY_EXISTS:{ label: "Hero ya existe",      color: C.amber },
  GOOGLE_NATIVE_SKIP: { label: "Google Docs (skip)",  color: C.inkFaint },
  HIDDEN_FILE:        { label: "Archivo oculto",      color: C.inkFaint },
  OUTSIDE_TENANT_ROOT:{ label: "Fuera del root",      color: C.red   },
  PERMISSION_DENIED:  { label: "Sin permisos",        color: C.red   },
  STALE_DRIVE_FILE:   { label: "Pendiente revalidar", color: C.amber },
};

const ASSET_TYPE_LABELS: Record<AssetTypeClassification, string> = {
  FOTO:          "Foto",
  VIDEO:         "Video",
  BANNER_PIEZA:  "Banner/Pieza",
  UNSUPPORTED:   "No soportado",
};

const STEPPER_LABELS = [
  { key: "connection", label: "Conexion" },
  { key: "root",       label: "Root" },
  { key: "folders",    label: "Carpetas" },
  { key: "scanning",   label: "Escaneo" },
  { key: "results",    label: "Resultados" },
] as const;

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkImportDrawer({
  orgSlug, organizationId, onClose,
}: BulkImportDrawerProps) {
  const [step, setStep]                       = useState<DrawerStep>("connection");
  const [connState, setConnState]             = useState<ConnectionState>("CHECKING");
  const [driveStatus, setDriveStatus]         = useState<DriveStatusResponse | null>(null);
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);
  const [dryRunResult, setDryRunResult]       = useState<(DryRunResult & { completeness?: DryRunCompleteness }) | null>(null);

  // Root folder picker (admin-browse)
  const [rootBrowseFolders, setRootBrowseFolders]     = useState<BrowseFolder[]>([]);
  const [rootBrowseBreadcrumb, setRootBrowseBreadcrumb] = useState<BrowseBreadcrumb[]>([]);
  const [rootBrowseLoading, setRootBrowseLoading]     = useState(false);
  const [rootBrowseMode, setRootBrowseMode]           = useState<"my-drive" | "shared-drives">("my-drive");
  const [rootSelectedId, setRootSelectedId]           = useState<string | null>(null);
  const [rootSelectedName, setRootSelectedName]       = useState("");
  const [rootSettingInProgress, setRootSettingInProgress] = useState(false);
  const [rootShowAdvanced, setRootShowAdvanced]       = useState(false);
  const [rootFolderUrl, setRootFolderUrl]             = useState("");

  // Folder picker (within tenant root) — multi-select
  const [browseFolders, setBrowseFolders]     = useState<BrowseFolder[]>([]);
  const [browseBreadcrumb, setBrowseBreadcrumb] = useState<BrowseBreadcrumb[]>([]);
  const [browseFileCount, setBrowseFileCount] = useState(0);
  const [browseLoading, setBrowseLoading]     = useState(false);
  const [browseFolderId, setBrowseFolderId]   = useState<string | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Map<string, string>>(new Map()); // id → name

  // Scan progress state
  const [scanFoldersDone, setScanFoldersDone]   = useState(0);
  const [scanFilesDone, setScanFilesDone]       = useState(0);
  const [scanPagesDone, setScanPagesDone]       = useState(0);
  const [scanCurrentFolder, setScanCurrentFolder] = useState("");
  const [scanErrors, setScanErrors]             = useState<string[]>([]);

  // Cancel ref
  const cancelledRef = useRef(false);

  // Filters for results table
  const [filterStatus, setFilterStatus]     = useState<DryRunStatus | "ALL">("ALL");
  const [filterType, setFilterType]         = useState<AssetTypeClassification | "ALL">("ALL");
  const [filterSearch, setFilterSearch]     = useState("");

  // ── Step 1: Check Drive status ──
  const checkDriveStatus = useCallback(async () => {
    setConnState("CHECKING");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?action=status`);
      if (!res.ok) {
        setErrorMsg("No se pudo verificar la conexion con Drive");
        setConnState("ERROR");
        return;
      }
      const data: DriveStatusResponse = await res.json();
      setDriveStatus(data);

      if (!data.connected) {
        setConnState("DISCONNECTED");
        return;
      }
      if (!data.tenantRootConfigured) {
        setConnState("CONNECTED_NO_ROOT");
        return;
      }
      setConnState("READY");
    } catch {
      setErrorMsg("Error de red al verificar conexion Drive");
      setConnState("ERROR");
    }
  }, [orgSlug]);

  // Auto-check on mount
  useEffect(() => {
    checkDriveStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance based on connection state
  useEffect(() => {
    if (connState === "READY" && step === "connection") {
      setStep("folders");
    } else if (connState === "CONNECTED_NO_ROOT" && step === "connection") {
      setStep("root");
    }
  }, [connState, step]);

  // ── Connect to Google Drive ──
  const connectDrive = useCallback(() => {
    setConnState("CONNECTING");
    window.location.href = `/api/integrations/google-drive/connect?orgSlug=${encodeURIComponent(orgSlug)}`;
  }, [orgSlug]);

  // ── Admin-browse for root selection (04A-F-R1) ──
  const adminBrowseFolder = useCallback(async (folderId?: string, mode?: "my-drive" | "shared-drives") => {
    setRootBrowseLoading(true);
    const browseMode = mode ?? rootBrowseMode;
    try {
      const params = new URLSearchParams({ action: "admin-browse", mode: browseMode });
      if (folderId && folderId !== "root") params.set("folderId", folderId);
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setErrorMsg(body.error ?? "Error al navegar carpetas");
        setRootBrowseLoading(false);
        return;
      }
      const data: BrowseResponse = await res.json();
      setRootBrowseFolders(data.folders);
      setRootBrowseBreadcrumb(data.breadcrumb);
      setRootBrowseLoading(false);
    } catch {
      setErrorMsg("Error de red al navegar carpetas");
      setRootBrowseLoading(false);
    }
  }, [orgSlug, rootBrowseMode]);

  // Auto-browse My Drive when entering root step
  useEffect(() => {
    if (step === "root" && rootBrowseFolders.length === 0 && !rootBrowseLoading && connState === "CONNECTED_NO_ROOT") {
      adminBrowseFolder(undefined, "my-drive");
    }
  }, [step, connState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Set root folder (visual selection or advanced URL) ──
  const setRootFolder = useCallback(async (folderId: string) => {
    if (!folderId.trim()) return;
    setRootSettingInProgress(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive/set-root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setErrorMsg(body.error ?? body.message ?? "Error al configurar root");
        setRootSettingInProgress(false);
        return;
      }
      await checkDriveStatus();
      setRootSettingInProgress(false);
      setStep("folders");
    } catch {
      setErrorMsg("Error de red al configurar root folder");
      setRootSettingInProgress(false);
    }
  }, [orgSlug, checkDriveStatus]);

  // ── Browse folders within tenant root ──
  const browseDriveFolder = useCallback(async (folderId?: string) => {
    setBrowseLoading(true);
    try {
      const params = new URLSearchParams({ action: "browse" });
      if (folderId) params.set("folderId", folderId);
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setErrorMsg(body.error ?? "Error al navegar carpetas");
        setBrowseLoading(false);
        return;
      }
      const data: BrowseResponse = await res.json();
      setBrowseFolders(data.folders);
      setBrowseBreadcrumb(data.breadcrumb);
      setBrowseFileCount(data.fileCount);
      setBrowseFolderId(data.folderId);
      setBrowseLoading(false);
    } catch {
      setErrorMsg("Error de red al navegar carpetas");
      setBrowseLoading(false);
    }
  }, [orgSlug]);

  // Auto-browse root when entering folders step
  useEffect(() => {
    if (step === "folders" && browseFolders.length === 0 && !browseLoading) {
      browseDriveFolder();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Multi-select folder toggling ──
  const toggleFolderSelection = useCallback((folderId: string, folderName: string) => {
    setSelectedFolderIds(prev => {
      const next = new Map(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.set(folderId, folderName);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFolderIds(new Map());
  }, []);

  // ── Hierarchical deduplication (04A-F-R2) ──
  // Uses deduplicateFolderSelection from folder-dedup module.
  // Resolves: same ID twice → one, parent + child → only parent,
  // two siblings → both, root + descendants → only root, external → reject.
  const deduplicateHierarchical = useCallback(async (
    folders: { id: string; name: string }[],
  ): Promise<{ dedupedFolders: { id: string; name: string }[]; rejected: string[] }> => {
    const { deduplicateFolderSelection } = await import(
      "@/lib/marketing-studio/bulk-import/folder-dedup"
    );
    const result = await deduplicateFolderSelection(folders, async (folderIds) => {
      try {
        const params = new URLSearchParams({
          action: "validate-ancestry",
          folderIds: folderIds.join(","),
        });
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/drive?${params.toString()}`
        );
        if (!res.ok) return folderIds.map(id => ({ folderId: id, valid: true, ancestors: [id] }));
        const data = await res.json() as {
          results: { folderId: string; valid: boolean; ancestors: string[] }[];
        };
        return data.results;
      } catch {
        return folderIds.map(id => ({ folderId: id, valid: true, ancestors: [id] }));
      }
    });
    return { dedupedFolders: result.folders, rejected: result.rejected };
  }, [orgSlug]);

  // ── Paginated BFS scan with server-side analysis (04A-D) ──
  const runPaginatedScan = useCallback(async () => {
    // Determine folders to scan: selected folders, or current browse folder, or root
    let foldersToScan: { id: string; name: string }[] = [];
    if (selectedFolderIds.size > 0) {
      foldersToScan = Array.from(selectedFolderIds.entries()).map(([id, name]) => ({ id, name }));
    } else if (browseFolderId) {
      const name = browseBreadcrumb[browseBreadcrumb.length - 1]?.name ?? "(root)";
      foldersToScan = [{ id: browseFolderId, name }];
    }
    if (foldersToScan.length === 0) return;

    // Hierarchical dedup: ID dedup + ancestry validation + parent/child pruning
    const { dedupedFolders, rejected } = await deduplicateHierarchical(foldersToScan);
    foldersToScan = dedupedFolders;
    if (rejected.length > 0) {
      setErrorMsg(`${rejected.length} carpeta(s) rechazadas: fuera del tenant root.`);
    }
    if (foldersToScan.length === 0) return;

    cancelledRef.current = false;
    setStep("scanning");
    setErrorMsg(null);
    setScanFoldersDone(0);
    setScanFilesDone(0);
    setScanPagesDone(0);
    setScanCurrentFolder("(root)");
    setScanErrors([]);

    const accumulatedFiles: DryRunFileDetail[] = [];
    const seenFileIds = new Set<string>();
    const allErrors: string[] = [];
    let totalFoldersProcessed = 0;
    let truncated = false;

    // Initialize BFS queue with all selected folders
    const queue: FolderQueueItem[] = foldersToScan.map(f => ({
      id: f.id, name: f.name, path: "", pageToken: null,
    }));

    try {
      while (queue.length > 0) {
        if (cancelledRef.current) { truncated = true; break; }

        const current = queue[0];
        setScanCurrentFolder(current.path || current.name);

        const params = new URLSearchParams({
          action:     "scan-page",
          folderId:   current.id,
          folderPath: current.path,
          folderName: current.name,
        });
        if (current.pageToken) params.set("pageToken", current.pageToken);

        const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?${params.toString()}`);

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const errCode = body.error ?? `HTTP ${res.status}`;
          if (errCode === "OUTSIDE_TENANT_ROOT") {
            setErrorMsg("Carpeta sustituida — fuera del tenant root configurado.");
            setStep("folders");
            return;
          }
          allErrors.push(`${current.path || "(root)"}: ${errCode}`);
          queue.shift();
          truncated = true;
          continue;
        }

        const page: ScanPageResult = await res.json();
        setScanPagesDone(prev => prev + 1);

        for (const f of page.analyzedFiles) {
          if (!seenFileIds.has(f.driveFileId)) {
            seenFileIds.add(f.driveFileId);
            accumulatedFiles.push(f);
          }
        }
        setScanFilesDone(accumulatedFiles.length);

        if (page.errors.length > 0) {
          allErrors.push(...page.errors);
          setScanErrors([...allErrors]);
          truncated = true;
        }
        if (page.truncated) truncated = true;

        if (page.nextPageToken) {
          queue[0] = { ...current, pageToken: page.nextPageToken };
        } else {
          queue.shift();
          totalFoldersProcessed++;
          setScanFoldersDone(totalFoldersProcessed);
        }

        for (const child of page.childFolderIds) {
          queue.push({ id: child.id, name: child.name, path: child.path, pageToken: null });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red";
      allErrors.push(msg);
      truncated = true;
    }

    if (cancelledRef.current) truncated = true;
    const complete = !truncated && queue.length === 0 && allErrors.length === 0;

    if (accumulatedFiles.length === 0 && complete) {
      setErrorMsg("No se encontraron archivos en la(s) carpeta(s) seleccionada(s).");
      setStep("folders");
      return;
    }

    const completeness: DryRunCompleteness = {
      complete, truncated,
      scannedFiles:   accumulatedFiles.length,
      scannedFolders: totalFoldersProcessed,
      errors:         allErrors,
    };

    const summary = buildClientSummary(accumulatedFiles, totalFoldersProcessed, allErrors);
    const dryRunResultLocal: DryRunResult & { completeness?: DryRunCompleteness } = {
      zeroWrites:     true,
      tenantRootId:   "server-scoped",
      tenantRootName: driveStatus?.tenantRootFolderName ?? "—",
      summary,
      files:          accumulatedFiles,
      analyzedAt:     new Date().toISOString(),
      organizationId,
      completeness,
    };

    setDryRunResult(dryRunResultLocal);
    setStep("results");
  }, [orgSlug, selectedFolderIds, browseFolderId, browseBreadcrumb, organizationId, driveStatus, deduplicateHierarchical]);

  // ── Cancel scan ──
  const cancelScan = useCallback(() => { cancelledRef.current = true; }, []);

  // ── Filtered files for results table ──
  const filteredFiles = useMemo(() => {
    if (!dryRunResult) return [];
    let files = dryRunResult.files;
    if (filterStatus !== "ALL") files = files.filter(f => f.status === filterStatus);
    if (filterType !== "ALL")   files = files.filter(f => f.assetType === filterType);
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      files = files.filter(f =>
        f.fileName.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q) ||
        (f.extractedRef?.toLowerCase().includes(q) ?? false) ||
        (f.matchedSku?.toLowerCase().includes(q) ?? false)
      );
    }
    return files;
  }, [dryRunResult, filterStatus, filterType, filterSearch]);

  // ── CSV download ──
  const downloadCSV = useCallback(() => {
    if (!dryRunResult) return;
    const comp = dryRunResult.completeness;
    const meta = `# complete=${comp?.complete ?? "unknown"},truncated=${comp?.truncated ?? "unknown"},scannedFiles=${comp?.scannedFiles ?? "—"},scannedFolders=${comp?.scannedFolders ?? "—"},errors=${(comp?.errors ?? []).length}\n`;
    const headers = ["Ruta", "Archivo", "Referencia", "Tipo", "Rol", "Estado", "Motivo", "Accion"];
    const rows = dryRunResult.files.map(f => [
      f.path, f.fileName, f.extractedRef ?? "", f.assetType,
      f.suggestedRole, f.status, f.reason ?? "", f.action,
    ]);
    const csv = meta + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dry-run-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dryRunResult]);

  // ── JSON download ──
  const downloadJSON = useCallback(() => {
    if (!dryRunResult) return;
    const blob = new Blob([JSON.stringify(dryRunResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dry-run-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dryRunResult]);

  // ── Completeness state ──
  const completeness = dryRunResult?.completeness as DryRunCompleteness | undefined;
  const isComplete  = completeness?.complete === true;
  const isTruncated = completeness?.truncated === true || (completeness && !completeness.complete);

  const isBlocking = step === "scanning";

  // ── Render ──
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", flexDirection: "column" as const,
    }}>
      {/* Backdrop */}
      <div
        onClick={!isBlocking ? onClose : undefined}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }}
      />

      {/* Panel */}
      <div style={{
        position: "relative",
        margin: "24px auto",
        width: "min(1120px, calc(100vw - 48px))",
        maxHeight: "calc(100vh - 48px)",
        background: C.white,
        borderRadius: R.lg,
        boxShadow: E.lg,
        display: "flex",
        flexDirection: "column" as const,
        overflow: "hidden",
      }}>
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[4]}px ${S[5]}px`,
          borderBottom: `1px solid ${C.line}`,
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink,
            }}>
              Importar lote desde Drive
            </div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2,
            }}>
              04A-F-R1 · Zero writes · Dry-run only
            </div>
          </div>
          <button
            onClick={!isBlocking ? onClose : undefined}
            disabled={isBlocking}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
              background: "none", border: "none",
              cursor: isBlocking ? "not-allowed" : "pointer",
              padding: S[2],
            }}
          >✕</button>
        </div>

        {/* ── Stepper ── */}
        <div style={{
          display: "flex", gap: 0, padding: `0 ${S[5]}px`,
          borderBottom: `1px solid ${C.line}`, background: C.surface, flexShrink: 0,
        }}>
          {STEPPER_LABELS.map((s, i) => {
            const stepIdx = STEPPER_LABELS.findIndex(sl => sl.key === step);
            const isActive  = s.key === step;
            const isDone    = i < stepIdx;
            return (
              <div key={s.key} style={{
                flex: 1, padding: `${S[3]}px 0`,
                textAlign: "center" as const,
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: isActive ? 700 : 500,
                color: isActive ? C.blueDark : isDone ? C.green : C.inkFaint,
                borderBottom: isActive ? `2px solid ${C.blueDark}` : isDone ? `2px solid ${C.green}` : "2px solid transparent",
              }}>
                <span style={{
                  display: "inline-block", width: 18, height: 18, lineHeight: "18px",
                  borderRadius: "50%", fontSize: 10, fontWeight: 700, marginRight: 4,
                  background: isActive ? C.blueDark : isDone ? C.green : C.line,
                  color: isActive || isDone ? C.white : C.inkFaint,
                }}>{isDone ? "✓" : i + 1}</span>
                {s.label}
              </div>
            );
          })}
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, overflow: "auto", padding: `${S[5]}px` }}>

          {/* ── Step 1: Connection ── */}
          {step === "connection" && (
            <div>
              {connState === "CHECKING" && (
                <StepMessage icon="⟳" title="Verificando conexion con Google Drive..."
                  detail="Comprobando integracion y root folder configurado." />
              )}

              {connState === "DISCONNECTED" && (
                <StepMessage icon="◎" title="Google Drive no conectado"
                  detail="Conecta tu cuenta de Google para acceder a las carpetas de producto.">
                  <div style={{ marginTop: S[4] }}>
                    <button onClick={connectDrive} style={primaryBtnStyle}>
                      Conectar cuenta de Google
                    </button>
                  </div>
                  <div style={{
                    marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                  }}>
                    Permisos: solo lectura (drive.readonly). No se modificaran archivos en tu Drive.
                  </div>
                </StepMessage>
              )}

              {connState === "CONNECTING" && (
                <StepMessage icon="⟳" title="Redirigiendo a Google..."
                  detail="Acepta los permisos en la ventana de Google para continuar." />
              )}

              {connState === "TOKEN_EXPIRED" && (
                <StepMessage icon="⚠" title="Sesion expirada" detail="La sesion de Google Drive ha expirado. Reconecta para continuar." color={C.amber}>
                  <div style={{ marginTop: S[4] }}>
                    <button onClick={connectDrive} style={primaryBtnStyle}>Reconectar</button>
                  </div>
                </StepMessage>
              )}

              {connState === "ERROR" && (
                <StepMessage icon="✕" title="Error de conexion" detail={errorMsg ?? "Error desconocido"} color={C.red}>
                  <div style={{ display: "flex", gap: S[2], marginTop: S[4], justifyContent: "center" }}>
                    <button onClick={() => checkDriveStatus()} style={secondaryBtnStyle}>Reintentar</button>
                    <button onClick={onClose} style={secondaryBtnStyle}>Cerrar</button>
                  </div>
                </StepMessage>
              )}
            </div>
          )}

          {/* ── Step 2: Root (visual picker + advanced URL input) ── */}
          {step === "root" && (
            <div>
              <StepMessage icon="⚙" title="Seleccionar carpeta raiz"
                detail={`Cuenta: ${driveStatus?.accountEmail ?? "—"}. Navega y selecciona la carpeta principal.`} />

              {/* Tab: My Drive / Shared Drives */}
              <div style={{
                display: "flex", gap: S[2], marginBottom: S[3], justifyContent: "center",
              }}>
                <button
                  onClick={() => { setRootBrowseMode("my-drive"); adminBrowseFolder(undefined, "my-drive"); }}
                  style={{
                    ...secondaryBtnStyle,
                    fontWeight: rootBrowseMode === "my-drive" ? 700 : 500,
                    color: rootBrowseMode === "my-drive" ? C.blueDark : C.inkMid,
                    borderColor: rootBrowseMode === "my-drive" ? C.blueDark : C.line,
                  }}
                >Mi Drive</button>
                <button
                  onClick={() => { setRootBrowseMode("shared-drives"); adminBrowseFolder(undefined, "shared-drives"); }}
                  style={{
                    ...secondaryBtnStyle,
                    fontWeight: rootBrowseMode === "shared-drives" ? 700 : 500,
                    color: rootBrowseMode === "shared-drives" ? C.blueDark : C.inkMid,
                    borderColor: rootBrowseMode === "shared-drives" ? C.blueDark : C.line,
                  }}
                >Shared Drives</button>
              </div>

              {/* Breadcrumb */}
              {rootBrowseBreadcrumb.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, marginBottom: S[3],
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                  flexWrap: "wrap" as const,
                }}>
                  {rootBrowseBreadcrumb.map((bc, i) => (
                    <span key={bc.id + i}>
                      {i > 0 && <span style={{ margin: "0 2px", color: C.inkFaint }}>/</span>}
                      <button
                        onClick={() => adminBrowseFolder(bc.id === "shared-drives" ? undefined : bc.id, bc.id === "shared-drives" ? "shared-drives" : rootBrowseMode)}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: i === rootBrowseBreadcrumb.length - 1 ? C.ink : C.blueDark,
                          fontWeight: i === rootBrowseBreadcrumb.length - 1 ? 700 : 500,
                          background: "none", border: "none", cursor: "pointer",
                          padding: "2px 4px", borderRadius: R.sm,
                        }}
                      >{bc.name}</button>
                    </span>
                  ))}
                </div>
              )}

              {rootBrowseLoading ? (
                <StepMessage icon="⟳" title="Cargando carpetas..." detail="" />
              ) : (
                <div>
                  <FolderList
                    folders={rootBrowseFolders}
                    selectedId={rootSelectedId}
                    onSelect={(id, name) => { setRootSelectedId(id); setRootSelectedName(name); }}
                    onNavigate={(id) => adminBrowseFolder(id)}
                    emptyMessage="No hay carpetas en esta ubicacion."
                  />

                  {/* Confirm root selection */}
                  {rootSelectedId && (
                    <div style={{
                      marginTop: S[4], display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: S[3],
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                        <span style={{ fontWeight: 600 }}>Seleccionada:</span> {rootSelectedName}
                      </div>
                      <button
                        onClick={() => setRootFolder(rootSelectedId)}
                        disabled={rootSettingInProgress}
                        style={{
                          ...primaryBtnStyle,
                          opacity: rootSettingInProgress ? 0.5 : 1,
                          cursor: rootSettingInProgress ? "not-allowed" : "pointer",
                        }}
                      >{rootSettingInProgress ? "Validando..." : "Confirmar como root"}</button>
                    </div>
                  )}
                </div>
              )}

              {/* Advanced: URL input */}
              <div style={{ marginTop: S[5], borderTop: `1px solid ${C.line}`, paddingTop: S[3] }}>
                <button
                  onClick={() => setRootShowAdvanced(!rootShowAdvanced)}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    background: "none", border: "none", cursor: "pointer",
                  }}
                >{rootShowAdvanced ? "▼" : "▶"} Opcion avanzada: ingresar URL o ID manualmente</button>
                {rootShowAdvanced && (
                  <div style={{ marginTop: S[2], display: "flex", gap: S[2] }}>
                    <input
                      type="text" value={rootFolderUrl}
                      onChange={e => setRootFolderUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/... o folder ID"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => setRootFolder(rootFolderUrl)}
                      disabled={!rootFolderUrl.trim() || rootSettingInProgress}
                      style={{
                        ...primaryBtnStyle,
                        opacity: !rootFolderUrl.trim() || rootSettingInProgress ? 0.5 : 1,
                        cursor: !rootFolderUrl.trim() || rootSettingInProgress ? "not-allowed" : "pointer",
                      }}
                    >{rootSettingInProgress ? "Validando..." : "Guardar root"}</button>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div style={{
                  marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                }}>{errorMsg}</div>
              )}
            </div>
          )}

          {/* ── Step 3: Folders (multi-select within tenant root) ── */}
          {step === "folders" && (
            <div>
              {/* Connection info strip */}
              <div style={{
                display: "flex", alignItems: "center", gap: S[3],
                padding: `${S[2]}px ${S[3]}px`, marginBottom: S[4],
                background: C.greenLight, border: `1px solid ${C.greenBorder}`,
                borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"],
              }}>
                <span style={{ color: C.green, fontWeight: 700 }}>● Conectado</span>
                <span style={{ color: C.inkMid }}>{driveStatus?.accountEmail ?? "—"}</span>
                <span style={{ color: C.inkFaint }}>Root: {driveStatus?.tenantRootFolderName ?? "—"}</span>
              </div>

              {/* Breadcrumb */}
              {browseBreadcrumb.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 4, marginBottom: S[3],
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                  flexWrap: "wrap" as const,
                }}>
                  {browseBreadcrumb.map((bc, i) => (
                    <span key={bc.id}>
                      {i > 0 && <span style={{ margin: "0 2px", color: C.inkFaint }}>/</span>}
                      <button
                        onClick={() => browseDriveFolder(bc.id)}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"],
                          color: i === browseBreadcrumb.length - 1 ? C.ink : C.blueDark,
                          fontWeight: i === browseBreadcrumb.length - 1 ? 700 : 500,
                          background: "none", border: "none", cursor: "pointer",
                          padding: "2px 4px", borderRadius: R.sm,
                        }}
                      >{bc.name}</button>
                    </span>
                  ))}
                </div>
              )}

              {browseLoading ? (
                <StepMessage icon="⟳" title="Cargando carpetas..." detail="" />
              ) : (
                <div>
                  {/* Folder list with multi-select */}
                  <div style={{
                    border: `1px solid ${C.line}`, borderRadius: R.md,
                    maxHeight: 320, overflow: "auto",
                  }}>
                    {browseFolders.length === 0 && (
                      <div style={{
                        padding: S[5], textAlign: "center" as const,
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                      }}>
                        No hay subcarpetas en esta ubicacion.
                        {browseFileCount > 0 && ` (${browseFileCount} archivos detectados)`}
                      </div>
                    )}
                    {browseFolders.map(folder => {
                      const isSelected = selectedFolderIds.has(folder.id);
                      return (
                        <div
                          key={folder.id}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: `${S[2]}px ${S[3]}px`,
                            borderBottom: `1px solid ${C.lineSubtle}`,
                            background: isSelected ? `${C.blueDark}0C` : C.white,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleFolderSelection(folder.id, folder.name)}
                              style={{ cursor: "pointer" }}
                            />
                            <span style={{ fontSize: 14 }}>📁</span>
                            <span
                              onClick={() => toggleFolderSelection(folder.id, folder.name)}
                              style={{
                                fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                                fontWeight: isSelected ? 700 : 400, cursor: "pointer",
                              }}
                            >{folder.name}</span>
                          </div>
                          <button
                            onClick={() => browseDriveFolder(folder.id)}
                            title="Abrir carpeta"
                            style={{
                              fontFamily: T.mono, fontSize: 10, color: C.blueDark,
                              background: "none", border: `1px solid ${C.line}`,
                              borderRadius: R.sm, padding: "2px 6px", cursor: "pointer",
                            }}
                          >→</button>
                        </div>
                      );
                    })}
                  </div>

                  {/* File count */}
                  {browseFileCount > 0 && (
                    <div style={{
                      marginTop: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    }}>
                      {browseFileCount} archivo(s) en esta carpeta
                    </div>
                  )}

                  {/* Selection summary + scan */}
                  <div style={{
                    marginTop: S[4], display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: S[3], flexWrap: "wrap" as const,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                      {selectedFolderIds.size > 0
                        ? <>
                            <span style={{ fontWeight: 600 }}>{selectedFolderIds.size} carpeta(s) seleccionada(s):</span>{" "}
                            {Array.from(selectedFolderIds.values()).join(", ")}
                            <button onClick={clearSelection} style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                              background: "none", border: "none", cursor: "pointer", marginLeft: S[2],
                            }}>Limpiar</button>
                          </>
                        : <span style={{ color: C.inkFaint }}>
                            Sin seleccion: se escaneara {browseBreadcrumb[browseBreadcrumb.length - 1]?.name ?? "root"} completa
                          </span>
                      }
                    </div>
                    <button
                      onClick={runPaginatedScan}
                      style={primaryBtnStyle}
                    >
                      Escanear {selectedFolderIds.size > 0 ? `${selectedFolderIds.size} carpeta(s)` : "carpeta actual"}
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div style={{
                  marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                }}>{errorMsg}</div>
              )}
            </div>
          )}

          {/* ── Step 4: Scanning ── */}
          {step === "scanning" && (
            <div style={{ padding: "24px 0" }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                color: C.ink, marginBottom: S[4], textAlign: "center" as const,
              }}>Escaneando Drive...</div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: S[3], marginBottom: S[4],
              }}>
                <ProgressKpi label="Carpetas" value={scanFoldersDone} />
                <ProgressKpi label="Archivos" value={scanFilesDone} />
                <ProgressKpi label="Paginas" value={scanPagesDone} />
                <ProgressKpi label="Errores" value={scanErrors.length} color={scanErrors.length > 0 ? C.red : undefined} />
              </div>

              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                textAlign: "center" as const, marginBottom: S[4],
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                Carpeta actual: {scanCurrentFolder}
              </div>

              <div style={{ textAlign: "center" as const }}>
                <button onClick={cancelScan} style={{
                  ...secondaryBtnStyle, color: C.red, borderColor: C.redBorder,
                }}>Cancelar escaneo</button>
              </div>

              {scanErrors.length > 0 && (
                <div style={{
                  marginTop: S[4], padding: `${S[3]}px ${S[4]}px`,
                  background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
                }}>
                  Errores parciales ({scanErrors.length}):
                  {scanErrors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {scanErrors.length > 5 && <div>... +{scanErrors.length - 5} mas</div>}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Results ── */}
          {step === "results" && dryRunResult && (
            <DryRunResults
              result={dryRunResult}
              completeness={completeness}
              filteredFiles={filteredFiles}
              filterStatus={filterStatus}
              filterType={filterType}
              filterSearch={filterSearch}
              onFilterStatus={setFilterStatus}
              onFilterType={setFilterType}
              onFilterSearch={setFilterSearch}
              onDownloadCSV={downloadCSV}
              onDownloadJSON={downloadJSON}
              onNewScan={() => {
                setDryRunResult(null);
                setSelectedFolderIds(new Map());
                setStep("folders");
              }}
              isComplete={isComplete}
              isTruncated={isTruncated ?? false}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[3]}px ${S[5]}px`,
          borderTop: `1px solid ${C.line}`,
          background: C.surface, flexShrink: 0,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {step === "results" && dryRunResult
              ? `${dryRunResult.summary.totalScanned} archivos · ${dryRunResult.summary.readyToImport} listos · ${dryRunResult.summary.rejected} rechazados · ${isComplete ? "complete" : "incomplete"}`
              : step === "scanning"
                ? `Escaneando... ${scanFilesDone} archivos · ${scanFoldersDone} carpetas`
                : "Dry-run only — zero writes"
            }
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
            {step === "results" && (
              <button
                disabled
                title="Importación todavía bloqueada — assetIngestionAllowed=false"
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  color: C.inkFaint, background: C.surface,
                  border: `1px solid ${C.line}`, borderRadius: R.md,
                  padding: `${S[2]}px ${S[4]}px`,
                  cursor: "not-allowed", opacity: 0.6,
                }}
              >
                Importación todavía bloqueada
              </button>
            )}
            {!isBlocking && (
              <button onClick={onClose} style={secondaryBtnStyle}>Cerrar</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FolderList ──────────────────────────────────────────────────────────────

function FolderList({
  folders, selectedId, onSelect, onNavigate, emptyMessage,
}: {
  folders:      { id: string; name: string }[];
  selectedId:   string | null;
  onSelect:     (id: string, name: string) => void;
  onNavigate:   (id: string) => void;
  emptyMessage: string;
}) {
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.md,
      maxHeight: 300, overflow: "auto",
    }}>
      {folders.length === 0 && (
        <div style={{
          padding: S[5], textAlign: "center" as const,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        }}>{emptyMessage}</div>
      )}
      {folders.map(folder => (
        <div
          key={folder.id}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: `${S[2]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.lineSubtle}`,
            background: selectedId === folder.id ? `${C.blueDark}08` : C.white,
            cursor: "pointer",
          }}
          onClick={() => onSelect(folder.id, folder.name)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ fontSize: 14 }}>📁</span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
              fontWeight: selectedId === folder.id ? 700 : 400,
            }}>{folder.name}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(folder.id); }}
            title="Abrir carpeta"
            style={{
              fontFamily: T.mono, fontSize: 10, color: C.blueDark,
              background: "none", border: `1px solid ${C.line}`,
              borderRadius: R.sm, padding: "2px 6px", cursor: "pointer",
            }}
          >→</button>
        </div>
      ))}
    </div>
  );
}

// ── StepMessage ──────────────────────────────────────────────────────────────

function StepMessage({
  icon, title, detail, color, children,
}: {
  icon: string; title: string; detail: string; color?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center" as const, padding: "40px 0" }}>
      <div style={{ fontFamily: T.mono, fontSize: 28, color: color ?? C.inkMid, marginBottom: S[3] }}>{icon}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>{title}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, maxWidth: 480, margin: "0 auto" }}>{detail}</div>
      {children}
    </div>
  );
}

// ── ProgressKpi ──────────────────────────────────────────────────────────────

function ProgressKpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      padding: `${S[3]}px`, background: C.surface,
      border: `1px solid ${C.line}`, borderRadius: R.md,
      textAlign: "center" as const,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 24, fontWeight: 700,
        color: color ?? C.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── DryRunResults ────────────────────────────────────────────────────────────

function DryRunResults({
  result, completeness, filteredFiles,
  filterStatus, filterType, filterSearch,
  onFilterStatus, onFilterType, onFilterSearch,
  onDownloadCSV, onDownloadJSON, onNewScan,
  isComplete, isTruncated,
}: {
  result:         DryRunResult & { completeness?: DryRunCompleteness };
  completeness?:  DryRunCompleteness;
  filteredFiles:  DryRunFileDetail[];
  filterStatus:   DryRunStatus | "ALL";
  filterType:     AssetTypeClassification | "ALL";
  filterSearch:   string;
  onFilterStatus: (v: DryRunStatus | "ALL") => void;
  onFilterType:   (v: AssetTypeClassification | "ALL") => void;
  onFilterSearch: (v: string) => void;
  onDownloadCSV:  () => void;
  onDownloadJSON: () => void;
  onNewScan:      () => void;
  isComplete:     boolean;
  isTruncated:    boolean;
}) {
  const s = result.summary;

  return (
    <div>
      {isTruncated && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.md, marginBottom: S[4],
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 600,
        }}>
          INCOMPLETO (complete=false, truncated=true) — El escaneo NO termino correctamente.
          {completeness?.errors && completeness.errors.length > 0
            ? ` ${completeness.errors.length} error(es) durante el escaneo.`
            : " Puede haber carpetas o paginas sin procesar."
          }
          {" "}No declare este resultado como definitivo. Reinicie el escaneo para resultados completos.
        </div>
      )}
      {isComplete && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          background: C.greenLight, border: `1px solid ${C.greenBorder}`,
          borderRadius: R.md, marginBottom: S[4],
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: 600,
        }}>
          COMPLETO (complete=true) — Todas las paginas consumidas, todas las subcarpetas recorridas,
          cola vacia, sin errores. {completeness?.scannedFolders ?? "—"} carpetas, {completeness?.scannedFiles ?? "—"} archivos.
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: S[3], marginBottom: S[5],
      }}>
        <KpiBox label="Escaneados"   value={s.totalScanned}       color={C.ink} />
        <KpiBox label="Refs. detectadas" value={s.uniqueRefsMatched + s.uniqueRefsUnmatched} color={C.blueDark} />
        <KpiBox label="Coincidencias" value={s.uniqueRefsMatched} color={C.green} />
        <KpiBox label="Ambiguas"      value={s.statusBreakdown.AMBIGUOUS_REF ?? 0} color={C.amber} />
        <KpiBox label="Sin referencia" value={s.statusBreakdown.NO_REF_EXTRACTED ?? 0} color={C.red} />
        <KpiBox label="Duplicados"    value={(s.statusBreakdown.DUPLICATE_DRIVE_FILE ?? 0) + (s.statusBreakdown.DUPLICATE_CHECKSUM ?? 0)} color={C.amber} />
        <KpiBox label="Rechazados"    value={s.rejected}          color={C.red} />
        <KpiBox label="Errores"       value={s.permissionErrors.length} color={C.red} />
      </div>

      <div style={{
        display: "flex", gap: S[3], marginBottom: S[4],
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
      }}>
        <span style={{ fontWeight: 600 }}>Propuesto por tipo:</span>
        <span>Fotos: {s.assetTypeBreakdown.FOTO ?? 0}</span>
        <span>Videos: {s.assetTypeBreakdown.VIDEO ?? 0}</span>
        <span>Banners: {s.assetTypeBreakdown.BANNER_PIEZA ?? 0}</span>
        <span>No soportado: {s.assetTypeBreakdown.UNSUPPORTED ?? 0}</span>
        <span>· Carpetas: {s.totalFolders}</span>
      </div>

      <div style={{
        display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center", flexWrap: "wrap" as const,
      }}>
        <button onClick={onDownloadCSV} style={secondaryBtnStyle}>↓ CSV</button>
        <button onClick={onDownloadJSON} style={secondaryBtnStyle}>↓ JSON</button>
        <button onClick={onNewScan} style={secondaryBtnStyle}>Nuevo escaneo</button>

        <select value={filterStatus} onChange={e => onFilterStatus(e.target.value as DryRunStatus | "ALL")} style={selectStyle}>
          <option value="ALL">Estado: Todos</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <select value={filterType} onChange={e => onFilterType(e.target.value as AssetTypeClassification | "ALL")} style={selectStyle}>
          <option value="ALL">Tipo: Todos</option>
          {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <input type="text" value={filterSearch} onChange={e => onFilterSearch(e.target.value)}
          placeholder="Buscar en resultados..."
          style={{ ...inputStyle, flex: "1 1 160px", minWidth: 120 }} />

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
          {filteredFiles.length} / {result.files.length} archivos
        </span>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "auto", maxHeight: 480 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
          <thead>
            <tr style={{ background: C.surface, position: "sticky" as const, top: 0, zIndex: 1 }}>
              {["Ruta", "Archivo", "Ref.", "Mundo", "Tipo", "Rol", "Estado", "Motivo", "Accion"].map(h => (
                <th key={h} style={{
                  padding: `${S[2]}px ${S[2]}px`, textAlign: "left" as const,
                  fontWeight: 600, color: C.inkMid, borderBottom: `1px solid ${C.line}`,
                  whiteSpace: "nowrap" as const,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: S[5], textAlign: "center" as const, color: C.inkFaint }}>Sin archivos para este filtro</td></tr>
            ) : (
              filteredFiles.map((f, i) => {
                const statusInfo = STATUS_LABELS[f.status];
                return (
                  <tr key={f.driveFileId + i} style={{
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    background: i % 2 === 0 ? C.white : C.surface,
                  }}>
                    <td style={cellStyle} title={f.path}>
                      <span style={{ maxWidth: 180, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.path}</span>
                    </td>
                    <td style={cellStyle} title={f.fileName}>
                      <span style={{ maxWidth: 160, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.fileName}</span>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{f.extractedRef ?? "—"}</td>
                    <td style={cellStyle}>{f.parentFolderName || "—"}</td>
                    <td style={cellStyle}>{ASSET_TYPE_LABELS[f.assetType]}</td>
                    <td style={cellStyle}>{f.suggestedRole}</td>
                    <td style={cellStyle}>
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: 3,
                        background: `${statusInfo.color}14`, color: statusInfo.color,
                        fontWeight: 600, fontSize: 9, whiteSpace: "nowrap" as const,
                      }}>{statusInfo.label}</span>
                    </td>
                    <td style={cellStyle} title={f.reason ?? ""}>
                      <span style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{f.reason ?? "—"}</span>
                    </td>
                    <td style={cellStyle}>
                      <span style={{ fontWeight: 600, color: f.action === "IMPORT" ? C.green : f.action === "REJECT" ? C.red : C.inkFaint }}>{f.action}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {s.permissionErrors.length > 0 && (
        <div style={{
          marginTop: S[4], padding: `${S[3]}px ${S[4]}px`,
          background: C.redLight, border: `1px solid ${C.redBorder}`,
          borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
        }}>
          <div style={{ fontWeight: 600, marginBottom: S[1] }}>Errores de permisos ({s.permissionErrors.length}):</div>
          {s.permissionErrors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div style={{
        marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, textAlign: "right" as const,
      }}>
        Analizado: {new Date(result.analyzedAt).toLocaleString("es-CO")} · zeroWrites: true
        · Root: {result.tenantRootName}
        · complete={String(completeness?.complete ?? "—")}
        · truncated={String(completeness?.truncated ?? "—")}
        · scannedFolders={completeness?.scannedFolders ?? "—"}
      </div>
    </div>
  );
}

// ── KpiBox ──────────────────────────────────────────────────────────────────

function KpiBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: `${S[3]}px`, background: C.white,
      border: `1px solid ${C.line}`, borderRadius: R.md,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 20, fontWeight: 700,
        color, lineHeight: 1, fontVariantNumeric: "tabular-nums", marginBottom: 2,
      }}>{value}</div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Client-side summary builder ─────────────────────────────────────────────

function buildClientSummary(
  files:        DryRunFileDetail[],
  totalFolders: number,
  errors:       string[],
): DryRunSummary {
  const statusBreakdown = {} as Record<DryRunStatus, number>;
  const assetTypeBreakdown = {} as Record<AssetTypeClassification, number>;
  const matchedRefs = new Set<string>();
  const unmatchedRefs = new Set<string>();
  let readyToImport = 0, skipped = 0, rejected = 0;

  for (const f of files) {
    statusBreakdown[f.status] = (statusBreakdown[f.status] ?? 0) + 1;
    assetTypeBreakdown[f.assetType] = (assetTypeBreakdown[f.assetType] ?? 0) + 1;
    switch (f.action) {
      case "IMPORT": readyToImport++; break;
      case "SKIP":   skipped++;       break;
      case "REJECT": rejected++;      break;
    }
    if (f.extractedRef) {
      if (f.matchedProductId) matchedRefs.add(f.extractedRef);
      else unmatchedRefs.add(f.extractedRef);
    }
  }

  return {
    totalScanned:       files.length,
    readyToImport,
    skipped,
    rejected,
    statusBreakdown,
    assetTypeBreakdown,
    uniqueRefsMatched:   matchedRefs.size,
    uniqueRefsUnmatched: unmatchedRefs.size,
    totalFolders,
    permissionErrors:    errors,
  };
}

// ── Shared styles ────────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[2]}px`,
  verticalAlign: "middle" as const,
  color: C.ink,
};

const primaryBtnStyle: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
  color: "#fff", background: MS_CTA.primaryButtonBg,
  border: "none", borderRadius: R.md,
  padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
  boxShadow: MS_CTA.primaryBoxShadow, flexShrink: 0,
};

const secondaryBtnStyle: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600,
  color: C.inkMid, background: C.surface,
  border: `1px solid ${C.line}`, borderRadius: R.md,
  padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
};

const selectStyle: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
  padding: `4px ${S[2]}px`, border: `1px solid ${C.line}`,
  borderRadius: R.sm, background: C.white, outline: "none", cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
  padding: `${S[2]}px ${S[3]}px`,
  border: `1px solid ${C.line}`, borderRadius: R.md,
  outline: "none", background: C.white,
};
