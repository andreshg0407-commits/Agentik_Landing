"use client";

/**
 * components/marketing-studio/social/social-detail-drawer.tsx
 *
 * MS-16 — Social Runtime: Publication detail drawer (12 sections).
 */

import { C, T, S }                from "@/lib/ui/tokens";
import {
  getSocialChannelLabel,
  getSocialChannelColor,
  getSocialStatusLabel,
  getSocialStatusVariant,
  getSocialContentTypeLabel,
  getSocialPriorityLabel,
  getSocialPriorityVariant,
  getSocialFailureLabel,
  formatPublishedAt,
  formatScheduledAt,
  formatDurationMs,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialPublication } from "@/lib/marketing-studio/social/social-types";

interface Props {
  publication: SocialPublication | null;
  onClose:     () => void;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkLight,
        fontWeight:   600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[2],
        paddingBottom: S[1],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[1]}px 0` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: color ?? C.ink, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

export function SocialDetailDrawer({ publication, onClose }: Props) {
  if (!publication) return null;

  const channelColor = getSocialChannelColor(publication.channel);
  const retry        = publication.retry;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          background: "rgba(0,0,0,0.18)",
          zIndex:     200,
        }}
      />

      {/* Drawer */}
      <div style={{
        position:    "fixed",
        top:         0,
        right:       0,
        bottom:      0,
        width:       420,
        background:  C.surface,
        borderLeft:  `1px solid ${C.line}`,
        zIndex:      201,
        display:     "flex",
        flexDirection: "column",
        overflow:    "hidden",
      }}>
        {/* Header */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        `${S[4]}px ${S[5]}px`,
          borderBottom:   `1px solid ${C.line}`,
          background:     C.surfaceAlt,
          flexShrink:     0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span style={{
              width: 10, height: 10,
              borderRadius: "50%",
              background: channelColor,
              display: "inline-block",
            }} />
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                {getSocialChannelLabel(publication.channel)}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                {getSocialContentTypeLabel(publication.contentType)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
            <span className={`ag-op-status ag-op-status--${getSocialStatusVariant(publication.status)}`}>
              {getSocialStatusLabel(publication.status)}
            </span>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border:     "none",
                cursor:     "pointer",
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                color:      C.inkLight,
                padding:    `${S[1]}px ${S[2]}px`,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: `${S[5]}px` }}>

          {/* 1. Identifiers */}
          <DrawerSection title="Identificación">
            <KV label="ID publicación" value={<span style={{ fontSize: 9 }}>{publication.id}</span>} />
            <KV label="Canal" value={getSocialChannelLabel(publication.channel)} />
            <KV label="Tipo de contenido" value={getSocialContentTypeLabel(publication.contentType)} />
            <KV label="Organización" value={<span style={{ fontSize: 9 }}>{publication.organizationId}</span>} />
          </DrawerSection>

          {/* 2. Status & priority */}
          <DrawerSection title="Estado y Prioridad">
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", marginBottom: S[2] }}>
              <span className={`ag-op-status ag-op-status--${getSocialStatusVariant(publication.status)}`}>
                {getSocialStatusLabel(publication.status)}
              </span>
              <span className={`ag-op-status ag-op-status--${getSocialPriorityVariant(publication.priority)}`}>
                {getSocialPriorityLabel(publication.priority)}
              </span>
            </div>
            {publication.blockers.length > 0 && (
              <div style={{
                padding:    `${S[2]}px ${S[3]}px`,
                background: C.redLight,
                borderRadius: 4,
                display:    "flex",
                flexDirection: "column",
                gap:        S[1],
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: 600 }}>
                  Bloqueadores ({publication.blockers.length})
                </span>
                {publication.blockers.map((b, i) => (
                  <span key={i} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>· {b}</span>
                ))}
              </div>
            )}
          </DrawerSection>

          {/* 3. Schedule */}
          <DrawerSection title="Programación">
            <KV label="Programado" value={formatScheduledAt(publication.scheduledAt)} />
            <KV label="Publicado" value={formatPublishedAt(publication.publishedAt)} />
            <KV label="Creado" value={formatPublishedAt(publication.createdAt)} />
            <KV label="Actualizado" value={formatPublishedAt(publication.updatedAt)} />
          </DrawerSection>

          {/* 4. Asset */}
          <DrawerSection title="Recurso multimedia">
            {publication.asset ? (
              <>
                <KV label="ID de recurso" value={<span style={{ fontSize: 9 }}>{publication.asset.assetId ?? "—"}</span>} />
                <KV label="Ratio" value={publication.asset.ratio ?? "—"} />
                <KV label="Dimensiones" value={
                  publication.asset.width && publication.asset.height
                    ? `${publication.asset.width}×${publication.asset.height}`
                    : "—"
                } />
                <KV
                  label="Disponible"
                  value={publication.asset.isReady ? "✓ Listo" : "✗ No listo"}
                  color={publication.asset.isReady ? C.green : C.red}
                />
                {publication.asset.notes && (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, display: "block", marginTop: S[1] }}>
                    {publication.asset.notes}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Sin asset asociado</span>
            )}
          </DrawerSection>

          {/* 5. Platform result */}
          <DrawerSection title="Resultado en Plataforma">
            <KV label="Post ID" value={publication.platformPostId ?? "—"} />
            <KV label="URL" value={publication.platformUrl ? "Ver post ↗" : "—"} color={publication.platformUrl ? C.blueDark : undefined} />
          </DrawerSection>

          {/* 6. Caption */}
          {publication.caption && (
            <DrawerSection title="Caption">
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                color:       C.inkMid,
                background:  C.surfaceAlt,
                padding:     `${S[3]}px`,
                borderRadius: 4,
                whiteSpace:  "pre-wrap",
                wordBreak:   "break-word",
              }}>
                {publication.caption}
              </div>
            </DrawerSection>
          )}

          {/* 7. Retry state */}
          <DrawerSection title="Estado de Reintentos">
            <KV label="Intentos" value={`${retry.retryCount} / ${retry.maxRetries}`} color={retry.retryCount > 0 ? C.amber : C.ink} />
            <KV label="Política" value={retry.policy} />
            <KV label="Próximo reintento" value={formatScheduledAt(retry.nextRetryAt)} />
            <KV label="Último fallo" value={formatPublishedAt(retry.lastFailureAt)} />
            {retry.failureType && (
              <KV
                label="Tipo de fallo"
                value={getSocialFailureLabel(retry.failureType)}
                color={C.red}
              />
            )}
            {retry.errorMessage && (
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                color:       C.red,
                background:  C.redLight,
                padding:     `${S[2]}px ${S[3]}px`,
                borderRadius: 4,
                marginTop:   S[2],
                wordBreak:   "break-word",
              }}>
                {retry.errorMessage}
              </div>
            )}
          </DrawerSection>

          {/* 8. Campaign link */}
          {publication.campaignLink && (
            <DrawerSection title="Vinculación a Contenido">
              <KV label="Contenido" value={publication.campaignLink.campaignName} />
              <KV label="Fase" value={publication.campaignLink.launchPhase} />
              <KV label="Rol del canal" value={publication.campaignLink.channelRole} />
            </DrawerSection>
          )}

          {/* 9. Distribution link */}
          {publication.distributionId && (
            <DrawerSection title="Distribución">
              <KV label="Distribution ID" value={<span style={{ fontSize: 9 }}>{publication.distributionId}</span>} />
            </DrawerSection>
          )}
        </div>
      </div>
    </>
  );
}
