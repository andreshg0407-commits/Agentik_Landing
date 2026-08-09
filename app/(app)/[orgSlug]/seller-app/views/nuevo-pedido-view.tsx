/**
 * Seller App — Nuevo Pedido (New Order) View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-02
 *
 * Complete mobile order flow:
 *   1. Customer selection (search or pre-selected)
 *   2. Customer context (overdue >30d WARNING, top products)
 *   3. Product search + variant selection
 *   4. Cart (order lines)
 *   5. Review + submit
 *   6. Result (success/error)
 *
 * Reuses existing Pedidos domain:
 *   API: POST /api/orgs/[orgSlug]/comercial/pedidos (actions: create, submit, search_customers, get_customer_context)
 *   API: POST /api/orgs/[orgSlug]/comercial/pedidos/products (actions: search, variants)
 *   Persistence: AgentExecution via createOrderDraftDeduped → submitOrder
 *   Idempotency: wizardSessionKey generated per session
 *   Origin: AGENTIK_NATIVE
 *   Status: borrador → listo_para_enviar
 */
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { SerializedCustomer, SellerIdentityProps } from "./seller-app-shared";
import { SellerIcon } from "./seller-ui-kit";
import { fmtCOP, DetailSection, DetailKpi } from "./seller-app-shared";

// ── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "customer" | "context" | "products" | "cart" | "review" | "submitting" | "result";

interface CartLine {
  id: string;
  referenceCode: string;
  productName: string;
  size: string;
  color: string;
  colorName: string;
  quantity: number;
  availableUnits: number | null;
  unitPrice: number;
  lineTotal: number;
  thumbnailUrl: string | null;
}

interface CustomerSearchResult {
  customerCode: string;
  customerName: string;
  customerId: string;
  city: string;
  sagCode: string;
  profileId: string;
  address: string;
  sellerName: string;
  sellerId: string;
  sagReadiness: { status: string; blockers: Array<{ field: string; reason: string }> } | null;
}

interface ProductSearchResult {
  referenceCode: string;
  productName: string;
  unitPrice: number;
  variants: Array<{
    variantId: string;
    size: string;
    color: string;
    availability: { availableUnits: number | null };
    inventoryStatus: string;
  }>;
  thumbnailUrl: string | null;
  availableQty: number | null;
  variantCount: number;
  inStock: boolean;
  inventoryStatus: string;
  description: string;
  categoryName: string;
  lineName: string;
}

interface CustomerContext {
  identity: { name: string; nit: string };
  receivables: { total: number; overdue: number; maxDaysOverdue: number; overdueDocumentCount: number; truthStatus?: string } | null;
  topProductsByUnits: Array<{ referenceCode: string; description: string; totalUnits: number; purchaseCount: number }>;
  totalOrdersL12: number;
  lastPurchaseDate: string | null;
}

