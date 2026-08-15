/**
 * Seller App Shell — Mobile-first operational surface.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-01 (Block 1: Inicio + Clientes)
 * Sprint: AGENTIK-SELLER-APP-UI-02 (Block 2: Nuevo Pedido + canonical nav)
 * Sprint: AGENTIK-SELLER-APP-UI-03 (Block 3: Portfolio + Orders + Alerts)
 * Sprint: AGENTIK-SELLER-APP-UX-01 (visual delivery pass — presentation only)
 *
 * "use client" — receives flat props from server page.
 * Primary target: 390px.
 *
 * Canonical bottom nav V1 (LOCKED): Inicio, Clientes, Pedido, Pedidos, Perfil
 * Maleta/Alertas: accessible via Home shortcuts + bell.
 *
 * Shell owns: navigation, selected view, shared mobile frame.
 * Views live in ./views/ for maintainability.
 */
"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { SellerTab, SellerAppShellProps } from "./views/seller-app-shared";
import { SellerIcon } from "./views/seller-ui-kit";
import { CopilotSphere } from "@/components/shell/copilot-sphere";
import { InicioView } from "./views/inicio-view";
import { ClientesView, ClienteDetailView } from "./views/clientes-view";
import { NuevoPedidoView } from "./views/nuevo-pedido-view";
import { SellerPortfolioView } from "./views/seller-portfolio-view";
import { SellerOrdersView } from "./views/seller-orders-view";
import { SellerAlertsView } from "./views/seller-alerts-view";
import { PerfilView } from "./views/perfil-view";

// ── Canonical bottom nav V1 (LOCKED — §13/§45) ──────────────────────────────

const NAV_ITEMS: Array<{ key: SellerTab; label: string; icon: string }> = [
  { key: "inicio", label: "Inicio", icon: "home" },
  { key: "clientes", label: "Clientes", icon: "users" },
  { key: "nuevo_pedido", label: "Pedido", icon: "cart" },
  { key: "pedidos", label: "Pedidos", icon: "clipboard" },
  { key: "perfil", label: "Perfil", icon: "user" },
];

/** §6 — saludo dinámico por franja horaria (solo presentación). */
function daypartGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function sellerInitials(name: string | null): string {
  if (!name) return "V";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "V";
}

// ── Main Shell ───────────────────────────────────────────────────────────────

