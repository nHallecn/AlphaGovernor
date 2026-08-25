import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#adff2f", color: "#090b10", fontSize: 21, fontWeight: 900, fontFamily: "Arial" }}>AG</div>,
    size,
  );
}
