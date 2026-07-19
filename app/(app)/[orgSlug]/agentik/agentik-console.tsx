"use client";

/**
 * Copiloto Empresarial — interactive AI query terminal.
 * Premium enterprise chat interface. No "use server" allowed here.
 */

import { useState } from "react";
import {
  queryExecutiveOverview,
  queryOpenAlerts,
  queryRecentRuns,
  queryRecentEvents,
  queryRecentKnowledge,
} from "./actions";
import type {
  ExecutiveOverview,
  OpenAlertsSummary,
  RecentRunsSummary,
  RecentEventsSummary,
  RecentKnowledgeSummary,
} from "@/lib/agentik/query-service";

type QueryType = "overview" | "alerts" | "runs" | "events" | "knowledge";

type Result =
  | { type: "overview";   data: ExecutiveOverview }
  | { type: "alerts";     data: OpenAlertsSummary }
  | { type: "runs";       data: RecentRunsSummary }
  | { type: "events";     data: RecentEventsSummary }
  | { type: "knowledge";  data: RecentKnowledgeSummary }
  | { type: "error";      message: string };

const INPUT_MAP: Array<{ keywords: string[]; query: QueryType }> = [
  { keywords: ["estado", "overview", "resumen", "status", "briefing", "diagnóstico"],  query: "overview"  },
  { keywords: ["alertas", "alerta", "alerts", "crítico", "crítica", "warning"],        query: "alerts"    },
  { keywords: ["runs", "run", "ejecuciones", "ejecución", "automatizaciones"],         query: "runs"      },
  { keywords: ["eventos", "evento", "events", "actividad"],                            query: "events"    },
  { keywords: ["conocimiento", "knowledge", "saber", "memoria", "políticas", "sop"],   query: "knowledge" },
];

function parseInput(raw: string): QueryType | null {
  const n = raw.trim().toLowerCase();
  for (const { keywords, query } of INPUT_MAP) {
    if (keywords.some((kw) => n.includes(kw))) return query;
  }
  return null;
}

const SUGGESTED: Array<{ label: string; icon: string; query: QueryType; prompt: string }> = [
  { label: "Estado del negocio", icon: "📊", query: "overview",  prompt: "resumen ejecutivo de hoy" },
  { label: "Alertas activas",    icon: "⚠",  query: "alerts",    prompt: "ver alertas críticas" },
  { label: "Automatizaciones",   icon: "⚡",  query: "runs",      prompt: "ejecuciones recientes" },
  { label: "Actividad reciente", icon: "📋",  query: "events",    prompt: "eventos de la plataforma" },
  { label: "Memoria IA",         icon: "🧠",  query: "knowledge", prompt: "conocimiento indexado" },
];

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Result renderers ──────────────────────────────────────────────────────────

