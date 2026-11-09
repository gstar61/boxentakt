import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the timetable mark on the dark brand background. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1220" }}>
        <svg width="112" height="112" viewBox="13 13 38 38">
          <rect x="13" y="13" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="27" y="13" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="41" y="13" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="13" y="27" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="27" y="27" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="41" y="27" width="10" height="10" rx="3" fill="#e2e8f0" />
          <rect x="13" y="41" width="10" height="10" rx="3" fill="#14d39a" opacity={0.35} />
          <rect x="27" y="41" width="10" height="10" rx="3" fill="#14d39a" />
          <rect x="41" y="41" width="10" height="10" rx="3" fill="#14d39a" />
        </svg>
      </div>
    ),
    size,
  );
}
