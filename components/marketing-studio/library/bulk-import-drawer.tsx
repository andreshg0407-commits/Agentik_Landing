/**
 * components/marketing-studio/library/bulk-import-drawer.tsx
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-B/04A-C — Bulk Import Drawer (Dry-Run Only)
 *
 * Full-screen drawer with paginated BFS scanning:
 *   1. Verify Drive connection + root
 *   2. Input folder URL
 *   3. Paginated scan (client BFS queue, server validates ancestry per page)
 *   4. Analyze (server runs dry-run engine on accumulated files)
 *   5. Results: KPIs + filterable table + CSV/JSON download
 *
 * ZERO WRITES. Import CTA permanently disabled.
 * assetIngestionAllowed=false throughout.
 *
 * 04A-C completeness contract:
 *   complete=true ONLY when all pages consumed AND all child folders
 *   processed AND folder queue empty AND no errors.
 *   Truncated scans are NEVER shown as success.
 */

"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { C, T, S, R, E }   from "@/lib/ui/tokens";
import { MS_CTA }           from "@/lib/marketing-studio/ms-design-system";
import type {
  DryRunResult,
  DryRunFileDetail,
  DryRunStatus,
  AssetTypeClassification,
  ScanPageResult,
  DryRunCompleteness,
} from "@/lib/marketing-studio/bulk-import/drive-dry-run-types";
import type { DriveScannedFile } from "@/lib/marketing-studio/drive/drive-api-client";

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawerStep =
  | "checking"     // verifying Drive connection + root
  | "configure"    // root not configured
  | "ready"        // Drive connected + root ready, input folder
  | "scanning"     // paginated scan in progress
  | "analyzing"    // server running dry-run engine
  | "results"      // dry-run complete
  | "error";       // error state

interface DriveStatusResponse {
  connected:            boolean;
  tenantRootConfigured: boolean;
  tenantRootFolderName: string | null;
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
};

