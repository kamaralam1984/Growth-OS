import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          backgroundColor: "#0a0f0d",
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 30% 0%, rgba(16,185,129,0.35), transparent 70%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 40,
            fontWeight: 700,
            backgroundImage:
              "linear-gradient(100deg, #34d399 0%, #60a5fa 55%, #a78bfa 100%)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          KVL GrowthOS
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 56,
            fontWeight: 600,
            lineHeight: 1.15,
            color: "#fafafa",
            maxWidth: 900,
          }}
        >
          The AI Workforce That Grows Your Business 24/7
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            color: "#a1a1aa",
            maxWidth: 820,
          }}
        >
          Five AI agents that qualify leads, run outreach, and move deals
          forward around the clock.
        </div>
      </div>
    ),
    { ...size },
  );
}
