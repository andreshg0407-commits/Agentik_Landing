"use client";

/**
 * components/layout/copilot-rail.tsx
 *
 * Agentik Copilot — persistent contextual intelligence rail.
 *
 * Client component embedded inside the server RightOpsRail.
 * Receives the pre-built ModuleContext from the server (derived from the
 * current route) and manages conversation state locally.
 *
 * UX layout (top → bottom):
 *   1. Module identity header  — icon, label, specialist badge
 *   2. Module description      — one-line context
 *   3. Conversation thread     — scrollable message history
 *   4. Suggested actions       — action buttons after each AI response
 *   5. Suggested prompts       — shown when conversation is empty
 *   6. Error notice            — shown on failure
 *   7. Sticky input area       — textarea + submit button
 */

import { useState, useRef, useEffect, useTransition } from "react";
import { C, T, S, R, E }                              from "@/lib/ui/tokens";
import {
  sendCopilotMessage,
  executeCopilotAction,
  type ConversationMessage,
  type CopilotSuggestedAction,
  type CopilotResponse,
  type ExecuteActionResult,
  type ChainStepResult,
}                                                      from "@/lib/agentik/copilot-actions";
import type { ModuleContext, CopilotActionType }       from "@/lib/agentik/copilot-context";

// ── Action type display metadata ──────────────────────────────────────────────

const ACTION_META: Record<CopilotActionType, {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
}> = {
  ask:       { label: "Consultar",  color: C.blueDark, bg: "#EEF5FF",     border: "rgba(0,74,173,.18)" },
  recommend: { label: "Recomendar", color: C.blue,     bg: C.blueLight,   border: C.blueBorder         },
  execute:   { label: "Ejecutar",   color: C.green,    bg: C.greenLight,  border: C.greenBorder        },
  delegate:  { label: "Delegar",    color: C.amber,    bg: C.amberLight,  border: C.amberBorder        },
  escalate:  { label: "Escalar",    color: C.red,      bg: C.redLight,    border: C.redBorder          },
  schedule:  { label: "Programar",  color: C.inkMid,   bg: C.surfaceAlt,  border: C.line               },
};

// ── Specialist display names ──────────────────────────────────────────────────

const SPECIALIST_LABEL: Record<string, string> = {
  luca:      "Luca",
  mila:      "Mila",
  sofi:      "Sofi",
  sag:       "SAG",
  finance:   "Finanzas",
  reports:   "Reportes",
  alerts:    "Alertas",
  executive: "Ejecutivo",
  general:   "Copilot",
};

// ── ActionButton sub-component ────────────────────────────────────────────────

function ActionButton({
  action, result, isDone, isPending, meta, onExecute,
}: {
  action:    CopilotSuggestedAction;
  result:    ExecuteActionResult | undefined;
  isDone:    boolean;
  isPending: boolean;
  meta:      { color: string; bg: string; border: string };
  onExecute: () => void;
}) {
  const isChain      = result?.mode === "chain";
  const isExec       = result?.mode === "executed";
  const isDelegated  = result?.mode === "delegated";
  // "task" is the remaining mode (ActionTask created for manual follow-up)

  // Colour scheme per outcome
  const doneBorder = isChain     ? "rgba(0,74,173,.18)"
                   : isExec      ? C.greenBorder
                   : isDelegated ? C.amberBorder
                   : "rgba(0,74,173,.18)";
  const doneBg     = isChain     ? "#EEF5FF"
                   : isExec      ? C.greenLight
                   : isDelegated ? C.amberLight
                   : "#EEF5FF";
  const doneColor  = isChain     ? C.blueDark
                   : isExec      ? C.green
                   : isDelegated ? C.amber
                   : C.blueDark;

  const doneLabel  = isChain     ? "✓ Workflow Ejecutado"
                   : isExec      ? (result?.resultMessage || "✓ Ejecutado")
                   : isDelegated ? "→ Delegado"
                   : "✓ Creado en bandeja";

  const modeBadge  = isChain ? "workflow" : isExec ? "exec" : isDelegated ? "delegado" : "task";

  return (
    <button
      onClick={onExecute}
      disabled={isDone || isPending}
      title={isDone ? (result?.resultMessage || action.description) : action.description}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           S[1],
        padding:       `${S[1]}px ${S[1] + 2}px`,
        borderRadius:  R.sm,
        border:        `1px solid ${isDone ? doneBorder : meta.border}`,
        background:    isDone ? doneBg    : meta.bg,
        color:         isDone ? doneColor : meta.color,
        fontSize:      T.sz["2xs"],
        fontFamily:    T.sans,
        fontWeight:    isDone ? T.wt.bold : T.wt.semibold,
        cursor:        isDone || isPending ? "default" : "pointer",
        textAlign:     "left" as const,
        width:         "100%",
        opacity:       isPending && !isDone ? 0.6 : 1,
        transition:    "all 0.15s ease",
        lineHeight:    1.3,
      }}
    >
      <span style={{ fontFamily: T.mono, flexShrink: 0 }}>
        {isDone ? (isDelegated ? "→" : "✓") : "›"}
      </span>
      <span style={{
        flex:         1,
        minWidth:     0,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap" as const,
      }}>
        {isDone ? doneLabel : action.label}
      </span>
      <span style={{
        fontSize:      T.sz["2xs"] - 1,
        fontFamily:    T.mono,
        opacity:       0.65,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
        flexShrink:    0,
      }}>
        {isDone ? modeBadge : action.type}
      </span>
    </button>
  );
}

