/**
 * components/marketing-studio/library/bulk-import-drawer.tsx
 *
 * MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-B — Bulk Import Drawer (Dry-Run Only)
 *
 * Full-screen drawer with 6-step flow:
 *   1. Verify Drive connection
 *   2. Configure or show tenant root
 *   3. Scan folders + files
 *   4. Show progress
 *   5. Present dry-run results (KPIs + table)
 *   6. CSV/JSON download
 *
 * ZERO WRITES. Import CTA permanently disabled.
 * assetIngestionAllowed=false throughout.
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import { C, T, S, R, E }   from "@/lib/ui/tokens";
import { MS_CTA }           from "@/lib/marketing-studio/ms-design-system";
import type {
  DryRunResult,
  DryRunFileDetail,
  DryRunStatus,
  AssetTypeClassification,
} from "@/lib/marketing-studio/bulk-import/drive-dry-run-types";

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawerStep =
  | "checking"     // verifying Drive connection + root
  | "configure"    // root not configured, show instructions
  | "ready"        // Drive connected + root ready, input folder
  | "scanning"     // scan in progress
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
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState("");

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

  // ── Step 3+4: Run scan + dry-run ──
  const runDryRun = useCallback(async () => {
    if (!folderUrl.trim()) return;
    setStep("scanning");
    setScanProgress("Conectando con Google Drive...");
    setErrorMsg(null);

    try {
      setScanProgress("Escaneando carpetas y archivos...");
      const res = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/drive?action=dry-run&folderId=${encodeURIComponent(folderUrl.trim())}`,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error desconocido" }));
        const code = body.error ?? "Error";
        if (code === "DRIVE_NOT_CONNECTED") {
          setErrorMsg("Drive no conectado");
        } else if (code === "DRIVE_TENANT_ROOT_NOT_CONFIGURED") {
          setErrorMsg("Root folder no configurado. Un administrador debe configurarlo primero.");
        } else if (code === "OUTSIDE_TENANT_ROOT") {
          setErrorMsg("La carpeta seleccionada está fuera del root configurado del tenant.");
        } else if (code === "DRIVE_TOKEN_EXPIRED") {
          setErrorMsg("Token de Drive expirado. Reconecta la integración.");
        } else {
          setErrorMsg(body.message ?? body.error ?? `Error ${res.status}`);
        }
        setStep("error");
        return;
      }

      const result: DryRunResult = await res.json();
      setDryRunResult(result);
      setStep("results");
    } catch {
      setErrorMsg("Error de red al ejecutar dry-run");
      setStep("error");
    }
  }, [orgSlug, folderUrl]);

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
    const headers = ["Ruta", "Archivo", "Referencia", "Tipo", "Rol", "Estado", "Motivo", "Accion"];
    const rows = dryRunResult.files.map(f => [
      f.path,
      f.fileName,
      f.extractedRef ?? "",
      f.assetType,
      f.suggestedRole,
      f.status,
      f.reason ?? "",
      f.action,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
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

  // ── Truncation check ──
  const isTruncated = dryRunResult
    ? dryRunResult.files.length >= 2000
    : false;

  // ── Render ──
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", flexDirection: "column" as const,
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,.45)",
        }}
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
              MARKETING-DRIVE-BULK-ASSET-INGESTION-04A-B · Dry-run only · Zero writes
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
              background: "none", border: "none", cursor: "pointer", padding: S[2],
            }}
          >✕</button>
        </div>

        {/* ── Content area ── */}
        <div style={{
          flex: 1, overflow: "auto",
          padding: `${S[5]}px`,
        }}>
          {/* ── Step: Checking ── */}
          {step === "checking" && (
            <StepMessage
              icon="⟳"
              title="Verificando conexión con Google Drive..."
              detail="Comprobando integración y root folder configurado."
            />
          )}

          {/* ── Step: Configure ── */}
          {step === "configure" && (
            <StepMessage
              icon="⚙"
              title="Root folder no configurado"
              detail="Un administrador (AGENTIK_ADMIN) debe seleccionar la carpeta raíz de Drive para esta organización antes de importar."
            >
              <div style={{ marginTop: S[4] }}>
                <button
                  onClick={() => checkDriveStatus()}
                  style={secondaryBtnStyle}
                >
                  Reintentar verificación
                </button>
              </div>
            </StepMessage>
          )}

          {/* ── Step: Error ── */}
          {step === "error" && (
            <StepMessage
              icon="✕"
              title="Error"
              detail={errorMsg ?? "Error desconocido"}
              color={C.red}
            >
              <div style={{ display: "flex", gap: S[2], marginTop: S[4] }}>
                <button onClick={() => checkDriveStatus()} style={secondaryBtnStyle}>
                  Reintentar
                </button>
                <button onClick={onClose} style={secondaryBtnStyle}>
                  Cerrar
                </button>
              </div>
            </StepMessage>
          )}

          {/* ── Step: Ready (input folder URL) ── */}
          {step === "ready" && (
            <div>
              <StepMessage
                icon="✓"
                title="Drive conectado"
                detail={`Root: ${driveStatus?.tenantRootFolderName ?? "—"}`}
                color={C.green}
              />
              <div style={{ marginTop: S[5] }}>
                <label style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: C.ink, display: "block", marginBottom: S[2],
                }}>
                  URL o ID de la carpeta a escanear
                </label>
                <div style={{ display: "flex", gap: S[2] }}>
                  <input
                    type="text"
                    value={folderUrl}
                    onChange={e => setFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... o folder ID"
                    style={{
                      flex: 1,
                      fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
                      padding: `${S[2]}px ${S[3]}px`,
                      border: `1px solid ${C.line}`, borderRadius: R.md,
                      outline: "none", background: C.white,
                    }}
                  />
                  <button
                    onClick={runDryRun}
                    disabled={!folderUrl.trim()}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                      color: !folderUrl.trim() ? C.inkFaint : "#fff",
                      background: !folderUrl.trim() ? C.surface : MS_CTA.primaryButtonBg,
                      border: !folderUrl.trim() ? `1px solid ${C.line}` : "none",
                      borderRadius: R.md,
                      padding: `${S[2]}px ${S[4]}px`,
                      cursor: !folderUrl.trim() ? "not-allowed" : "pointer",
                      boxShadow: !folderUrl.trim() ? "none" : MS_CTA.primaryBoxShadow,
                      flexShrink: 0,
                    }}
                  >
                    Escanear y analizar
                  </button>
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[2],
                }}>
                  La carpeta debe estar dentro del root configurado. Se escanearán subcarpetas recursivamente.
                  Máximo 2000 archivos. Zero writes — solo lectura.
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Scanning ── */}
          {step === "scanning" && (
            <StepMessage
              icon="⟳"
              title="Escaneando..."
              detail={scanProgress}
            >
              <div style={{
                marginTop: S[4],
                height: 4, background: C.surface, borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  width: "60%", height: "100%",
                  background: C.blueDark, borderRadius: 2,
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
              </div>
            </StepMessage>
          )}

          {/* ── Step: Results ── */}
          {step === "results" && dryRunResult && (
            <DryRunResults
              result={dryRunResult}
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
              isTruncated={isTruncated}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${S[3]}px ${S[5]}px`,
          borderTop: `1px solid ${C.line}`,
          background: C.surface,
          flexShrink: 0,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
          }}>
            {step === "results" && dryRunResult
              ? `${dryRunResult.summary.totalScanned} archivos · ${dryRunResult.summary.readyToImport} listos · ${dryRunResult.summary.rejected} rechazados`
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
            <button onClick={onClose} style={secondaryBtnStyle}>
              Cerrar
            </button>
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
  icon:      string;
  title:     string;
  detail:    string;
  color?:    string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center" as const, padding: "40px 0" }}>
      <div style={{
        fontFamily: T.mono, fontSize: 28, color: color ?? C.inkMid,
        marginBottom: S[3],
      }}>{icon}</div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
        color: C.ink, marginBottom: S[2],
      }}>{title}</div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
        maxWidth: 480, margin: "0 auto",
      }}>{detail}</div>
      {children}
    </div>
  );
}

// ── DryRunResults ────────────────────────────────────────────────────────────

function DryRunResults({
  result, filteredFiles,
  filterStatus, filterType, filterSearch,
  onFilterStatus, onFilterType, onFilterSearch,
  onDownloadCSV, onDownloadJSON, onNewScan,
  isTruncated,
}: {
  result:         DryRunResult;
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
  isTruncated:    boolean;
}) {
  const s = result.summary;

  return (
    <div>
      {/* Truncation warning */}
      {isTruncated && (
        <div style={{
          padding: `${S[3]}px ${S[4]}px`,
          background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.md, marginBottom: S[4],
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, fontWeight: 600,
        }}>
          TRUNCADO — Se alcanzó el límite de 2000 archivos. El dry-run NO está completo.
          Subcarpetas adicionales pueden existir sin escanear. No declare éxito con datos parciales.
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
        display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center",
        flexWrap: "wrap" as const,
      }}>
        <button onClick={onDownloadCSV} style={secondaryBtnStyle}>↓ CSV</button>
        <button onClick={onDownloadJSON} style={secondaryBtnStyle}>↓ JSON</button>
        <button onClick={onNewScan} style={secondaryBtnStyle}>Nuevo escaneo</button>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => onFilterStatus(e.target.value as DryRunStatus | "ALL")}
          style={selectStyle}
        >
          <option value="ALL">Estado: Todos</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => onFilterType(e.target.value as AssetTypeClassification | "ALL")}
          style={selectStyle}
        >
          <option value="ALL">Tipo: Todos</option>
          {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Search in results */}
        <input
          type="text"
          value={filterSearch}
          onChange={e => onFilterSearch(e.target.value)}
          placeholder="Buscar en resultados..."
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            padding: `4px ${S[2]}px`, border: `1px solid ${C.line}`,
            borderRadius: R.sm, outline: "none", background: C.white,
            flex: "1 1 160px", minWidth: 120,
          }}
        />

        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
          {filteredFiles.length} / {result.files.length} archivos
        </span>
      </div>

      {/* Results table */}
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.md,
        overflow: "auto", maxHeight: 480,
      }}>
        <table style={{
          width: "100%", borderCollapse: "collapse" as const,
          fontFamily: T.mono, fontSize: T.sz["2xs"],
        }}>
          <thead>
            <tr style={{ background: C.surface, position: "sticky" as const, top: 0, zIndex: 1 }}>
              {["Ruta", "Archivo", "Ref.", "Mundo", "Tipo", "Rol", "Estado", "Motivo", "Acción"].map(h => (
                <th key={h} style={{
                  padding: `${S[2]}px ${S[2]}px`,
                  textAlign: "left" as const,
                  fontWeight: 600, color: C.inkMid,
                  borderBottom: `1px solid ${C.line}`,
                  whiteSpace: "nowrap" as const,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredFiles.length === 0 ? (
              <tr>
                <td colSpan={9} style={{
                  padding: S[5], textAlign: "center" as const,
                  color: C.inkFaint,
                }}>
                  Sin archivos para este filtro
                </td>
              </tr>
            ) : (
              filteredFiles.map((f, i) => {
                const statusInfo = STATUS_LABELS[f.status];
                return (
                  <tr key={f.driveFileId + i} style={{
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    background: i % 2 === 0 ? C.white : C.surface,
                  }}>
                    <td style={cellStyle} title={f.path}>
                      <span style={{ maxWidth: 180, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {f.path}
                      </span>
                    </td>
                    <td style={cellStyle} title={f.fileName}>
                      <span style={{ maxWidth: 160, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {f.fileName}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>
                      {f.extractedRef ?? "—"}
                    </td>
                    <td style={cellStyle}>
                      {f.parentFolderName || "—"}
                    </td>
                    <td style={cellStyle}>
                      {ASSET_TYPE_LABELS[f.assetType]}
                    </td>
                    <td style={cellStyle}>
                      {f.suggestedRole}
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        display: "inline-block",
                        padding: "1px 6px", borderRadius: 3,
                        background: `${statusInfo.color}14`,
                        color: statusInfo.color,
                        fontWeight: 600, fontSize: 9,
                        whiteSpace: "nowrap" as const,
                      }}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td style={cellStyle} title={f.reason ?? ""}>
                      <span style={{ maxWidth: 200, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {f.reason ?? "—"}
                      </span>
                    </td>
                    <td style={cellStyle}>
                      <span style={{
                        fontWeight: 600,
                        color: f.action === "IMPORT" ? C.green : f.action === "REJECT" ? C.red : C.inkFaint,
                      }}>
                        {f.action}
                      </span>
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
          borderRadius: R.md,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
        }}>
          <div style={{ fontWeight: 600, marginBottom: S[1] }}>
            Errores de permisos ({s.permissionErrors.length} carpeta{s.permissionErrors.length !== 1 ? "s" : ""}):
          </div>
          {s.permissionErrors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {/* Analyzed timestamp */}
      <div style={{
        marginTop: S[3],
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost,
        textAlign: "right" as const,
      }}>
        Analizado: {new Date(result.analyzedAt).toLocaleString("es-CO")} · zeroWrites: true · Root: {result.tenantRootName}
      </div>
    </div>
  );
}

// ── KpiBox ──────────────────────────────────────────────────────────────────

function KpiBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: `${S[3]}px ${S[3]}px`,
      background: C.white,
      border: `1px solid ${C.line}`,
      borderRadius: R.md,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 20, fontWeight: 700,
        color, lineHeight: 1, fontVariantNumeric: "tabular-nums",
        marginBottom: 2,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: 9, color: C.inkFaint,
        fontWeight: 600,
      }}>
        {label}
      </div>
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
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  fontWeight:   600,
  color:        C.inkMid,
  background:   C.surface,
  border:       `1px solid ${C.line}`,
  borderRadius: R.md,
  padding:      `${S[2]}px ${S[3]}px`,
  cursor:       "pointer",
};

const selectStyle: React.CSSProperties = {
  fontFamily:   T.mono,
  fontSize:     T.sz.xs,
  color:        C.ink,
  padding:      `4px ${S[2]}px`,
  border:       `1px solid ${C.line}`,
  borderRadius: R.sm,
  background:   C.white,
  outline:      "none",
  cursor:       "pointer",
};
