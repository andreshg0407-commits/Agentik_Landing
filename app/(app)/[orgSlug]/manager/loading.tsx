/**
 * Manager route-level loading UI — Fable-aligned skeleton.
 *
 * Sprint: AGENTIK-MANAGER-FABLE-INTEGRATION-M1
 *
 * Next.js renders this immediately while page.tsx awaits server data.
 * Shell (header, drawer, orb) renders via layout.tsx — unblocked.
 * This skeleton fills the canvas slot with Fable-consistent placeholders.
 */

const F = {
  ink50:  "#F4F6FA",
  ink200: "#D4DAE5",
  line:   "rgba(11,23,48,.08)",
  bg:     "#FFFFFF",
  bgSoft: "#F5F8FC",
  r:      14,
  rXl:    22,
  font:   "'Inter', system-ui, -apple-system, sans-serif",
} as const;

function Bone({ w, h, r = 8 }: { w: string | number; h: number; r?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: F.ink50,
        flexShrink: 0,
      }}
    />
  );
}

export default function ManagerLoading() {
  return (
    <div
      style={{
        padding: "6px 20px 120px",
        fontFamily: F.font,
      }}
      aria-busy="true"
      aria-label="Cargando..."
    >
      {/* Date skeleton */}
      <Bone w={120} h={12} />

      {/* Greeting skeleton */}
      <div style={{ marginTop: 10 }}>
        <Bone w={200} h={28} r={10} />
        <div style={{ marginTop: 6 }}>
          <Bone w={140} h={28} r={10} />
        </div>
      </div>

      {/* Executive Pulse card skeleton */}
      <div
        style={{
          marginTop: 20,
          background: F.bg,
          border: `1px solid ${F.line}`,
          borderRadius: F.rXl,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 18px 16px" }}>
          <Bone w={100} h={11} />
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <Bone w={34} h={34} r={11} />
            <Bone w={180} h={17} r={6} />
          </div>
        </div>
        <div
          style={{
            padding: "11px 18px",
            borderTop: `1px solid ${F.line}`,
          }}
        >
          <Bone w={130} h={11} />
        </div>
      </div>

      {/* Module folders skeleton */}
      <div style={{ marginTop: 30 }}>
        <Bone w={70} h={11} />
      </div>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2].map(i => (
          <div
            key={i}
            style={{
              background: F.bg,
              border: `1px solid ${F.line}`,
              borderRadius: F.rXl,
              padding: "17px 17px 15px",
              display: "flex",
              gap: 13,
              alignItems: "flex-start",
            }}
          >
            <Bone w={44} h={44} r={13} />
            <div style={{ flex: 1 }}>
              <Bone w={120} h={17} r={6} />
              <div style={{ marginTop: 8 }}>
                <Bone w="80%" h={12} r={5} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
