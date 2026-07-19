"use client";
/**
 * components/marketing-studio/ads/ads-accounts-panel.tsx
 *
 * MARKETING-ADS-ACCOUNTS-01 — Ads Resource Discovery & Selection Panel
 *
 * Displays per-platform advertising resources and allows the operator to
 * select which account/page/profile Agentik will use when preparing campaigns.
 *
 * Architecture:
 *   - Initial selections rendered from RSC props (accountsConfig from Prisma).
 *   - "Descubrir recursos" triggers GET /api/.../ads/accounts (on-demand).
 *   - Save triggers PUT /api/.../ads/accounts (per platform).
 *   - Never shows tokens or secrets.
 *
 * Prepared for MARKETING-ADS-EXECUTION-01:
 *   The executor will read TenantAdsConfig.selectedAdAccountId (etc.) to decide
 *   which platform resources to target when creating campaigns.
 */
import React, { useState, useCallback } from "react";

import {
  AgModuleSecondaryPanel,
} from "@/components/agentik/operational-ux-kit";
import { C, T, S, R } from "@/lib/ui/tokens";

import type {
  TenantAdsConfigData,
  AdsPlatformResource,
  AdsAccountsDiscoveryResult,
  AdsPlatformDiscoveryResult,
  SaveAdsSelectionInput,
} from "@/lib/marketing-studio/ads/ads-accounts-types";

// ── Props ──────────────────────────────────────────────────────────────────────

interface AdsAccountsPanelProps {
  orgSlug:        string;
  accountsConfig: TenantAdsConfigData[] | null;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusMessage(result: AdsPlatformDiscoveryResult): string {
  if (result.status === "not_configured") return "Credenciales no configuradas para esta plataforma.";
  if (result.status === "empty")          return "No se encontraron recursos disponibles con las credenciales actuales.";
  if (result.status === "insufficient_permissions") return "Las credenciales son válidas pero no permiten acceder a las cuentas publicitarias.";
  if (result.status === "error")          return result.message ?? "Error al descubrir recursos.";
  return "";
}

function platformLabel(platform: string): string {
  if (platform === "meta")   return "Meta (Facebook + Instagram)";
  if (platform === "tiktok") return "TikTok Ads";
  if (platform === "google") return "Google Ads";
  return platform;
}

// ── Resource selector ──────────────────────────────────────────────────────────

interface ResourceSelectorProps {
  label:     string;
  resources: AdsPlatformResource[];
  type:      string;
  value:     string | null | undefined;
  onChange:  (id: string | null, name: string | null) => void;
}

function ResourceSelector({ label, resources, type, value, onChange }: ResourceSelectorProps) {
  const filtered = resources.filter(r => r.type === type);
  if (filtered.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={e => {
          const id = e.target.value || null;
          const found = filtered.find(r => r.externalId === id);
          onChange(id, found?.displayName ?? null);
        }}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
          background: C.white, border: `1px solid ${C.line}`,
          borderRadius: R.md, padding: `${S[1]}px ${S[2]}px`,
          outline: "none", width: "100%",
        }}
      >
        <option value="">— Sin seleccionar —</option>
        {filtered.map(r => (
          <option key={r.externalId} value={r.externalId}>
            {r.displayName} {r.status !== "active" ? `(${r.status})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Platform card ──────────────────────────────────────────────────────────────

interface PlatformCardProps {
  platform:   string;
  config:     TenantAdsConfigData | null;
  discovery:  AdsPlatformDiscoveryResult | null;
  orgSlug:    string;
  onSaved:    (updated: TenantAdsConfigData) => void;
}

function PlatformCard({ platform, config, discovery, orgSlug, onSaved }: PlatformCardProps) {
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveErr] = useState<string | null>(null);

  // Local selection state — initialised from config or discovery
  const [selAdAccount, setSelAdAccount]   = useState<{ id: string | null; name: string | null }>({
    id: config?.selectedAdAccountId ?? null, name: config?.selectedAdAccountName ?? null,
  });
  const [selBusiness, setSelBusiness]     = useState<{ id: string | null; name: string | null }>({
    id: config?.selectedBusinessId  ?? null, name: config?.selectedBusinessName  ?? null,
  });
  const [selPage, setSelPage]             = useState<{ id: string | null; name: string | null }>({
    id: config?.selectedPageId      ?? null, name: config?.selectedPageName      ?? null,
  });
  const [selIg, setSelIg]                 = useState<{ id: string | null; name: string | null }>({
    id: config?.selectedInstagramAccountId ?? null, name: config?.selectedInstagramAccountName ?? null,
  });
  const [selAdvertiser, setSelAdvertiser] = useState<{ id: string | null; name: string | null }>({
    id: config?.selectedAdvertiserId ?? null, name: config?.selectedAdvertiserName ?? null,
  });

  const resources: AdsPlatformResource[] = discovery?.resources ?? [];

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      const body: SaveAdsSelectionInput = {
        platform,
        selectedAdAccountId:          selAdAccount.id,
        selectedAdAccountName:        selAdAccount.name,
        selectedBusinessId:           selBusiness.id,
        selectedBusinessName:         selBusiness.name,
        selectedPageId:               selPage.id,
        selectedPageName:             selPage.name,
        selectedInstagramAccountId:   selIg.id,
        selectedInstagramAccountName: selIg.name,
        selectedAdvertiserId:         selAdvertiser.id,
        selectedAdvertiserName:       selAdvertiser.name,
      };

      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/accounts`, {
        method: "PUT", body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json() as { config?: TenantAdsConfigData; error?: string };

      if (!res.ok || data.error) {
        setSaveErr(data.error ?? "Error al guardar.");
      } else if (data.config) {
        onSaved(data.config);
      }
    } catch {
      setSaveErr("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }, [platform, orgSlug, selAdAccount, selBusiness, selPage, selIg, selAdvertiser, onSaved]);

  const noResources = resources.length === 0;
  const msg         = discovery ? statusMessage(discovery) : "";

  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.md,
      padding: `${S[3]}px ${S[4]}px`, background: C.white,
      display: "flex", flexDirection: "column", gap: S[3],
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
          {platformLabel(platform)}
        </span>
        {config?.lastDiscoveredAt && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Última búsqueda: {new Date(config.lastDiscoveredAt).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}
      </div>

      {/* Discovery message */}
      {msg && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          padding: `${S[2]}px ${S[3]}px`, background: C.surface,
          borderRadius: R.sm, border: `1px solid ${C.line}`,
        }}>
          {msg}
        </div>
      )}

      {/* Currently in use */}
      {config && (config.selectedAdAccountId ?? config.selectedAdvertiserId) && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
          borderLeft: `3px solid ${C.blueDark}`, paddingLeft: S[3],
        }}>
          Actualmente en uso:{" "}
          {config.selectedAdAccountName ?? config.selectedAdvertiserName ?? config.selectedAdAccountId ?? config.selectedAdvertiserId}
        </div>
      )}

      {/* Selectors — only shown when discovery returned resources */}
      {!noResources && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
          {platform === "meta" && (
            <>
              <ResourceSelector
                label="Cuenta publicitaria"
                resources={resources} type="ad_account"
                value={selAdAccount.id}
                onChange={(id, name) => setSelAdAccount({ id, name })}
              />
              <ResourceSelector
                label="Página de Facebook"
                resources={resources} type="facebook_page"
                value={selPage.id}
                onChange={(id, name) => setSelPage({ id, name })}
              />
              <ResourceSelector
                label="Cuenta de Instagram"
                resources={resources} type="instagram_account"
                value={selIg.id}
                onChange={(id, name) => setSelIg({ id, name })}
              />
            </>
          )}
          {platform === "tiktok" && (
            <>
              <ResourceSelector
                label="Cuenta de anunciante"
                resources={resources} type="advertiser"
                value={selAdvertiser.id}
                onChange={(id, name) => setSelAdvertiser({ id, name })}
              />
              <ResourceSelector
                label="Business Center"
                resources={resources} type="business"
                value={selBusiness.id}
                onChange={(id, name) => setSelBusiness({ id, name })}
              />
            </>
          )}
        </div>
      )}

