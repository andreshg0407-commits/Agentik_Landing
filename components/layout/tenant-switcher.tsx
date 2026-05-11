"use client";

/**
 * components/layout/tenant-switcher.tsx
 *
 * Tenant context card in the sidebar header.
 *
 * ── Two modes ─────────────────────────────────────────────────────────────────
 *
 *   showSwitcher = false  (ORG_ADMIN and below)
 *     Renders exactly the same static card that was inline in layout.tsx.
 *     Zero new behavior, zero risk.
 *
 *   showSwitcher = true   (SUPER_ADMIN / AGENTIK_ADMIN)
 *     Adds a chevron ▾ indicator and opens a searchable dropdown on click.
 *     Org list is fetched lazily from GET /api/user/orgs on first open.
 *     Selecting a different org navigates to /{newSlug} (role-home redirect
 *     in page.tsx takes care of landing the user in the right module).
 *
 * ── Sprint 1 scope ─────────────────────────────────────────────────────────
 *   ✅ Static render when showSwitcher=false
 *   ✅ Lazy fetch on first open
 *   ✅ Search filter (visible when orgs > 5)
 *   ✅ Click-outside and Escape to close
 *   ✅ Current org highlighted
 *   ✅ Navigate to new org
 *   ❌ Preserve current module (Sprint 3)
 *   ❌ Recents in localStorage (Sprint 3)
 *   ❌ Pagination (Sprint 3)
 */

import { useState, useEffect, useRef } from "react";
import { useRouter }                   from "next/navigation";
import { C, T, S, R, E }               from "@/lib/ui/tokens";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgItem {
  id:   string;
  name: string;
  slug: string;
  role: string;
}