function OverviewResult({ d }: { d: ExecutiveOverview }) {
  const statusColor = d.status === "healthy" ? "#22c55e" : d.status === "warning" ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: statusColor, flexShrink: 0,
        }} />
        <span style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9" }}>{d.headline}</span>
      </div>
      {d.message && (
        <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{d.message}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "Ejecuciones", val: d.summary.runs.total, sub: `${d.summary.runs.failed} fallidas`, red: d.summary.runs.failed > 0 },
          { label: "Alertas",     val: d.summary.alerts.open, sub: `${d.summary.alerts.critical} críticas`, red: d.summary.alerts.critical > 0 },
          { label: "Eventos",     val: d.summary.events.total, sub: `${d.summary.events.failed} fallidos`, red: d.summary.events.failed > 0 },
        ].map(({ label, val, sub, red }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#f1f5f9" }}>{val}</div>
            <div style={{ fontSize: 10, color: red ? "#f87171" : "#64748b", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#475569" }}>Generado {fmtDateShort(d.generatedAt)}</div>
    </div>
  );
}

function AlertsResult({ d }: { d: OpenAlertsSummary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Críticas", val: d.critical, bg: "#7f1d1d", color: "#fca5a5" },
          { label: "Advertencias", val: d.warning, bg: "#78350f", color: "#fcd34d" },
          { label: "Informativas", val: d.info, bg: "#1e3a5f", color: "#93c5fd" },
        ].map(({ label, val, bg, color }) => (
          <div key={label} style={{
            flex: 1, background: bg, borderRadius: 5, padding: "8px 10px",
          }}>
            <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{val}</div>
          </div>
        ))}
      </div>
      {d.recentAlerts.slice(0, 5).map(a => (
        <div key={a.id} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 5, padding: "8px 12px",
          borderLeft: `3px solid ${a.severity === "CRITICAL" ? "#ef4444" : a.severity === "WARNING" ? "#f59e0b" : "#3b82f6"}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{a.title}</div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{a.type} · {fmtDateShort(a.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function RunsResult({ d }: { d: RecentRunsSummary }) {
  const STATUS_COLOR: Record<string, string> = {
    completed: "#22c55e", failed: "#ef4444", running: "#f59e0b", queued: "#94a3b8",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>
        {d.totalRecent} recientes · <span style={{ color: "#f87171" }}>{d.failed} fallidas</span> · <span style={{ color: "#fcd34d" }}>{d.running} en curso</span>
      </div>
      {d.recentRuns.slice(0, 6).map(r => (
        <div key={r.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "7px 12px",
        }}>
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: STATUS_COLOR[r.status.toLowerCase()] ?? "#64748b", flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600, flex: 1 }}>{r.type}</span>
          <span style={{ fontSize: 10, color: "#64748b" }}>{r.project ?? "—"}</span>
          <span style={{ fontSize: 10, color: "#475569" }}>{r.startedAt ? fmtDateShort(r.startedAt) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function EventsResult({ d }: { d: RecentEventsSummary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{d.events.length} eventos recientes</div>
      {d.events.slice(0, 6).map(e => (
        <div key={e.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "7px 12px",
        }}>
          <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600, flex: 1 }}>{e.type}</span>
          <span style={{ fontSize: 10, color: "#64748b" }}>{e.sourceType ?? "—"}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
            background: e.status === "failed" ? "#7f1d1d" : "rgba(255,255,255,0.06)",
            color: e.status === "failed" ? "#fca5a5" : "#94a3b8",
          }}>
            {e.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function KnowledgeResult({ d }: { d: RecentKnowledgeSummary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>Conocimiento indexado recientemente</div>
      {d.items.slice(0, 5).map(item => (
        <div key={item.id} style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "8px 12px",
          borderLeft: "3px solid #7c3aed",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{item.title}</div>
          {item.preview && (
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{item.preview}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentikConsole({
  organizationId,
}: {
  organizationId: string;
  orgSlug: string;
}) {
  const [loading,  setLoading]  = useState<QueryType | null>(null);
  const [result,   setResult]   = useState<Result | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [inputErr, setInputErr] = useState<string | null>(null);

  async function runQuery(id: QueryType) {
    setLoading(id);
    setResult(null);
    setInputErr(null);
    try {
      let res;
      if (id === "overview")  res = await queryExecutiveOverview(organizationId);
      else if (id === "alerts")    res = await queryOpenAlerts(organizationId);
      else if (id === "runs")      res = await queryRecentRuns(organizationId);
      else if (id === "events")    res = await queryRecentEvents(organizationId);
      else                         res = await queryRecentKnowledge(organizationId);
      setResult(res.ok ? ({ type: id, data: res.data } as Result) : { type: "error", message: res.error });
    } catch (e) {
      setResult({ type: "error", message: e instanceof Error ? e.message : "Error inesperado" });
    } finally {
      setLoading(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseInput(inputVal);
    if (!q) {
      setInputErr("No reconocí esa consulta. Prueba: estado, alertas, ejecuciones, eventos, memoria.");
      return;
    }
    setInputVal("");
    runQuery(q);
  }

  return (
    <div>
      {/* Input */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="text"
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); setInputErr(null); }}
            placeholder="Pregunta algo: estado, alertas, ejecuciones, eventos, memoria…"
            disabled={loading !== null}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${inputErr ? "#ef4444" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 8, color: "#f1f5f9", padding: "12px 48px 12px 16px",
              fontSize: 13, outline: "none", fontFamily: "monospace",
            }}
          />
          <span style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 16, opacity: 0.3, pointerEvents: "none",
          }}>
            {loading ? "⏳" : "↵"}
          </span>
        </div>
        <button
          type="submit"
          disabled={loading !== null || !inputVal.trim()}
          style={{
            background: loading || !inputVal.trim() ? "rgba(124,58,237,0.3)" : "#7c3aed",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "0 20px", fontSize: 12, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          {loading ? "…" : "CONSULTAR"}
        </button>
      </form>

      {inputErr && (
        <div style={{
          fontSize: 11, color: "#f87171", marginBottom: 10,
          padding: "6px 12px", background: "rgba(239,68,68,0.08)",
          borderRadius: 5, border: "1px solid rgba(239,68,68,0.2)",
        }}>
          {inputErr}
        </div>
      )}

      {/* Suggested prompts */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {SUGGESTED.map(s => (
          <button
            key={s.query}
            onClick={() => runQuery(s.query)}
            disabled={loading !== null}
            style={{
              background: loading === s.query ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, color: loading === s.query ? "#c4b5fd" : "#94a3b8",
              padding: "5px 12px", fontSize: 11, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", fontFamily: "monospace",
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.15s",
            }}
          >
            <span>{s.icon}</span>
            {loading === s.query ? "Cargando…" : s.label}
          </button>
        ))}
      </div>

      {/* Result panel */}
      {result && (
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8, padding: "16px 18px",
          animation: "fadeIn 0.2s ease",
        }}>
          {result.type === "error" ? (
            <div style={{ color: "#f87171", fontSize: 12 }}>Error: {result.message}</div>
          ) : result.type === "overview" ? (
            <OverviewResult d={result.data} />
          ) : result.type === "alerts" ? (
            <AlertsResult d={result.data} />
          ) : result.type === "runs" ? (
            <RunsResult d={result.data} />
          ) : result.type === "events" ? (
            <EventsResult d={result.data} />
          ) : (
            <KnowledgeResult d={result.data} />
          )}
        </div>
      )}
    </div>
  );
}
