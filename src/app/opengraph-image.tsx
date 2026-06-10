import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#FBF8F1",
          color: "#1A1611",
          fontFamily: "Arial",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: "#B45F4B", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800 }}>C</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>Convive Connect</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 74, lineHeight: 0.95, letterSpacing: 0, fontWeight: 800, maxWidth: 900 }}>
            Tu edificio, mas humano que nunca.
          </div>
          <div style={{ marginTop: 28, fontSize: 28, lineHeight: 1.35, color: "#524A40", maxWidth: 880 }}>
            Gestion comunitaria, CoCo IA, WhatsApp, apoyo mutuo y convivencia vecinal para condominios en Chile.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 22, color: "#B45F4B", fontWeight: 700 }}>
          <span>Activacion IA</span>
          <span>|</span>
          <span>Ley 21.442</span>
          <span>|</span>
          <span>WhatsApp-first</span>
        </div>
      </div>
    ),
    size
  );
}
