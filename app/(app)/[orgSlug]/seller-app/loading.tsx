/**
 * Seller App — Splash / route loading state (AGENTIK-SELLER-APP-UX-01 §3).
 *
 * Identidad Agentik centrada + animación de carga sutil.
 * Se muestra SOLO mientras el server component carga — jamás alarga la carga.
 */

export default function SellerAppSplash() {
  return (
    <div style={{
      minHeight: "100dvh", maxWidth: 430, margin: "0 auto",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 20, background: "#f8f9fb",
      paddingTop: "env(safe-area-inset-top, 0px)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <style>{`
        @keyframes agk-splash-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.82; transform: scale(0.97); }
        }
        @keyframes agk-splash-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(260%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .agk-splash-logo, .agk-splash-ind { animation: none !important; }
        }
      `}</style>
      {/* Logo Agentik REAL — asset suministrado */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/agentik-logo.png"
        alt="Agentik Enterprise AI"
        className="agk-splash-logo"
        style={{ width: 148, height: "auto", animation: "agk-splash-pulse 1.8s ease-in-out infinite" }}
      />
      <div style={{
        width: 120, height: 4, borderRadius: 999, overflow: "hidden",
        background: "#e5e7eb", position: "relative",
      }}>
        <span className="agk-splash-ind" style={{
          position: "absolute", inset: 0, width: "45%", borderRadius: 999,
          background: "#004AAD", animation: "agk-splash-bar 1.2s ease-in-out infinite",
        }} />
      </div>
    </div>
  );
}