const ASSET_TYPE_LABELS: Record<AssetTypeClassification, string> = {
  FOTO:          "Foto",
  VIDEO:         "Video",
  BANNER_PIEZA:  "Banner/Pieza",
  UNSUPPORTED:   "No soportado",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkImportDrawer({
  orgSlug, organizationId, onClose,
}: BulkImportDrawerProps) {
  const [step, setStep]             = useState<DrawerStep>("checking");
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [folderUrl, setFolderUrl]   = useState("");
  const [dryRunResult, setDryRunResult] = useState<(DryRunResult & { completeness?: DryRunCompleteness }) | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

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
  const [filterSearch, setFilterSearch]      = useState("");

  // ── Step 1: Check Drive status ──
  const checkDriveStatus = useCallback(async () => {
    setStep("checking");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive?action=status`);
      if (!res.ok) {
        setErrorMsg("No se pudo verificar la conexión con Drive");
        setStep("error");
        return;
      }
      const data: DriveStatusResponse = await res.json();
      setDriveStatus(data);

      if (!data.connected) {
        setErrorMsg("Google Drive no está conectado. Conecta la integración desde Configuración.");
        setStep("error");
        return;
      }
      if (!data.tenantRootConfigured) {
        setStep("configure");
        return;
      }
      setStep("ready");
    } catch {
      setErrorMsg("Error de red al verificar conexión Drive");
      setStep("error");
    }
  }, [orgSlug]);

  // Auto-check on mount
  useState(() => { checkDriveStatus(); });

  // ── Paginated BFS scan (04A-C) ──
  const runPaginatedScan = useCallback(async () => {
    if (!folderUrl.trim()) return;
    cancelledRef.current = false;
    setStep("scanning");
    setErrorMsg(null);
    setScanFoldersDone(0);
    setScanFilesDone(0);
    setScanPagesDone(0);
    setScanCurrentFolder("(root)");
    setScanErrors([]);

    const accumulatedFiles: DriveScannedFile[] = [];
    const seenFileIds = new Set<string>();
    const allErrors: string[] = [];
    let totalFoldersProcessed = 0;
    let truncated = false;

    // Initialize BFS queue with root folder
    const rootFolderId = folderUrl.trim();
    const queue: FolderQueueItem[] = [{
      id: rootFolderId, name: "(root)", path: "", pageToken: null,
    }];

    try {
      while (queue.length > 0) {
        if (cancelledRef.current) {
          truncated = true;
          break;
        }

        const current = queue[0];
        setScanCurrentFolder(current.path || current.name);

        // Fetch one page
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
            setStep("error");
            return;
          }
          if (errCode === "DRIVE_TENANT_ROOT_NOT_CONFIGURED") {
            setErrorMsg("Root folder no configurado.");
            setStep("error");
            return;
          }
          allErrors.push(`${current.path || "(root)"}: ${errCode}`);
          queue.shift();
          truncated = true;
          continue;
        }

        const page: ScanPageResult = await res.json();
        setScanPagesDone(prev => prev + 1);

        // Accumulate files with deduplication
        for (const f of page.scannedFiles) {
          if (!seenFileIds.has(f.id)) {
            seenFileIds.add(f.id);
            accumulatedFiles.push(f);
          }
        }
        setScanFilesDone(accumulatedFiles.length);

        // Collect errors
        if (page.errors.length > 0) {
          allErrors.push(...page.errors);
          setScanErrors([...allErrors]);
          truncated = true;
        }

        if (page.truncated) truncated = true;

        // Handle pagination within folder
        if (page.nextPageToken) {
          // More pages in this folder — update pageToken
          queue[0] = { ...current, pageToken: page.nextPageToken };
        } else {
          // Folder exhausted — remove from queue and count it
          queue.shift();
          totalFoldersProcessed++;
          setScanFoldersDone(totalFoldersProcessed);
        }

        // Enqueue child folders
        for (const child of page.childFolderIds) {
          queue.push({ id: child.id, name: child.name, path: child.path, pageToken: null });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red";
      allErrors.push(msg);
      truncated = true;
    }

    if (cancelledRef.current) {
      truncated = true;
    }

    const complete = !truncated && queue.length === 0 && allErrors.length === 0;

    // ── Step 4: Analyze accumulated files ──
    if (accumulatedFiles.length === 0 && complete) {
      setErrorMsg("No se encontraron archivos en la carpeta seleccionada.");
      setStep("error");
      return;
    }

    setStep("analyzing");

    try {
      const completeness: DryRunCompleteness = {
        complete,
        truncated,
        scannedFiles:   accumulatedFiles.length,
        scannedFolders: totalFoldersProcessed,
        errors:         allErrors,
      };

      const analyzeRes = await fetch(`/api/orgs/${orgSlug}/marketing-studio/drive`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          action: "analyze",
          files:  accumulatedFiles,
          completeness,
        }),
      });

      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({ error: "Error" }));
        setErrorMsg(body.error ?? `Error ${analyzeRes.status}`);
        setStep("error");
        return;
      }

      const result = await analyzeRes.json();
      setDryRunResult(result);
      setStep("results");
    } catch {
      setErrorMsg("Error al analizar archivos escaneados");
      setStep("error");
    }
  }, [orgSlug, folderUrl]);

  // ── Cancel scan ──
  const cancelScan = useCallback(() => {
    cancelledRef.current = true;
  }, []);

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

  // ── Render ──
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", flexDirection: "column" as const,
    }}>
      {/* Backdrop */}
      <div
        onClick={step !== "scanning" && step !== "analyzing" ? onClose : undefined}
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
              04A-C · Paginated scan · Dry-run only · Zero writes
            </div>
          </div>
          <button
            onClick={step !== "scanning" && step !== "analyzing" ? onClose : undefined}
            disabled={step === "scanning" || step === "analyzing"}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
              background: "none", border: "none",
              cursor: step === "scanning" || step === "analyzing" ? "not-allowed" : "pointer",
              padding: S[2],
            }}
          >✕</button>
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, overflow: "auto", padding: `${S[5]}px` }}>

          {/* ── Step: Checking ── */}
          {step === "checking" && (
            <StepMessage icon="⟳" title="Verificando conexión con Google Drive..."
              detail="Comprobando integración y root folder configurado." />
          )}

          {/* ── Step: Configure ── */}
          {step === "configure" && (
            <StepMessage icon="⚙" title="Root folder no configurado"
              detail="Un administrador (AGENTIK_ADMIN) debe seleccionar la carpeta raíz de Drive para esta organización antes de importar.">
              <div style={{ marginTop: S[4] }}>
                <button onClick={() => checkDriveStatus()} style={secondaryBtnStyle}>Reintentar verificación</button>
              </div>
            </StepMessage>
          )}

          {/* ── Step: Error ── */}
          {step === "error" && (
            <StepMessage icon="✕" title="Error" detail={errorMsg ?? "Error desconocido"} color={C.red}>
              <div style={{ display: "flex", gap: S[2], marginTop: S[4] }}>
                <button onClick={() => checkDriveStatus()} style={secondaryBtnStyle}>Reintentar</button>
                <button onClick={onClose} style={secondaryBtnStyle}>Cerrar</button>
              </div>
            </StepMessage>
          )}

          {/* ── Step: Ready ── */}
          {step === "ready" && (
            <div>
              <StepMessage icon="✓" title="Drive conectado"
                detail={`Root: ${driveStatus?.tenantRootFolderName ?? "—"}`} color={C.green} />
              <div style={{ marginTop: S[5] }}>
                <label style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: C.ink, display: "block", marginBottom: S[2],
                }}>URL o ID de la carpeta a escanear</label>
                <div style={{ display: "flex", gap: S[2] }}>
                  <input
                    type="text" value={folderUrl}
                    onChange={e => setFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... o folder ID"
                    style={{
                      flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                      padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.md,
                      outline: "none", background: C.white,
                    }}
                  />
                  <button
                    onClick={runPaginatedScan}
                    disabled={!folderUrl.trim()}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                      color: !folderUrl.trim() ? C.inkFaint : "#fff",
                      background: !folderUrl.trim() ? C.surface : MS_CTA.primaryButtonBg,
                      border: !folderUrl.trim() ? `1px solid ${C.line}` : "none",
                      borderRadius: R.md, padding: `${S[2]}px ${S[4]}px`,
                      cursor: !folderUrl.trim() ? "not-allowed" : "pointer",
                      boxShadow: !folderUrl.trim() ? "none" : MS_CTA.primaryBoxShadow,
                      flexShrink: 0,
                    }}
                  >Escanear y analizar</button>
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[2],
                }}>
                  Escaneo paginado recursivo. Sin límite fijo — recorre todas las páginas y subcarpetas.
                  Cada página valida ascendencia del folder contra el tenant root. Zero writes.
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Scanning (paginated progress) ── */}
          {step === "scanning" && (
            <div style={{ padding: "24px 0" }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                color: C.ink, marginBottom: S[4], textAlign: "center" as const,
              }}>Escaneando Drive...</div>

              {/* Progress KPIs */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: S[3], marginBottom: S[4],
              }}>
                <ProgressKpi label="Carpetas" value={scanFoldersDone} />
                <ProgressKpi label="Archivos" value={scanFilesDone} />
                <ProgressKpi label="Páginas" value={scanPagesDone} />
                <ProgressKpi label="Errores" value={scanErrors.length} color={scanErrors.length > 0 ? C.red : undefined} />
              </div>

              {/* Current folder */}
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                textAlign: "center" as const, marginBottom: S[4],
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
              }}>
                Carpeta actual: {scanCurrentFolder}
              </div>

              {/* Cancel button */}
              <div style={{ textAlign: "center" as const }}>
                <button onClick={cancelScan} style={{
                  ...secondaryBtnStyle, color: C.red, borderColor: C.redBorder,
                }}>
                  Cancelar escaneo
                </button>
              </div>

              {/* Errors so far */}
              {scanErrors.length > 0 && (
                <div style={{
                  marginTop: S[4], padding: `${S[3]}px ${S[4]}px`,
                  background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
                }}>
                  Errores parciales ({scanErrors.length}):
                  {scanErrors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {scanErrors.length > 5 && <div>... +{scanErrors.length - 5} más</div>}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Analyzing ── */}
          {step === "analyzing" && (
            <StepMessage icon="⟳" title="Analizando archivos escaneados..."
              detail={`${scanFilesDone} archivos de ${scanFoldersDone} carpetas. Matching contra catálogo de productos.`} />
          )}

          {/* ── Step: Results ── */}
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
              onNewScan={() => { setDryRunResult(null); setStep("ready"); setFolderUrl(""); }}
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
            {step !== "scanning" && step !== "analyzing" && (
              <button onClick={onClose} style={secondaryBtnStyle}>Cerrar</button>
            )}
          </div>
        </div>
      </div>
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
      {/* Completeness banner */}
      {isTruncated && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.md, marginBottom: S[4],
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 600,
        }}>
          INCOMPLETO (complete=false, truncated=true) — El escaneo NO terminó correctamente.
          {completeness?.errors && completeness.errors.length > 0
            ? ` ${completeness.errors.length} error(es) durante el escaneo.`
            : " Puede haber carpetas o páginas sin procesar."
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
          COMPLETO (complete=true) — Todas las páginas consumidas, todas las subcarpetas recorridas,
          cola vacía, sin errores. {completeness?.scannedFolders ?? "—"} carpetas, {completeness?.scannedFiles ?? "—"} archivos.
        </div>
      )}

      {/* KPI Strip */}
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

      {/* Asset type breakdown */}
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

      {/* Actions bar */}
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
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            padding: `4px ${S[2]}px`, border: `1px solid ${C.line}`,
            borderRadius: R.sm, outline: "none", background: C.white,
            flex: "1 1 160px", minWidth: 120,
          }} />

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
          {filteredFiles.length} / {result.files.length} archivos
        </span>
      </div>

      {/* Results table */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "auto", maxHeight: 480 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
          <thead>
            <tr style={{ background: C.surface, position: "sticky" as const, top: 0, zIndex: 1 }}>
              {["Ruta", "Archivo", "Ref.", "Mundo", "Tipo", "Rol", "Estado", "Motivo", "Acción"].map(h => (
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

      {/* Permission errors */}
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

      {/* Metadata */}
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

// ── Shared styles ────────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[2]}px`,
  verticalAlign: "middle" as const,
  color: C.ink,
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