interface SelectedCustomer {
  profileId: string;
  customerCode: string;
  customerName: string;
  customerId: string;
  city: string;
  address: string;
  sellerName: string;
  sellerId: string;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function NuevoPedidoView({
  orgSlug,
  orgId,
  sellerIdentity,
  customers,
  preSelectedCustomerId,
  onExit,
  onWorkInProgressChange,
}: {
  orgSlug: string;
  orgId: string;
  sellerIdentity: SellerIdentityProps;
  customers: SerializedCustomer[];
  preSelectedCustomerId?: string | null;
  onExit: () => void;
  onWorkInProgressChange?: (inProgress: boolean) => void;
}) {
  const [step, setStep] = useState<WizardStep>("customer");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [customerContext, setCustomerContext] = useState<CustomerContext | null>(null);
  const [overdueAlert, setOverdueAlert] = useState<{ severity: string; message: string } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; orderId?: string; error?: string } | null>(null);
  const [wizardSessionKey] = useState(() => `SA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // Signal work-in-progress to shell for navigation guard
  useEffect(() => {
    const hasWork = cart.length > 0 || selectedCustomer !== null;
    onWorkInProgressChange?.(hasWork);
    return () => { onWorkInProgressChange?.(false); };
  }, [cart.length, selectedCustomer, onWorkInProgressChange]);

  // Pre-select customer if coming from Clientes tab
  useEffect(() => {
    if (preSelectedCustomerId && step === "customer") {
      const c = customers.find(cu => cu.id === preSelectedCustomerId);
      if (c) {
        // Need to fetch full customer data via API to get sagCode
        fetchCustomerForSelection(preSelectedCustomerId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedCustomerId]);

  const fetchCustomerForSelection = useCallback(async (profileId: string) => {
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_customer_detail", profileId }),
      });
      if (!r.ok) return;
      const { customer } = await r.json();
      if (customer) {
        setSelectedCustomer({
          profileId: customer.id,
          customerCode: customer.sagCode ?? "",
          customerName: customer.legalName ?? customer.tradeName ?? "",
          customerId: customer.nitNormalized ?? customer.documentNumber ?? "",
          city: customer.city ?? "",
          address: customer.address ?? "",
          sellerName: customer.seller?.name ?? sellerIdentity.sellerName ?? "",
          sellerId: customer.seller?.id ?? sellerIdentity.sellerId ?? "",
        });
        setStep("context");
      }
    } catch { /* ignore */ }
  }, [orgSlug, sellerIdentity]);

  const handleCustomerSelected = useCallback((c: SelectedCustomer) => {
    setSelectedCustomer(c);
    setStep("context");
  }, []);

  const handleContextContinue = useCallback(() => {
    setStep("products");
  }, []);

  const handleAddToCart = useCallback((line: CartLine) => {
    setCart(prev => {
      // Merge if same ref+size+color
      const existing = prev.find(l =>
        l.referenceCode === line.referenceCode && l.size === line.size && l.color === line.color
      );
      if (existing) {
        return prev.map(l =>
          l.id === existing.id
            ? { ...l, quantity: l.quantity + line.quantity, lineTotal: (l.quantity + line.quantity) * l.unitPrice }
            : l
        );
      }
      return [...prev, line];
    });
  }, []);

  const handleRemoveFromCart = useCallback((lineId: string) => {
    setCart(prev => prev.filter(l => l.id !== lineId));
  }, []);

  const handleUpdateQuantity = useCallback((lineId: string, quantity: number) => {
    if (quantity <= 0) return;
    setCart(prev => prev.map(l =>
      l.id === lineId ? { ...l, quantity, lineTotal: quantity * l.unitPrice } : l
    ));
  }, []);

  const handleGoToReview = useCallback(() => { setStep("review"); }, []);
  const handleBackToProducts = useCallback(() => { setStep("products"); }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedCustomer || cart.length === 0) return;
    setStep("submitting");

    try {
      const header = {
        customerId: selectedCustomer.customerId,
        customerName: selectedCustomer.customerName,
        customerCode: selectedCustomer.customerCode,
        sellerId: selectedCustomer.sellerId || sellerIdentity.sellerId || "",
        sellerName: selectedCustomer.sellerName || sellerIdentity.sellerName || "",
        channel: "seller_app",
        notes,
        orderDate: new Date().toISOString().slice(0, 10),
      };

      const lines = cart.map(l => ({
        id: l.id,
        referenceCode: l.referenceCode,
        productName: l.productName,
        size: l.size,
        color: l.color,
        quantity: l.quantity,
        availableUnits: l.availableUnits,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        removed: false,
        comment: "",
        thumbnailUrl: l.thumbnailUrl,
        colorName: l.colorName,
      }));

      // Create draft (idempotent via wizardSessionKey) + submit
      const createRes = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          header,
          lines,
          createdBy: sellerIdentity.sellerName ?? "vendedor",
          wizardSessionKey,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        setSubmitResult({ ok: false, error: err.error ?? `Error ${createRes.status}` });
        setStep("result");
        return;
      }

      const { order, alreadyExists } = await createRes.json();
      if (!order) {
        setSubmitResult({ ok: false, error: "No se pudo crear el pedido" });
        setStep("result");
        return;
      }

      // Submit (borrador → listo_para_enviar)
      const submitRes = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", orderId: order.id }),
      });

      if (!submitRes.ok) {
        // Draft was created but submit failed — still a partial success
        setSubmitResult({
          ok: true,
          orderId: order.id,
          error: "Pedido guardado como borrador. No se pudo enviar automaticamente.",
        });
        setStep("result");
        return;
      }

      const submitData = await submitRes.json();
      const finalOrder = submitData.order;

      setSubmitResult({
        ok: true,
        orderId: finalOrder?.id ?? order.id,
      });
      setStep("result");
    } catch (e) {
      setSubmitResult({ ok: false, error: "Error de conexion. Intente nuevamente." });
      setStep("result");
    }
  }, [selectedCustomer, cart, notes, orgSlug, sellerIdentity, wizardSessionKey]);

  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.lineTotal, 0), [cart]);
  const cartUnits = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  return (
    <div style={{ padding: S[4] }}>
      {/* Step header */}
      <WizardHeader step={step} onBack={() => {
        if (step === "context") setStep("customer");
        else if (step === "products") setStep("context");
        else if (step === "cart") setStep("products");
        else if (step === "review") setStep("cart");
        else {
          if (cart.length > 0) {
            if (!window.confirm("Tiene un pedido en progreso. ¿Desea salir y perder los cambios?")) return;
          }
          onExit();
        }
      }} onExit={() => {
        if (cart.length > 0) {
          if (!window.confirm("Tiene un pedido en progreso. ¿Desea salir y perder los cambios?")) return;
        }
        onExit();
      }} />

      {step === "customer" && (
        <CustomerSelectionStep
          orgSlug={orgSlug}
          customers={customers}
          onSelect={handleCustomerSelected}
        />
      )}

      {step === "context" && selectedCustomer && (
        <CustomerContextStep
          orgSlug={orgSlug}
          customer={selectedCustomer}
          sellerIdentity={sellerIdentity}
          customerContext={customerContext}
          setCustomerContext={setCustomerContext}
          overdueAlert={overdueAlert}
          setOverdueAlert={setOverdueAlert}
          onContinue={handleContextContinue}
        />
      )}

      {step === "products" && (
        <ProductSearchStep
          orgSlug={orgSlug}
          onAddToCart={handleAddToCart}
          cartCount={cart.length}
          cartTotal={cartTotal}
          onGoToCart={() => setStep("cart")}
        />
      )}

      {step === "cart" && (
        <CartStep
          cart={cart}
          onRemove={handleRemoveFromCart}
          onUpdateQuantity={handleUpdateQuantity}
          onBack={handleBackToProducts}
          onReview={handleGoToReview}
          cartTotal={cartTotal}
          cartUnits={cartUnits}
        />
      )}

      {step === "review" && selectedCustomer && (
        <ReviewStep
          customer={selectedCustomer}
          cart={cart}
          notes={notes}
          onNotesChange={setNotes}
          cartTotal={cartTotal}
          cartUnits={cartUnits}
          overdueAlert={overdueAlert}
          onBack={() => setStep("cart")}
          onSubmit={handleSubmit}
        />
      )}

      {step === "submitting" && (
        <div style={{ textAlign: "center", padding: `${S[12]}px ${S[4]}px` }}>
          <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[3] }}>
            Enviando pedido...
          </div>
          <div style={{ fontSize: T.sz.md, color: C.inkLight }}>
            No cierre esta pantalla
          </div>
        </div>
      )}

      {step === "result" && submitResult && (
        <ResultStep result={submitResult} onDone={onExit} />
      )}
    </div>
  );
}

// ── Wizard Header ───────────────────────────────────────────────────────────

function WizardHeader({ step, onBack, onExit }: {
  step: WizardStep;
  onBack: () => void; onExit: () => void;
}) {
  const stepLabels: Record<WizardStep, string> = {
    customer: "Seleccionar cliente",
    context: "Contexto del cliente",
    products: "Agregar productos",
    cart: "Carrito",
    review: "Revisar pedido",
    submitting: "Enviando...",
    result: "Resultado",
  };

  const stepNumber: Record<WizardStep, number> = {
    customer: 1, context: 2, products: 3, cart: 4, review: 5, submitting: 6, result: 7,
  };

  const showBack = step !== "submitting" && step !== "result";
  const inFlow = step !== "submitting" && step !== "result";
  const current = Math.min(stepNumber[step], 5);

  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[1] }}>
        {showBack ? (
          <button onClick={onBack} style={{
            display: "flex", alignItems: "center", gap: S[1],
            border: "none", background: "transparent", cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold,
            color: C.blueDark, padding: `${S[2]}px 0`, minHeight: 44, touchAction: "manipulation",
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.blueDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
            Atras
          </button>
        ) : <div />}
        {inFlow && (
          <button onClick={onExit} style={{
            border: "none", background: "transparent", cursor: "pointer",
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            padding: `${S[2]}px 0`, minHeight: 44, touchAction: "manipulation",
          }}>
            Cancelar
          </button>
        )}
      </div>
      <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep, letterSpacing: "-0.3px" }}>
        {stepLabels[step]}
      </div>
      {inFlow && (
        <>
          {/* §23: progreso móvil compacto — dónde estoy y qué falta */}
          <div style={{ display: "flex", gap: 5, marginTop: S[2] }} aria-label={`Paso ${current} de 5`}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} aria-hidden style={{
                flex: 1, height: 4, borderRadius: 999,
                background: n <= current ? C.blueDark : C.line,
                transition: "background 0.2s",
              }} />
            ))}
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
            Paso {current} de 5
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 1: Customer Selection ──────────────────────────────────────────────

function CustomerSelectionStep({
  orgSlug,
  customers,
  onSelect,
}: {
  orgSlug: string;
  customers: SerializedCustomer[];
  onSelect: (c: SelectedCustomer) => void;
}) {
  const [search, setSearch] = useState("");
  const [apiResults, setApiResults] = useState<CustomerSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter local customers for quick match
  const localFiltered = useMemo(() => {
    if (!search.trim()) return customers.slice(0, 20);
    const q = search.toLowerCase().trim();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || (c.nit && c.nit.includes(q))
    ).slice(0, 20);
  }, [customers, search]);

  // Debounced API search for broader results
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!search.trim() || search.trim().length < 2) {
      setApiResults(null);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search_customers", query: search.trim() }),
        });
        if (r.ok) {
          const { customers: results } = await r.json();
          setApiResults(results ?? []);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search, orgSlug]);

  const handleSelectLocal = useCallback(async (c: SerializedCustomer) => {
    // Fetch full customer detail to get sagCode
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_customer_detail", profileId: c.id }),
      });
      if (r.ok) {
        const { customer } = await r.json();
        if (customer) {
          onSelect({
            profileId: customer.id,
            customerCode: customer.sagCode ?? "",
            customerName: customer.legalName ?? customer.tradeName ?? "",
            customerId: customer.nitNormalized ?? customer.documentNumber ?? "",
            city: customer.city ?? "",
            address: customer.address ?? "",
            sellerName: customer.seller?.name ?? "",
            sellerId: customer.seller?.id ?? "",
          });
          return;
        }
      }
    } catch { /* fallback below */ }
    // Fallback: use local data
    onSelect({
      profileId: c.id,
      customerCode: "",
      customerName: c.name,
      customerId: c.nit ?? "",
      city: c.city ?? "",
      address: "",
      sellerName: "",
      sellerId: "",
    });
  }, [orgSlug, onSelect]);

  const handleSelectApi = useCallback((c: CustomerSearchResult) => {
    onSelect({
      profileId: c.profileId,
      customerCode: c.sagCode ?? c.customerCode ?? "",
      customerName: c.customerName,
      customerId: c.customerId,
      city: c.city,
      address: c.address,
      sellerName: c.sellerName,
      sellerId: c.sellerId,
    });
  }, [onSelect]);

  // Display API results when available, otherwise local
  const showApiResults = apiResults !== null && search.trim().length >= 2;

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar por nombre o NIT..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: "100%", padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
          borderRadius: R.md, fontFamily: T.mono, fontSize: 16, background: C.white,
          outline: "none", boxSizing: "border-box", marginBottom: S[3],
        }}
      />

      {searching && (
        <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>Buscando...</div>
      )}

      {showApiResults ? (
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          {apiResults.length === 0 && (
            <div style={{ padding: S[4], textAlign: "center", color: C.inkLight, fontSize: T.sz.md }}>
              Sin resultados para &quot;{search}&quot;
            </div>
          )}
          {apiResults.map(c => (
            <button key={c.profileId} onClick={() => handleSelectApi(c)} style={{
              display: "block", width: "100%", textAlign: "left", padding: S[3],
              background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md,
              cursor: "pointer", fontFamily: T.mono,
            }}>
              <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>{c.customerName}</div>
              <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                {c.city || "\u2014"}{c.customerId ? ` \u00B7 ${c.customerId}` : ""}
                {c.sagCode ? ` \u00B7 SAG: ${c.sagCode}` : ""}
              </div>
              {c.sagReadiness && c.sagReadiness.status !== "READY" && (
                <div style={{ fontSize: T.sz.xs, color: C.amberDark, marginTop: 2 }}>
                  {(c.sagReadiness.blockers ?? []).map(b => b.reason).join("; ") || c.sagReadiness.status}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          {localFiltered.length === 0 && (
            <div style={{ padding: S[4], textAlign: "center", color: C.inkLight, fontSize: T.sz.md }}>
              Sin clientes
            </div>
          )}
          {localFiltered.map(c => (
            <button key={c.id} onClick={() => handleSelectLocal(c)} style={{
              display: "block", width: "100%", textAlign: "left", padding: S[3],
              background: C.white, border: `1px solid ${C.line}`, borderRadius: R.md,
              cursor: "pointer", fontFamily: T.mono,
            }}>
              <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>{c.name}</div>
              <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                {c.city ?? "\u2014"}{c.nit ? ` \u00B7 ${c.nit}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Customer Context ────────────────────────────────────────────────

function CustomerContextStep({
  orgSlug,
  customer,
  sellerIdentity,
  customerContext,
  setCustomerContext,
  overdueAlert,
  setOverdueAlert,
  onContinue,
}: {
  orgSlug: string;
  customer: SelectedCustomer;
  sellerIdentity: SellerIdentityProps;
  customerContext: CustomerContext | null;
  setCustomerContext: (c: CustomerContext | null) => void;
  overdueAlert: { severity: string; message: string } | null;
  setOverdueAlert: (a: { severity: string; message: string } | null) => void;
  onContinue: () => void;
}) {
  const [loading, setLoading] = useState(!customerContext);

  useEffect(() => {
    if (customerContext) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get_customer_context",
            profileId: customer.profileId,
            sellerId: sellerIdentity.sellerId,
          }),
        });
        if (r.ok && !cancelled) {
          const data = await r.json();
          setCustomerContext(data.context ?? null);
          if (data.overdueAlert) setOverdueAlert(data.overdueAlert);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [orgSlug, customer.profileId, sellerIdentity.sellerId, customerContext, setCustomerContext, setOverdueAlert]);

