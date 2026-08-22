"use client";

/**
 * app/(app)/[orgSlug]/agentik/copilot/copilot-runtime-client.tsx
 *
 * Copilot Core — Live Runtime Client
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C-R2
 *
 * Client component. Receives server-derived state.
 * Renders explicit states: enabled | flag_disabled | module_disabled | role_blocked.
 * When enabled: real API calls, ephemeral session, truth badges, report downloads.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { C, T, S, R, E, panel, panelHeader } from "@/lib/ui/tokens";
import {
  CopilotChatMessage,
  type CopilotSessionMessage,
} from "@/components/copilot/copilot-chat-message";
import { CopilotTruthBadge } from "@/components/copilot/copilot-truth-badge";

// ── Types ────────────────────────────────────────────────────────────────────

type CopilotPageState = "enabled" | "flag_disabled" | "module_disabled" | "role_blocked";
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

interface CopilotRuntimeClientProps {
  orgSlug: string;
  state: CopilotPageState;
  membershipRole: string;
  previewEnabled: boolean;
}

// ── Blocked State ────────────────────────────────────────────────────────────

const BLOCKED_MESSAGES: Record<Exclude<CopilotPageState, "enabled">, { title: string; description: string }> = {
  flag_disabled: {
    title: "Copilot no habilitado",
    description: "La funcionalidad de Copilot Preview no está habilitada para este entorno.",
  },
  module_disabled: {
    title: "Módulo no disponible",
    description: "El módulo Copilot o el módulo Comercial no está habilitado para esta organización.",
  },
  role_blocked: {
    title: "Acceso restringido",
    description: "Tu rol actual no tiene permisos para acceder al Copilot. Roles permitidos: ORG_ADMIN, MANAGER.",
  },
};

// ── Report Types ─────────────────────────────────────────────────────────────

const REPORT_OPTIONS = [
  { type: "customer_summary", label: "Resumen de Clientes" },
  { type: "sales_performance", label: "Desempeño de Ventas" },
  { type: "orders_summary", label: "Resumen de Pedidos" },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function CopilotRuntimeClient({
  orgSlug,
  state,
  membershipRole,
  previewEnabled,
}: CopilotRuntimeClientProps) {
  // Blocked states — explicit, never hidden
  if (state !== "enabled") {
    const info = BLOCKED_MESSAGES[state];
    return (
      <div style={{ padding: S[6], maxWidth: 600, margin: "0 auto" }}>
        <div style={{ ...panel, padding: S[6], textAlign: "center" }}>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.lg,
              fontWeight: T.wt.semibold,
              color: C.ink,
              marginBottom: S[2],
            }}
          >
            Agentik Copilot
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.base,
              fontWeight: T.wt.medium,
              color: C.amberDark,
              marginBottom: S[3],
            }}
          >
            {info.title}
          </div>
          <div
            style={{
              fontFamily: T.sans,
              fontSize: T.sz.base,
              color: C.inkMid,
              lineHeight: 1.5,
              marginBottom: S[4],
            }}
          >
            {info.description}
          </div>
          <div
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkFaint,
            }}
          >
            Rol: {membershipRole}
          </div>
        </div>
      </div>
    );
  }

  // Enabled state — full chat
  return (
    <CopilotChat
      orgSlug={orgSlug}
      membershipRole={membershipRole}
    />
  );
}

// ── Chat Component ───────────────────────────────────────────────────────────

function CopilotChat({
  orgSlug,
  membershipRole,
}: {
  orgSlug: string;
  membershipRole: string;
}) {
  const [messages, setMessages] = useState<CopilotSessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
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
      const res = await fetch(`/api/orgs/${orgSlug}/copilot/chat`, {
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
  }, [input, connectionStatus, orgSlug]);

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
        const res = await fetch(`/api/orgs/${orgSlug}/copilot/reports`, {
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
    [orgSlug],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxWidth: 800,
        margin: "0 auto",
        padding: `${S[4]}px ${S[4]}px 0`,
      }}
    >
      {/* Header */}
      <div
        style={{
          ...panelHeader,
          borderBottom: "none",
          background: "transparent",
          padding: `${S[3]}px 0`,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.lg,
              fontWeight: T.wt.bold,
              color: C.titleDeep,
            }}
          >
            Agentik Copilot
          </span>
          {/* Preview badge */}
          <span
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.medium,
              color: C.blueDark,
              background: C.blueLight,
              border: `1px solid ${C.blueBorder}`,
              borderRadius: R.pill,
              padding: "1px 6px",
            }}
          >
            Preview
          </span>
          {/* Connection status */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
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
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  connectionStatus === "sending" ? C.amber :
                  connectionStatus === "error"   ? C.red :
                  C.green,
              }}
            />
            {connectionStatus === "sending" ? "Enviando..." :
             connectionStatus === "error"   ? "Error" :
             "Conectado"}
          </span>
        </div>
        <span
          style={{
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            color: C.inkFaint,
          }}
        >
          {membershipRole}
        </span>
      </div>

      {/* Messages area */}
      <div
        style={{
          ...panel,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: S[4],
            display: "flex",
            flexDirection: "column",
            gap: S[3],
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: `${S[10]}px ${S[4]}px`,
              }}
            >
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.md,
                  fontWeight: T.wt.medium,
                  color: C.inkMid,
                  marginBottom: S[2],
                }}
              >
                Copilot Preview
              </div>
              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: T.sz.base,
                  color: C.inkLight,
                  lineHeight: 1.5,
                  maxWidth: 400,
                  margin: "0 auto",
                }}
              >
                Pregunta sobre clientes, pedidos o desempeño de ventas.
                Los datos son agregados y redactados.
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

        {/* Input bar */}
        <div
          style={{
            borderTop: `1px solid ${C.line}`,
            padding: S[3],
            display: "flex",
            gap: S[2],
            alignItems: "center",
            background: C.white,
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
              fontSize: T.sz.base,
              color: C.ink,
              padding: `${S[2]}px ${S[3]}px`,
              border: `1px solid ${C.line}`,
              borderRadius: R.md,
              outline: "none",
              background: connectionStatus === "sending" ? C.surfaceAlt : C.white,
            }}
          />
          <button
            onClick={handleSend}
            disabled={connectionStatus === "sending" || !input.trim()}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.sm,
              fontWeight: T.wt.medium,
              color: C.white,
              background:
                connectionStatus === "sending" || !input.trim()
                  ? C.inkGhost
                  : C.blueDark,
              border: "none",
              borderRadius: R.md,
              padding: `${S[2]}px ${S[4]}px`,
              cursor:
                connectionStatus === "sending" || !input.trim()
                  ? "not-allowed"
                  : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Demo mode banner — permanent, never hidden */}
      <div
        style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.amberDark,
          background: C.amberLight,
          border: `1px solid ${C.amberBorder}`,
          borderRadius: R.sm,
          padding: `${S[1]}px ${S[3]}px`,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Modo demostración — respuestas determinísticas, sin modelo de IA conectado.
        Los datos son agregados y redactados. No es un Copilot conversacional terminado.
      </div>

      {/* Reports section */}
      <div
        style={{
          padding: `${S[3]}px 0 ${S[4]}px`,
          display: "flex",
          gap: S[2],
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            color: C.inkLight,
            marginRight: S[1],
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
              fontSize: T.sz.xs,
              fontWeight: T.wt.medium,
              color: C.blueDark,
              background: C.blueLight,
              border: `1px solid ${C.blueBorder}`,
              borderRadius: R.sm,
              padding: `2px ${S[2]}px`,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {lastError && connectionStatus === "error" && (
        <div
          style={{
            fontFamily: T.mono,
            fontSize: T.sz.xs,
            color: C.red,
            background: C.redLight,
            border: `1px solid ${C.redBorder}`,
            borderRadius: R.sm,
            padding: `${S[1]}px ${S[3]}px`,
            marginBottom: S[3],
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