// ── ChainProgress sub-component ───────────────────────────────────────────────

function ChainProgress({ steps }: { steps: ChainStepResult[] }) {
  return (
    <div style={{
      marginTop:     S[1],
      marginLeft:    S[1] + 2,
      paddingLeft:   S[2],
      borderLeft:    "2px solid rgba(0,74,173,.18)",
      display:       "flex",
      flexDirection: "column",
      gap:           3,
    }}>
      {steps.map((step) => {
        const isFailed    = step.mode === "failed";
        const isTask      = step.mode === "task";
        const isDelegate  = step.mode === "delegated";
        const dotColor    = isFailed   ? C.red
                          : isTask     ? C.blueDark
                          : isDelegate ? C.amber
                          : C.green;
        const msgColor    = isFailed   ? C.redDark
                          : isTask     ? C.blueDark
                          : isDelegate ? C.amberDark
                          : C.green;

        return (
          <div key={step.stepIndex} style={{
            display:    "flex",
            alignItems: "flex-start",
            gap:        S[1],
          }}>
            {/* Status dot */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      dotColor,
              flexShrink: 0,
              marginTop:  1,
              lineHeight: 1,
            }}>
              {isFailed ? "✗" : isDelegate ? "→" : "✓"}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Step label + specialist */}
              <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                <span style={{
                  fontSize:   T.sz["2xs"],
                  fontFamily: T.sans,
                  fontWeight: T.wt.semibold,
                  color:      C.inkMid,
                  flex:       1,
                  minWidth:   0,
                  overflow:   "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}>
                  {step.label}
                </span>
                <span style={{
                  fontSize:      T.sz["2xs"] - 1,
                  fontFamily:    T.mono,
                  color:         C.inkFaint,
                  flexShrink:    0,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.04em",
                }}>
                  → {step.specialist}
                </span>
              </div>
              {/* Result message */}
              <div style={{
                fontSize:   T.sz["2xs"] - 1,
                fontFamily: T.sans,
                color:      msgColor,
                lineHeight: 1.35,
                marginTop:  1,
              }}>
                {step.resultMessage}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotRailProps {
  orgSlug:       string;
  moduleContext: ModuleContext;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotRail({ orgSlug, moduleContext }: CopilotRailProps) {
  const [messages,     setMessages]     = useState<ConversationMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<CopilotResponse | null>(null);
  const [input,        setInput]        = useState("");
  const [error,        setError]        = useState<string | null>(null);
  // Maps action key → execution result (mode + resultMessage)
  const [actionResults, setActionResults] = useState<Map<string, ExecuteActionResult>>(new Map());
  const [isPending,    startTransition] = useTransition();

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll when a new message lands
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, lastResponse]);

  // Reset conversation when module changes (route change)
  useEffect(() => {
    setMessages([]);
    setLastResponse(null);
    setError(null);
    setInput("");
    setActionResults(new Map());
  }, [moduleContext.moduleId]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit(overrideText?: string) {
    const query = (overrideText ?? input).trim();
    if (!query || isPending) return;

    const userMsg: ConversationMessage = { role: "user", content: query };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setError(null);
    setLastResponse(null);

    startTransition(async () => {
      const result = await sendCopilotMessage(
        orgSlug,
        moduleContext,
        messages,   // history before this message
        query,
      );

      if (result.ok) {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: result.data.message },
        ]);
        setLastResponse(result.data);
      } else {
        setError(result.error);
        setMessages(prev => prev.slice(0, -1)); // remove optimistic user message
      }
    });
  }

  function handleSuggestedPrompt(prompt: string) {
    setInput(prompt);
    handleSubmit(prompt);
  }

  // ── Execute action ──────────────────────────────────────────────────────────

  function handleExecuteAction(action: CopilotSuggestedAction, idx: number) {
    const key = `${idx}:${action.label}`;
    if (actionResults.has(key) || isPending) return;

    startTransition(async () => {
      const result = await executeCopilotAction(
        orgSlug,
        moduleContext.moduleId,
        action.type,
        action.label,
        action.description,
      );
      if (result.ok) {
        setActionResults(prev => new Map(prev).set(key, result.data));
      } else {
        setError(result.error);
      }
    });
  }

  const specialistLabel = SPECIALIST_LABEL[moduleContext.specialist] ?? moduleContext.specialist;
  const showSuggestions = messages.length === 0;

  return (
    <div style={{
      padding:       S[3],
      display:       "flex",
      flexDirection: "column",
      gap:           0,
    }}>

      {/* ── 1. Copilot header ────────────────────────────────────────────────── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[1] + 2,
        marginBottom: S[2],
      }}>

        {/* Module icon */}
        <span style={{
          fontSize:   T.sz.base,
          fontFamily: T.mono,
          color:      C.blueDark,
          fontWeight: T.wt.bold,
          flexShrink: 0,
        }}>
          {moduleContext.moduleIcon}
        </span>

        {/* Identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily:    T.sans,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.bold,
            color:         C.blueDark,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
          }}>
            Agentik Copilot
          </div>
          <div style={{
            fontSize:     T.sz["2xs"],
            color:        C.inkFaint,
            fontFamily:   T.sans,
            overflow:     "hidden",
            whiteSpace:   "nowrap" as const,
            textOverflow: "ellipsis",
          }}>
            {moduleContext.moduleLabel}
          </div>
        </div>

        {/* Specialist badge */}
        <span style={{
          fontSize:     T.sz["2xs"],
          fontFamily:   T.mono,
          color:        C.blueDark,
          background:   "#EEF5FF",
          border:       "1px solid rgba(0,74,173,.18)",
          borderRadius: R.pill,
          padding:      "1px 6px",
          whiteSpace:   "nowrap" as const,
          flexShrink:   0,
        }}>
          {specialistLabel}
        </span>
      </div>

      {/* ── 2. Module description ────────────────────────────────────────────── */}
      <div style={{
        fontSize:      T.sz["2xs"],
        color:         C.inkLight,
        fontFamily:    T.sans,
        lineHeight:    1.45,
        marginBottom:  S[2],
        paddingBottom: S[2],
        borderBottom:  "1px solid var(--ag-line, rgba(0,74,173,.12))",
      }}>
        {moduleContext.description}
      </div>

      {/* ── 3. Conversation thread ───────────────────────────────────────────── */}
      {messages.length > 0 && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           S[1] + 2,
          marginBottom:  S[2],
          maxHeight:     240,
          overflowY:     "auto",
        }}>
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div key={i} style={{
                padding:      `${S[1] + 2}px ${S[2]}px`,
                borderRadius: R.md,
                fontSize:     T.sz["2xs"],
                fontFamily:   T.sans,
                lineHeight:   1.5,
                background:   isUser ? "#EEF5FF"    : C.surface,
                border:       `1px solid ${isUser ? "rgba(0,74,173,.18)" : C.line}`,
                color:        isUser ? C.blueDark   : C.inkMid,
                alignSelf:    isUser ? "flex-end"    : "flex-start",
                maxWidth:     "92%",
              }}>
                <div style={{
                  fontSize:     T.sz["2xs"],
                  fontWeight:   T.wt.bold,
                  color:        isUser ? C.blueDark : C.inkFaint,
                  marginBottom: 2,
                  fontFamily:   T.mono,
                }}>
                  {isUser ? "Tú" : "Agentik"}
                </div>
                {msg.content}
              </div>
            );
          })}

          {/* Thinking indicator */}
          {isPending && messages[messages.length - 1]?.role === "user" && (
            <div className="ag-copilot-thinking" style={{
              padding:      `${S[1] + 2}px ${S[2]}px`,
              borderRadius: R.md,
              fontSize:     T.sz["2xs"],
              fontFamily:   T.mono,
              color:        C.inkFaint,
              background:   C.surface,
              border:       `1px solid ${C.line}`,
              alignSelf:    "flex-start",
            }}>
              Analizando…
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* ── 4. Suggested actions (after AI response) ─────────────────────────── */}
      {lastResponse && lastResponse.suggestedActions.length > 0 && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           S[1],
          marginBottom:  S[2],
          paddingBottom: S[2],
          borderBottom:  "1px solid var(--ag-line, rgba(0,74,173,.12))",
        }}>
          <div style={{
            fontSize:      T.sz["2xs"],
            fontFamily:    T.sans,
            fontWeight:    T.wt.bold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            marginBottom:  2,
          }}>
            Acciones disponibles
          </div>

          {lastResponse.suggestedActions.map((action, i) => {
            const meta   = ACTION_META[action.type] ?? ACTION_META.recommend;
            const key    = `${i}:${action.label}`;
            const result = actionResults.get(key);
            const isDone = !!result;

            return (
              <div key={key}>
                <ActionButton
                  action={action}
                  result={result}
                  isDone={isDone}
                  isPending={isPending}
                  meta={meta}
                  onExecute={() => handleExecuteAction(action, i)}
                />
                {/* Chain step progress tracker */}
                {isDone && result?.mode === "chain" && result.steps && (
                  <ChainProgress steps={result.steps} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 5. Suggested prompts (empty state) ───────────────────────────────── */}
      {showSuggestions && (
        <div style={{ marginBottom: S[2] }}>
          <div style={{
            fontSize:      T.sz["2xs"],
            fontFamily:    T.sans,
            fontWeight:    T.wt.bold,
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
            marginBottom:  S[1] + 2,
          }}>
            Preguntas sugeridas
          </div>
          {moduleContext.suggestedPrompts.slice(0, 4).map(prompt => (
            <button
              key={prompt}
              onClick={() => handleSuggestedPrompt(prompt)}
              disabled={isPending}
              style={{
                display:      "block",
                width:        "100%",
                textAlign:    "left" as const,
                fontSize:     T.sz["2xs"],
                fontFamily:   T.sans,
                color:        C.blueDark,
                background:   "transparent",
                border:       "none",
                borderBottom: "1px solid var(--ag-line, rgba(0,74,173,.12))",
                padding:      `${S[1] + 1}px 0`,
                cursor:       isPending ? "not-allowed" : "pointer",
                lineHeight:   1.4,
                opacity:      isPending ? 0.5 : 1,
              }}
            >
              › {prompt}
            </button>
          ))}
        </div>
      )}

      {/* ── 6. Error notice ──────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding:      `${S[1]}px ${S[2]}px`,
          borderRadius: R.sm,
          fontSize:     T.sz["2xs"],
          fontFamily:   T.sans,
          color:        C.redDark,
          background:   C.redLight,
          border:       `1px solid ${C.redBorder}`,
          marginBottom: S[2],
          lineHeight:   1.4,
        }}>
          {error}
        </div>
      )}

      {/* ── 7. Input area ────────────────────────────────────────────────────── */}
      <div style={{
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.md,
        overflow:     "hidden",
        boxShadow:    E.xs,
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={`Pregunta sobre ${moduleContext.moduleLabel}…`}
          disabled={isPending}
          rows={2}
          style={{
            width:      "100%",
            border:     "none",
            outline:    "none",
            resize:     "none" as const,
            padding:    `${S[2]}px`,
            fontSize:   T.sz["2xs"],
            fontFamily: T.sans,
            color:      C.ink,
            background: "transparent",
            lineHeight: 1.5,
            boxSizing:  "border-box" as const,
          }}
        />

        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        `${S[1]}px ${S[1] + 2}px`,
          borderTop:      `1px solid ${C.line}`,
          background:     C.surfaceAlt,
        }}>
          {/* Clear or hint */}
          {messages.length > 0 ? (
            <button
              onClick={() => {
                setMessages([]);
                setLastResponse(null);
                setError(null);
                setActionResults(new Map());
              }}
              style={{
                fontSize:   T.sz["2xs"],
                fontFamily: T.sans,
                color:      C.inkFaint,
                background: "none",
                border:     "none",
                cursor:     "pointer",
                padding:    0,
              }}
            >
              Limpiar
            </button>
          ) : (
            <span style={{
              fontSize:   T.sz["2xs"],
              fontFamily: T.mono,
              color:      C.inkGhost,
            }}>
              ↵ enviar
            </span>
          )}

          {/* Submit */}
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isPending}
            style={{
              padding:       `${S[1]}px ${S[2]}px`,
              borderRadius:  R.sm,
              border:        "none",
              background:    !input.trim() || isPending ? C.surfaceAlt : "var(--ag-grad-hero, linear-gradient(135deg, #004AAD, #1E63D8))",
              color:         !input.trim() || isPending ? C.inkGhost   : C.white,
              fontSize:      T.sz["2xs"],
              fontFamily:    T.sans,
              fontWeight:    T.wt.bold,
              cursor:        !input.trim() || isPending ? "not-allowed" : "pointer",
              transition:    "all 0.15s ease",
              letterSpacing: "0.03em",
            }}
          >
            {isPending ? "…" : "Consultar"}
          </button>
        </div>
      </div>

      {/* Routing note */}
      {messages.length > 0 && (
        <div style={{
          marginTop:  S[1] + 2,
          fontSize:   T.sz["2xs"] - 1,
          fontFamily: T.mono,
          color:      C.inkGhost,
          textAlign:  "center" as const,
        }}>
          Orquestando → {specialistLabel}
        </div>
      )}

    </div>
  );
}