  // AGENTIK-RECEIVABLES-SAFETY-LOCK-P0: suppress overdue presentation
  // when receivable data is not certified. overdueAlert is already gated
  // server-side via emitCustomerOverdueAttention(), but the hasOverdue
  // flag is derived client-side and must also be suppressed.
  const hasOverdue = customerContext?.receivables
    && customerContext.receivables.truthStatus === "CERTIFIED"
    && customerContext.receivables.overdue > 0
    && customerContext.receivables.maxDaysOverdue > 30;

  return (
    <div>
      {/* Customer header */}
      <div style={{
        padding: S[3], background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.lg, marginBottom: S[3],
      }}>
        <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
          {customer.customerName}
        </div>
        <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
          {customer.city || "\u2014"}{customer.customerId ? ` \u00B7 ${customer.customerId}` : ""}
          {customer.customerCode ? ` \u00B7 SAG: ${customer.customerCode}` : ""}
        </div>
      </div>

      {/* Overdue >30d WARNING */}
      {hasOverdue && (
        <div style={{
          padding: S[3], background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.lg, marginBottom: S[3],
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <SellerIcon name="alert" size={18} color={C.amberDark} />
            <div>
              <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.sm, color: C.amberDark }}>
                Cliente con cartera vencida &gt;30 dias
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.amberDark, marginTop: 2 }}>
                Vencida: {fmtCOP(customerContext!.receivables!.overdue)} ({customerContext!.receivables!.maxDaysOverdue}d)
                {" \u00B7 "}Puede continuar con el pedido.
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: S[8], color: C.inkLight, fontSize: T.sz.md }}>
          Cargando contexto...
        </div>
      )}

      {customerContext && !loading && (
        <>
          {customerContext.receivables && (
            <DetailSection title="Cartera">
              <div style={{ display: "flex", gap: S[3] }}>
                <DetailKpi label="Total" value={fmtCOP(customerContext.receivables.total)} />
                <DetailKpi label="Vencida" value={fmtCOP(customerContext.receivables.overdue)}
                  color={customerContext.receivables.overdue > 0 ? C.red : undefined} />
                <DetailKpi label="Max dias" value={`${customerContext.receivables.maxDaysOverdue}d`}
                  color={customerContext.receivables.maxDaysOverdue > 30 ? C.red : undefined} />
              </div>
            </DetailSection>
          )}

          {customerContext.topProductsByUnits.length > 0 && (
            <DetailSection title="Top productos del cliente">
              {customerContext.topProductsByUnits.slice(0, 5).map((p, i) => (
                <div key={p.referenceCode} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: `${S[1]}px 0`,
                  borderBottom: i < Math.min(customerContext.topProductsByUnits.length - 1, 4) ? `1px solid ${C.lineSubtle}` : undefined,
                  fontSize: T.sz.sm,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{p.referenceCode}</div>
                    <div style={{ color: C.inkLight, fontSize: T.sz.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.description}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: S[2] }}>
                    <span style={{ fontWeight: T.wt.semibold }}>{p.totalUnits} uds</span>
                  </div>
                </div>
              ))}
            </DetailSection>
          )}
        </>
      )}

      <button onClick={onContinue} style={{
        width: "100%", padding: `${S[3]}px`, background: C.blueDark, color: C.white,
        border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
        fontWeight: T.wt.semibold, cursor: "pointer", marginTop: S[2],
      }}>
        Continuar a productos
      </button>
    </div>
  );
}

