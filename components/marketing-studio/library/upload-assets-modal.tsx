/**
 * components/marketing-studio/library/upload-assets-modal.tsx
 *
 * MARKETING-STUDIO-ASSET-UPLOAD-01
 *
 * Modal for uploading assets directly to a ProductEntity reference.
 *
 * ── Supported types ───────────────────────────────────────────────────────────
 *   Images:    jpg, jpeg, png, webp
 *   Videos:    mp4, mov
 *   Documents: pdf
 *
 * ── Roles ─────────────────────────────────────────────────────────────────────
 *   hero | gallery | video | document
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *   Select files → assign role → upload → success callback with new assetDetails
 *
 * ── Design rules ──────────────────────────────────────────────────────────────
 *   MS Design System tokens only. No raw hex.
 */

"use client";

import { useState, useRef }  from "react";
import { X, Upload, File as FileIcon, ImageIcon, Video, FileText } from "lucide-react";
import { C, T, S, R }       from "@/lib/ui/tokens";
import {
  MS_PALETTE, MS_SHADOWS, MS_APP_ICON, MS_CTA, MS_TYPOGRAPHY,
} from "@/lib/marketing-studio/ms-design-system";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UploadedAsset {
  id:        string;
  assetUrl:  string;
  role:      string;
  createdAt: string;
}

interface UploadAssetsModalProps {
  organizationId: string;
  orgSlug:        string;
  productId:      string;
  onSuccess:      (assets: UploadedAsset[]) => void;
  onClose:        () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN = MS_PALETTE.product;

const ROLES = [
  { value: "hero",     label: "Hero",       desc: "Imagen principal del producto" },
  { value: "gallery",  label: "Galería",    desc: "Imágenes adicionales"          },
  { value: "video",    label: "Video",      desc: "Video del producto"            },
  { value: "document", label: "Documento",  desc: "PDF, ficha técnica"            },
];

const ACCEPTED_MIME = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf";

const MAX_FILES = 10;

// ── File preview helper ────────────────────────────────────────────────────────

function filePreviewUrl(file: File): string | null {
  if (file.type.startsWith("image/")) return URL.createObjectURL(file);
  return null;
}

function FileTypeIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }) {
  if (mimeType.startsWith("image/"))  return <ImageIcon size={size} strokeWidth={1.4} color={DOMAIN.primary} />;
  if (mimeType.startsWith("video/"))  return <Video      size={size} strokeWidth={1.4} color={C.amber}       />;
  if (mimeType === "application/pdf") return <FileText   size={size} strokeWidth={1.4} color={C.red}         />;
  return <FileIcon size={size} strokeWidth={1.4} color={C.inkFaint} />;
}

// ── Per-file row ───────────────────────────────────────────────────────────────

