"use client";

/**
 * components/copilot/copilot-chat-consumer.tsx
 *
 * Copilot Core — Shared Chat Consumer
 * Sprint: COPILOT-SURFACE-UNIFICATION-01 → COPILOT-DESKTOP-RAIL-UX-01R1
 *
 * Reusable conversational UI with contextual agent identity.
 * Consumed by:
 *   - Desktop: right rail drawer (agent-resolved)
 *   - Manager App: fullscreen (Phase 2)
 *   - Seller App: fullscreen with seller confinement (Phase 2)
 *   - QA harness: /agentik/copilot page
 *
 * Same 01C runtime. Same API routes. Same deterministic mock.
 * Identity, role, tenant, seller scope always server-side.
 *
 * R1 changes:
 *   - Agent identity (name, title, avatar) replaces generic "Copilot Preview"
 *   - Contextual report chips (only for agent domain)
 *   - Reports render in chat first, download is secondary
 *   - Facts (source, freshness, confidence) visible on responses
 *   - Viewport-dependent layout: only messages scroll
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import {
  CopilotChatMessage,
  type CopilotSessionMessage,
} from "@/components/copilot/copilot-chat-message";

// ── Types ────────────────────────────────────────────────────────────────────

type TruthState = "VERIFIED" | "PARTIAL" | "DATA_UNVERIFIED";
type ConnectionStatus = "idle" | "sending" | "error";

interface ApiAnswer {
  answerId: string;
  text: string;
  truthState: TruthState;
  asOf: string;
  capabilityId: string;
  warnings: unknown[];
  facts: Array<{
    source: string;
    truthState: TruthState;
    confidence: number;
    sourceUpdatedAt: string;
  }>;
}

export interface CopilotAgentInfo {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly title: string;
  readonly avatarKey: string;
  readonly accentColor: string;
  readonly domain: string;
  readonly capabilities: readonly string[];
}

export interface CopilotPageContext {
  readonly orgSlug: string;
  readonly module: string | null;
  readonly route: string;
  readonly membershipRole: string;
  readonly agent: CopilotAgentInfo;
}

interface CopilotChatConsumerProps {
  context: CopilotPageContext;
  /** Compact layout for narrow containers (rail drawer) */
  compact?: boolean;
  onClose?: () => void;
}

// ── Agent-Contextual Report Chips ────────────────────────────────────────────
// Only show report actions supported by the active agent's domain.
// In 01C all capabilities are commercial (sales domain).

interface ReportChip {
  keyword: string;
  label: string;
  reportType: string;
}

const COMMERCIAL_REPORTS: ReportChip[] = [
  { keyword: "clientes", label: "Clientes", reportType: "customer_summary" },
  { keyword: "ventas",   label: "Ventas",   reportType: "sales_performance" },
  { keyword: "pedidos",  label: "Pedidos",  reportType: "orders_summary" },
];

/** Domains that have 01C commercial capabilities. */
const DOMAIN_REPORTS: Record<string, ReportChip[]> = {
  sales: COMMERCIAL_REPORTS,
};

/** Map capabilityId → reportType for download action. */
const CAPABILITY_TO_REPORT: Record<string, string> = {
  "commercial.customers.summary.read": "customer_summary",
  "commercial.orders.summary.read":    "orders_summary",
  "commercial.sales.performance.read": "sales_performance",
};

// ── Component ────────────────────────────────────────────────────────────────

