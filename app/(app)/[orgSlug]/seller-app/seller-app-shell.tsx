/**
 * Seller App Shell — Mobile-first operational surface.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-01 (Block 1: Inicio + Clientes)
 * Sprint: AGENTIK-SELLER-APP-UI-02 (Block 2: Nuevo Pedido + canonical nav)
 *
 * "use client" — receives flat props from server page.
 * Primary target: 390px.
 *
 * Canonical bottom nav V1: Inicio, Clientes, Pedido, Pedidos, Perfil
 * Maleta/Alertas/Catalog: Home shortcuts + attention deep links.
 *
 * Shell owns: navigation, selected view, shared mobile frame.
 * Views live in ./views/ for maintainability.
 */
"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { SellerTab, SellerAppShellProps } from "./views/seller-app-shared";
import { InicioView } from "./views/inicio-view";
import { ClientesView, ClienteDetailView } from "./views/clientes-view";
import { NuevoPedidoView } from "./views/nuevo-pedido-view";
import { PlaceholderView } from "./views/placeholder-view";

// ── Canonical bottom nav V1 ─────────────────────────────────────────────────

const NAV_ITEMS: Array<{ key: SellerTab; label: string; icon: string }> = [
  { key: "inicio", label: "Inicio", icon: "\u2302" },
  { key: "clientes", label: "Clientes", icon: "\uD83D\uDC64" },
  { key: "nuevo_pedido", label: "Pedido", icon: "\u002B" },
  { key: "pedidos", label: "Pedidos", icon: "\uD83D\uDCCB" },
  { key: "perfil", label: "Perfil", icon: "\u2699" },
];

// ── Main Shell ───────────────────────────────────────────────────────────────

