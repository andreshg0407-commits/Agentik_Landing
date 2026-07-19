/**
 * components/marketing-studio/review/review-queue.tsx
 *
 * MS-07 — Review Queue
 *
 * Operational product review queue. Each row communicates:
 *   - Priority level
 *   - Identity (name, SKU, thumbnail)
 *   - Readiness score
 *   - Blocking issues count
 *   - Destination health
 *   - Suggested action
 *
 * Client component — manages selected item state, filter by status/priority.
 */

"use client";

import { useState, useMemo } from "react";
import { C, T, S, R, E }    from "@/lib/ui/tokens";
import type { ReviewQueueItem, ReviewStatus, PriorityLevel } from "@/lib/marketing-studio/review/review-engine";
import { ReviewStatus as RS, PriorityLevel as PL, REVIEW_STATUS_LABEL, PRIORITY_LABEL } from "@/lib/marketing-studio/review/review-engine";

// ── Priority visual config ────────────────────────────────────────────────────
import { ReviewDetailDrawer } from "./review-detail-drawer";

// ── Visual config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReviewStatus, { dot: string; bg: string; border: string; text: string; label: string }> = {
  pending_review:     { dot: C.amber,    bg: C.amberLight,  border: C.amberBorder,  text: C.amber,    label: REVIEW_STATUS_LABEL.pending_review     },
  blocked:            { dot: C.red,      bg: C.redLight,    border: C.redBorder,    text: C.red,      label: REVIEW_STATUS_LABEL.blocked            },
  partially_ready:    { dot: C.amber,    bg: C.amberLight,  border: C.amberBorder,  text: C.amber,    label: REVIEW_STATUS_LABEL.partially_ready    },
  ready:              { dot: C.green,    bg: C.greenLight,  border: C.greenBorder,  text: C.green,    label: REVIEW_STATUS_LABEL.ready              },
  published:          { dot: C.blueDark, bg: C.blueLight,   border: C.blueBorder,   text: C.blueDark, label: REVIEW_STATUS_LABEL.published          },
  failed_sync:        { dot: C.red,      bg: C.redLight,    border: C.redBorder,    text: C.red,      label: REVIEW_STATUS_LABEL.failed_sync        },
  requires_attention: { dot: C.amber,    bg: C.amberLight,  border: C.amberBorder,  text: C.amber,    label: REVIEW_STATUS_LABEL.requires_attention },
};

const PRIORITY_CONFIG: Record<PriorityLevel, { bg: string; text: string; border: string }> = {
  critical: { bg: C.redLight,    text: C.red,      border: C.redBorder    },
  high:     { bg: C.amberLight,  text: C.amber,    border: C.amberBorder  },
  medium:   { bg: C.blueLight,   text: C.blueDark, border: C.blueBorder   },
  low:      { bg: C.surface,     text: C.inkLight, border: C.line         },
};

const CHANNEL_SHORT: Record<string, string> = {
  shopify:  "SHO",
  crm:      "CRM",
  whatsapp: "WA",
  catalog:  "CAT",
  ads:      "ADS",
  landing:  "LND",
};

// ── Filter presets ─────────────────────────────────────────────────────────────

type FilterId = "all" | ReviewStatus | PriorityLevel;

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: "all",               label: "Todos"              },
  { id: RS.BLOCKED,          label: "Bloqueados"         },
  { id: RS.FAILED_SYNC,      label: "Sincronización fallida" },
  { id: RS.REQUIRES_ATTENTION, label: "Requieren atención" },
  { id: RS.READY,            label: "Listos"             },
  { id: RS.PARTIALLY_READY,  label: "Parciales"          },
  { id: RS.PUBLISHED,        label: "Publicados"         },
  { id: PL.CRITICAL,         label: "Prioridad crítica"  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChannelDot({ ch, status }: { ch: string; status: "ready" | "partial" | "blocked" | "failed" | "none" }) {
  const color =
    status === "ready"   ? C.green    :
    status === "partial" ? C.amber    :
    status === "failed"  ? C.red      :
    status === "blocked" ? C.red      :
    C.line;
  const bg =
    status === "ready"   ? C.greenLight  :
    status === "partial" ? C.amberLight  :
    status === "failed"  ? C.redLight    :
    status === "blocked" ? C.redLight    :
    C.surface;

  return (
    <span style={{
      fontFamily:    T.mono, fontSize: 8, fontWeight: T.wt.bold,
      padding:       "1px 4px", borderRadius: R.sm,
      background:    bg, color,
      border:        `1px solid ${color}`,
      letterSpacing: "0.04em",
    }}>
      {CHANNEL_SHORT[ch] ?? ch.toUpperCase().slice(0, 3)}
    </span>
  );
}

function PriorityBadge({ level }: { level: PriorityLevel }) {
  const p = PRIORITY_CONFIG[level];
  return (
    <span style={{
      fontFamily:    T.mono, fontSize: 8, fontWeight: T.wt.bold,
      padding:       "2px 6px", borderRadius: R.pill,
      background:    p.bg, color: p.text, border: `1px solid ${p.border}`,
      textTransform: "uppercase" as const, letterSpacing: "0.07em",
      flexShrink:    0,
    }}>
      {PRIORITY_LABEL[level]}
    </span>
  );
}

function ReadinessBar({ score, level }: { score: number; level: string }) {
  const color = level === "ready" ? C.green : level === "partial" ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <div style={{ flex: 1, height: 3, borderRadius: R.pill, background: C.line, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: R.pill }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: T.wt.bold, color, minWidth: 24, textAlign: "right" as const }}>
        {score}
      </span>
    </div>
  );
}

