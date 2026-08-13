"use client";

/**
 * Agentik — Login.
 *
 * AGENTIK-SELLER-APP-UX-01 §4–§5: composición mobile-first premium con la
 * identidad Agentik REAL. MISMA autenticación existente (next-auth
 * credentials: email + password) — solo cambia la presentación.
 * Copy genérico antes de autenticar (sin identidad de vendedor implícita).
 */

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const BLUE = "#004AAD";
const NAVY = "#0D2454";

/**
 * Validate callbackUrl is an internal path only (no open redirect).
 * Returns "/" for any external, protocol-based, or malformed value.
 */
function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  // Must start with exactly one "/" — reject "//host", empty, protocol schemes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  // Reject protocol-like patterns anywhere
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return "/";
  // Reject backslash tricks (\\host)
  if (trimmed.startsWith("\\")) return "/";
  return trimmed;
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      setError("Correo o contraseña incorrectos.");
      return;
    }

    // Resolve post-login destination server-side.
    // If a valid internal callback exists, it takes precedence.
    // Otherwise the resolver determines the correct surface based on
    // user memberships, role, and seller identity.
    const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));
    try {
      const params = new URLSearchParams();
      if (callbackUrl && callbackUrl !== "/") {
        params.set("callbackUrl", callbackUrl);
      }
      const qs = params.toString();
      const res = await fetch(`/api/auth/post-login-destination${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        if (data.destination && data.destination !== "/login") {
          router.push(data.destination);
          return;
        }
      }
    } catch {
      // Resolver failed — fall through to callback or org root
    }

    // Fallback: use callback if it's not the public landing
    if (callbackUrl && callbackUrl !== "/") {
      router.push(callbackUrl);
      return;
    }

    // Last resort: org selector (server-side resolution for single/multi org)
    // Never default to public landing for authenticated users.
    router.push("/select-org");
  }

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6,
  };
  const inputWrapStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    border: "1.5px solid #d6ddea", borderRadius: 14, background: "#fff",
    padding: "0 14px", minHeight: 52,
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, border: "none", outline: "none", background: "transparent",
    fontSize: 16, color: "#0f0f1a", fontFamily: "inherit", minWidth: 0,
  };

  return (
    <main style={{
      minHeight: "100dvh",
      background: `linear-gradient(160deg, ${BLUE} 0%, ${NAVY} 100%)`,
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: `"Inter", system-ui, -apple-system, sans-serif`,
      paddingTop: "calc(28px + env(safe-area-inset-top, 0px))",
      paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
      paddingLeft: 20, paddingRight: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Logo Agentik REAL — centrado, en contenedor blanco (asset sin modificar) */}
        <div style={{
          background: "#fff", borderRadius: 24, padding: "14px 18px",
          boxShadow: "0 10px 34px rgba(0,0,0,0.22)", marginBottom: 22,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/agentik-logo.png"
            alt="Agentik Enterprise AI"
            style={{ height: 92, width: "auto", display: "block" }}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const fallback = document.createElement("span");
              fallback.textContent = "Agentik";
              fallback.style.cssText = "font-size:28px;font-weight:800;color:#004AAD;letter-spacing:-0.03em;";
              img.parentElement?.appendChild(fallback);
            }}
          />
        </div>

        {/* Mensaje orientado a venta — genérico (§5) */}
        <div style={{
          alignSelf: "flex-start", fontSize: 12, fontWeight: 700, letterSpacing: "0.22em",
          color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginBottom: 8,
        }}>
          Agentik Enterprise
        </div>
        <h1 style={{
          alignSelf: "flex-start", margin: 0, color: "#fff",
          fontSize: 32, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.5px",
        }}>
          Bienvenido
        </h1>
        <p style={{
          alignSelf: "flex-start", margin: "10px 0 24px", color: "rgba(255,255,255,0.82)",
          fontSize: 15, lineHeight: 1.55, maxWidth: 320,
        }}>
          Ingresa para continuar a tu espacio de trabajo.
        </p>

        {/* Form card — MISMA autenticación existente */}
        <form onSubmit={handleSubmit} style={{
          width: "100%", background: "#fff", borderRadius: 22,
          padding: "22px 20px 18px", boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
          boxSizing: "border-box",
        }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={labelStyle}>Correo</label>
            <div style={inputWrapStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              <input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" inputMode="email"
                placeholder="tu@correo.com" style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="password" style={labelStyle}>Contraseña</label>
            <div style={inputWrapStyle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="password" type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password"
                placeholder="••••••••" style={inputStyle}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  padding: 8, margin: -8, marginLeft: 0, display: "flex",
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={showPassword ? BLUE : "#9ca3af"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" style={{
              margin: "0 0 14px", padding: "10px 12px", borderRadius: 12,
              background: "#fff0f0", border: "1px solid #fca5a5",
              color: "#991b1b", fontSize: 13, lineHeight: 1.5,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", minHeight: 52, border: "none", borderRadius: 14,
              background: BLUE, color: "#fff", fontSize: 16, fontWeight: 700,
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.75 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 8px 22px rgba(0,74,173,0.35)", touchAction: "manipulation",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Ingresando…" : "Ingresar"}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4.5 12h15" /><path d="m13 5.5 6.5 6.5L13 18.5" />
              </svg>
            )}
          </button>

          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#6b7280" }}>
            Agentik Enterprise OS
          </div>
        </form>

        <div style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
          ¿Problemas para entrar? Contacta a tu supervisor
        </div>
      </div>
    </main>
  );
}
