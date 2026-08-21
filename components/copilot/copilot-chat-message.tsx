"use client";

/**
 * components/copilot/copilot-chat-message.tsx
 *
 * Copilot Core — Chat Message Bubble
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Renders a single user or agent message with optional truth badge.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { CopilotTruthBadge } from "./copilot-truth-badge";

type TruthState = "VERIFIED" | "PARTIAL" | "DATA_UNVERIFIED";

export interface CopilotSessionMessage {
  readonly id: string;
  readonly role: "user" | "agent";
  readonly text: string;
  readonly truthState?: TruthState;
  readonly timestamp: string;
}

interface CopilotChatMessageProps {
  message: CopilotSessionMessage;
  agentInitial?: string;
}

export function CopilotChatMessage({ message, agentInitial = "D" }: CopilotChatMessageProps) {
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
      </div>
    </div>
  );
}
