"use client";

/**
 * components/copilot/copilot-chat-message.tsx
 *
 * Copilot Core — Chat Message Bubble
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C + COPILOT-DESKTOP-RAIL-UX-01R1
 *
 * Renders a single user or agent message with optional truth badge,
 * fact references, and secondary download action for report messages.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { CopilotTruthBadge } from "./copilot-truth-badge";

type TruthState = "VERIFIED" | "PARTIAL" | "DATA_UNVERIFIED";

export interface MessageFact {
  readonly source: string;
  readonly truthState: TruthState;
  readonly confidence: number;
  readonly sourceUpdatedAt: string;
}

export interface CopilotSessionMessage {
  readonly id: string;
  readonly role: "user" | "agent";
  readonly text: string;
  readonly truthState?: TruthState;
  readonly timestamp: string;
  readonly capabilityId?: string;
  readonly facts?: readonly MessageFact[];
}

interface CopilotChatMessageProps {
  message: CopilotSessionMessage;
  agentInitial?: string;
  /** When provided and message has capabilityId, shows "Descargar CSV" button. */
  onDownload?: (capabilityId: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  customer_profile:       "Perfil de clientes",
  customer_order_record:  "Registro de pedidos",
};

function formatFreshness(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function CopilotChatMessage({ message, agentInitial = "D", onDownload }: CopilotChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display:        "flex",
        gap:             S[2],
        alignItems:     "flex-start",
        flexDirection:  isUser ? "row-reverse" : "row",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width:          24,
          height:         24,
          borderRadius:   "50%",
          background:     isUser
            ? C.surfaceAlt
            : "linear-gradient(135deg, #004AAD 0%, #002460 100%)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          marginTop:      2,
        }}
      >
        <span
          style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            fontWeight: T.wt.bold,
            color:      isUser ? C.inkMid : "#fff",
            lineHeight: 1,
          }}
        >
          {isUser ? "T" : agentInitial}
        </span>
      </div>

      {/* Bubble */}
      <div
        style={{
          background:   isUser ? C.blueLight : C.surface,
          border:       `1px solid ${isUser ? C.blueBorder : C.line}`,
          borderRadius: isUser
            ? `${R.lg}px ${R.sm}px ${R.lg}px ${R.lg}px`
            : `${R.sm}px ${R.lg}px ${R.lg}px ${R.lg}px`,
          padding:      `${S[2]}px ${S[3]}px`,
          maxWidth:     "85%",
          minWidth:     0,
        }}
      >
        <div
          style={{
            fontFamily: T.sans,
            fontSize:   T.sz.base,
            color:      C.ink,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak:  "break-word",
          }}
        >
          {message.text}
        </div>

        {/* Truth badge for agent messages */}
        {!isUser && message.truthState && (
          <div style={{ marginTop: S[1] + 2 }}>
            <CopilotTruthBadge truthState={message.truthState} />
          </div>
        )}

        {/* Fact references — source, freshness, confidence */}
        {!isUser && message.facts && message.facts.length > 0 && (
          <div style={{
            marginTop:     S[2],
            paddingTop:    S[1],
            borderTop:     `1px solid ${C.lineSubtle}`,
            display:       "flex",
            flexDirection: "column",
            gap:           3,
          }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              fontWeight:    T.wt.semibold,
              color:         C.inkFaint,
              letterSpacing: "0.04em",
            }}>
              Evidencia
            </span>
            {message.facts.map((fact, i) => (
              <div key={i} style={{
                display:    "flex",
                alignItems: "center",
                gap:         S[1],
                flexWrap:   "wrap",
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                  background: fact.truthState === "VERIFIED" ? C.green
                            : fact.truthState === "PARTIAL" ? C.amber
                            : C.inkGhost,
                }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                  {SOURCE_LABELS[fact.source] ?? fact.source}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  · {Math.round(fact.confidence * 100)}%
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  · {formatFreshness(fact.sourceUpdatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Download action for report messages */}
        {!isUser && message.capabilityId && onDownload && (
          <div style={{ marginTop: S[2], paddingTop: S[1], borderTop: `1px solid ${C.lineSubtle}` }}>
            <button
              onClick={() => onDownload(message.capabilityId!)}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                fontWeight:   T.wt.medium,
                color:        C.blueDark,
                background:   "transparent",
                border:       `1px solid ${C.blueBorder}`,
                borderRadius: R.sm,
                padding:      "2px 8px",
                cursor:       "pointer",
              }}
            >
              Descargar CSV ↓
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