// ── Step 3: Product Search + Variant Selection ──────────────────────────────

function ProductSearchStep({
  orgSlug,
  onAddToCart,
  cartCount,
  cartTotal,
  onGoToCart,
}: {
  orgSlug: string;
  onAddToCart: (line: CartLine) => void;
  cartCount: number;
  cartTotal: number;
  onGoToCart: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductSearchResult["variants"]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", query: query.trim(), limit: 20 }),
        });
        if (r.ok) {
          const { products } = await r.json();
          setResults(products ?? []);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, orgSlug]);

  const handleExpandProduct = useCallback(async (refCode: string) => {
    if (expandedRef === refCode) { setExpandedRef(null); return; }
    setExpandedRef(refCode);
    setLoadingVariants(true);
    setVariants([]);
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "variants", referenceCode: refCode }),
      });
      if (r.ok) {
        const { variants: v } = await r.json();
        setVariants(v ?? []);
      }
    } catch { /* ignore */ }
    setLoadingVariants(false);
  }, [expandedRef, orgSlug]);

  const handleAddVariant = useCallback((product: ProductSearchResult, variant: ProductSearchResult["variants"][number], qty: number) => {
    onAddToCart({
      id: `${product.referenceCode}-${variant.size}-${variant.color}-${Date.now()}`,
      referenceCode: product.referenceCode,
      productName: product.productName,
      size: variant.size,
      color: variant.color,
      colorName: variant.color,
      quantity: qty,
      availableUnits: variant.availability.availableUnits,
      unitPrice: product.unitPrice,
      lineTotal: qty * product.unitPrice,
      thumbnailUrl: product.thumbnailUrl,
    });
  }, [onAddToCart]);

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar referencia o nombre..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{
          width: "100%", padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
          borderRadius: R.md, fontFamily: T.mono, fontSize: 16, background: C.white,
          outline: "none", boxSizing: "border-box", marginBottom: S[3],
        }}
      />

      {searching && (
        <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[2] }}>Buscando...</div>
      )}

      {results.length === 0 && query.trim().length >= 2 && !searching && (
        <div style={{ padding: S[4], textAlign: "center", color: C.inkLight, fontSize: T.sz.md }}>
          Sin resultados
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {results.map(p => (
          <ProductCard
            key={p.referenceCode}
            product={p}
            orgSlug={orgSlug}
            isExpanded={expandedRef === p.referenceCode}
            variants={expandedRef === p.referenceCode ? variants : []}
            loadingVariants={expandedRef === p.referenceCode && loadingVariants}
            onExpand={() => handleExpandProduct(p.referenceCode)}
            onAddVariant={(v, qty) => handleAddVariant(p, v, qty)}
          />
        ))}
      </div>

      {/* Floating cart indicator */}
      {cartCount > 0 && (
        <button onClick={onGoToCart} style={{
          position: "fixed", bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
          left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 32px)", maxWidth: 398, minHeight: 52,
          padding: `${S[3]}px ${S[4]}px`, background: C.blueDark, color: C.white,
          border: "none", borderRadius: 16, fontFamily: T.mono, fontSize: T.sz.md,
          fontWeight: T.wt.bold, cursor: "pointer", boxShadow: "0 10px 26px rgba(0,74,173,0.4)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 95, touchAction: "manipulation",
        }}>
          <span>Ver carrito ({cartCount})</span>
          <span>{fmtCOP(cartTotal)}</span>
        </button>
      )}
    </div>
  );
}