export function SellerAppShell(props: SellerAppShellProps) {
  const [activeTab, setActiveTab] = useState<SellerTab>("inicio");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [orderPreSelectedCustomerId, setOrderPreSelectedCustomerId] = useState<string | null>(null);
  const orderInProgressRef = useRef(false);

  const alertCount = useMemo(() => props.attention.items.length, [props.attention.items]);

  const handleSelectCustomer = useCallback((id: string) => {
    setSelectedCustomerId(id);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedCustomerId(null);
  }, []);

  const handleCreateOrderForCustomer = useCallback((customerId: string) => {
    setOrderPreSelectedCustomerId(customerId);
    setActiveTab("nuevo_pedido");
    setSelectedCustomerId(null);
  }, []);

  const handleExitOrder = useCallback(() => {
    setOrderPreSelectedCustomerId(null);
    setActiveTab("inicio");
  }, []);

  const handleTabChange = useCallback((tab: SellerTab) => {
    // Guard: confirm before leaving order wizard with work in progress
    if (activeTab === "nuevo_pedido" && tab !== "nuevo_pedido" && orderInProgressRef.current) {
      const confirmed = window.confirm("Tiene un pedido en progreso. ¿Desea salir y perder los cambios?");
      if (!confirmed) return;
    }
    setActiveTab(tab);
    setSelectedCustomerId(null);
    if (tab !== "nuevo_pedido") setOrderPreSelectedCustomerId(null);
  }, [activeTab]);

  return (
    <div style={{
      fontFamily: T.mono,
      fontSize: T.sz.base,
      color: C.ink,
      background: C.surface,
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      maxWidth: 430,
      margin: "0 auto",
      position: "relative",
    }}>
      {/* Header */}
      <header style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.blueDark,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: T.sz.lg, fontWeight: T.wt.semibold }}>
            {props.sellerIdentity.sellerName ?? "Vendedor"}
          </div>
          <div style={{ fontSize: T.sz.xs, opacity: 0.7 }}>
            {props.sellerIdentity.isManagerOrAbove ? "Administrador" : "Vendedor"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          {/* Notification bell */}
          <button
            onClick={() => handleTabChange("inicio")}
            style={{
              position: "relative",
              border: "none", background: "transparent", cursor: "pointer",
              color: C.white, fontSize: 18, padding: 0, lineHeight: 1,
            }}
          >
            {"\uD83D\uDD14"}
            {alertCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -6,
                background: C.red, color: C.white,
                fontSize: 9, fontWeight: T.wt.bold,
                minWidth: 14, height: 14,
                borderRadius: R.pill,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px",
              }}>
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            )}
          </button>
          {/* Avatar */}
          <div style={{
            width: 32, height: 32, borderRadius: R.pill,
            background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: T.sz.lg, fontWeight: T.wt.bold,
          }}>
            {(props.sellerIdentity.sellerName ?? "V")[0].toUpperCase()}
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflow: "auto", paddingBottom: 64 }}>
        {activeTab === "inicio" && (
          <InicioView
            attention={props.attention}
            orgSlug={props.orgSlug}
            onNavigate={handleTabChange}
          />
        )}
        {activeTab === "clientes" && !selectedCustomerId && (
          <ClientesView
            customers={props.customers}
            inactiveCustomerIds={props.inactiveCustomerIds}
            inactiveCustomers={props.inactiveCustomers}
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            onSelectCustomer={handleSelectCustomer}
          />
        )}
        {activeTab === "clientes" && selectedCustomerId && (
          <ClienteDetailView
            customerId={selectedCustomerId}
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            customers={props.customers}
            onBack={handleBackFromDetail}
            onCreateOrder={handleCreateOrderForCustomer}
          />
        )}
        {activeTab === "nuevo_pedido" && (
          <NuevoPedidoView
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            sellerIdentity={props.sellerIdentity}
            customers={props.customers}
            preSelectedCustomerId={orderPreSelectedCustomerId}
            onExit={handleExitOrder}
            onWorkInProgressChange={(inProgress) => { orderInProgressRef.current = inProgress; }}
          />
        )}
        {activeTab === "pedidos" && <PlaceholderView title="Pedidos" />}
        {activeTab === "perfil" && (
          <PerfilPlaceholderView sellerIdentity={props.sellerIdentity} />
        )}
      </main>

      {/* Floating Copilot button — visual placeholder */}
      <div style={{
        position: "fixed",
        bottom: 72,
        right: "calc(50% - 200px)",
        width: 44, height: 44,
        borderRadius: R.pill,
        background: C.blueDark,
        color: C.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: E.lg,
        fontSize: 20, lineHeight: 1,
        cursor: "default",
        opacity: 0.3,
        zIndex: 90,
      }}
        title="Agentik Copilot (proximamente)"
      >
        {"\u2728"}
      </div>

      {/* Bottom nav */}
      <nav style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 430,
        background: C.white,
        borderTop: `1px solid ${C.line}`,
        display: "flex",
        boxShadow: E.md,
        zIndex: 100,
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              style={{
                flex: 1,
                padding: `${S[2]}px 0`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: isActive ? C.blueDark : C.inkLight,
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: isActive ? T.wt.semibold : T.wt.normal,
                transition: "color 0.15s",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ── Perfil placeholder ──────────────────────────────────────────────────────

function PerfilPlaceholderView({ sellerIdentity }: { sellerIdentity: SellerAppShellProps["sellerIdentity"] }) {
  return (
    <div style={{ padding: S[4] }}>
      {/* Seller identity card */}
      <div style={{
        padding: S[4], background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.lg, marginBottom: S[4], textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: R.pill,
          background: C.blueDark, color: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
          margin: "0 auto", marginBottom: S[3],
        }}>
          {(sellerIdentity.sellerName ?? "V")[0].toUpperCase()}
        </div>
        <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.semibold, color: C.ink }}>
          {sellerIdentity.sellerName ?? "Vendedor"}
        </div>
        <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 2 }}>
          {sellerIdentity.isManagerOrAbove ? "Administrador" : "Vendedor"}
          {sellerIdentity.sellerSlug ? ` \u00B7 ${sellerIdentity.sellerSlug}` : ""}
        </div>
      </div>

      {/* Financial sections — blocked pending SAG authority */}
      {[
        { title: "Mis comisiones", subtitle: "Comision del periodo, detalle" },
        { title: "Mis anticipos", subtitle: "Saldo cuenta 133010, movimientos" },
      ].map(section => (
        <div key={section.title} style={{
          padding: S[3], background: C.white, border: `1px solid ${C.line}`,
          borderRadius: R.lg, marginBottom: S[2], opacity: 0.5,
        }}>
          <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
            {section.title}
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
            {section.subtitle} \u2014 Pendiente de auditoria de fuentes
          </div>
        </div>
      ))}
    </div>
  );
}