// ── Queue row ──────────────────────────────────────────────────────────────────

function ReviewRow({
  item,
  selected,
  onClick,
}: {
  item:     ReviewQueueItem;
  selected: boolean;
  onClick:  () => void;
}) {
  const statusCfg  = STATUS_CONFIG[item.reviewStatus];
  const allChannels = ["shopify", "crm", "whatsapp", "catalog", "ads", "landing"] as const;

  const channelStatus = (ch: string): "ready" | "partial" | "blocked" | "failed" | "none" => {
    if (item.syncSummary.find(s => s.channel === ch && s.status === "failed"))  return "failed";
    if (item.readyDestinations.includes(ch as never))                           return "ready";
    if (item.partialDestinations.includes(ch as never))                         return "partial";
    if (item.blockedDestinations.includes(ch as never))                         return "blocked";
    return "none";
  };

  return (
    <div
      className="ag-review-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && onClick()}
      style={{
        outline:       selected ? `2px solid ${C.blueDark}` : "none",
        outlineOffset: -1,
      }}
    >
      {/* Priority accent bar */}
      <div style={{
        position:     "absolute" as const,
        left:         0, top: 0, bottom: 0,
        width:        3,
        background:   PRIORITY_CONFIG[item.priorityLevel].text,
        borderRadius: `${R.md}px 0 0 ${R.md}px`,
      }} />

      {/* Thumbnail */}
      <div style={{
        width: 52, height: 52, borderRadius: R.md,
        overflow: "hidden", flexShrink: 0,
        background: C.surfaceAlt,
        border: `1px solid ${C.line}`,
      }}>
        {item.primaryAssetUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.primaryAssetUrl} alt={item.productName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
            justifyContent: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>—</span>
          </div>
        )}
      </div>

      {/* Identity + readiness */}
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 3 }}>
          <PriorityBadge level={item.priorityLevel} />
          <span style={{
            fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color:        C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          }}>
            {item.productName}
          </span>
          {item.sku && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, flexShrink: 0 }}>
              {item.sku}
            </span>
          )}
        </div>

        <ReadinessBar score={item.readinessScore} level={item.readinessLevel} />

        {/* Channel dots row */}
        <div style={{ display: "flex", gap: 3, marginTop: S[1], flexWrap: "wrap" as const }}>
          {allChannels.map(ch => (
            <ChannelDot key={ch} ch={ch} status={channelStatus(ch)} />
          ))}
        </div>
      </div>

      {/* Status chip */}
      <div style={{ flexShrink: 0 }}>
        <span style={{
          display:       "inline-flex", alignItems: "center", gap: 5,
          fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.semibold,
          padding:       "3px 8px", borderRadius: R.pill,
          background:    statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
          whiteSpace:    "nowrap" as const,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusCfg.dot, flexShrink: 0 }} />
          {statusCfg.label}
        </span>
      </div>

      {/* Blocking issues count */}
      <div style={{ flexShrink: 0, textAlign: "center" as const, minWidth: 52 }}>
        {item.blockingIssues.length > 0 ? (
          <>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.red, lineHeight: 1 }}>
              {item.blockingIssues.length}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 2 }}>
              {item.blockingIssues.length === 1 ? "bloqueo" : "bloqueos"}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost }}>—</div>
        )}
      </div>

      {/* Top suggested action */}
      <div style={{ flexShrink: 0, maxWidth: 180, display: "none" }} className="ag-review-row__action">
        {item.suggestedActions[0] && (
          <span style={{
            fontFamily: T.mono, fontSize: 9, color: C.inkLight,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
            display: "block",
          }}>
            → {item.suggestedActions[0]}
          </span>
        )}
      </div>

      {/* Open detail chevron */}
      <div style={{ flexShrink: 0, color: C.inkGhost, fontFamily: T.mono, fontSize: T.sz.sm }}>
        ›
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ReviewQueueProps {
  items:   ReviewQueueItem[];
  orgSlug: string;
}