      {/* Save button + error */}
      {!noResources && (
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <button
            className="ag-action-secondary"
            onClick={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Guardando…" : "Guardar selección"}
          </button>
          {saveError && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
              {saveError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AdsAccountsPanel({ orgSlug, accountsConfig }: AdsAccountsPanelProps) {
  const [discovering, setDiscovering]   = useState(false);
  const [discovery,   setDiscovery]     = useState<AdsAccountsDiscoveryResult | null>(null);
  const [discoverErr, setDiscoverErr]   = useState<string | null>(null);
  const [configs,     setConfigs]       = useState<TenantAdsConfigData[]>(accountsConfig ?? []);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    setDiscoverErr(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/marketing-studio/ads/accounts`);
      const data = await res.json() as {
        config?:    TenantAdsConfigData[];
        discovery?: AdsAccountsDiscoveryResult;
        error?:     string;
      };

      if (!res.ok || data.error) {
        setDiscoverErr(data.error ?? "Error al descubrir recursos.");
      } else {
        if (data.discovery) setDiscovery(data.discovery);
        if (data.config)    setConfigs(data.config);
      }
    } catch {
      setDiscoverErr("Error de red. Intenta nuevamente.");
    } finally {
      setDiscovering(false);
    }
  }, [orgSlug]);

  const handleSaved = useCallback((updated: TenantAdsConfigData) => {
    setConfigs(prev => {
      const idx = prev.findIndex(c => c.platform === updated.platform);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }, []);

  const PLATFORMS = ["meta", "tiktok"];

  return (
    <AgModuleSecondaryPanel label="Configuración de plataformas">
      <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

        {/* Discover button */}
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <button
            className="ag-action-secondary"
            onClick={handleDiscover}
            disabled={discovering}
            style={{ opacity: discovering ? 0.6 : 1 }}
          >
            {discovering ? "Buscando recursos…" : "Descubrir recursos"}
          </button>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Conecta con Meta y TikTok para ver tus cuentas y páginas disponibles.
          </span>
          {discoverErr && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
              {discoverErr}
            </span>
          )}
        </div>

        {/* Platform cards */}
        {PLATFORMS.map(platform => {
          const config    = configs.find(c => c.platform === platform) ?? null;
          const platDisc  = discovery?.platforms.find(p => p.platform === platform) ?? null;

          return (
            <PlatformCard
              key={platform}
              platform={platform}
              config={config}
              discovery={platDisc}
              orgSlug={orgSlug}
              onSaved={handleSaved}
            />
          );
        })}

      </div>
    </AgModuleSecondaryPanel>
  );
}
