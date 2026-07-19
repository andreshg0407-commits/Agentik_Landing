"use client";

/**
 * Branding configuration client — tenant corporate identity editor.
 *
 * Sprint: TENANT-BRANDING-FOUNDATION-01
 * Sprint: TENANT-BRANDING-IMPORT-01 — import section + AI extraction
 * Sprint: TENANT-BRANDING-SAVED-STATE-UX-01 — VIEW/EDIT mode
 */

import { useState, useCallback, useRef } from "react";
import { C, T, S, R, E, panel, panelHeader } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type { OrganizationBrandingData } from "@/lib/tenant/branding";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function brandingApi(orgSlug: string, action: string, data?: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/branding`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  if (!res.ok) {
    try {
      const body = await res.json();
      return { error: body.error ?? `Error del servidor (${res.status}).` };
    } catch {
      return { error: `Error del servidor (${res.status}). Intenta de nuevo.` };
    }
  }
  return res.json();
}

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ── Field definitions ────────────────────────────────────────────────────────

interface FieldDef {
  key: keyof OrganizationBrandingData;
  label: string;
  placeholder?: string;
  type?: "text" | "color" | "url";
}

const IDENTITY_FIELDS: FieldDef[] = [
  { key: "commercialName", label: "Nombre comercial", placeholder: "Nombre visible de la empresa" },
  { key: "legalName",      label: "Razon social",     placeholder: "Razon social registrada" },
  { key: "taxId",          label: "NIT / RUT",        placeholder: "Ej. 900.123.456-7" },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: "address", label: "Direccion",   placeholder: "Direccion comercial" },
  { key: "city",    label: "Ciudad",      placeholder: "Ciudad" },
  { key: "country", label: "Pais",        placeholder: "Colombia" },
  { key: "phone",   label: "Telefono",    placeholder: "+57 300 000 0000" },
  { key: "email",   label: "Email",       placeholder: "contacto@empresa.com" },
  { key: "website", label: "Sitio web",   placeholder: "https://www.empresa.com", type: "url" },
];

const VISUAL_FIELDS: FieldDef[] = [
  { key: "primaryColor",   label: "Color principal",   placeholder: "#004AAD", type: "color" },
  { key: "secondaryColor", label: "Color secundario",  placeholder: "#1e1e2e", type: "color" },
  { key: "accentColor",    label: "Color acento",      placeholder: "#004AAD", type: "color" },
  { key: "logoUrl",        label: "Logo URL",          placeholder: "https://...", type: "url" },
  { key: "logoDarkUrl",    label: "Logo oscuro URL",   placeholder: "https://...", type: "url" },
  { key: "logoMonoUrl",    label: "Logo mono URL",     placeholder: "https://...", type: "url" },
];

const DOCUMENT_FIELDS: FieldDef[] = [
  { key: "documentFooter", label: "Pie de documento", placeholder: "Texto que aparece al final de documentos generados" },
];

const SOCIAL_FIELDS: FieldDef[] = [
  { key: "socialInstagram", label: "Instagram", placeholder: "@usuario" },
  { key: "socialFacebook",  label: "Facebook",  placeholder: "https://facebook.com/..." },
  { key: "socialWhatsapp",  label: "WhatsApp",  placeholder: "+57 300 000 0000" },
];

const ALL_FORM_KEYS = [
  ...IDENTITY_FIELDS, ...CONTACT_FIELDS, ...VISUAL_FIELDS,
  ...DOCUMENT_FIELDS, ...SOCIAL_FIELDS,
].map(f => f.key);

// ── Import types ─────────────────────────────────────────────────────────────

interface ImportFile {
  file: File;
  role: "logo" | "logo_dark" | "logo_mono" | "brand_manual";
  preview?: string;
}

interface ExtractionResult {
  commercialName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  documentFooter?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialWhatsapp?: string;
  fonts?: string[];
  logoUsageNotes?: string;
  confidence: "high" | "medium" | "low";
}

interface UploadedAsset {
  url: string;
  role: string;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function brandingToFormRecord(b: OrganizationBrandingData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ALL_FORM_KEYS) {
    out[k] = String(b[k] ?? "");
  }
  return out;
}

function hasSavedBranding(b: OrganizationBrandingData): boolean {
  return b.isPersisted === true;
}

// ── Component ────────────────────────────────────────────────────────────────

export function BrandingConfigClient({
  orgSlug,
  initial,
}: {
  orgSlug: string;
  initial: OrganizationBrandingData;
}) {
  // Saved branding state — reflects what is persisted in the DB
  const [savedBranding, setSavedBranding] = useState<OrganizationBrandingData>(initial);

  // Mode: view (read-only identity card) or edit (form)
  const [mode, setMode] = useState<"view" | "edit">(
    hasSavedBranding(initial) ? "view" : "edit"
  );

  const [form, setForm] = useState<Record<string, string>>(() => brandingToFormRecord(initial));

  const [saving, setSaving]       = useState(false);
  const [feedback, setFeedback]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // Import state
  const [importFiles, setImportFiles]     = useState<ImportFile[]>([]);
  const [importing, setImporting]         = useState(false);
  const [extraction, setExtraction]       = useState<ExtractionResult | null>(null);
  const [uploadedLogos, setUploadedLogos] = useState<UploadedAsset[]>([]);
  const [importError, setImportError]     = useState<string | null>(null);
  const [dragOver, setDragOver]           = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onChange = useCallback((key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFeedback(null);
    setError(null);
  }, []);

  const enterEditMode = useCallback(() => {
    setForm(brandingToFormRecord(savedBranding));
    setFeedback(null);
    setError(null);
    setMode("edit");
  }, [savedBranding]);

  const cancelEdit = useCallback(() => {
    setForm(brandingToFormRecord(savedBranding));
    setFeedback(null);
    setError(null);
    setExtraction(null);
    setImportFiles([]);
    setUploadedLogos([]);
    setImportError(null);
    setMode("view");
  }, [savedBranding]);

  const enterImportMode = useCallback(() => {
    setForm(brandingToFormRecord(savedBranding));
    setFeedback(null);
    setError(null);
    setMode("edit");
  }, [savedBranding]);

  const onSave = useCallback(async () => {
    // Client-side validation
    const validationErrors: string[] = [];

    for (const f of VISUAL_FIELDS) {
      if (f.type === "color") {
        const val = (form[f.key] ?? "").trim();
        if (val !== "" && !HEX_RE.test(val)) {
          validationErrors.push(`${f.label}: formato hex invalido (ej. #004AAD).`);
        }
      }
    }

    for (const f of [...VISUAL_FIELDS, ...CONTACT_FIELDS]) {
      if (f.type === "url") {
        const val = (form[f.key] ?? "").trim();
        if (val !== "" && !URL_RE.test(val)) {
          validationErrors.push(`${f.label}: debe comenzar con http:// o https://`);
        }
      }
    }

    const emailVal = (form.email ?? "").trim();
    if (emailVal !== "" && !EMAIL_RE.test(emailVal)) {
      validationErrors.push("Email: formato invalido.");
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await brandingApi(orgSlug, "upsert", form);
      if (result.error) {
        setError(result.error);
        return;
      }

      // Refresh saved state from API to ensure consistency
      const fresh = await brandingApi(orgSlug, "get");
      if (fresh.branding) {
        setSavedBranding(fresh.branding);
      }

      setFeedback("Identidad corporativa guardada.");
      setExtraction(null);
      setImportFiles([]);
      setUploadedLogos([]);
      setImportError(null);
      setMode("view");
    } catch (e: any) {
      setError(e?.message ?? "Error de conexion al guardar. Verifica tu conexion e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [orgSlug, form]);

  // ── Import handlers ───────────────────────────────────────────────────

  const LOGO_EXTS  = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);
  const PDF_EXTS   = new Set(["application/pdf"]);

  function inferRole(file: File, existing: ImportFile[]): ImportFile["role"] | null {
    const mime = file.type.toLowerCase();
    if (PDF_EXTS.has(mime)) return "brand_manual";
    if (!LOGO_EXTS.has(mime)) return null;

    const name = file.name.toLowerCase();
    if (name.includes("dark") || name.includes("oscuro") || name.includes("negro"))
      return "logo_dark";
    if (name.includes("mono") || name.includes("bw") || name.includes("blanco"))
      return "logo_mono";

    const hasLogo = existing.some(f => f.role === "logo");
    if (!hasLogo) return "logo";
    const hasDark = existing.some(f => f.role === "logo_dark");
    if (!hasDark) return "logo_dark";
    const hasMono = existing.some(f => f.role === "logo_mono");
    if (!hasMono) return "logo_mono";
    return "logo";
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setImportError(null);
    setImportFiles(prev => {
      let updated = [...prev];
      for (const file of arr) {
        const role = inferRole(file, updated);
        if (!role) {
          setImportError(`Archivo no soportado: ${file.name}`);
          continue;
        }
        updated = updated.filter(f => f.role !== role);
        const preview = LOGO_EXTS.has(file.type.toLowerCase())
          ? URL.createObjectURL(file) : undefined;
        updated.push({ file, role, preview });
      }
      return updated;
    });
  }

  function removeFile(role: string) {
    setImportFiles(prev => {
      const removed = prev.find(f => f.role === role);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter(f => f.role !== role);
    });
  }

  async function handleImport() {
    if (importFiles.length === 0) return;
    setImporting(true);
    setImportError(null);
    setExtraction(null);
    setUploadedLogos([]);

    try {
      const fd = new FormData();
      for (const f of importFiles) {
        fd.append(f.role, f.file);
      }

      const res = await fetch(`/api/orgs/${orgSlug}/branding/import`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (data.errors?.length && !data.uploads?.length) {
        setImportError(data.errors.map((e: any) => e.error).join(". "));
        return;
      }

      const logos: UploadedAsset[] = (data.uploads ?? []).filter(
        (u: any) => u.role !== "brand_manual"
      );
      setUploadedLogos(logos);

      for (const logo of logos) {
        if (logo.role === "logo")      onChange("logoUrl", logo.url);
        if (logo.role === "logo_dark") onChange("logoDarkUrl", logo.url);
        if (logo.role === "logo_mono") onChange("logoMonoUrl", logo.url);
      }

      if (data.extraction) {
        setExtraction(data.extraction);
      }

      if (data.errors?.length) {
        setImportError(`Algunos archivos con error: ${data.errors.map((e: any) => e.error).join(". ")}`);
      }
    } catch {
      setImportError("Error al importar archivos.");
    } finally {
      setImporting(false);
    }
  }

  function applyExtraction() {
    if (!extraction) return;
    const fields = [
      "commercialName", "legalName", "taxId", "address", "city", "country",
      "phone", "email", "website", "primaryColor", "secondaryColor", "accentColor",
      "documentFooter", "socialInstagram", "socialFacebook", "socialWhatsapp",
    ] as const;

    setForm(prev => {
      const updated = { ...prev };
      for (const f of fields) {
        const val = (extraction as any)[f];
        if (typeof val === "string" && val.length > 0) {
          updated[f] = val;
        }
      }
      return updated;
    });

    setFeedback("Datos extraidos aplicados al formulario. Revisa y guarda.");
    setExtraction(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const sectionStyle = { ...panel, marginBottom: S[4] };

  const sectionHeaderStyle = {
    ...panelHeader,
    fontFamily: T.mono,
    fontSize: T.sz.xs,
    fontWeight: T.wt.semibold,
    color: C.blueDark,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  };

  const ROLE_LABELS: Record<string, string> = {
    logo: "Logo principal",
    logo_dark: "Logo oscuro",
    logo_mono: "Logo monocromo",
    brand_manual: "Manual de marca (PDF)",
  };

  const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
    high:   { label: "Alta confianza", color: C.green },
    medium: { label: "Confianza media", color: C.amber },
    low:    { label: "Baja confianza", color: C.red },
  };

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 800, padding: `${S[6]}px` }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Configuracion", href: `/${orgSlug}/configuracion/branding` },
          { label: "Identidad corporativa" },
        ]}
        title="Identidad corporativa"
        subtitle="Marca, datos legales y configuracion visual del tenant"
        status={hasSavedBranding(savedBranding) ? "ok" : "neutral"}
        statusLabel={hasSavedBranding(savedBranding) ? "Configurada" : "Sin configurar"}
      />

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* VIEW MODE                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "view" && hasSavedBranding(savedBranding) && (
        <>
          {/* Success feedback after save */}
          {feedback && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green,
              padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
              background: `${C.green}0a`, border: `1px solid ${C.green}30`,
              borderRadius: R.sm,
            }}>
              {feedback}
            </div>
          )}

          {/* Identity Card */}
          <div style={{
            ...panel,
            marginBottom: S[4],
            borderLeft: `4px solid ${savedBranding.primaryColor || C.blueDark}`,
          }}>
            <div style={{
              ...panelHeader,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                IDENTIDAD CORPORATIVA ACTIVA
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"],
                color: C.green, background: `${C.green}0a`,
                border: `1px solid ${C.green}30`, borderRadius: R.pill,
                padding: "1px 8px",
              }}>
                Guardada
              </span>
            </div>

            <div style={{ padding: `${S[4]}px ${S[5]}px` }}>
              {/* Logo + name strip */}
              <div style={{
                display: "flex", alignItems: "center", gap: S[4],
                marginBottom: S[4], paddingBottom: S[4],
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                {savedBranding.logoUrl ? (
                  <img
                    src={savedBranding.logoUrl}
                    alt="Logo"
                    style={{
                      height: 48, maxWidth: 140, objectFit: "contain",
                      borderRadius: R.sm, border: `1px solid ${C.line}`,
                      padding: 4, background: C.white,
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: R.sm,
                    background: savedBranding.primaryColor || C.blueDark,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: T.mono, fontSize: T.sz.lg, color: C.white,
                    fontWeight: T.wt.bold, flexShrink: 0,
                  }}>
                    {(savedBranding.commercialName || "?")[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                    color: C.ink,
                  }}>
                    {savedBranding.commercialName || "\u2014"}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                    {savedBranding.legalName || "\u2014"}
                    {savedBranding.taxId ? ` \u00b7 ${savedBranding.taxId}` : ""}
                  </div>
                </div>
                {/* Color swatches */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {[savedBranding.primaryColor, savedBranding.secondaryColor, savedBranding.accentColor]
                    .filter(Boolean)
                    .map((c, i) => (
                      <div key={i} style={{ textAlign: "center" }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: R.sm,
                          background: c, border: `1px solid ${C.line}`,
                          display: "inline-block",
                        }} />
                        <div style={{
                          fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                          marginTop: 2,
                        }}>{c}</div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Detail grid */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[3]}px ${S[5]}px`,
              }}>
                {renderViewField("Direccion", savedBranding.address)}
                {renderViewField("Ciudad", savedBranding.city)}
                {renderViewField("Pais", savedBranding.country)}
                {renderViewField("Telefono", savedBranding.phone)}
                {renderViewField("Email", savedBranding.email)}
                {renderViewField("Sitio web", savedBranding.website)}
                {renderViewField("Instagram", savedBranding.socialInstagram)}
                {renderViewField("Facebook", savedBranding.socialFacebook)}
                {renderViewField("WhatsApp", savedBranding.socialWhatsapp)}
              </div>

              {/* Document footer preview */}
              {savedBranding.documentFooter && (
                <div style={{
                  marginTop: S[4], padding: `${S[3]}px ${S[4]}px`,
                  background: C.surface, borderRadius: R.sm,
                  borderTop: `3px solid ${savedBranding.primaryColor || C.blueDark}`,
                }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                    textTransform: "uppercase" as const, letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}>
                    Pie de documento
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    {savedBranding.documentFooter}
                  </div>
                </div>
              )}

              {/* Logo variants row */}
              {(savedBranding.logoDarkUrl || savedBranding.logoMonoUrl) && (
                <div style={{
                  marginTop: S[4], display: "flex", gap: S[4], alignItems: "center",
                }}>
                  {savedBranding.logoDarkUrl && (
                    <div style={{ textAlign: "center" }}>
                      <img
                        src={savedBranding.logoDarkUrl}
                        alt="Logo oscuro"
                        style={{
                          height: 32, maxWidth: 100, objectFit: "contain",
                          borderRadius: R.sm, border: `1px solid ${C.line}`,
                          padding: 3, background: "#1e1e2e",
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 2 }}>
                        Oscuro
                      </div>
                    </div>
                  )}
                  {savedBranding.logoMonoUrl && (
                    <div style={{ textAlign: "center" }}>
                      <img
                        src={savedBranding.logoMonoUrl}
                        alt="Logo mono"
                        style={{
                          height: 32, maxWidth: 100, objectFit: "contain",
                          borderRadius: R.sm, border: `1px solid ${C.line}`,
                          padding: 3, background: C.white,
                        }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 2 }}>
                        Mono
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action tray */}
          <div className="ag-action-tray" style={{ display: "flex", gap: S[3] }}>
            <button
              onClick={enterEditMode}
              className="ag-action-primary"
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                padding: `${S[2]}px ${S[5]}px`,
              }}
            >
              Editar identidad
            </button>
            <button
              onClick={enterImportMode}
              className="ag-action-secondary"
              style={{
                fontFamily: T.mono, fontSize: T.sz.xs,
                padding: `${S[2]}px ${S[5]}px`,
              }}
            >
              Reimportar desde manual
            </button>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* EDIT MODE                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "edit" && (
        <>
          {/* ── IMPORT SECTION ──────────────────────────────────────────── */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>IMPORTAR IDENTIDAD DE MARCA</div>
            <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
                marginBottom: S[3],
              }}>
                Sube el manual de marca (PDF) y los logos. Agentik extrae automaticamente
                colores, datos de contacto y razon social.
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? C.blueDark : C.line}`,
                  borderRadius: R.card,
                  padding: `${S[5]}px`,
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragOver ? C.surface : C.white,
                  transition: "all 0.15s ease",
                  marginBottom: S[3],
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.svg,.webp"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                />
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: 4 }}>
                  Arrastra archivos aqui o haz clic para seleccionar
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  PDF (manual de marca) · PNG / JPG / SVG / WebP (logos)
                </div>
              </div>

              {/* Selected files */}
              {importFiles.length > 0 && (
                <div style={{ marginBottom: S[3] }}>
                  {importFiles.map(f => (
                    <div key={f.role} style={{
                      display: "flex", alignItems: "center", gap: S[3],
                      padding: `${S[2]}px 0`,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                    }}>
                      {f.preview ? (
                        <img src={f.preview} alt={f.role} style={{
                          width: 36, height: 36, objectFit: "contain",
                          borderRadius: R.sm, border: `1px solid ${C.line}`,
                        }} />
                      ) : (
                        <span style={{
                          width: 36, height: 36, display: "flex", alignItems: "center",
                          justifyContent: "center", borderRadius: R.sm,
                          background: C.surface, border: `1px solid ${C.line}`,
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                        }}>PDF</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.medium }}>
                          {ROLE_LABELS[f.role]}
                        </div>
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {f.file.name} · {(f.file.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(f.role); }}
                        style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
                          background: "none", border: "none", cursor: "pointer",
                          padding: `${S[1]}px ${S[2]}px`,
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {importError && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginBottom: S[2] }}>
                  {importError}
                </div>
              )}

              {importFiles.length > 0 && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="ag-action-primary"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"],
                    padding: `${S[1] + 2}px ${S[4]}px`,
                    cursor: importing ? "wait" : "pointer",
                    opacity: importing ? 0.6 : 1,
                  }}
                >
                  {importing ? "Importando..." : "Subir y extraer identidad"}
                </button>
              )}
            </div>
          </div>

          {/* ── EXTRACTION PREVIEW ──────────────────────────────────────── */}
          {extraction && (
            <div style={{
              ...panel,
              marginBottom: S[4],
              borderLeft: `4px solid ${C.blueDark}`,
            }}>
              <div style={{
                ...panelHeader,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: C.blueDark, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                }}>
                  DATOS EXTRAIDOS DEL MANUAL
                </span>
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"],
                  color: CONFIDENCE_LABELS[extraction.confidence]?.color ?? C.inkFaint,
                  background: C.surface, border: `1px solid ${C.line}`,
                  borderRadius: R.pill, padding: "1px 8px",
                }}>
                  {CONFIDENCE_LABELS[extraction.confidence]?.label ?? extraction.confidence}
                </span>
              </div>

              <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[3] }}>
                  {renderExtractionField("Nombre comercial", extraction.commercialName)}
                  {renderExtractionField("Razon social", extraction.legalName)}
                  {renderExtractionField("NIT", extraction.taxId)}
                  {renderExtractionField("Ciudad", extraction.city)}
                  {renderExtractionField("Telefono", extraction.phone)}
                  {renderExtractionField("Email", extraction.email)}
                  {renderExtractionField("Website", extraction.website)}
                  {renderExtractionField("Direccion", extraction.address)}
                </div>

                {(extraction.primaryColor || extraction.secondaryColor || extraction.accentColor) && (
                  <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[3] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Colores:</span>
                    {[extraction.primaryColor, extraction.secondaryColor, extraction.accentColor]
                      .filter(Boolean)
                      .map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: R.sm,
                            background: c, border: `1px solid ${C.line}`, display: "inline-block",
                          }} />
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{c}</span>
                        </div>
                      ))}
                  </div>
                )}

                {extraction.fonts && extraction.fonts.length > 0 && (
                  <div style={{ marginBottom: S[3] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                      Tipografias: {extraction.fonts.join(", ")}
                    </span>
                  </div>
                )}

                {extraction.logoUsageNotes && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
                    background: C.surface, borderRadius: R.sm,
                    padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
                  }}>
                    {extraction.logoUsageNotes}
                  </div>
                )}

                {extraction.documentFooter && (
                  <div style={{
                    marginBottom: S[3],
                    padding: `${S[3]}px ${S[4]}px`,
                    background: C.white,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    borderTop: `3px solid ${extraction.primaryColor || C.blueDark}`,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 4 }}>
                      Vista previa: pie de documento
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      {extraction.documentFooter}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: S[3] }}>
                  <button
                    onClick={applyExtraction}
                    className="ag-action-primary"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      padding: `${S[1] + 2}px ${S[4]}px`,
                    }}
                  >
                    Aplicar al formulario
                  </button>
                  <button
                    onClick={() => setExtraction(null)}
                    className="ag-action-ghost"
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      padding: `${S[1] + 2}px ${S[4]}px`,
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Uploaded logos feedback ─────────────────────────────────── */}
          {uploadedLogos.length > 0 && !extraction && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green,
              marginBottom: S[3],
            }}>
              {uploadedLogos.length} logo{uploadedLogos.length > 1 ? "s" : ""} subido{uploadedLogos.length > 1 ? "s" : ""} y aplicado{uploadedLogos.length > 1 ? "s" : ""} al formulario.
            </div>
          )}

          {/* ── PREVIEW STRIP ──────────────────────────────────────────── */}
          {(form.primaryColor || form.logoUrl) && (
            <div style={{
              ...panel,
              marginBottom: S[4],
              padding: `${S[4]}px ${S[5]}px`,
              display: "flex",
              alignItems: "center",
              gap: S[4],
              borderLeft: `4px solid ${form.primaryColor || C.blueDark}`,
            }}>
              {form.logoUrl && (
                <img
                  src={form.logoUrl}
                  alt="Logo"
                  style={{ height: 40, maxWidth: 120, objectFit: "contain" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div>
                <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  {form.commercialName || "\u2014"}
                </div>
                <div style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>
                  {form.legalName || "\u2014"} {form.taxId ? `\u00b7 ${form.taxId}` : ""}
                </div>
              </div>
              {form.primaryColor && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  {[form.primaryColor, form.secondaryColor, form.accentColor].filter(Boolean).map((c, i) => (
                    <span key={i} style={{
                      width: 20, height: 20, borderRadius: R.sm,
                      background: c, border: `1px solid ${C.line}`,
                      display: "inline-block",
                    }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FORM SECTIONS ──────────────────────────────────────────── */}
          {renderSection("IDENTIDAD", IDENTITY_FIELDS)}
          {renderSection("CONTACTO", CONTACT_FIELDS)}
          {renderSection("VISUAL", VISUAL_FIELDS)}
          {renderSection("DOCUMENTO", DOCUMENT_FIELDS)}
          {renderSection("REDES SOCIALES", SOCIAL_FIELDS)}

          {/* Feedback / Error */}
          {feedback && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
              padding: `${S[2]}px 0`, marginBottom: S[3],
            }}>
              {feedback}
            </div>
          )}
          {error && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
              padding: `${S[2]}px 0`, marginBottom: S[3],
            }}>
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
            <button
              onClick={onSave}
              disabled={saving}
              className="ag-action-primary"
              style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                padding: `${S[2]}px ${S[5]}px`,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Guardando..." : "Guardar identidad corporativa"}
            </button>
            {hasSavedBranding(savedBranding) && (
              <button
                onClick={cancelEdit}
                className="ag-action-ghost"
                style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  padding: `${S[2]}px ${S[5]}px`,
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ── Helpers ──────────────────────────────────────────────────────────

  function renderViewField(label: string, value: string) {
    return (
      <div style={{ padding: `${S[1]}px 0` }}>
        <div style={{
          fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
          textTransform: "uppercase" as const, letterSpacing: "0.08em",
        }}>
          {label}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink,
          fontWeight: value ? T.wt.medium : T.wt.normal,
        }}>
          {value || "\u2014"}
        </div>
      </div>
    );
  }

  function renderExtractionField(label: string, value?: string) {
    if (!value) return null;
    return (
      <div style={{ padding: `${S[1]}px 0` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: T.wt.medium }}>
          {value}
        </div>
      </div>
    );
  }

  function renderSection(title: string, fields: FieldDef[]) {
    return (
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>{title}</div>
        <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
          {fields.map(f => (
            <div key={f.key} style={{
              display: "flex", alignItems: "center", gap: S[3],
              marginBottom: S[3],
            }}>
              <label style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                width: 140, flexShrink: 0,
              }}>
                {f.label}
              </label>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                {f.type === "color" && form[f.key] && HEX_RE.test(form[f.key]) && (
                  <span style={{
                    width: 16, height: 16, borderRadius: R.sm,
                    background: form[f.key], border: `1px solid ${C.line}`,
                    display: "inline-block", flexShrink: 0,
                  }} />
                )}
                <input
                  type="text"
                  value={form[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={e => onChange(f.key, e.target.value)}
                  style={{
                    fontFamily: T.mono,
                    fontSize: T.sz.xs,
                    color: C.ink,
                    background: C.white,
                    border: `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    padding: `${S[1] + 2}px ${S[2]}px`,
                    width: "100%",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