interface FileRowState {
  file:     File;
  preview:  string | null;
  status:   "pending" | "uploading" | "done" | "error";
  error?:   string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UploadAssetsModal({
  organizationId,
  orgSlug,
  productId,
  onSuccess,
  onClose,
}: UploadAssetsModalProps) {
  const [files,     setFiles]     = useState<FileRowState[]>([]);
  const [role,      setRole]      = useState("gallery");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const valid    = selected.filter(f => ACCEPTED_MIME.includes(f.type));
    const invalid  = selected.filter(f => !ACCEPTED_MIME.includes(f.type));

    if (invalid.length > 0) {
      setFormError(`Tipos no soportados: ${invalid.map(f => f.name).join(", ")}`);
    } else {
      setFormError(null);
    }

    const combined = [...files, ...valid.map<FileRowState>(f => ({
      file:    f,
      preview: filePreviewUrl(f),
      status:  "pending",
    }))].slice(0, MAX_FILES);

    setFiles(combined);
    // Reset input so same files can be re-selected
    if (e.target) e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles(prev => {
      const next    = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setFormError(null);

    const formData = new FormData();
    formData.append("role", role);
    files.forEach(fr => formData.append("files", fr.file));

    // Set all to uploading
    setFiles(prev => prev.map(f => ({ ...f, status: "uploading" })));

    try {
      const res  = await fetch(
        `/api/orgs/${orgSlug}/marketing-studio/products/${productId}/assets`,
        { method: "POST", body: formData },
      );
      const data = await res.json() as {
        ok: boolean;
        assets: UploadedAsset[];
        errors: { fileName: string; error: string }[];
      };

      if (!res.ok) {
        setFormError(data && "error" in data ? (data as { error: string }).error : "Upload failed");
        setFiles(prev => prev.map(f => ({ ...f, status: "error" })));
        return;
      }

      // Match results back to file rows by position
      const errorMap = new Map(data.errors.map(e => [e.fileName, e.error]));
      setFiles(prev => prev.map(f => {
        const err = errorMap.get(f.file.name);
        return { ...f, status: err ? "error" : "done", error: err };
      }));

      if (data.assets.length > 0) {
        onSuccess(data.assets);
      }
      if (data.errors.length > 0 && data.assets.length === 0) {
        setFormError(`${data.errors.length} archivo(s) fallaron. Revisa los errores.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setFormError(msg);
      setFiles(prev => prev.map(f => ({ ...f, status: "error" })));
    } finally {
      setUploading(false);
    }
  }

  const canUpload = files.some(f => f.status === "pending") && !uploading;

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(10,15,30,0.50)",
        backdropFilter: "blur(3px)",
        zIndex:         9100,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        S[4],
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:    "#fff",
        border:        `1px solid ${C.line}`,
        borderRadius:  16,
        boxShadow:     "0 24px 64px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.06)",
        width:         "100%",
        maxWidth:      520,
        maxHeight:     "90vh",
        display:       "flex",
        flexDirection: "column" as const,
        overflow:      "hidden",
      }}>

        {/* Header */}
        <div style={{
          display:      "flex",
          alignItems:   "flex-start",
          gap:          S[3],
          padding:      "20px 20px 16px",
          borderBottom: `1px solid ${C.line}`,
          background:   "#fafbfc",
          flexShrink:   0,
        }}>
          <div style={{
            width:          MS_APP_ICON.size,
            height:         MS_APP_ICON.size,
            borderRadius:   MS_APP_ICON.borderRadius,
            background:     `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${DOMAIN.iconBg} 100%)`,
            boxShadow:      MS_SHADOWS.appIcon(DOMAIN.primary),
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            <Upload size={MS_APP_ICON.iconSize} strokeWidth={MS_APP_ICON.strokeWidth} color={DOMAIN.primary} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      MS_TYPOGRAPHY.cardTitleSize,
              fontWeight:    T.wt.bold,
              color:         C.ink,
              letterSpacing: "-0.02em",
              lineHeight:    1.3,
            }}>
              Agregar assets
            </div>
            <div style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.inkMid, marginTop: 4 }}>
              jpg, png, webp, mp4, mov, pdf · máx {MAX_FILES} archivos
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          28,
              height:         28,
              borderRadius:   R.pill,
              border:         `1px solid ${C.line}`,
              background:     C.surface,
              cursor:         "pointer",
              color:          C.inkMid,
              flexShrink:     0,
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "20px" }}>

          {/* Role selector */}
          <div style={{ marginBottom: S[4] }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      MS_TYPOGRAPHY.tagSize,
              fontWeight:    T.wt.bold,
              color:         C.inkFaint,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              marginBottom:  S[2],
            }}>
              Tipo de asset
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
              {ROLES.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRole(r.value)}
                  style={{
                    fontFamily:    T.mono,
                    fontSize:      MS_TYPOGRAPHY.descSize,
                    fontWeight:    T.wt.semibold,
                    padding:       `${S[2]}px ${S[3]}px`,
                    borderRadius:  R.md,
                    border:        role === r.value
                      ? `1.5px solid ${DOMAIN.primary}`
                      : `1px solid ${C.line}`,
                    background:    role === r.value ? DOMAIN.selectedBg : C.surface,
                    color:         role === r.value ? DOMAIN.primary : C.inkMid,
                    cursor:        "pointer",
                    textAlign:     "left" as const,
                    transition:    "all 0.12s",
                  }}
                >
                  <div style={{ fontWeight: T.wt.bold }}>{r.label}</div>
                  <div style={{ fontSize: 9, color: role === r.value ? DOMAIN.primary : C.inkFaint, marginTop: 2 }}>
                    {r.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              border:        `2px dashed ${C.line}`,
              borderRadius:  R.md,
              padding:       "24px",
              textAlign:     "center" as const,
              cursor:        "pointer",
              background:    C.surface,
              marginBottom:  files.length > 0 ? S[4] : 0,
              transition:    "border-color 0.12s",
            }}
          >
            <Upload size={20} strokeWidth={1.4} color={C.inkFaint} style={{ margin: "0 auto 8px" }} />
            <div style={{ fontFamily: T.mono, fontSize: MS_TYPOGRAPHY.descSize, color: C.inkMid, fontWeight: T.wt.medium }}>
              Haz clic para seleccionar archivos
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 4 }}>
              o arrastra y suelta aquí
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {files.map((fr, idx) => (
                <div key={idx} style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          S[3],
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   fr.status === "done"     ? C.greenLight :
                                fr.status === "error"    ? C.redLight   : C.surface,
                  border:       `1px solid ${
                    fr.status === "done"  ? C.greenBorder :
                    fr.status === "error" ? C.redBorder   : C.line
                  }`,
                  borderRadius: R.md,
                }}>
                  {/* Thumbnail or icon */}
                  <div style={{
                    width:          40,
                    height:         40,
                    borderRadius:   R.sm,
                    background:     C.line,
                    overflow:       "hidden",
                    flexShrink:     0,
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                  }}>
                    {fr.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fr.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <FileTypeIcon mimeType={fr.file.type} size={18} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily:   T.mono,
                      fontSize:     MS_TYPOGRAPHY.descSize,
                      color:        C.ink,
                      overflow:     "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace:   "nowrap" as const,
                    }}>
                      {fr.file.name}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                      {(fr.file.size / 1024).toFixed(0)} KB ·{" "}
                      {fr.status === "uploading" ? "Subiendo…" :
                       fr.status === "done"      ? "✓ Listo"   :
                       fr.status === "error"     ? (fr.error ?? "Error") :
                       "Pendiente"}
                    </div>
                  </div>

                  {fr.status === "pending" && !uploading && (
                    <button
                      onClick={() => removeFile(idx)}
                      style={{
                        background: "none",
                        border:     "none",
                        cursor:     "pointer",
                        color:      C.inkFaint,
                        padding:    4,
                        flexShrink: 0,
                      }}
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {formError && (
            <div style={{
              fontFamily:   T.mono,
              fontSize:     MS_TYPOGRAPHY.descSize,
              color:        C.red,
              background:   C.redLight,
              border:       `1px solid ${C.redBorder}`,
              borderRadius: R.sm,
              padding:      "8px 12px",
              marginTop:    S[3],
            }}>
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent: "flex-end",
          gap:           S[2],
          padding:       "12px 20px",
          borderTop:     `1px solid ${C.line}`,
          background:    "#fafbfc",
          flexShrink:    0,
        }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              fontFamily:   T.mono,
              fontSize:     MS_TYPOGRAPHY.descSize,
              fontWeight:   T.wt.semibold,
              color:        C.inkMid,
              background:   "transparent",
              border:       "none",
              cursor:       uploading ? "not-allowed" : "pointer",
              padding:      "8px 12px",
              borderRadius: R.sm,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            style={{
              fontFamily:    T.mono,
              fontSize:      "12px",
              fontWeight:    T.wt.bold,
              color:         "#fff",
              background:    canUpload ? MS_CTA.primaryButtonBg : C.inkGhost,
              border:        "none",
              borderRadius:  R.sm,
              padding:       "9px 18px",
              cursor:        canUpload ? "pointer" : "not-allowed",
              boxShadow:     canUpload ? MS_CTA.primaryBoxShadow : "none",
              transition:    "background 0.15s",
              letterSpacing: "-0.01em",
            }}
          >
            {uploading
              ? `Subiendo ${files.filter(f => f.status === "uploading").length}…`
              : `Subir ${files.filter(f => f.status === "pending").length} archivo(s) →`}
          </button>
        </div>
      </div>
    </div>
  );
}