interface TenantSwitcherProps {
  /** Slug of the org whose layout is currently rendering. */
  currentOrgSlug: string;
  /** Shown as the small monospace badge below the org name. */
  projectKey:     string;
  /**
   * When true the card is interactive and a chevron is shown.
   * Should only be true for SUPER_ADMIN / AGENTIK_ADMIN.
   */
  showSwitcher:   boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TenantSwitcher({
  currentOrgSlug,
  projectKey,
  showSwitcher,
}: TenantSwitcherProps) {
  const [open,    setOpen]    = useState(false);
  const [orgs,    setOrgs]    = useState<OrgItem[]>([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);

  const hasFetched   = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);
  const router       = useRouter();

  // ── Close on click outside ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Auto-focus search when dropdown opens ─────────────────────────────────
  useEffect(() => {
    if (open && orgs.length > 5) {
      // Slight delay so the DOM is painted before focusing
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, orgs.length]);

  // ── Toggle ────────────────────────────────────────────────────────────────
  function handleToggle() {
    if (!showSwitcher) return;

    const willOpen = !open;
    setOpen(willOpen);
    setSearch("");

    if (willOpen && !hasFetched.current) {
      hasFetched.current = true;
      setLoading(true);
      fetch("/api/user/orgs")
        .then(r => (r.ok ? r.json() : []))
        .then((data: OrgItem[]) => setOrgs(data))
        .catch(() => setOrgs([]))
        .finally(() => setLoading(false));
    }
  }

  // ── Switch ────────────────────────────────────────────────────────────────
  function switchTo(slug: string) {
    setOpen(false);
    setSearch("");
    if (slug !== currentOrgSlug) {
      router.push(`/${slug}`);
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const q        = search.trim().toLowerCase();
  const filtered = q
    ? orgs.filter(o =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
      )
    : orgs;

  const showSearch = orgs.length > 5;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: S[3] }}>

      {/* ── Trigger card ── */}
      <div
        role={showSwitcher ? "button" : undefined}
        tabIndex={showSwitcher ? 0 : undefined}
        onClick={handleToggle}
        onKeyDown={showSwitcher ? (e) => { if (e.key === "Enter" || e.key === " ") handleToggle(); } : undefined}
        style={{
          background:   C.surface,
          border:       `1px solid ${open ? C.brand : C.sidebarLine}`,
          borderRadius: R.xl,
          padding:      `${S[2] + 4}px ${S[3]}px`,
          cursor:       showSwitcher ? "pointer" : "default",
          userSelect:   "none",
          transition:   "border-color 120ms",
        }}
      >
        {/* Label */}
        <div style={{
          fontFamily:    T.sans,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.bold,
          color:         C.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom:  S[1],
        }}>
          Agentik Enterprise
        </div>

        {/* Org name row */}
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   S[1],
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.lg,
            fontWeight: T.wt.black,
            color:      C.ink,
            lineHeight: 1.2,
          }}>
            {currentOrgSlug}
          </div>
          {showSwitcher && (
            <span
              aria-hidden
              style={{
                fontSize:   10,
                color:      open ? C.brand : C.inkFaint,
                transform:  open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms, color 120ms",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ▾
            </span>
          )}
        </div>

        {/* Project key badge */}
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        C.inkFaint,
          background:   C.surfaceAlt,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xs,
          padding:      "1px 6px",
        }}>
          {projectKey}
        </span>
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 4px)",
          left:         0,
          right:        0,
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.xl,
          boxShadow:    E.lg,
          zIndex:       1000,
          overflow:     "hidden",
        }}>

          {/* Search */}
          {showSearch && (
            <div style={{
              padding:      `${S[2]}px ${S[2]}px`,
              borderBottom: `1px solid ${C.line}`,
            }}>
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar tenant…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width:        "100%",
                  boxSizing:    "border-box",
                  fontFamily:   T.mono,
                  fontSize:     T.sz.sm,
                  color:        C.ink,
                  background:   C.surface,
                  border:       `1px solid ${C.line}`,
                  borderRadius: R.md,
                  padding:      `${S[1]}px ${S[2]}px`,
                  outline:      "none",
                }}
              />
            </div>
          )}

          {/* List */}
          <div style={{ maxHeight: 272, overflowY: "auto" }}>
            {loading ? (
              <div style={{
                padding:   `${S[4]}px`,
                textAlign: "center",
                color:     C.inkFaint,
                fontSize:  T.sz.sm,
                fontFamily: T.mono,
              }}>
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{
                padding:   `${S[4]}px`,
                textAlign: "center",
                color:     C.inkFaint,
                fontSize:  T.sz.sm,
                fontFamily: T.mono,
              }}>
                Sin resultados
              </div>
            ) : (
              filtered.map((org, idx) => {
                const isCurrent = org.slug === currentOrgSlug;
                const isLast    = idx === filtered.length - 1;
                return (
                  <button
                    key={org.id}
                    onClick={() => switchTo(org.slug)}
                    style={{
                      width:        "100%",
                      display:      "flex",
                      alignItems:   "center",
                      gap:          S[2],
                      padding:      `${S[2]}px ${S[3]}px`,
                      background:   isCurrent ? C.brandLight : "transparent",
                      border:       "none",
                      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
                      cursor:       "pointer",
                      textAlign:    "left",
                    }}
                  >
                    {/* Status dot */}
                    <span style={{
                      width:        7,
                      height:       7,
                      borderRadius: R.pill,
                      background:   isCurrent ? C.brand : C.inkGhost,
                      flexShrink:   0,
                      display:      "block",
                    }} />

                    {/* Name + slug */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily:   T.mono,
                        fontSize:     T.sz.sm,
                        fontWeight:   isCurrent ? T.wt.bold : T.wt.medium,
                        color:        isCurrent ? C.brand : C.ink,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}>
                        {org.name}
                      </div>
                      <div style={{
                        fontFamily: T.mono,
                        fontSize:   T.sz["2xs"],
                        color:      C.inkFaint,
                      }}>
                        {org.slug}
                      </div>
                    </div>

                    {/* Current checkmark */}
                    {isCurrent && (
                      <span style={{
                        fontSize:   T.sz.xs,
                        color:      C.brand,
                        fontWeight: T.wt.bold,
                        flexShrink: 0,
                      }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

    </div>
  );
}
