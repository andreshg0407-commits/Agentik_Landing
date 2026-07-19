"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Notification } from "@prisma/client";
import { serverListNotifications, serverMarkNotifRead, serverMarkAllNotifsRead } from "./action-tasks";

// ── Notification type labels ───────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  ACTION_ASSIGNED:        "Asignación",
  ACTION_REASSIGNED:      "Reasignación",
  ACTION_DUE_TODAY:       "Vence hoy",
  ACTION_OVERDUE:         "Vencida",
  ACTION_COMPLETED:       "Completada",
  SCHEDULED_REPORT_READY: "Informe listo",
  SCHEDULED_REPORT_FAILED:"Error en informe",
  SYSTEM:                 "Sistema",
};

const TYPE_ICONS: Record<string, string> = {
  ACTION_ASSIGNED:        "👤",
  ACTION_REASSIGNED:      "🔄",
  ACTION_DUE_TODAY:       "📅",
  ACTION_OVERDUE:         "⚠",
  ACTION_COMPLETED:       "✅",
  SCHEDULED_REPORT_READY: "📊",
  SCHEDULED_REPORT_FAILED:"❌",
  SYSTEM:                 "🔔",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  orgSlug: string;
}

export default function NotificationBell({ orgSlug }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open,          setOpen]          = useState(false);
  const [loading,       setLoading]       = useState(false);
  const panelRef  = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const res = await serverListNotifications(orgSlug, false);
    if (res.ok) setNotifications(res.data);
  }, [orgSlug]);

  // Initial load + polling every 60s
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function markRead(notifId: string) {
    const res = await serverMarkNotifRead(orgSlug, notifId);
    if (res.ok) {
      setNotifications(prev =>
        prev.map(n => n.id === notifId ? { ...n, isRead: true } : n)
      );
    }
  }

  async function markAll() {
    setLoading(true);
    const res = await serverMarkAllNotifsRead(orgSlug);
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }
    setLoading(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={panelRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:   "relative",
          background: open ? "#f3f0ff" : "transparent",
          border:     open ? "1px solid #7c3aed" : "1px solid transparent",
          borderRadius: 6,
          cursor:     "pointer",
          padding:    "4px 8px",
          fontSize:   16,
          lineHeight: 1,
        }}
        title="Notificaciones"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position:   "absolute",
            top:        -4,
            right:      -4,
            background: "#dc2626",
            color:      "#fff",
            borderRadius: "50%",
            width:      16,
            height:     16,
            fontSize:   9,
            fontWeight: 700,
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:   "absolute",
          top:        "calc(100% + 6px)",
          right:      0,
          width:      340,
          maxHeight:  420,
          overflowY:  "auto",
          background: "#fff",
          border:     "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow:  "0 8px 24px rgba(0,0,0,0.12)",
          zIndex:     200,
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            padding:      "10px 14px",
            borderBottom: "1px solid #f0f0f0",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              Notificaciones {unreadCount > 0 && (
                <span style={{
                  background: "#dc2626", color: "#fff",
                  borderRadius: 4, padding: "1px 5px", fontSize: 9, marginLeft: 4,
                }}>
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAll}
                disabled={loading}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 10, color: "#7c3aed", fontWeight: 700, fontFamily: "monospace",
                }}
              >
                {loading ? "..." : "Marcar todas leídas"}
              </button>
            )}
          </div>

          {/* Items */}
          {notifications.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12, color: "#999" }}>
              No hay notificaciones
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.isRead && markRead(n.id)}
                style={{
                  padding:      "10px 14px",
                  borderBottom: "1px solid #f7f7f7",
                  cursor:       n.isRead ? "default" : "pointer",
                  background:   n.isRead ? "#fff" : "#faf5ff",
                  display:      "flex",
                  gap:          10,
                  alignItems:   "flex-start",
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>
                  {TYPE_ICONS[n.type] ?? "🔔"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.isRead ? 400 : 700, fontSize: 12, color: "#111", marginBottom: 2 }}>
                    {n.title}
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
                    {TYPE_LABELS[n.type] ?? n.type} · {fmtAgo(new Date(n.createdAt))}
                  </div>
                </div>
                {!n.isRead && (
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#7c3aed", flexShrink: 0, marginTop: 4,
                  }} />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAgo(date: Date): string {
  const ms  = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1)  return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
