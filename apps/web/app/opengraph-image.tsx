import { ImageResponse } from "next/og";

export const alt = "AlphaGovernor autonomous capital command center";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", overflow: "hidden", background: "#090b10", color: "#f4f6f9", padding: "72px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ position: "absolute", width: 520, height: 520, borderRadius: 520, border: "1px solid rgba(173,255,47,.16)", right: -170, top: -170, boxShadow: "0 0 120px rgba(173,255,47,.08)" }} />
      <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 62, height: 62, display: "flex", alignItems: "center", justifyContent: "center", background: "#adff2f", color: "#090b10", fontSize: 22, fontWeight: 800 }}>AG</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 22, fontWeight: 800, letterSpacing: 2, lineHeight: 1 }}><span>ALPHA</span><span style={{ color: "#adff2f" }}>GOVERNOR</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: "#adff2f", fontSize: 16, letterSpacing: 4, fontWeight: 700 }}>AUTONOMOUS CAPITAL COMMAND CENTER</span>
          <span style={{ marginTop: 18, maxWidth: 900, fontSize: 68, lineHeight: .98, letterSpacing: -4, fontWeight: 750 }}>The operating system that hires, funds and fires AI traders.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #29303c", paddingTop: 25, color: "#8b93a5", fontSize: 18 }}>
          <span>Specialist agents · Dynamic reputation · Alpaca paper execution</span>
          <span style={{ display: "flex", color: "#adff2f", fontWeight: 700 }}>RISK CONSTITUTION: LOCKED</span>
        </div>
      </div>
    </div>,
    size,
  );
}
