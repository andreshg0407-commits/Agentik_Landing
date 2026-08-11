/**
 * Tenant User Administration — client component.
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-02
 *
 * Internal Agentik admin surface. SUPER_ADMIN / AGENTIK_ADMIN only.
 *
 * Capabilities:
 *   - List org members with role, status, email
 *   - Create new member (name, email, role, password)
 *   - Change member role
 *   - Disable / reactivate membership
 *
 * No seller provisioning controls.
 * Passwords never displayed after creation.
 * Server remains authority for all operations.
 */
"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SerializedMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
  disabledAt: string | null;
  hasSellerIdentity: boolean;
}

type ClientRole =
  | "SUPER_ADMIN"
  | "AGENTIK_ADMIN"
  | "ORG_ADMIN"
  | "MANAGER"
  | "OPERATOR"
  | "VIEWER"
  | "BILLING";

const ASSIGNABLE_ROLES: ClientRole[] = [
  "ORG_ADMIN", "MANAGER", "OPERATOR", "VIEWER", "BILLING",
];

// ── Main ──────────────────────────────────────────────────────────────────────

export function UsersAdminClient({
  orgSlug,
  orgName,
  callerRole,
  initialMembers,
}: {
  orgSlug: string;
  orgName: string;
  callerRole: string;
  initialMembers: SerializedMember[];
}) {
  const [members, setMembers] = useState<SerializedMember[]>(initialMembers);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function refreshMembers() {
    const res = await fetch(`/api/orgs/${orgSlug}/members`);
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
    }
  }

  async function handleDisable(membershipId: string) {
    setBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/orgs/${orgSlug}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    if (res.ok) {
      setFeedback("Membresía deshabilitada.");
      await refreshMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setFeedback(`Error: ${data.error ?? res.status}`);
    }
    setBusy(false);
  }

  async function handleReactivate(membershipId: string) {
    setBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/orgs/${orgSlug}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (res.ok) {
      setFeedback("Membresía reactivada.");
      await refreshMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setFeedback(`Error: ${data.error ?? res.status}`);
    }
    setBusy(false);
  }

  async function handleRoleChange(membershipId: string, newRole: string) {
    setBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/orgs/${orgSlug}/members/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      setFeedback(`Rol actualizado a ${newRole}.`);
      await refreshMembers();
    } else {
      const data = await res.json().catch(() => ({}));
      setFeedback(`Error: ${data.detail ?? data.error ?? res.status}`);
    }
    setBusy(false);
  }

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 960, padding: `${S[6]}px` }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Agentik", href: `/${orgSlug}/agentik` },
          { label: "Usuarios" },
        ]}
        title="Usuarios y Membresías"
        subtitle={orgName}
        status="ready"
        statusLabel={`${members.length} miembro${members.length !== 1 ? "s" : ""}`}
      />

      {/* Feedback */}
      {feedback && (
        <div style={{
          marginBottom: S[3], padding: `${S[2]}px ${S[3]}px`,
          background: feedback.startsWith("Error") ? "rgba(220,38,38,0.06)" : "rgba(22,163,74,0.06)",
          border: `1px solid ${feedback.startsWith("Error") ? "rgba(220,38,38,0.15)" : "rgba(22,163,74,0.15)"}`,
          borderRadius: R.md,
          fontSize: T.sz.xs, color: feedback.startsWith("Error") ? C.redDark : C.greenDark,
        }}>
          {feedback}
        </div>
      )}

      {/* Actions bar */}
      <div style={{
        display: "flex", justifyContent: "flex-end",
        marginBottom: S[3],
      }}>
        <button
          onClick={() => { setShowCreate(true); setFeedback(null); }}
          disabled={busy}
          className="ag-action-primary"
          style={{
            padding: `${S[2]}px ${S[3]}px`,
            fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            fontFamily: T.mono,
          }}
        >
          + Crear usuario
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateMemberForm
          orgSlug={orgSlug}
          callerRole={callerRole}
          onCreated={async () => {
            setShowCreate(false);
            setFeedback("Usuario creado exitosamente.");
            await refreshMembers();
          }}
          onCancel={() => setShowCreate(false)}
          onError={(msg) => setFeedback(`Error: ${msg}`)}
        />
      )}

      {/* Members table */}
      <div className="ag-op-table" style={{ borderRadius: R.md, overflow: "hidden" }}>
        {/* Header */}
        <div className="ag-op-row" style={{
          display: "grid",
          gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1.2fr",
          padding: `${S[2]}px ${S[3]}px`,
          background: C.surfaceAlt,
          borderBottom: `1px solid ${C.line}`,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.bold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
          <span>Nombre</span>
          <span>Email</span>
          <span>Rol</span>
          <span>Estado</span>
          <span>Vendedor</span>
          <span>Acciones</span>
        </div>

        {members.length === 0 && (
          <div style={{
            padding: `${S[5]}px ${S[3]}px`,
            textAlign: "center",
            color: C.inkFaint,
            fontSize: T.sz.sm,
          }}>
            Sin miembros en esta organización.
          </div>
        )}

        {members.map(m => (
          <MemberRow
            key={m.membershipId}
            member={m}
            callerRole={callerRole}
            busy={busy}
            onDisable={() => handleDisable(m.membershipId)}
            onReactivate={() => handleReactivate(m.membershipId)}
            onRoleChange={(role) => handleRoleChange(m.membershipId, role)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Member row ──────────────────────────────────────────────────────────────

function MemberRow({
  member,
  callerRole,
  busy,
  onDisable,
  onReactivate,
  onRoleChange,
}: {
  member: SerializedMember;
  callerRole: string;
  busy: boolean;
  onDisable: () => void;
  onReactivate: () => void;
  onRoleChange: (role: string) => void;
}) {
  const isInternalMember = member.role === "SUPER_ADMIN" || member.role === "AGENTIK_ADMIN";
  const canEditRole = callerRole === "SUPER_ADMIN" || !isInternalMember;

  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1.2fr",
      padding: `${S[2]}px ${S[3]}px`,
      borderBottom: `1px solid ${C.line}`,
      fontSize: T.sz.xs,
      alignItems: "center",
      opacity: member.status === "DISABLED" ? 0.55 : 1,
    }}>
      {/* Name */}
      <span style={{ color: C.ink, fontWeight: T.wt.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {member.name ?? "\u2014"}
      </span>

      {/* Email */}
      <span style={{ color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {member.email}
      </span>

      {/* Role */}
      <span>
        {canEditRole ? (
          <select
            value={member.role}
            onChange={(e) => onRoleChange(e.target.value)}
            disabled={busy}
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              padding: "2px 4px",
              border: `1px solid ${C.line}`,
              borderRadius: R.sm,
              background: C.white,
              color: C.ink,
              cursor: "pointer",
            }}
          >
            {isInternalMember && (
              <option value={member.role}>{member.role}</option>
            )}
            {ASSIGNABLE_ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </span>

      {/* Status */}
      <span>
        <StatusBadge status={member.status} />
      </span>

      {/* Seller identity */}
      <span style={{ fontSize: T.sz["2xs"], color: member.hasSellerIdentity ? C.amberDark : C.inkFaint }}>
        {member.hasSellerIdentity ? "Vendedor" : "\u2014"}
      </span>

      {/* Actions */}
      <span style={{ display: "flex", gap: S[1] }}>
        {member.status === "ACTIVE" && (
          <button
            onClick={onDisable}
            disabled={busy}
            style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              padding: "2px 6px", border: `1px solid ${C.line}`,
              borderRadius: R.sm, background: C.white,
              color: C.redDark, cursor: "pointer",
            }}
          >
            Deshabilitar
          </button>
        )}
        {member.status === "DISABLED" && (
          <button
            onClick={onReactivate}
            disabled={busy}
            style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"],
              padding: "2px 6px", border: `1px solid ${C.line}`,
              borderRadius: R.sm, background: C.white,
              color: C.greenDark, cursor: "pointer",
            }}
          >
            Reactivar
          </button>
        )}
      </span>
    </div>
  );
}

// ── Create member form ──────────────────────────────────────────────────────

function CreateMemberForm({
  orgSlug,
  callerRole,
  onCreated,
  onCancel,
  onError,
}: {
  orgSlug: string;
  callerRole: string;
  onCreated: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClientRole>("ORG_ADMIN");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) return;
    if (password.length < 8) {
      onError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/orgs/${orgSlug}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, password }),
    });

    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json().catch(() => ({}));
      onError(data.detail ?? data.error ?? `Error ${res.status}`);
    }
    setSubmitting(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: `${S[2]}px ${S[2]}px`,
    fontFamily: T.mono, fontSize: T.sz.xs,
    border: `1px solid ${C.line}`, borderRadius: R.sm,
    background: C.white, color: C.ink,
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: T.sz["2xs"],
    fontWeight: T.wt.semibold, color: C.inkLight,
    marginBottom: 4, textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginBottom: S[4], padding: S[4],
        background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.md, boxShadow: E.sm,
      }}
    >
      <div style={{
        fontSize: T.sz.sm, fontWeight: T.wt.bold,
        color: C.ink, marginBottom: S[3],
      }}>
        Crear usuario
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3], marginBottom: S[3] }}>
        <div>
          <label style={labelStyle}>Nombre</label>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            required placeholder="Nombre completo" style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder="usuario@empresa.com" style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3], marginBottom: S[3] }}>
        <div>
          <label style={labelStyle}>Rol</label>
          <select
            value={role} onChange={e => setRole(e.target.value as ClientRole)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {ASSIGNABLE_ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Contraseña inicial</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={8} placeholder="Mínimo 8 caracteres"
            autoComplete="new-password" style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: S[2], justifyContent: "flex-end" }}>
        <button
          type="button" onClick={onCancel}
          className="ag-action-ghost"
          style={{ padding: `${S[1]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.xs }}
        >
          Cancelar
        </button>
        <button
          type="submit" disabled={submitting}
          className="ag-action-primary"
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Creando..." : "Crear"}
        </button>
      </div>
    </form>
  );
}

// ── Shared badges ────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const color = role === "SUPER_ADMIN" ? C.titleDeep
    : role === "AGENTIK_ADMIN" ? C.blueDark
    : C.ink;

  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"],
      fontWeight: T.wt.semibold, color,
    }}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: C.greenDark, label: "Activo" },
    INVITED: { color: C.amberDark, label: "Invitado" },
    DISABLED: { color: C.redDark, label: "Deshabilitado" },
  };
  const cfg = map[status] ?? { color: C.inkFaint, label: status };

  return (
    <span className="ag-op-status" style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"],
      fontWeight: T.wt.semibold, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}