export function SellerAppShell(props: SellerAppShellProps) {
  const [activeTab, setActiveTab] = useState<SellerTab>("inicio");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [orderPreSelectedCustomerId, setOrderPreSelectedCustomerId] = useState<string | null>(null);
  const [deepLinkContext, setDeepLinkContext] = useState<Record<string, string> | undefined>();
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
    // Dismiss keyboard + reset iOS Safari visual viewport before switching views
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setActiveTab(tab);
    setSelectedCustomerId(null);
    if (tab !== "nuevo_pedido") {
      setOrderPreSelectedCustomerId(null);
    }
    // Deep link context is consumed once — clear on next manual nav
    setDeepLinkContext(undefined);
  }, [activeTab]);

  const greeting = daypartGreeting();
  const showGreetingHeader = activeTab === "inicio";

  return (
    <div style={{
      fontFamily: T.sans,
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
      {/* Header — claro y premium; saludo dinámico REAL (§6/§7), safe-area top */}
      <header style={{
        padding: `calc(${S[3]}px + env(safe-area-inset-top, 0px)) ${S[4]}px ${S[2]}px`,
        background: C.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: S[2],
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          {showGreetingHeader ? (
            <>
              <div style={{ fontSize: T.sz.md, color: C.inkLight }}>{greeting}</div>
              <div style={{
                fontSize: 22, fontWeight: T.wt.bold, color: C.titleDeep, letterSpacing: "-0.4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25,
              }}>
                {props.sellerIdentity.sellerName ?? "Vendedor"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                Agentik · Ventas
              </div>
              <div style={{
                fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {props.sellerIdentity.sellerName ?? "Vendedor"}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
          {/* Notification bell */}
          <button
            onClick={() => handleTabChange("alertas")}
            aria-label={alertCount > 0 ? `Alertas: ${alertCount} sin revisar` : "Alertas"}
            style={{
              position: "relative", width: 44, height: 44,
              border: `1px solid ${C.line}`, background: C.white, cursor: "pointer",
              borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: E.xs, padding: 0, touchAction: "manipulation",
            }}
          >
            <SellerIcon name="bell" size={20} color={C.ink} />
            {alertCount > 0 && (
              <span style={{
                position: "absolute", top: 8, right: 9,
                width: 8, height: 8, borderRadius: R.pill,
                background: C.red, border: `1.5px solid ${C.white}`,
              }} />
            )}
          </button>
          {/* Avatar — identidad real del vendedor */}
          <div aria-hidden style={{
            width: 44, height: 44, borderRadius: 14,
            background: C.blueDark, color: C.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: T.sz.lg, fontWeight: T.wt.bold, boxShadow: E.sm,
          }}>
            {sellerInitials(props.sellerIdentity.sellerName)}
          </div>
        </div>
      </header>

      {/* Content — reserva para nav fija + safe area + esfera Copilot */}
      <main style={{ flex: 1, overflow: "auto", paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}>
        {activeTab === "inicio" && (
          <InicioView
            attention={props.attention}
            orgSlug={props.orgSlug}
            features={props.features}
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
        {activeTab === "pedidos" && (
          <SellerOrdersView
            orders={props.orders}
            orgSlug={props.orgSlug}
            orgId={props.orgId}
            initialOrderId={deepLinkContext?.orderId}
          />
        )}
        {activeTab === "maleta" && (
          <SellerPortfolioView
            portfolio={props.portfolio}
            supplyNeeds={props.supplyNeeds}
            initialSection={deepLinkContext?.section}
          />
        )}
        {activeTab === "alertas" && (
          <SellerAlertsView
            attention={props.attention}
            onNavigate={(tab, context) => {
              handleTabChange(tab);
              // Set after handleTabChange (which clears context)
              if (context) setDeepLinkContext(context);
            }}
          />
        )}
        {activeTab === "perfil" && (
          <PerfilView sellerIdentity={props.sellerIdentity} orgSlug={props.orgSlug} />
        )}
      </main>

      {/* Floating Agentik Copilot — esfera de vidrio con la marca real (§15–§17).
          Runtime no activo → estado disabled honesto; nunca cubre CTA/nav. */}
      <div style={{
        position: "fixed",
        bottom: `calc(76px + env(safe-area-inset-bottom, 0px))`,
        right: "max(16px, calc(50% - 199px))",
        zIndex: 90,
      }}>
        <CopilotSphere size={58} disabled />
      </div>

      {/* Bottom nav — LOCKED IA; activo azul + indicador, safe-area (§13/§39) */}
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
        boxShadow: "0 -4px 16px rgba(0,74,173,0.06)",
        zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleTabChange(item.key)}
              aria-current={isActive ? "page" : undefined}
              style={{
                flex: 1,
                minHeight: 56,
                padding: `${S[2]}px 0 ${S[1]}px`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                position: "relative",
                color: isActive ? C.blueDark : C.inkLight,
                fontFamily: T.sans,
                fontSize: T.sz.xs,
                fontWeight: isActive ? T.wt.semibold : T.wt.medium,
                transition: "color 0.15s",
                touchAction: "manipulation",
              }}
            >
              {isActive && (
                <span aria-hidden style={{
                  position: "absolute", top: 0, width: 28, height: 3,
                  borderRadius: "0 0 3px 3px", background: C.blueDark,
                }} />
              )}
              <SellerIcon name={item.icon} size={21} color={isActive ? C.blueDark : C.inkLight} strokeWidth={isActive ? 2.2 : 1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