export function ReviewQueue({ items, orgSlug }: ReviewQueueProps) {
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [searchText,   setSearchText]   = useState("");

  const filtered = useMemo(() => {
    let result = items;

    if (activeFilter !== "all") {
      result = result.filter(i => {
        // Status filter
        if (Object.values(RS).includes(activeFilter as ReviewStatus))
          return i.reviewStatus === activeFilter;
        // Priority filter
        if (Object.values(PL).includes(activeFilter as PriorityLevel))
          return i.priorityLevel === activeFilter;
        return true;
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(i =>
        i.productName.toLowerCase().includes(q) ||
        (i.sku?.toLowerCase().includes(q) ?? false),
      );
    }

    return result;
  }, [items, activeFilter, searchText]);

  return (
    <>
      {/* ── Filter chips ── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, marginBottom: S[3] }}>
        {FILTER_CHIPS.map(chip => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`ag-preset-chip${isActive ? " ag-preset-chip--active" : ""}`}
              style={{
                background:  isActive ? C.blueDark : C.surface,
                borderColor: isActive ? C.blueDark : C.line,
                color:       isActive ? C.white    : C.inkLight,
                cursor: "pointer",
              }}
            >
              {chip.label}
              {chip.id !== "all" && (
                <span style={{
                  marginLeft: 4, fontFamily: T.mono, fontSize: 8,
                  opacity: 0.7,
                }}>
                  {chip.id === activeFilter
                    ? filtered.length
                    : items.filter(i =>
                        Object.values(RS).includes(chip.id as ReviewStatus)
                          ? i.reviewStatus === chip.id
                          : i.priorityLevel === chip.id,
                      ).length
                  }
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        background: C.white, border: `1px solid ${searchText ? C.blueBorder : C.line}`,
        borderRadius: R.md, padding: `5px ${S[3]}px`,
        boxShadow: searchText ? `0 0 0 2px rgba(0,74,173,.10)` : E.xs,
        marginBottom: S[3],
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint, flexShrink: 0 }}>⌕</span>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="Buscar por nombre o SKU…"
          style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
          }}
        />
        {searchText && (
          <button
            onClick={() => setSearchText("")}
            style={{ border: "none", background: "none", cursor: "pointer",
              fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, padding: 0 }}
          >✕</button>
        )}
      </div>

      {/* ── Column headers ── */}
      <div style={{
        display:       "grid",
        gridTemplateColumns: "52px 1fr 120px 52px 24px",
        gap:           S[3],
        padding:       `${S[2]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.lineSubtle}`,
        marginBottom:  S[1],
      }}>
        {["Producto", "", "Estado", "Bloqueos", ""].map((col, i) => (
          <div key={i} style={{
            fontFamily:    T.mono, fontSize: 9, fontWeight: T.wt.bold,
            color:         C.inkGhost, textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
          }}>
            {col}
          </div>
        ))}
      </div>

      {/* ── Rows ── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: `${S[8]}px ${S[4]}px`, textAlign: "center" as const,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint,
        }}>
          {searchText || activeFilter !== "all"
            ? "Sin productos para este filtro."
            : "No hay productos en la cola de revisión."}
        </div>
      ) : (
        <div>
          {filtered.map(item => (
            <ReviewRow
              key={item.productId}
              item={item}
              selected={selectedItem?.productId === item.productId}
              onClick={() => setSelectedItem(item)}
            />
          ))}
        </div>
      )}

      {/* ── Result count ── */}
      {(searchText || activeFilter !== "all") && filtered.length > 0 && (
        <div style={{
          marginTop: S[3], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          textAlign: "center" as const,
        }}>
          {filtered.length} / {items.length} productos
        </div>
      )}

      {/* ── Detail drawer ── */}
      <ReviewDetailDrawer
        item={selectedItem}
        orgSlug={orgSlug}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}
