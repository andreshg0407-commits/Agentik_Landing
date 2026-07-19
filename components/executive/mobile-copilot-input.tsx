"use client";

/**
 * components/executive/mobile-copilot-input.tsx
 *
 * Mobile Agentik Copilot command bar — Torre de Control.
 *
 * Sticky bottom command surface with:
 *   - 3 suggested prompt chips (horizontal scroll, from module context)
 *   - Text input + submit
 *   - Inline response card (appears above input on answer)
 *
 * Single-shot query model: no conversation history on mobile.
 * Reuses sendCopilotMessage with the executive ModuleContext — same LLM
 * call, same system prompt, same specialist routing as the desktop rail.
 *
 * Stickiness: position:sticky bottom:0 — works inside the scrollable main
 * content area without fighting mobile browser chrome.
 */

import { useState, useTransition, useRef } from "react";
import {
  sendCopilotMessage,
  type ConversationMessage,
  type CopilotResponse,
}                                           from "@/lib/agentik/copilot-actions";
import type { ModuleContext }               from "@/lib/agentik/copilot-context";

// ── Specialist display names ───────────────────────────────────────────────────

const SPECIALIST_LABELS: Record<string, string> = {
  executive:      "Ejecutivo",
  finance:        "Finanzas",
  sales:          "Comercial",
  alerts:         "Alertas",
  reconciliation: "Reconciliación",
  sag:            "SAG",
  dashboard:      "Dashboard",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface MobileCopilotInputProps {
  orgSlug:          string;
  moduleContext:    ModuleContext;
  /** Most recent Agentik action title — shown as a confidence footer. Null = no history yet. */
  lastActionLabel?: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MobileCopilotInput({
  orgSlug,
  moduleContext,
  lastActionLabel,
}: MobileCopilotInputProps) {
  const [input,      setInput]      = useState("");
  const [response,   setResponse]   = useState<CopilotResponse | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // First 3 suggested prompts from the executive module context
  const chips = moduleContext.suggestedPrompts.slice(0, 3);

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit(overrideText?: string) {
    const query = (overrideText ?? input).trim();
    if (!query || isPending) return;

    setInput("");
    setError(null);
    setResponse(null);

    // Empty history: single-shot model for mobile — keeps the UX fast and focused
    const history: ConversationMessage[] = [];

    startTransition(async () => {
      const result = await sendCopilotMessage(orgSlug, moduleContext, history, query);
      if (result.ok) {
        setResponse(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  function handleChipClick(prompt: string) {
    handleSubmit(prompt);
    inputRef.current?.blur();
  }

  function dismiss() {
    setResponse(null);
    setError(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position:   "sticky",
      bottom:     0,
      zIndex:     20,
      background: "#fff",
      borderTop:  "1px solid #e5e7eb",
      paddingTop: 10,
      // Respect mobile browser safe-area insets (iPhone home indicator, etc.)
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
      marginLeft:  -4,
      marginRight: -4,
      paddingLeft: 4,
      paddingRight: 4,
    }}>

      {/* ── Response card ── */}
      {isPending && (
        <div style={{
          background:   "#faf5ff",
          border:       "1px solid #ede9fe",
          borderLeft:   "3px solid #7c3aed",
          borderRadius: 10,
          padding:      "12px 14px",
          marginBottom: 10,
          fontSize:     12,
          color:        "#7c3aed",
          fontFamily:   "Inter, system-ui, sans-serif",
        }}>
          Analizando con Agentik…
        </div>
      )}

      {response && !isPending && (
        <div style={{
          background:   "#faf5ff",
          border:       "1px solid #ede9fe",
          borderLeft:   "3px solid #7c3aed",
          borderRadius: 10,
          padding:      "12px 14px",
          marginBottom: 10,
        }}>
          {/* Header */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            marginBottom:   8,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#7c3aed",
              textTransform: "uppercase", letterSpacing: "0.07em",
            }}>
              Agentik · {SPECIALIST_LABELS[moduleContext.specialist] ?? moduleContext.specialist}
            </span>
            <button
              onClick={dismiss}
              style={{
                fontSize: 10, color: "#9ca3af", background: "none",
                border: "none", cursor: "pointer", padding: "0 4px",
              }}
            >
              ✕
            </button>
          </div>

          {/* Message */}
          <div style={{
            fontSize: 13, color: "#374151", lineHeight: 1.6,
            fontFamily: "Inter, system-ui, sans-serif",
          }}>
            {response.message}
          </div>
        </div>
      )}

      {error && !isPending && (
        <div style={{
          background: "#fff0f0", border: "1px solid #fca5a5",
          borderRadius: 10, padding: "10px 14px", marginBottom: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "#991b1b" }}>{error}</span>
          <button
            onClick={dismiss}
            style={{ fontSize: 10, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Suggested prompt chips (hidden while loading or showing response) ── */}
      {!response && !isPending && (
        <div style={{
          display:      "flex",
          gap:          6,
          overflowX:    "auto",
          scrollbarWidth: "none",
          marginBottom: 8,
          paddingBottom: 2,
        }}>
          {chips.map(prompt => (
            <button
              key={prompt}
              onClick={() => handleChipClick(prompt)}
              disabled={isPending}
              style={{
                flexShrink:    0,
                fontSize:      11,
                fontWeight:    600,
                color:         "#7c3aed",
                background:    "#faf5ff",
                border:        "1px solid #ede9fe",
                borderRadius:  20,
                padding:       "6px 12px",
                cursor:        "pointer",
                whiteSpace:    "nowrap",
                fontFamily:    "Inter, system-ui, sans-serif",
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* ── Last-action confidence footer ── */}
      {lastActionLabel && !response && !isPending && (
        <div style={{
          fontSize:   9,
          color:      "#9ca3af",
          marginBottom: 6,
          paddingLeft: 2,
          display:    "flex",
          alignItems: "center",
          gap:        5,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#7c3aed", flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Última: {lastActionLabel}
          </span>
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{
          display:      "flex",
          flex:         1,
          alignItems:   "center",
          background:   "#f8f9fb",
          border:       "1px solid #e5e7eb",
          borderRadius: 10,
          padding:      "0 12px",
          gap:          6,
        }}>
          {/* Copilot badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#7c3aed",
            textTransform: "uppercase", letterSpacing: "0.07em",
            flexShrink: 0,
          }}>
            IA
          </span>

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Pregunta al Copilot ejecutivo…"
            disabled={isPending}
            style={{
              flex:       1,
              fontSize:   13,
              border:     "none",
              outline:    "none",
              background: "transparent",
              padding:    "11px 0",
              color:      "#111",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={() => handleSubmit()}
          disabled={!input.trim() || isPending}
          style={{
            padding:      "11px 16px",
            background:   !input.trim() || isPending ? "#e5e7eb" : "#7c3aed",
            color:        !input.trim() || isPending ? "#9ca3af" : "#fff",
            border:       "none",
            borderRadius: 10,
            fontSize:     16,
            fontWeight:   700,
            cursor:       !input.trim() || isPending ? "not-allowed" : "pointer",
            transition:   "all 0.15s",
            flexShrink:   0,
            lineHeight:   1,
          }}
        >
          {isPending ? "…" : "→"}
        </button>
      </div>

    </div>
  );
}
