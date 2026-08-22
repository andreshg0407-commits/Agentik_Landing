"use client";

/**
 * components/copilot/copilot-chat-consumer.tsx
 *
 * Copilot Core — Shared Chat Consumer
 * Sprint: COPILOT-SURFACE-UNIFICATION-01
 *
 * Reusable conversational UI. Consumed by:
 *   - Desktop: right rail drawer
 *   - Manager App: fullscreen (Phase 2)
 *   - Seller App: fullscreen with seller confinement (Phase 2)
 *   - QA harness: /agentik/copilot page
 *
 * Same 01C runtime. Same API routes. Same deterministic mock.
 * Identity, role, tenant, seller scope always server-side.
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

export interface CopilotPageContext {
  readonly orgSlug: string;
  readonly module: string | null;
  readonly route: string;
  readonly membershipRole: string;
}

interface CopilotChatConsumerProps {
  context: CopilotPageContext;
  /** Compact layout for narrow containers (rail drawer) */
  compact?: boolean;
  onClose?: () => void;
}

// ── Report Types ─────────────────────────────────────────────────────────────

const REPORT_OPTIONS = [
  { type: "customer_summary", label: "Clientes" },
  { type: "sales_performance", label: "Ventas" },
  { type: "orders_summary", label: "Pedidos" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function CopilotChatConsumer({
  context,
  compact = false,
  onClose,
}: CopilotChatConsumerProps) {
  const [messages, setMessages] = useState<CopilotSessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || connectionStatus === "sending") return;

    const userMessage: CopilotSessionMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
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

  const handleDownloadReport = useCallback(
    async (reportType: string) => {
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Header */}
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
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: compact ? T.sz.sm : T.sz.md,
              fontWeight: T.wt.bold,
              color: C.titleDeep,
            }}
          >
            Copilot
          </span>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.medium,
              color: C.blueDark,
              background: C.blueLight,
              border: `1px solid ${C.blueBorder}`,
              borderRadius: R.pill,
              padding: "1px 5px",
            }}
          >
            Preview
          </span>
          {/* Connection status */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color:
                connectionStatus === "sending" ? C.amberDark :
                connectionStatus === "error"   ? C.red :
                C.green,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background:
                  connectionStatus === "sending" ? C.amber :
                  connectionStatus === "error"   ? C.red :
                  C.green,
              }}
            />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          {/* Context badge */}
          {context.module && (
            <span
              style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkFaint,
                background: C.surfaceAlt,
                borderRadius: R.sm,
                padding: "1px 5px",
              }}
            >
              {context.module}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Cerrar Copilot"
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

      {/* Messages area */}
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
              Copilot Preview
            </div>
            <div
              style={{
                fontFamily: T.sans,
                fontSize: T.sz.xs,
                color: C.inkLight,
                lineHeight: 1.5,
              }}
            >
              Pregunta sobre clientes, pedidos o ventas.
              Las respuestas son determinísticas (sin modelo de IA).
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <CopilotChatMessage
            key={msg.id}
            message={msg}
            agentInitial="C"
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Demo mode banner */}
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

      {/* Reports bar */}
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
        {REPORT_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => handleDownloadReport(opt.type)}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.medium,
              color: C.blueDark,
              background: C.blueLight,
              border: `1px solid ${C.blueBorder}`,
              borderRadius: R.sm,
              padding: "1px 5px",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
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
          placeholder="Escribe tu consulta..."
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
          onClick={handleSend}
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

      {/* Error banner */}
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