function ProductCard({
  product,
  orgSlug,
  isExpanded,
  variants,
  loadingVariants,
  onExpand,
  onAddVariant,
}: {
  product: ProductSearchResult;
  orgSlug: string;
  isExpanded: boolean;
  variants: ProductSearchResult["variants"];
  loadingVariants: boolean;
  onExpand: () => void;
  onAddVariant: (v: ProductSearchResult["variants"][number], qty: number) => void;
}) {
  const stockColor = product.inventoryStatus === "high" ? C.green
    : product.inventoryStatus === "medium" ? C.amberDark
    : product.inventoryStatus === "low" ? C.red
    : product.inventoryStatus === "out" ? C.inkLight : C.inkLight;

  const stockLabel = product.inventoryStatus === "high" ? "Disponible"
    : product.inventoryStatus === "medium" ? "Stock medio"
    : product.inventoryStatus === "low" ? "Ultimas uds"
    : product.inventoryStatus === "out" ? "Agotado"
    : "Sin datos";

  const sellable = product.variantCount > 0 && product.variants.some(v => v.size || v.color);

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 16,
      overflow: "hidden", boxShadow: E.sm,
    }}>
      <button onClick={onExpand} disabled={!sellable} style={{
        display: "flex", width: "100%", textAlign: "left", padding: S[3],
        border: "none", background: "transparent", cursor: sellable ? "pointer" : "default",
        fontFamily: T.mono, gap: S[3], alignItems: "center", minHeight: 72,
        opacity: sellable ? 1 : 0.5, touchAction: "manipulation",
      }}>
        {product.thumbnailUrl && (
          <img src={product.thumbnailUrl} alt="" loading="lazy" style={{
            width: 56, height: 56, objectFit: "cover", borderRadius: 12, flexShrink: 0,
            background: C.surfaceAlt,
          }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md, color: C.ink }}>
            {product.referenceCode}
          </div>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {product.productName}
          </div>
          <div style={{ display: "flex", gap: S[2], marginTop: 2, alignItems: "center" }}>
            <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
              {fmtCOP(product.unitPrice)}
            </span>
            <span style={{ fontSize: T.sz.xs, color: stockColor }}>
              {stockLabel}
              {product.availableQty !== null ? ` (${product.availableQty})` : ""}
            </span>
          </div>
        </div>
        <span aria-hidden style={{ flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
          <SellerIcon name="chevronRight" size={17} color={C.inkGhost} />
        </span>
      </button>

      {isExpanded && (
        <div style={{ padding: `0 ${S[3]}px ${S[3]}px`, borderTop: `1px solid ${C.lineSubtle}` }}>
          {loadingVariants && (
            <div style={{ padding: S[3], textAlign: "center", fontSize: T.sz.xs, color: C.inkLight }}>
              Cargando tallas...
            </div>
          )}
          {!loadingVariants && variants.length === 0 && (
            <div style={{ padding: S[3], textAlign: "center", fontSize: T.sz.xs, color: C.inkLight }}>
              Sin variantes disponibles
            </div>
          )}
          {!loadingVariants && variants.length > 0 && (
            <VariantGrid variants={variants} product={product} orgSlug={orgSlug} onAdd={(v, qty) => onAddVariant(v, qty)} onAddBatch={(lines) => {
              for (const line of lines) onAddVariant(line.variant, line.qty);
            }} />
          )}
        </div>
      )}
    </div>
  );
}

/** Server-returned auto-assortment proposal line */
interface ProposalLine {
  variantId: string;
  size: string;
  color: string;
  availableUnits: number;
  allocatedUnits: number;
}

/** Server-returned auto-assortment proposal */
interface AssortmentProposal {
  referenceCode: string;
  productName: string;
  requestedUnits: number;
  allocatedUnits: number;
  unallocatedUnits: number;
  fulfillable: boolean;
  lines: ProposalLine[];
  explanation: string;
}

function VariantGrid({
  variants,
  product,
  orgSlug,
  onAdd,
  onAddBatch,
}: {
  variants: ProductSearchResult["variants"];
  product: ProductSearchResult;
  orgSlug: string;
  onAdd: (v: ProductSearchResult["variants"][number], qty: number) => void;
  onAddBatch: (lines: Array<{ variant: ProductSearchResult["variants"][number]; qty: number }>) => void;
}) {
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [autoQty, setAutoQty] = useState<number>(0);
  const [proposal, setProposal] = useState<AssortmentProposal | null>(null);
  const [distributing, setDistributing] = useState(false);

  // Request server-authoritative auto-assortment proposal
  async function handleAutoDistribute() {
    if (autoQty <= 0) return;
    setDistributing(true);
    setProposal(null);
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_assortment",
          referenceCode: product.referenceCode,
          requestedUnits: autoQty,
        }),
      });
      if (r.ok) {
        const { proposal: p } = await r.json();
        setProposal(p ?? null);
      }
    } catch { /* degrade silently */ }
    setDistributing(false);
  }

  // Accept server proposal — create cart lines from canonical proposal lines
  function handleAddProposalToCart() {
    if (!proposal) return;
    const lines: Array<{ variant: ProductSearchResult["variants"][number]; qty: number }> = [];
    for (const pl of proposal.lines) {
      if (pl.allocatedUnits <= 0) continue;
      const v = variants.find(vr => vr.variantId === pl.variantId);
      if (v) lines.push({ variant: v, qty: pl.allocatedUnits });
    }
    onAddBatch(lines);
    setProposal(null);
    setAutoQty(0);
  }

  const selected = variants.find(v => v.variantId === selectedVariant);

  return (
    <div style={{ paddingTop: S[2] }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: S[3], borderRadius: R.md, overflow: "hidden", border: `1px solid ${C.line}` }}>
        <button onClick={() => setMode("auto")} style={{
          flex: 1, padding: `${S[2]}px 0`, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          border: "none", cursor: "pointer",
          background: mode === "auto" ? C.blueDark : C.white,
          color: mode === "auto" ? C.white : C.inkMid,
        }}>
          Surtido automatico
        </button>
        <button onClick={() => setMode("manual")} style={{
          flex: 1, padding: `${S[2]}px 0`, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          border: "none", borderLeft: `1px solid ${C.line}`, cursor: "pointer",
          background: mode === "manual" ? C.blueDark : C.white,
          color: mode === "manual" ? C.white : C.inkMid,
        }}>
          Seleccion manual
        </button>
      </div>

      {/* ── Auto-assortment mode ───────────────────────────────────────── */}
      {mode === "auto" && (
        <div>
          <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
            Ingresa la cantidad total y se distribuira entre tallas con stock
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: S[3] }}>
            <input
              type="number"
              min={1}
              value={autoQty || ""}
              onChange={e => { setAutoQty(parseInt(e.target.value) || 0); setProposal(null); }}
              placeholder="Cantidad"
              style={{
                flex: 1, padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`,
                borderRadius: R.md, fontFamily: T.mono, fontSize: 16, background: C.white,
                outline: "none", boxSizing: "border-box", textAlign: "center",
              }}
            />
            <button
              onClick={handleAutoDistribute}
              disabled={autoQty <= 0 || distributing}
              style={{
                padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz.sm,
                fontWeight: T.wt.semibold, border: "none", borderRadius: R.md, cursor: autoQty > 0 && !distributing ? "pointer" : "default",
                background: autoQty > 0 && !distributing ? C.blueDark : C.surfaceAlt,
                color: autoQty > 0 && !distributing ? C.white : C.inkLight,
                whiteSpace: "nowrap",
              }}
            >
              {distributing ? "..." : "Distribuir"}
            </button>
          </div>

          {/* Server-generated proposal */}
          {proposal && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{
                padding: `${S[1]}px ${S[2]}px`, marginBottom: S[2], borderRadius: R.sm,
                fontFamily: T.mono, fontSize: T.sz.xs,
                background: proposal.fulfillable ? `${C.green}10` : `${C.amber}10`,
                color: proposal.fulfillable ? C.green : C.amberDark,
                border: `1px solid ${proposal.fulfillable ? C.green : C.amber}20`,
              }}>
                {proposal.explanation}
              </div>

              {/* Per-line proposal table */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {proposal.lines.filter(l => l.allocatedUnits > 0).map(l => (
                  <div key={l.variantId} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: `${S[1]}px ${S[2]}px`, background: C.surfaceAlt, borderRadius: R.sm,
                    fontFamily: T.mono, fontSize: T.sz.xs,
                  }}>
                    <span style={{ fontWeight: T.wt.semibold, color: C.ink }}>
                      {l.size}{l.color ? `/${l.color}` : ""}
                    </span>
                    <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                      <span style={{ color: C.inkMid }}>{l.allocatedUnits} uds</span>
                      <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>de {l.availableUnits} disp</span>
                    </div>
                  </div>
                ))}
              </div>

              {proposal.unallocatedUnits > 0 && (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark,
                  marginTop: S[1], padding: `${S[1]}px ${S[2]}px`,
                }}>
                  {proposal.unallocatedUnits} uds sin asignar por inventario insuficiente
                </div>
              )}

              {/* Accept proposal */}
              <button
                onClick={handleAddProposalToCart}
                style={{
                  width: "100%", marginTop: S[3], padding: `${S[3]}px 0`,
                  background: C.blueDark, color: C.white, border: "none",
                  borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
                  fontWeight: T.wt.bold, cursor: "pointer",
                }}
              >
                Agregar al pedido ({proposal.allocatedUnits} uds)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manual mode ────────────────────────────────────────────────── */}
      {mode === "manual" && (
        <>
          <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2], fontWeight: T.wt.medium }}>
            Seleccionar talla y color:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: S[2] }}>
            {variants.filter(v => v.size || v.color).map(v => {
              const isSelected = selectedVariant === v.variantId;
              const available = v.availability.availableUnits;
              const isOut = available !== null && available <= 0;
              return (
                <button
                  key={v.variantId}
                  onClick={() => { if (!isOut) { setSelectedVariant(v.variantId); setQuantity(1); } }}
                  disabled={isOut}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`, fontSize: T.sz.xs,
                    border: `1px solid ${isSelected ? C.blueDark : C.line}`,
                    borderRadius: R.sm, fontFamily: T.mono, cursor: isOut ? "default" : "pointer",
                    background: isSelected ? C.blueLight : isOut ? C.surfaceAlt : C.white,
                    color: isOut ? C.inkLight : isSelected ? C.blueDark : C.ink,
                    opacity: isOut ? 0.5 : 1,
                  }}
                >
                  {v.size}{v.color ? `/${v.color}` : ""}
                  {available !== null ? ` (${available})` : ""}
                </button>
              );
            })}
          </div>

          {selected && (
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginTop: S[2] }}>
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: R.md }}>
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{
                  width: 32, height: 32, border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.lg, color: C.ink,
                }}>-</button>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => { const n = parseInt(e.target.value); if (n > 0) setQuantity(n); }}
                  style={{
                    width: 40, textAlign: "center", border: "none", fontFamily: T.mono,
                    fontSize: 16, outline: "none", background: "transparent",
                  }}
                />
                <button onClick={() => setQuantity(q => q + 1)} style={{
                  width: 32, height: 32, border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.lg, color: C.ink,
                }}>+</button>
              </div>
              <button
                onClick={() => { onAdd(selected, quantity); setSelectedVariant(null); setQuantity(1); }}
                style={{
                  flex: 1, padding: `${S[2]}px ${S[3]}px`, background: C.blueDark, color: C.white,
                  border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: T.wt.semibold, cursor: "pointer",
                }}
              >
                Agregar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Step 4: Cart ────────────────────────────────────────────────────────────