export function CopilotChatConsumer({
  context,
  compact = false,
  onClose,
}: CopilotChatConsumerProps) {
  const { agent } = context;
  const [messages, setMessages] = useState<CopilotSessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reports available for the resolved agent's domain
  const reportChips = DOMAIN_REPORTS[agent.domain] ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || connectionStatus === "sending") return;

    const userMessage: CopilotSessionMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!text) setInput("");
    setConnectionStatus("sending");
    setLastError(null);

    try {
      const res = await fetch(`/api/orgs/${context.orgSlug}/copilot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errText =
          res.status === 401 ? "No autenticado" :
          res.status === 403 ? "Sin permisos" :
          res.status === 429 ? "Demasiadas solicitudes. Intenta de nuevo en unos segundos." :
          (errBody as Record<string, string>).error ?? `Error ${res.status}`;
        throw new Error(errText);
      }

      const data = await res.json() as { requestId: string; answer: ApiAnswer };

      const agentMessage: CopilotSessionMessage = {
        id: data.answer.answerId,
        role: "agent",
        text: data.answer.text,
        truthState: data.answer.truthState as TruthState,
        timestamp: data.answer.asOf,
        capabilityId: data.answer.capabilityId,
        facts: data.answer.facts,
      };

      setMessages((prev) => [...prev, agentMessage]);
      setConnectionStatus("idle");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error de conexión";
      setLastError(errorMsg);
      setConnectionStatus("error");

      const errorMessage: CopilotSessionMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        text: `Error: ${errorMsg}`,
        truthState: "DATA_UNVERIFIED",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [input, connectionStatus, context.orgSlug]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Report chip → send keyword as chat message ──────────────────────────

  const handleReportQuery = useCallback(
    (chip: ReportChip) => {
      handleSend(chip.keyword);
    },
    [handleSend],
  );

  // ── Download CSV (secondary action on report messages) ──────────────────

  const handleDownloadReport = useCallback(
    async (capabilityId: string) => {
      const reportType = CAPABILITY_TO_REPORT[capabilityId];
      if (!reportType) return;

      try {
        const res = await fetch(`/api/orgs/${context.orgSlug}/copilot/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportType, format: "csv" }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error((errBody as Record<string, string>).error ?? `Error ${res.status}`);
        }

        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
        const filename = filenameMatch?.[1] ?? `copilot-${reportType}.csv`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setLastError(err instanceof Error ? err.message : "Error descargando reporte");
        setConnectionStatus("error");
      }
    },
    [context.orgSlug],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* ── Header — Agent Identity ───────────────────────────────────────── */}
      <div
        style={{
          padding: `${S[2]}px ${S[3]}px`,
          borderBottom: `1px solid ${C.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: C.white,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
          {/* Agent avatar */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${agent.accentColor} 0%, ${agent.accentColor}CC 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.bold,
                color: "#fff",
                lineHeight: 1,
              }}
            >
              {agent.name.slice(0, 1)}
            </span>
          </div>
          {/* Agent name + title */}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: compact ? T.sz.sm : T.sz.md,
                fontWeight: T.wt.bold,
                color: C.titleDeep,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.2,
              }}
            >
              {agent.displayName}
            </div>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkLight,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                lineHeight: 1.3,
              }}
            >
              {agent.title}
            </div>
          </div>
          {/* Connection status dot */}
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              flexShrink: 0,
              background:
                connectionStatus === "sending" ? C.amber :
                connectionStatus === "error"   ? C.red :
                C.green,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.medium,
              color: C.amberDark,
              background: C.amberLight,
              border: `1px solid ${C.amberBorder}`,
              borderRadius: R.pill,
              padding: "1px 5px",
            }}
          >
            Preview
          </span>
          {onClose && (
            <button
              onClick={onClose}
              title="Cerrar chat"
              style={{
                all: "unset",
                cursor: "pointer",
                width: 22,
                height: 22,
                borderRadius: 5,
                border: `1px solid ${C.line}`,
                background: C.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: C.inkMid,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Messages area (only this scrolls) ─────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: `${S[3]}px ${compact ? S[2] : S[3]}px`,
          display: "flex",
          flexDirection: "column",
          gap: S[2],
          minHeight: 0,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: `${S[6]}px ${S[2]}px`,
            }}
          >
            <div
              style={{
                fontFamily: T.mono,
                fontSize: T.sz.sm,
                fontWeight: T.wt.medium,
                color: C.inkMid,
                marginBottom: S[1],
              }}
            >
              {agent.displayName}
            </div>
            <div
              style={{
                fontFamily: T.sans,
                fontSize: T.sz.xs,
                color: C.inkLight,
                lineHeight: 1.5,
                marginBottom: S[2],
              }}
            >
              {reportChips.length > 0
                ? "Pregunta sobre clientes, pedidos o ventas. Usa los accesos rápidos o escribe tu consulta."
                : `Escribe tu consulta para ${agent.name}.`}
            </div>
            {/* Agent capabilities */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
              {agent.capabilities.slice(0, 4).map((cap) => (
                <span
                  key={cap}
                  style={{
                    fontFamily: T.mono,
                    fontSize: T.sz["2xs"],
                    color: C.inkFaint,
                    lineHeight: 1.4,
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <CopilotChatMessage
            key={msg.id}
            message={msg}
            agentInitial={agent.name.slice(0, 1)}
            onDownload={handleDownloadReport}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Demo mode banner ──────────────────────────────────────────────── */}
      <div
        style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.amberDark,
          background: C.amberLight,
          border: `1px solid ${C.amberBorder}`,
          padding: `2px ${S[2]}px`,
          textAlign: "center",
          lineHeight: 1.4,
          flexShrink: 0,
        }}
      >
        Modo demostración — respuestas determinísticas, sin modelo de IA conectado.
      </div>

      {/* ── Contextual report chips (agent domain only) ───────────────────── */}
      {reportChips.length > 0 && (
        <div
          style={{
            padding: `${S[1]}px ${S[2]}px`,
            display: "flex",
            gap: 4,
            alignItems: "center",
            flexWrap: "wrap",
            flexShrink: 0,
            borderTop: `1px solid ${C.line}`,
          }}
        >
          <span
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color: C.inkLight,
            }}
          >
            Informes:
          </span>
          {reportChips.map((chip) => (
            <button
              key={chip.reportType}
              onClick={() => handleReportQuery(chip)}
              disabled={connectionStatus === "sending"}
              style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.medium,
                color: connectionStatus === "sending" ? C.inkGhost : C.blueDark,
                background: C.blueLight,
                border: `1px solid ${C.blueBorder}`,
                borderRadius: R.sm,
                padding: "1px 5px",
                cursor: connectionStatus === "sending" ? "not-allowed" : "pointer",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          padding: `${S[2]}px ${compact ? S[2] : S[3]}px`,
          display: "flex",
          gap: S[1],
          alignItems: "center",
          background: C.white,
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Pregunta a ${agent.name}...`}
          disabled={connectionStatus === "sending"}
          style={{
            flex: 1,
            fontFamily: T.sans,
            fontSize: T.sz.sm,
            color: C.ink,
            padding: `${S[1]}px ${S[2]}px`,
            border: `1px solid ${C.line}`,
            borderRadius: R.md,
            outline: "none",
            background: connectionStatus === "sending" ? C.surfaceAlt : C.white,
            minWidth: 0,
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={connectionStatus === "sending" || !input.trim()}
          style={{
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            fontWeight: T.wt.medium,
            color: C.white,
            background:
              connectionStatus === "sending" || !input.trim()
                ? C.inkGhost
                : C.blueDark,
            border: "none",
            borderRadius: R.md,
            padding: `${S[1]}px ${S[2]}px`,
            cursor:
              connectionStatus === "sending" || !input.trim()
                ? "not-allowed"
                : "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Enviar
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {lastError && connectionStatus === "error" && (
        <div
          style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.red,
            background: C.redLight,
            border: `1px solid ${C.redBorder}`,
            padding: `2px ${S[2]}px`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span>{lastError}</span>
          <button
            onClick={() => {
              setLastError(null);
              setConnectionStatus("idle");
            }}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color: C.red,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
