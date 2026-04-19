/**
 * components/executive/mobile-kpi-carousel.tsx
 *
 * Mobile-only horizontally scrollable KPI carousel — Torre de Control.
 *
 * Swipe behavior is handled by native CSS scroll-snap — no JS library required.
 * The <style> tag is embedded directly so this component is self-contained.
 *
 * Receives pre-formatted KPI objects from the page; does no data fetching.
 */

export interface MobileKpiCard {
  id:        string;
  label:     string;
  value:     string;
  sublabel:  string;
  dotColor:  string;
}

export interface MobileKpiCarouselProps {
  kpis: MobileKpiCard[];
}

export default function MobileKpiCarousel({ kpis }: MobileKpiCarouselProps) {
  return (
    <>
      <style>{`
        .mob-kpi-track {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-bottom: 4px;
          margin-bottom: 16px;
        }
        .mob-kpi-track::-webkit-scrollbar { display: none; }
        .mob-kpi-card {
          flex: 0 0 calc(80vw - 32px);
          max-width: 260px;
          scroll-snap-align: start;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 16px;
        }
      `}</style>

      <div className="mob-kpi-track">
        {kpis.map(kpi => (
          <div key={kpi.id} className="mob-kpi-card">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", background: kpi.dotColor,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10, color: "#888",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {kpi.label}
              </span>
            </div>
            <div style={{
              fontSize: 26, fontWeight: 900, color: "#111",
              letterSpacing: "-0.03em", marginBottom: 4, lineHeight: 1.1,
            }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: "#aaa" }}>
              {kpi.sublabel}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
