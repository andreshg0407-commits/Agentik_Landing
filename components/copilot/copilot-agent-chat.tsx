"use client";

/**
 * components/copilot/copilot-agent-chat.tsx
 *
 * Agentik Copilot — Agent Chat V2
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01 + COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Two modes:
 *   1. Visual-only (default): static opening message, disabled input.
 *   2. Runtime (when orgSlug + runtimeEnabled): ephemeral chat with
 *      POST /api/orgs/[orgSlug]/copilot/chat. No persistence.
 *
 * Chat content derived from CopilotViewModel — no hardcoded data.
 * Domain chips derived from summary.activeDomains.
 */

import { useState, useRef, useCallback } from "react";
import { C, T, S, R }             from "@/lib/ui/tokens";
import type { CopilotAgentCard }  from "@/lib/copilot/viewmodel";
import type { CopilotSummary }    from "@/lib/copilot/viewmodel";
import type { DomainId }          from "@/lib/copilot/knowledge/domain-registry";
import { BASE_LANGUAGE }          from "@/lib/copilot/language";
import { CopilotChatMessage }     from "./copilot-chat-message";
import type { CopilotSessionMessage } from "./copilot-chat-message";

// ── Domain labels ─────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<DomainId, string> = {
  ventas:       "Ventas",
  clientes:     "Clientes",
  productos:    "Productos",
  inventario:   "Inventario",
  compras:      "Compras",
  cartera:      "Cartera",
  pagos:        "Pagos",
  recaudos:     "Recaudos",
  bancos:       "Bancos",
  marketing:    "Marketing",
  produccion:   "Producción",
  conciliacion: "Conciliación",
  tareas:       "Tareas",
  alertas:      "Alertas",
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FUTURE_CAPABILITIES: { label: string; status: string }[] = [
  { label: "Consultas",           status: "Próximamente"         },
  { label: "Documentos",          status: "Próximamente"         },
  { label: "Tareas",              status: "Requiere conexión"     },
  { label: "Seguimientos",        status: "Requiere conexión"     },
  { label: "Acciones aprobadas",  status: "Disponible al activar" },
  { label: "Reportes",            status: "Próximamente"          },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContextLine(summary: CopilotSummary): string {
  const parts: string[] = [];
  if (summary.attentionCount > 0) {
    parts.push(`${summary.attentionCount} tema${summary.attentionCount > 1 ? "s" : ""} que requiere${summary.attentionCount > 1 ? "n" : ""} atención`);
  }
  if (summary.opportunityCount > 0) {
    parts.push(`${summary.opportunityCount} oportunidad${summary.opportunityCount > 1 ? "es" : ""} de análisis`);
  }
  if (parts.length === 0 && summary.totalSuggestions > 0) {
    parts.push(`${summary.totalSuggestions} sugerencia${summary.totalSuggestions > 1 ? "s" : ""} disponible${summary.totalSuggestions > 1 ? "s" : ""}`);
  }
  return parts.length > 0
    ? `Encontré ${parts.join(" y ")}.`
    : "El contexto está listo para trabajar.";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotAgentChatProps {
  leadAgent: CopilotAgentCard;
  summary:   CopilotSummary;
  /** Org slug for runtime API calls. When set with runtimeEnabled, chat is live. */
  orgSlug?:        string;
  /** Enable live runtime chat. Default: false (visual-only mode). */
  runtimeEnabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotAgentChat({
  leadAgent,
  summary,
  orgSlug,
  runtimeEnabled = false,
}: CopilotAgentChatProps) {
  const agentFirstName   = leadAgent.agentName.split(" ")[0] ?? leadAgent.agentName;
  const inputPlaceholder = `Pídele algo a ${agentFirstName}…`;
  const contextLine      = buildContextLine(summary);

  // ── Runtime state (ephemeral — page refresh = new session) ──────────────
  const [messages, setMessages]   = useState<CopilotSessionMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLive = runtimeEnabled && !!orgSlug;

  const handleSend = useCallback(async () => {
    if (!isLive || !inputValue.trim() || isSending) return;

    const userMsg: CopilotSessionMessage = {
      id:        crypto.randomUUID(),
      role:      "user",
      text:      inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsSending(true);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/copilot/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: userMsg.text }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Error" }));
        setMessages(prev => [...prev, {
          id:        crypto.randomUUID(),
          role:      "agent",
          text:      res.status === 429
            ? "Has enviado muchos mensajes. Intenta de nuevo en un momento."
            : errBody.error ?? "Error al procesar tu solicitud.",
          truthState: "DATA_UNVERIFIED",
          timestamp: new Date().toISOString(),
        }]);
        return;
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        id:         data.answer?.answerId ?? crypto.randomUUID(),
        role:       "agent",
        text:       data.answer?.text ?? "Sin respuesta.",
        truthState: data.answer?.truthState ?? "DATA_UNVERIFIED",
        timestamp:  new Date().toISOString(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id:        crypto.randomUUID(),
        role:      "agent",
        text:      "Error de conexión. Intenta de nuevo.",
        truthState: "DATA_UNVERIFIED",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsSending(false);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLive, orgSlug, inputValue, isSending]);

  // Domain chips: derived from activeDomains + fallback "Otro tema"
  const domainChips: string[] = [
    ...summary.activeDomains.slice(0, 4).map(d => DOMAIN_LABELS[d] ?? d),
    BASE_LANGUAGE["chat_other_topic"],
  ];

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      background:    C.white,
    }}>
      {/* Chat header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        padding:      `${S[2]}px ${S[5]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surface,
      }}>
        <span style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   C.green,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkMid,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          flex:          1,
        }}>
          {BASE_LANGUAGE["chat_header"]} {agentFirstName}
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.amberDark,
          background:    C.amberLight,
          border:        `1px solid ${C.amberBorder}`,
          borderRadius:  R.pill,
          padding:       "1px 7px",
          letterSpacing: "0.03em",
        }}>
          Próximamente
        </span>
      </div>

      {/* Agent opening message — multi-line conversation starter */}
      <div style={{
        padding:    `${S[4]}px ${S[5]}px ${S[3]}px`,
        display:    "flex",
        gap:         S[3],
        alignItems: "flex-start",
      }}>
        {/* Agent avatar */}
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   "50%",
          background:     "linear-gradient(135deg, #004AAD 0%, #002460 100%)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          marginTop:      2,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            fontWeight: T.wt.bold,
            color:      "#fff",
            lineHeight: 1,
          }}>
            {leadAgent.agentName.slice(0, 1)}
          </span>
        </div>

        {/* Message bubble */}
        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.line}`,
          borderRadius: `${R.sm}px ${R.lg}px ${R.lg}px ${R.lg}px`,
          padding:      `${S[3]}px`,
          flex:         1,
          minWidth:     0,
        }}>
          {/* Agent name */}
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         C.blueDark,
            marginBottom:  S[2],
            letterSpacing: "0.03em",
          }}>
            {leadAgent.agentName}
          </div>

          {/* Message lines */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] + 2 }}>
            <div style={{ fontFamily: T.sans, fontSize: T.sz.base, color: C.ink, lineHeight: 1.55 }}>
              Hola.
            </div>
            <div style={{ fontFamily: T.sans, fontSize: T.sz.base, color: C.inkMid, lineHeight: 1.55 }}>
              Estuve revisando el contexto operativo actual.
            </div>
            <div style={{ fontFamily: T.sans, fontSize: T.sz.base, color: C.inkMid, lineHeight: 1.55 }}>
              {contextLine}
            </div>
            <div style={{
              fontFamily:  T.sans,
              fontSize:    T.sz.base,
              color:       C.ink,
              lineHeight:  1.55,
              fontWeight:  T.wt.medium,
              marginTop:   S[1],
            }}>
              ¿Qué deseas revisar primero?
            </div>
          </div>
        </div>
      </div>

      {/* Domain chips — visual topic selector */}
      <div style={{
        padding:  `0 ${S[5]}px ${S[3]}px`,
        display:  "flex",
        flexWrap: "wrap" as const,
        gap:       S[1] + 2,
      }}>
        {domainChips.map(chip => (
          <button
            key={chip}
            disabled
            type="button"
            title="Próximamente disponible"
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.blueDark,
              background:   C.blueLight,
              border:       `1px solid ${C.blueBorder}`,
              borderRadius: R.pill,
              padding:      `${S[1]}px ${S[3]}px`,
              cursor:       "not-allowed" as const,
              opacity:      0.75,
              lineHeight:   1,
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Runtime messages (ephemeral — not persisted) */}
      {isLive && messages.length > 0 && (
        <div style={{
          padding:       `${S[3]}px ${S[5]}px`,
          display:       "flex",
          flexDirection: "column" as const,
          gap:            S[3],
          maxHeight:      320,
          overflowY:     "auto" as const,
          borderTop:     `1px solid ${C.lineSubtle}`,
        }}>
          {messages.map(msg => (
            <CopilotChatMessage
              key={msg.id}
              message={msg}
              agentInitial={leadAgent.agentName.slice(0, 1)}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input bar */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:         S[2],
        padding:    `${S[2]}px ${S[5]}px ${S[3]}px`,
        borderTop:  `1px solid ${C.lineSubtle}`,
      }}>
        <input
          readOnly={!isLive}
          value={isLive ? inputValue : ""}
          onChange={isLive ? (e) => setInputValue(e.target.value) : undefined}
          onKeyDown={isLive ? (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } } : undefined}
          placeholder={inputPlaceholder}
          maxLength={4000}
          style={{
            flex:         1,
            fontFamily:   T.mono,
            fontSize:     T.sz.base,
            color:        C.ink,
            background:   C.surface,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
            outline:      "none",
            cursor:       isLive ? "text" : "not-allowed" as const,
            opacity:      isLive ? 1 : 0.55,
          }}
        />
        <button
          disabled={!isLive || isSending || !inputValue.trim()}
          type="button"
          onClick={isLive ? handleSend : undefined}
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.semibold,
            color:        C.white,
            background:   isLive && inputValue.trim() ? C.blueDark : C.inkGhost,
            border:       "none",
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
            cursor:       isLive && inputValue.trim() ? "pointer" : "not-allowed" as const,
            lineHeight:   1,
            flexShrink:   0,
            transition:   "background 160ms ease",
          }}
        >
          {isSending ? "…" : "Enviar"}
        </button>
      </div>

      {/* Future capabilities strip */}
      <div style={{
        padding:    `${S[2]}px ${S[5]}px ${S[3]}px`,
        borderTop:  `1px solid ${C.lineSubtle}`,
        background: C.surface,
      }}>
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          marginBottom:  S[2],
        }}>
          {BASE_LANGUAGE["chat_capabilities_label"]}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] + 2 }}>
          {FUTURE_CAPABILITIES.map(cap => (
            <span key={cap.label} style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:           4,
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.inkFaint,
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.sm,
              padding:      "2px 6px",
            }}>
              {cap.label}
              <span style={{ color: C.inkGhost, fontSize: T.sz["2xs"] }}>
                · {cap.status}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
