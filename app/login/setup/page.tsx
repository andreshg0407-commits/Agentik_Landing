"use client";

/**
 * /login/setup — Seller account setup page.
 *
 * AGENTIK-SELLER-ACCESS-PROVISIONING-V1-01
 *
 * Seller receives a link from their manager with token + email.
 * They set their own password. On success, membership activates and
 * they can log in normally via /login.
 *
 * NO admin password creation. NO public registration.
 */

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BLUE = "#004AAD";
const NAVY = "#0D2454";

function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return "/";
  if (trimmed.startsWith("\\")) return "/";
  return trimmed;
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupForm />
    </Suspense>
  );
}

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const emailParam = searchParams.get("email") ?? "";
  const tokenParam = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contrasena debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam, token: tokenParam, password }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Error al configurar la cuenta.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
      setLoading(false);
    }
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

  if (!tokenParam || !emailParam) {
    return (
      <main style={{
        minHeight: "100dvh",
        background: `linear-gradient(160deg, ${BLUE} 0%, ${NAVY} 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: `"Inter", system-ui, -apple-system, sans-serif`,
        padding: 20,
      }}>
        <div style={{
          background: "#fff", borderRadius: 22, padding: "32px 24px",
          maxWidth: 400, width: "100%", textAlign: "center",
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: "0 0 12px" }}>
            Enlace invalido
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>
            Este enlace de configuracion no es valido. Solicita uno nuevo a tu supervisor.
          </p>
        </div>
      </main>
    );
  }

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
        <div style={{
          background: "#fff", borderRadius: 24, padding: "14px 18px",
          boxShadow: "0 10px 34px rgba(0,0,0,0.22)", marginBottom: 22,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/agentik-logo.png" alt="Agentik Enterprise AI" style={{ height: 92, width: "auto", display: "block" }} />
        </div>

        <div style={{
          alignSelf: "flex-start", fontSize: 12, fontWeight: 700, letterSpacing: "0.22em",
          color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginBottom: 8,
        }}>
          Configuracion de cuenta
        </div>
        <h1 style={{
          alignSelf: "flex-start", margin: 0, color: "#fff",
          fontSize: 28, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.5px",
        }}>
          Crea tu contrasena
        </h1>
        <p style={{
          alignSelf: "flex-start", margin: "10px 0 24px", color: "rgba(255,255,255,0.82)",
          fontSize: 15, lineHeight: 1.55, maxWidth: 320,
        }}>
          Configura tu acceso a Agentik Ventas.
        </p>

        {success ? (
          <div style={{
            width: "100%", background: "#fff", borderRadius: 22,
            padding: "32px 20px", boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: "0 0 8px" }}>
              Cuenta configurada
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Redirigiendo al inicio de sesion...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{
            width: "100%", background: "#fff", borderRadius: 22,
            padding: "22px 20px 18px", boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
            boxSizing: "border-box",
          }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Correo</label>
              <div style={{ ...inputWrapStyle, background: "#f9fafb" }}>
                <input
                  type="email" value={emailParam} disabled
                  style={{ ...inputStyle, color: "#6b7280" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="password" style={labelStyle}>Contrasena</label>
              <div style={inputWrapStyle}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="new-password" minLength={8}
                  placeholder="Minimo 8 caracteres" style={inputStyle}
                />
                <button
                  type="button" onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 8, margin: -8, display: "flex" }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={showPassword ? BLUE : "#9ca3af"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="confirmPassword" style={labelStyle}>Confirmar contrasena</label>
              <div style={inputWrapStyle}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  id="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required autoComplete="new-password" minLength={8}
                  placeholder="Repite tu contrasena" style={inputStyle}
                />
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
              type="submit" disabled={loading}
              style={{
                width: "100%", minHeight: 52, border: "none", borderRadius: 14,
                background: BLUE, color: "#fff", fontSize: 16, fontWeight: 700,
                cursor: loading ? "wait" : "pointer", opacity: loading ? 0.75 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: "0 8px 22px rgba(0,74,173,0.35)", touchAction: "manipulation",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Configurando..." : "Crear cuenta"}
            </button>

            <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#6b7280" }}>
              Agentik Enterprise OS
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
