/**
 * components/marketing-studio/library/import-catalog-wizard.tsx
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * 4-step wizard for bulk importing a product catalog from a local folder or ZIP.
 *
 * ── Steps ─────────────────────────────────────────────────────────────────────
 *   1. Fuente      — select folder / ZIP / Drive (disabled)
 *   2. Análisis    — preview detected structure
 *   3. Mapeo       — review role classification rules
 *   4. Resumen     — final counts + conflicts + confirm
 *   exec           — progress overlay while importing
 *   done           — success / partial / error report
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *   Parsing:   lib/marketing-studio/bulk-import/structure-parser.ts
 *   Planning:  lib/marketing-studio/bulk-import/import-planner.ts
 *   Roles:     lib/marketing-studio/bulk-import/asset-role-mapper.ts
 *   Execution: calls createReference() server action + assets upload API
 *   Rollback:  DELETE /api/orgs/{orgSlug}/marketing-studio/bulk-import
 *
 * ── Design contract ───────────────────────────────────────────────────────────
 *   MS Design System tokens only. No raw hex.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Folder, FileArchive, Cloud, X, ArrowRight, ArrowLeft,
  CheckCircle, AlertCircle, Package, Upload, Loader,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { C, T, S, R }              from "@/lib/ui/tokens";
import {
  MS_PALETTE, MS_SHADOWS, MS_APP_ICON, MS_CTA, MS_TYPOGRAPHY,
} from "@/lib/marketing-studio/ms-design-system";
import { createReference }         from "@/app/actions/marketing-studio/products";
import { parseFolder, parseZip }   from "@/lib/marketing-studio/bulk-import/structure-parser";
import {
  checkDriveStatus,
  parseDriveFolder,
  resolveDriveFile,
}                                  from "@/lib/marketing-studio/bulk-import/drive-import-provider";
import { planImport, countExecutableRefs } from "@/lib/marketing-studio/bulk-import/import-planner";
import { getRoleRulesSummary }     from "@/lib/marketing-studio/bulk-import/asset-role-mapper";
import type {
  ParsedImportStructure,
  ImportPlan,
  ImportConflict,
  ConflictResolution,
  ImportProgressEvent,
  ImportResult,
  ImportAuditRecord,
} from "@/lib/marketing-studio/bulk-import/import-types";

// ── Constants ──────────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

const ROLE_LABELS: Record<string, string> = {
  hero:       "HERO",
  raw_back:   "ESPALDA",
  raw_detail: "DETALLE",
  gallery:    "GALERÍA",
  video:      "VIDEO",
  document:   "DOCUMENTO",
};

const ROLE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  hero:       { color: DOMAIN.primary,  bg: DOMAIN.selectedBg, border: `${DOMAIN.primary}33` },
  raw_back:   { color: C.amber,         bg: C.amberLight,      border: C.amberBorder          },
  raw_detail: { color: C.blueDark,      bg: C.blueLight,       border: C.blueBorder           },
  gallery:    { color: C.inkMid,        bg: C.surface,         border: C.line                 },
  video:      { color: C.amber,         bg: C.amberLight,      border: C.amberBorder          },
  document:   { color: C.inkFaint,      bg: C.surface,         border: C.line                 },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ImportCatalogWizardProps {
  orgSlug:        string;
  organizationId: string;
  onSuccess:      () => void;
  onClose:        () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | "exec" | "done";

export function ImportCatalogWizard({
  orgSlug,
  organizationId,
  onSuccess,
  onClose,
}: ImportCatalogWizardProps) {
  const [step,      setStep]      = useState<WizardStep>(1);
  const [source,    setSource]    = useState<"local_folder" | "local_zip" | null>(null);
  const [structure, setStructure] = useState<ParsedImportStructure | null>(null);
  const [plan,      setPlan]      = useState<ImportPlan | null>(null);
  const [conflicts, setConflicts] = useState<Map<string, ConflictResolution>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress,  setProgress]  = useState<{ current: number; total: number; label: string }>({ current: 0, total: 0, label: "" });
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Drive-specific state
  const [driveSelected,  setDriveSelected]  = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null); // null = not checked
  const [driveUrl,       setDriveUrl]       = useState("");
  const [driveFolder,    setDriveFolder]    = useState<string | null>(null);
  const [driveIgnored,   setDriveIgnored]   = useState(0);
  const [drivePermErrors, setDrivePermErrors] = useState<string[]>([]);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef    = useRef<HTMLInputElement>(null);

  // Check Drive connection status when Drive card is expanded
  useEffect(() => {
    if (!driveSelected || driveConnected !== null) return;
    let cancelled = false;
    checkDriveStatus(orgSlug).then(connected => {
      if (!cancelled) setDriveConnected(connected);
    });
    return () => { cancelled = true; };
  }, [driveSelected, driveConnected, orgSlug]);

  // ── File selection ──────────────────────────────────────────────────────────

  async function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSource("local_folder");
    setLoadError(null);
    setIsLoading(true);
    try {
      const parsed = parseFolder(files);
      if (parsed.categories.length === 0) {
        setLoadError("No se detectaron categorías. Asegúrate de que la carpeta tiene la estructura: Categoría/Referencia/imagen.jpg");
        return;
      }
      setStructure(parsed);
      await loadPlanForStructure(parsed, new Map());
      setStep(2);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al leer la carpeta");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleZipSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSource("local_zip");
    setLoadError(null);
    setIsLoading(true);
    try {
      const parsed = await parseZip(file);
      if (parsed.categories.length === 0) {
        setLoadError("No se detectaron categorías en el ZIP. Asegúrate de que tiene la estructura: Categoría/Referencia/imagen.jpg");
        return;
      }
      setStructure(parsed);
      await loadPlanForStructure(parsed, new Map());
      setStep(2);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al leer el archivo ZIP");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDriveAnalyze() {
    if (!driveUrl.trim()) return;
    setLoadError(null);
    setIsLoading(true);
    try {
      const response = await parseDriveFolder(driveUrl, orgSlug);
      if (response.structure.categories.length === 0) {
        setLoadError(
          "No se detectaron categorías. Asegúrate de que la carpeta contiene subcarpetas de categoría con referencias dentro.",
        );
        return;
      }
      setDriveFolder(response.folderName);
      setDriveIgnored(response.ignoredCount);
      setDrivePermErrors(response.permissionErrors);
      setStructure(response.structure);
      await loadPlanForStructure(response.structure, new Map());
      setStep(2);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al leer la carpeta de Google Drive");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPlanForStructure(
    parsed:       ParsedImportStructure,
    resolutions:  Map<string, ConflictResolution>,
  ) {
    const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/bulk-import`);
    const data = res.ok
      ? await res.json() as { bySku: Record<string, string>; byName: Record<string, string> }
      : { bySku: {}, byName: {} };

    const existingSkus = new Map(Object.entries(data.bySku));
    const newPlan      = planImport(parsed, existingSkus, resolutions);
    setPlan(newPlan);
  }

  // ── Conflict resolution ─────────────────────────────────────────────────────

  function handleConflictChange(sku: string, resolution: ConflictResolution) {
    const next = new Map(conflicts);
    next.set(sku, resolution);
    setConflicts(next);
    // Re-plan with updated resolutions
    if (structure) loadPlanForStructure(structure, next).catch(() => {});
  }

  // ── Execution ───────────────────────────────────────────────────────────────

  const executeImport = useCallback(async () => {
    if (!plan) return;
    setStep("exec");

    const createdProductIds: string[] = [];
    const errors: { referenceName: string; assetName?: string; message: string }[] = [];
    let refsCreated   = 0;
    let assetsImported = 0;

    const { refs: totalRefs, assets: totalAssets } = countExecutableRefs(plan);
    const totalSteps = totalRefs + totalAssets;
    let   doneSteps  = 0;

    function emitProgress(label: string) {
      doneSteps++;
      setProgress({
        current: doneSteps,
        total:   totalSteps,
        label,
      });
    }

    const startedAt = new Date().toISOString();

    try {
      // ── Phase 1: Create all product references ──────────────────────────────
      for (const cat of plan.categories) {
        for (const ref of cat.references) {
          if (ref.conflict?.resolution === "skip") {
            emitProgress(`Omitiendo "${ref.name}"`);
            continue;
          }

          emitProgress(`Creando "${ref.name}"…`);

          const result = await createReference({
            organizationId,
            name:     ref.name,
            sku:      ref.sku,
            category: cat.name,
          });

          if (!result.success || !result.productId) {
            errors.push({ referenceName: ref.name, message: result.error ?? "Error al crear referencia" });
            // Continue — we don't rollback on single-ref failure to maximize progress
            continue;
          }

          createdProductIds.push(result.productId);
          refsCreated++;

          // ── Phase 2: Upload assets for this reference ─────────────────────
          for (const parsedFile of ref.files) {
            emitProgress(`Subiendo ${parsedFile.name}…`);

            try {
              // Resolve file: for Drive imports, download lazily from server proxy
              let fileBlob: File;
              if (parsedFile.file) {
                fileBlob = parsedFile.file;
              } else if (parsedFile.driveFileId) {
                fileBlob = await resolveDriveFile({
                  orgSlug,
                  driveFileId: parsedFile.driveFileId,
                  fileName:    parsedFile.name,
                  mimeType:    parsedFile.mimeType,
                });
              } else {
                throw new Error(`Sin fuente de archivo para ${parsedFile.name}`);
              }

              const formData = new FormData();
              formData.append("role", mapRoleForUpload(parsedFile.role));
              formData.append("files", fileBlob);

              const uploadRes = await fetch(
                `/api/orgs/${orgSlug}/marketing-studio/products/${result.productId}/assets`,
                { method: "POST", body: formData },
              );

              if (!uploadRes.ok) {
                const errData = await uploadRes.json().catch(() => ({ error: "Upload failed" })) as { error: string };
                errors.push({ referenceName: ref.name, assetName: parsedFile.name, message: errData.error });
              } else {
                assetsImported++;
              }
            } catch (uploadErr) {
              errors.push({
                referenceName: ref.name,
                assetName:     parsedFile.name,
                message:       uploadErr instanceof Error ? uploadErr.message : "Error de red",
              });
            }
          }
        }
      }
    } catch (fatalErr) {
      // Fatal error — rollback ALL created products
      setProgress({ current: 0, total: 0, label: "Revirtiendo importación…" });
      await rollbackProducts(createdProductIds);

      const audit = buildAudit({
        orgSlug, organizationId, source: plan.source, startedAt,
        refsCreated, assetsImported, conflictsDetected: plan.conflicts.length,
        errors: [...errors.map(e => e.message), (fatalErr instanceof Error ? fatalErr.message : "Fatal error")],
        status: "rolled_back",
      });

      setResult({
        success:           false,
        categoriesCreated: 0,
        referencesCreated: 0,
        assetsImported:    0,
        errors:            [...errors, { referenceName: "General", message: fatalErr instanceof Error ? fatalErr.message : "Error fatal" }],
        rolledBack:        true,
        audit,
      });
      setStep("done");
      return;
    }

    const status = errors.length === 0 ? "success" : refsCreated > 0 ? "partial" : "failed";
    const audit  = buildAudit({
      orgSlug, organizationId, source: plan.source, startedAt,
      refsCreated, assetsImported, conflictsDetected: plan.conflicts.length,
      errors: errors.map(e => `${e.referenceName}: ${e.message}`),
      status,
    });

    setResult({
      success:           status !== "failed",
      categoriesCreated: plan.totalCategories,
      referencesCreated: refsCreated,
      assetsImported,
      errors,
      rolledBack:        false,
      audit,
    });
    setStep("done");

    if (status !== "failed") {
      onSuccess(); // triggers router.refresh() in parent
    }
  }, [plan, organizationId, orgSlug, onSuccess]);

  async function rollbackProducts(productIds: string[]) {
    if (productIds.length === 0) return;
    try {
      await fetch(`/api/orgs/${orgSlug}/marketing-studio/bulk-import`, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ productIds }),
      });
    } catch { /* best-effort rollback */ }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  const roleRules = getRoleRulesSummary();

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(10,15,30,0.55)", backdropFilter: "blur(4px)",
        zIndex: 9200, display: "flex", alignItems: "center", justifyContent: "center",
        padding: S[4],
      }}
      onClick={e => { if (e.target === e.currentTarget && step !== "exec") onClose(); }}
    >
      <div style={{
        background: "#fff", border: `1px solid ${C.line}`,
        borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,0.16), 0 4px 20px rgba(0,0,0,0.08)",
        width: "100%", maxWidth: 600, maxHeight: "92vh",
        display: "flex", flexDirection: "column" as const, overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <WizardHeader step={step} onClose={step !== "exec" ? onClose : undefined} />

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "24px" }}>

          {/* ── STEP 1: Fuente ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
                Selecciona el origen de tus referencias de producto.
                La estructura esperada es: <strong>Categoría / Referencia / imagen.jpg</strong>
              </div>

              {loadError && (
                <div style={{
                  fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.red,
                  background: C.redLight, border: `1px solid ${C.redBorder}`,
                  borderRadius: R.sm, padding: "10px 14px",
                }}>
                  {loadError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
                {/* Carpeta local */}
                <SourceCard
                  icon={<Folder size={22} strokeWidth={1.6} color={DOMAIN.primary} />}
                  title="Carpeta local"
                  desc="Selecciona una carpeta de tu computador. El sistema leerá toda la estructura."
                  isLoading={isLoading && source === "local_folder"}
                  onClick={() => folderInputRef.current?.click()}
                />

                {/* ZIP */}
                <SourceCard
                  icon={<FileArchive size={22} strokeWidth={1.6} color={DOMAIN.primary} />}
                  title="Archivo ZIP"
                  desc="Sube un archivo .zip con la estructura de carpetas dentro."
                  isLoading={isLoading && source === "local_zip"}
                  onClick={() => zipInputRef.current?.click()}
                />

                {/* Google Drive */}
                <SourceCard
                  icon={<Cloud size={22} strokeWidth={1.6} color={driveSelected ? DOMAIN.primary : C.inkLight} />}
                  title="Google Drive"
                  desc="Importar directamente desde una carpeta de Drive."
                  isLoading={isLoading && driveSelected}
                  active={driveSelected}
                  onClick={() => {
                    setDriveSelected(prev => {
                      if (!prev) setDriveConnected(null); // reset so useEffect re-checks
                      return !prev;
                    });
                    setLoadError(null);
                  }}
                />

                {/* Drive panel — shown when Drive card is selected */}
                {driveSelected && (
                  <div style={{
                    background: C.surface, border: `1px solid ${C.blueBorder}`,
                    borderRadius: R.md, padding: `${S[3]}px`,
                    display: "flex", flexDirection: "column" as const, gap: S[3],
                  }}>
                    {/* Connection status */}
                    {driveConnected === null && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, display: "flex", alignItems: "center", gap: S[2] }}>
                        <Loader size={12} strokeWidth={1.6} color={C.inkFaint} />
                        Verificando conexión…
                      </div>
                    )}

                    {driveConnected === false && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          Conecta tu cuenta de Google para acceder a tus carpetas de Drive.
                        </div>
                        <a
                          href={`/api/integrations/google-drive/connect?orgSlug=${orgSlug}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontFamily: T.mono, fontSize: "11px", fontWeight: T.wt.bold,
                            color: "#fff", background: C.blueDark,
                            borderRadius: 6, padding: "7px 14px",
                            textDecoration: "none", letterSpacing: "-0.01em",
                            boxShadow: "0 2px 8px rgba(0,74,173,0.28)",
                            alignSelf: "flex-start" as const,
                          }}
                        >
                          Conectar Google Drive →
                        </a>
                      </div>
                    )}

                    {driveConnected === true && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                          <span style={{ fontFamily: T.mono, fontSize: 10, color: C.green, fontWeight: T.wt.semibold }}>
                            Google Drive conectado
                          </span>
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                          Pega la URL de la carpeta de Drive que contiene tu catálogo.
                        </div>
                        <div style={{ display: "flex", gap: S[2], alignItems: "stretch" }}>
                          <input
                            type="text"
                            value={driveUrl}
                            onChange={e => setDriveUrl(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleDriveAnalyze()}
                            placeholder="https://drive.google.com/drive/folders/…"
                            style={{
                              flex: 1, fontFamily: T.mono, fontSize: 11,
                              border: `1px solid ${driveUrl ? C.blueBorder : C.line}`,
                              borderRadius: R.sm, padding: "7px 10px",
                              outline: "none", color: C.ink, background: "#fff",
                            }}
                          />
                          <button
                            onClick={handleDriveAnalyze}
                            disabled={!driveUrl.trim() || isLoading}
                            style={{
                              fontFamily: T.mono, fontSize: "11px", fontWeight: T.wt.bold,
                              color: "#fff",
                              background: driveUrl.trim() && !isLoading ? DOMAIN.primary : C.inkGhost,
                              border: "none", borderRadius: R.sm,
                              padding: "7px 14px", cursor: driveUrl.trim() && !isLoading ? "pointer" : "not-allowed",
                              whiteSpace: "nowrap" as const, flexShrink: 0,
                            }}
                          >
                            {isLoading ? "Analizando…" : "Analizar carpeta"}
                          </button>
                        </div>
                        {driveFolder && (
                          <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                            Carpeta detectada: <strong>{driveFolder}</strong>
                            {driveIgnored > 0 && ` · ${driveIgnored} archivos ignorados`}
                          </div>
                        )}
                        {drivePermErrors.length > 0 && (
                          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
                            ⚠ {drivePermErrors[0]}
                            {drivePermErrors.length > 1 && ` (+${drivePermErrors.length - 1} más)`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hidden file inputs */}
              <input
                ref={folderInputRef}
                type="file"
                {...{ webkitdirectory: "", mozdirectory: "" } as Record<string, string>}
                multiple
                onChange={handleFolderSelect}
                style={{ display: "none" }}
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipSelect}
                style={{ display: "none" }}
              />

              {/* Structure hint */}
              <div style={{
                background: C.blueLight, borderRadius: R.md,
                padding: `${S[3]}px`, border: `1px solid ${C.blueBorder}`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: T.wt.bold, color: C.blueDark, marginBottom: S[2] }}>
                  Estructura esperada
                </div>
                {["Niño/", "  Conjunto Dino/", "    frontal.jpg", "    trasera.jpg", "  Pantalón Azul/", "    front.jpg", "Niña/", "  Vestido Floral/", "    hero.jpg"].map((line, i) => (
                  <div key={i} style={{ fontFamily: T.mono, fontSize: 10, color: line.endsWith("/") ? C.blueDark : C.inkMid }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2: Análisis ── */}
          {step === 2 && structure && plan && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              {/* Summary strip */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2],
              }}>
                <SummaryKpi value={plan.totalCategories} label="Categorías" />
                <SummaryKpi value={plan.totalReferences} label="Referencias" />
                <SummaryKpi value={plan.totalAssets}     label="Assets" />
              </div>

              {plan.conflicts.length > 0 && (
                <div style={{
                  fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.amber,
                  background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.sm, padding: "10px 14px",
                }}>
                  ⚠ {plan.conflicts.length} conflicto{plan.conflicts.length > 1 ? "s" : ""} detectados.
                  Podrás resolverlos en el paso siguiente.
                </div>
              )}

              {/* Category list */}
              {plan.categories.map(cat => (
                <div key={cat.name} style={{
                  background: C.surface, borderRadius: R.md, border: `1px solid ${C.line}`,
                  overflow: "hidden",
                }}>
                  <button
                    onClick={() => setExpandedCats(prev => {
                      const next = new Set(prev);
                      if (next.has(cat.name)) next.delete(cat.name); else next.add(cat.name);
                      return next;
                    })}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: `${S[3]}px`,
                      background: "transparent", border: "none", cursor: "pointer",
                      textAlign: "left" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      <Package size={14} strokeWidth={1.6} color={DOMAIN.primary} />
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                        {cat.name}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                        {cat.referenceCount} ref · {cat.assetCount} assets
                      </span>
                    </div>
                    {expandedCats.has(cat.name)
                      ? <ChevronUp size={12} color={C.inkFaint} />
                      : <ChevronDown size={12} color={C.inkFaint} />}
                  </button>

                  {expandedCats.has(cat.name) && (
                    <div style={{ padding: `0 ${S[3]}px ${S[3]}px`, display: "flex", flexDirection: "column" as const, gap: 2 }}>
                      {cat.references.slice(0, 20).map(ref => (
                        <div key={ref.name} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: `3px 0`, borderBottom: `1px solid ${C.line}`,
                        }}>
                          <span style={{ fontFamily: T.mono, fontSize: 10, color: C.ink }}>{ref.name}</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {ref.sku && (
                              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                                {ref.sku}
                              </span>
                            )}
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                              {ref.files.length} img
                            </span>
                            {ref.conflict && (
                              <span style={{
                                fontFamily: T.mono, fontSize: 8, color: C.amber,
                                background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                                borderRadius: R.pill, padding: "1px 5px",
                              }}>
                                conflicto
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {cat.references.length > 20 && (
                        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, paddingTop: S[1] }}>
                          + {cat.references.length - 20} más…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── STEP 3: Mapeo ── */}
          {step === 3 && plan && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                El sistema clasifica automáticamente los assets según el nombre del archivo.
              </div>

              {/* Role rules table */}
              <div>
                <div style={{
                  fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                  color: C.inkFaint, textTransform: "uppercase" as const,
                  letterSpacing: "0.08em", marginBottom: S[2],
                }}>
                  Reglas de clasificación
                </div>
                {roleRules.map(rule => {
                  const c = ROLE_COLORS[rule.role] ?? ROLE_COLORS.gallery;
                  return (
                    <div key={rule.role} style={{
                      display: "flex", alignItems: "flex-start", gap: S[3],
                      padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.line}`,
                    }}>
                      <span style={{
                        fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                        color: c.color, background: c.bg, border: `1px solid ${c.border}`,
                        borderRadius: R.pill, padding: "2px 7px", minWidth: 70,
                        textAlign: "center" as const, flexShrink: 0,
                      }}>
                        {ROLE_LABELS[rule.role] ?? rule.role}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkMid, flex: 1 }}>
                        {rule.examples.join(", ")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Conflict resolution (if any) */}
              {plan.conflicts.length > 0 && (
                <div>
                  <div style={{
                    fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold,
                    color: C.inkFaint, textTransform: "uppercase" as const,
                    letterSpacing: "0.08em", marginBottom: S[2],
                  }}>
                    Resolver conflictos ({plan.conflicts.length})
                  </div>
                  {plan.conflicts.map(conflict => (
                    <ConflictRow
                      key={`${conflict.referenceName}-${conflict.sku}`}
                      conflict={conflict}
                      resolution={conflicts.get(conflict.sku ?? conflict.referenceName) ?? "skip"}
                      onChange={res => handleConflictChange(conflict.sku ?? conflict.referenceName, res)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Resumen ── */}
          {step === 4 && plan && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                Revisa el resumen antes de confirmar. Esta operación no se puede deshacer fácilmente.
              </div>

              {/* Final counts */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[2],
              }}>
                {(() => {
                  const { refs, assets } = countExecutableRefs(plan);
                  return [
                    { label: "Categorías a crear",   value: plan.totalCategories },
                    { label: "Referencias a crear",   value: refs },
                    { label: "Assets a importar",     value: assets },
                    { label: "Conflictos detectados", value: plan.conflicts.length },
                  ].map(kpi => (
                    <div key={kpi.label} style={{
                      background: C.surface, border: `1px solid ${C.line}`,
                      borderRadius: R.md, padding: `${S[3]}px`,
                    }}>
                      <div style={{
                        fontFamily: T.mono, fontSize: 22, fontWeight: T.wt.bold,
                        color: kpi.label.includes("Conflictos") && kpi.value > 0 ? C.amber : DOMAIN.primary,
                        lineHeight: 1,
                      }}>
                        {kpi.value}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 3 }}>
                        {kpi.label}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              {plan.conflicts.length > 0 && (
                <div style={{
                  fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.amber,
                  background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                  borderRadius: R.sm, padding: "10px 14px",
                }}>
                  {plan.conflicts.filter(c => conflicts.get(c.sku ?? c.referenceName) === "skip" || !conflicts.has(c.sku ?? c.referenceName)).length} conflicto(s) serán omitidos.
                  Los demás serán importados como nuevas referencias.
                </div>
              )}

              <div style={{
                background: C.blueLight, borderRadius: R.sm,
                padding: `${S[3]}px`, border: `1px solid ${C.blueBorder}`,
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
              }}>
                ℹ Al confirmar, el sistema creará todas las referencias y subirá los assets.
                Si algo falla, la operación se revertirá automáticamente.
              </div>
            </div>
          )}

          {/* ── EXECUTING ── */}
          {step === "exec" && (
            <div style={{
              display: "flex", flexDirection: "column" as const,
              alignItems: "center", gap: S[4], padding: "32px 0",
            }}>
              <Loader size={32} strokeWidth={1.4} color={DOMAIN.primary} style={{ animation: "spin 1s linear infinite" } as React.CSSProperties} />
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                Importando catálogo…
              </div>
              {progress.total > 0 && (
                <>
                  <div style={{ width: "100%", height: 6, borderRadius: R.pill, background: C.line, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      height: "100%", background: DOMAIN.primary,
                      borderRadius: R.pill, transition: "width 0.3s",
                    }} />
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, textAlign: "center" as const }}>
                    {progress.label}
                    <br />
                    {progress.current} / {progress.total} pasos
                  </div>
                </>
              )}
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && result && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                {result.success
                  ? <CheckCircle size={32} strokeWidth={1.4} color={C.green} />
                  : result.rolledBack
                  ? <AlertCircle size={32} strokeWidth={1.4} color={C.red} />
                  : <AlertCircle size={32} strokeWidth={1.4} color={C.amber} />}
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                    {result.rolledBack ? "Importación revertida" : result.success ? "Importación completada" : "Importación parcial"}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginTop: 2 }}>
                    {result.audit.id} · {new Date(result.audit.startedAt).toLocaleTimeString("es-CO")}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
                <SummaryKpi value={result.categoriesCreated} label="Categorías" />
                <SummaryKpi value={result.referencesCreated} label="Referencias" />
                <SummaryKpi value={result.assetsImported}    label="Assets" />
              </div>

              {result.errors.length > 0 && (
                <div style={{
                  background: C.redLight, border: `1px solid ${C.redBorder}`,
                  borderRadius: R.md, padding: `${S[3]}px`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, color: C.red, marginBottom: S[2], textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                    Errores ({result.errors.length})
                  </div>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontFamily: T.mono, fontSize: 10, color: C.red, marginBottom: 2 }}>
                      {e.referenceName}{e.assetName ? ` / ${e.assetName}` : ""}: {e.message}
                    </div>
                  ))}
                  {result.errors.length > 5 && (
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: C.red }}>
                      + {result.errors.length - 5} más…
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <WizardFooter
          step={step}
          plan={plan}
          onBack={() => setStep(prev => typeof prev === "number" && prev > 1 ? (prev - 1) as WizardStep : prev)}
          onNext={() => setStep(prev => typeof prev === "number" && prev < 4 ? (prev + 1) as WizardStep : prev)}
          onExecute={executeImport}
          onClose={onClose}
          canNext={step === 2 ? !!structure && !!plan : true}
        />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function WizardHeader({ step, onClose }: { step: WizardStep; onClose?: () => void }) {
  const STEP_LABELS: Partial<Record<string, string>> = {
    "1": "1. Fuente", "2": "2. Análisis", "3": "3. Mapeo", "4": "4. Confirmar",
    "exec": "Importando…", "done": "Resultado",
  };
  const label = STEP_LABELS[String(step)] ?? "Importar catálogo";

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: S[3],
      padding: "20px 24px 16px", borderBottom: `1px solid ${C.line}`,
      background: "#fafbfc", flexShrink: 0,
    }}>
      <div style={{
        width: MS_APP_ICON.size, height: MS_APP_ICON.size,
        borderRadius: MS_APP_ICON.borderRadius,
        background: `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${MS_PALETTE.product.iconBg} 100%)`,
        boxShadow: MS_SHADOWS.appIcon(MS_PALETTE.product.primary),
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Upload size={MS_APP_ICON.iconSize} strokeWidth={MS_APP_ICON.strokeWidth} color={MS_PALETTE.product.primary} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.cardTitleSize, fontWeight: T.wt.bold, color: C.ink, letterSpacing: "-0.02em" }}>
          Importar catálogo
        </div>
        <div style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.inkMid, marginTop: 4 }}>
          {label}
        </div>
      </div>

      {/* Step dots */}
      {typeof step === "number" && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{
              width: s === step ? 18 : 6, height: 6, borderRadius: R.pill,
              background: s === step ? MS_PALETTE.product.primary : s < step ? `${MS_PALETTE.product.primary}55` : C.line,
              transition: "all 0.2s",
            }} />
          ))}
        </div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: R.pill,
            border: `1px solid ${C.line}`, background: C.surface,
            cursor: "pointer", color: C.inkMid, flexShrink: 0,
          }}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function WizardFooter({
  step, plan, onBack, onNext, onExecute, onClose, canNext,
}: {
  step:      WizardStep;
  plan:      ImportPlan | null;
  onBack:    () => void;
  onNext:    () => void;
  onExecute: () => void;
  onClose:   () => void;
  canNext:   boolean;
}) {
  if (step === "exec") return null;

  return (
    <div style={{
      padding: "12px 24px", borderTop: `1px solid ${C.line}`,
      background: "#fafbfc", display: "flex", gap: S[2],
      justifyContent: "flex-end", flexShrink: 0,
    }}>
      {step === "done" ? (
        <button onClick={onClose} style={primaryBtnStyle}>
          Cerrar
        </button>
      ) : (
        <>
          {typeof step === "number" && step > 1 && (
            <button onClick={onBack} style={ghostBtnStyle}>
              <ArrowLeft size={12} strokeWidth={2} /> Anterior
            </button>
          )}
          {step === 1 && (
            <button onClick={onClose} style={ghostBtnStyle}>
              Cancelar
            </button>
          )}
          {typeof step === "number" && step < 4 && (
            <button
              onClick={onNext}
              disabled={!canNext}
              style={canNext ? primaryBtnStyle : disabledBtnStyle}
            >
              Siguiente <ArrowRight size={12} strokeWidth={2} />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={onExecute}
              disabled={!plan}
              style={plan ? executeBtnStyle : disabledBtnStyle}
            >
              Importar {plan ? `${countExecutableRefs(plan).refs} referencias` : ""} →
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SourceCard({
  icon, title, desc, onClick, isLoading, disabled, badge, active,
}: {
  icon:       React.ReactNode;
  title:      string;
  desc:       string;
  onClick?:   () => void;
  isLoading?: boolean;
  disabled?:  boolean;
  badge?:     string;
  active?:    boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled || isLoading}
      style={{
        display: "flex", alignItems: "flex-start", gap: S[3],
        padding: `${S[3]}px`, borderRadius: R.md, textAlign: "left" as const,
        background: disabled ? C.surface : active ? DOMAIN.selectedBg : DOMAIN.cardBg,
        border: `1.5px solid ${disabled ? C.line : active ? DOMAIN.primary : `${DOMAIN.primary}33`}`,
        cursor: disabled ? "not-allowed" : isLoading ? "wait" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "all 0.12s",
        width: "100%",
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: R.md,
        background: disabled ? C.line : `linear-gradient(145deg, rgba(255,255,255,0.9) 0%, ${DOMAIN.iconBg} 100%)`,
        boxShadow: disabled ? "none" : MS_SHADOWS.appIcon(DOMAIN.primary),
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {isLoading ? <Loader size={18} strokeWidth={1.6} color={DOMAIN.primary} /> : icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: disabled ? C.inkFaint : C.ink }}>
            {title}
          </span>
          {badge && (
            <span style={{
              fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold,
              color: C.amber, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
              borderRadius: R.pill, padding: "1px 6px", letterSpacing: "0.04em",
            }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.inkFaint, marginTop: 3 }}>
          {desc}
        </div>
      </div>
      {!disabled && !isLoading && (
        <ArrowRight size={14} strokeWidth={1.6} color={DOMAIN.primary} style={{ marginTop: 12, flexShrink: 0 }} />
      )}
    </button>
  );
}

function SummaryKpi({ value, label }: { value: number; label: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.md, padding: `${S[3]}px`,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 22, fontWeight: T.wt.bold,
        color: DOMAIN.primary, lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

function ConflictRow({
  conflict, resolution, onChange,
}: {
  conflict:   ImportConflict;
  resolution: ConflictResolution;
  onChange:   (r: ConflictResolution) => void;
}) {
  return (
    <div style={{
      padding: `${S[2]}px ${S[3]}px`,
      background: C.amberLight, border: `1px solid ${C.amberBorder}`,
      borderRadius: R.sm, marginBottom: S[2],
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[2] }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
            {conflict.referenceName}
          </div>
          {conflict.sku && (
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
              SKU: {conflict.sku} ya existe
            </div>
          )}
        </div>
        <select
          value={resolution}
          onChange={e => onChange(e.target.value as ConflictResolution)}
          style={{
            fontFamily: T.mono, fontSize: 10, color: C.ink,
            background: "#fff", border: `1px solid ${C.amberBorder}`,
            borderRadius: R.sm, padding: "4px 8px", cursor: "pointer",
          }}
        >
          <option value="skip">Omitir</option>
          <option value="duplicate">Crear duplicado</option>
        </select>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map internal role to ProductAssetLink role accepted by assets API */
function mapRoleForUpload(role: string): string {
  const map: Record<string, string> = {
    hero:       "hero",
    raw_back:   "gallery",
    raw_detail: "gallery",
    gallery:    "gallery",
    video:      "video",
    document:   "document",
  };
  return map[role] ?? "gallery";
}

function buildAudit(params: {
  orgSlug:          string;
  organizationId:   string;
  source:           string;
  startedAt:        string;
  refsCreated:      number;
  assetsImported:   number;
  conflictsDetected: number;
  errors:           string[];
  status:           "success" | "partial" | "failed" | "rolled_back";
}): ImportAuditRecord {
  return {
    id:                 `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`,
    startedAt:          params.startedAt,
    completedAt:        new Date().toISOString(),
    source:             params.source as ImportAuditRecord["source"],
    orgSlug:            params.orgSlug,
    organizationId:     params.organizationId,
    totalCategories:    0,
    referencesCreated:  params.refsCreated,
    assetsImported:     params.assetsImported,
    conflictsDetected:  params.conflictsDetected,
    errors:             params.errors,
    status:             params.status,
  };
}

// ── Button styles ─────────────────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  fontFamily: T.mono, fontSize: "11px", fontWeight: T.wt.bold,
  color: "#fff", background: MS_CTA.primaryButtonBg, border: "none",
  borderRadius: R.sm, padding: "8px 14px", cursor: "pointer",
  boxShadow: MS_CTA.primaryBoxShadow, letterSpacing: "-0.01em",
};

const executeBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: C.green, boxShadow: "none",
};

const ghostBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  fontFamily: T.mono, fontSize: "11px", fontWeight: T.wt.semibold,
  color: C.inkMid, background: "transparent", border: "none",
  borderRadius: R.sm, padding: "8px 12px", cursor: "pointer",
};

const disabledBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: C.inkGhost, boxShadow: "none", cursor: "not-allowed",
};
