import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SandboxScope | Ask your data, see exactly what runs";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0c0c0f",
          color: "#f4f4ef",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 34 }}>
            <div style={{ width: 7, height: 14, background: "#63e6c7", opacity: 0.45 }} />
            <div style={{ width: 7, height: 23, background: "#63e6c7", opacity: 0.7 }} />
            <div style={{ width: 7, height: 31, background: "#63e6c7" }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>SandboxScope</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 20, letterSpacing: "0.14em", color: "#63e6c7", marginBottom: 20 }}>
            SANDBOXED DATA ANALYSIS
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            Ask your data.
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            See exactly what runs.
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 21, color: "#90909a" }}>
          {["Review before execution", "Network denied", "Isolated Vercel Sandbox"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "10px 18px",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