function CartStep({
  cart,
  onRemove,
  onUpdateQuantity,
  onBack,
  onReview,
  cartTotal,
  cartUnits,
}: {
  cart: CartLine[];
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onBack: () => void;
  onReview: () => void;
  cartTotal: number;
  cartUnits: number;
}) {
  if (cart.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: `${S[10]}px ${S[4]}px` }}>
        <div style={{ fontSize: T.sz.xl, color: C.inkLight, marginBottom: S[3] }}>
          Carrito vacio
        </div>
        <button onClick={onBack} style={{
          padding: `${S[2]}px ${S[4]}px`, background: C.blueDark, color: C.white,
          border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
          cursor: "pointer",
        }}>
          Agregar productos
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div style={{
        display: "flex", justifyContent: "space-between", padding: `${S[2]}px ${S[3]}px`,
        background: C.surfaceAlt, borderRadius: R.md, marginBottom: S[3],
        fontSize: T.sz.sm,
      }}>
        <span>{cart.length} ref \u00B7 {cartUnits} uds</span>
        <span style={{ fontWeight: T.wt.bold }}>{fmtCOP(cartTotal)}</span>
      </div>

      {/* Lines */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[2], marginBottom: S[4] }}>
        {cart.map(line => (
          <div key={line.id} style={{
            padding: S[3], background: C.white, border: `1px solid ${C.line}`,
            borderRadius: R.lg,
          }}>
            <div style={{ display: "flex", gap: S[2], marginBottom: S[2] }}>
              {line.thumbnailUrl && (
                <img src={line.thumbnailUrl} alt="" style={{
                  width: 40, height: 40, objectFit: "cover", borderRadius: R.sm, flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.sm, color: C.ink }}>
                  {line.referenceCode}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                  {line.size}/{line.color} \u00B7 {fmtCOP(line.unitPrice)}/ud
                </div>
              </div>
              <button onClick={() => onRemove(line.id)} style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: C.red, fontSize: T.sz.lg, padding: 0, flexShrink: 0,
              }}>
                {"\u2715"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: R.md }}>
                <button onClick={() => onUpdateQuantity(line.id, line.quantity - 1)} disabled={line.quantity <= 1} style={{
                  width: 28, height: 28, border: "none", background: "transparent",
                  cursor: line.quantity > 1 ? "pointer" : "default", fontFamily: T.mono,
                  fontSize: T.sz.md, color: line.quantity > 1 ? C.ink : C.inkLight,
                }}>-</button>
                <span style={{ width: 32, textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm }}>
                  {line.quantity}
                </span>
                <button onClick={() => onUpdateQuantity(line.id, line.quantity + 1)} style={{
                  width: 28, height: 28, border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.md, color: C.ink,
                }}>+</button>
              </div>
              <span style={{ fontWeight: T.wt.semibold, fontSize: T.sz.sm }}>
                {fmtCOP(line.lineTotal)}
              </span>
              {line.availableUnits !== null && line.quantity > line.availableUnits && (
                <span style={{ fontSize: T.sz.xs, color: C.amberDark }}>
                  Supera disp ({line.availableUnits})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[2] }}>
        <button onClick={onBack} style={{
          flex: 1, padding: `${S[3]}px`, background: C.white, color: C.blueDark,
          border: `1px solid ${C.blueDark}`, borderRadius: R.md, fontFamily: T.mono,
          fontSize: T.sz.md, cursor: "pointer",
        }}>
          + Productos
        </button>
        <button onClick={onReview} style={{
          flex: 1, padding: `${S[3]}px`, background: C.blueDark, color: C.white,
          border: "none", borderRadius: R.md, fontFamily: T.mono, fontSize: T.sz.md,
          fontWeight: T.wt.semibold, cursor: "pointer",
        }}>
          Revisar pedido
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Review ──────────────────────────────────────────────────────────

function ReviewStep({
  customer,
  cart,
  notes,
  onNotesChange,
  cartTotal,
  cartUnits,
  overdueAlert,
  onBack,
  onSubmit,
}: {
  customer: SelectedCustomer;
  cart: CartLine[];
  notes: string;
  onNotesChange: (n: string) => void;
  cartTotal: number;
  cartUnits: number;
  overdueAlert: { severity: string; message: string } | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      {/* Overdue warning in review */}
      {overdueAlert && (
        <div style={{
          padding: S[3], background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.lg, marginBottom: S[3],
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: S[2], fontSize: T.sz.sm, color: C.amberDark, fontWeight: T.wt.semibold, lineHeight: 1.5 }}>
            <SellerIcon name="alert" size={16} color={C.amberDark} />
            <span>{overdueAlert.message || "Cliente con cartera vencida >30 dias"}</span>
          </div>
        </div>
      )}

      {/* Customer */}
      <DetailSection title="Cliente">
        <div style={{ fontWeight: T.wt.semibold, fontSize: T.sz.md }}>{customer.customerName}</div>
        <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
          {customer.city}{customer.customerCode ? ` \u00B7 SAG: ${customer.customerCode}` : ""}
        </div>
      </DetailSection>

      {/* Lines summary */}
      <DetailSection title={`Productos (${cart.length} ref, ${cartUnits} uds)`}>
        {cart.map(line => (
          <div key={line.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: `${S[1]}px 0`, fontSize: T.sz.sm,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: T.wt.medium }}>{line.referenceCode}</span>
              <span style={{ color: C.inkLight }}> {line.size}/{line.color} x{line.quantity}</span>
            </div>
            <span style={{ fontWeight: T.wt.semibold, flexShrink: 0 }}>{fmtCOP(line.lineTotal)}</span>
          </div>
        ))}
        <div style={{
          display: "flex", justifyContent: "space-between", paddingTop: S[2],
          borderTop: `1px solid ${C.line}`, marginTop: S[2],
          fontSize: T.sz.md, fontWeight: T.wt.bold,
        }}>
          <span>Total</span>
          <span>{fmtCOP(cartTotal)}</span>
        </div>
      </DetailSection>

      {/* Notes */}
      <DetailSection title="Notas (opcional)">
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Observaciones del pedido..."
          rows={3}
          style={{
            width: "100%", padding: S[2], border: `1px solid ${C.line}`,
            borderRadius: R.sm, fontFamily: T.mono, fontSize: 16,
            resize: "vertical", outline: "none", boxSizing: "border-box",
          }}
        />
      </DetailSection>

      {/* Actions */}
      <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
        <button onClick={onBack} style={{
          flex: 1, minHeight: 52, padding: `${S[3]}px`, background: C.white, color: C.inkMid,
          border: `1.5px solid ${C.line}`, borderRadius: 14, fontFamily: T.mono,
          fontSize: T.sz.md, fontWeight: T.wt.semibold, cursor: "pointer", touchAction: "manipulation",
        }}>
          Editar
        </button>
        <button onClick={onSubmit} style={{
          flex: 2, minHeight: 52, padding: `${S[3]}px`, background: C.blueDark, color: C.white,
          border: "none", borderRadius: 14, fontFamily: T.mono, fontSize: T.sz.lg,
          fontWeight: T.wt.bold, cursor: "pointer", boxShadow: "0 8px 22px rgba(0,74,173,0.3)",
          touchAction: "manipulation",
        }}>
          Enviar pedido
        </button>
      </div>
    </div>
  );
}

// ── Step 6: Result ──────────────────────────────────────────────────────────

function ResultStep({
  result,
  onDone,
}: {
  result: { ok: boolean; orderId?: string; error?: string };
  onDone: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: `${S[10]}px ${S[4]}px` }}>
      {result.ok ? (
        <>
          <div style={{
            width: 72, height: 72, borderRadius: 24, background: C.greenLight,
            border: `1.5px solid ${C.greenBorder}`, margin: `0 auto ${S[3]}px`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6.5 9.5 17 4.5 12" />
            </svg>
          </div>
          <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.titleDeep, marginBottom: S[2] }}>
            Pedido creado
          </div>
          {result.error && (
            <div style={{ fontSize: T.sz.sm, color: C.amberDark, marginBottom: S[3] }}>
              {result.error}
            </div>
          )}
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[4] }}>
            Guardado y listo para enviar
          </div>
        </>
      ) : (
        <>
          <div style={{
            width: 72, height: 72, borderRadius: 24, background: C.redLight,
            border: `1.5px solid ${C.redBorder}`, margin: `0 auto ${S[3]}px`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.redDark} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </div>
          <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.red, marginBottom: S[2] }}>
            Error al crear pedido
          </div>
          <div style={{ fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[4] }}>
            {result.error ?? "Error desconocido"}
          </div>
        </>
      )}
      <button onClick={onDone} style={{
        minHeight: 52, padding: `${S[3]}px ${S[6]}px`, background: C.blueDark, color: C.white,
        border: "none", borderRadius: 14, fontFamily: T.mono, fontSize: T.sz.lg,
        fontWeight: T.wt.semibold, cursor: "pointer", touchAction: "manipulation",
        boxShadow: "0 8px 22px rgba(0,74,173,0.3)",
      }}>
        Volver al inicio
      </button>
    </div>
  );
}
