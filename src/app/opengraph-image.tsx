import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SLOGAN } from "@/lib/brand";

export const alt = "Boxentakt – Online-Termine für Werkstätten";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (w: string) => readFile(join(process.cwd(), `node_modules/geist/dist/fonts/geist-sans/Geist-${w}.ttf`));

/** Social preview: headline, price and a small calendar sketch in the brand colors. */
export default async function OpenGraphImage() {
  const [regular, semibold] = await Promise.all([font("Regular"), font("SemiBold")]);
  const blocks = [
    { top: 40, h: 70, c: "#14d39a" },
    { top: 130, h: 46, c: "#14d39a" },
    { top: 196, h: 92, c: "#94a3b8" },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b1220", color: "#fff", fontFamily: "Geist", padding: 72, position: "relative" }}>
        <div style={{ position: "absolute", top: -220, left: 260, width: 760, height: 520, borderRadius: 9999, background: "rgba(20,211,154,0.16)", filter: "blur(90px)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 660 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, border: "2px solid rgba(20,211,154,0.35)", background: "rgba(20,211,154,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="13 13 38 38">
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
            Boxentakt
            <span style={{ fontSize: 24, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>{SLOGAN}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 84, fontWeight: 600, lineHeight: 1.02, letterSpacing: -3 }}>
            <span>Online-Termine.</span>
            <span style={{ color: "#94a3b8" }}>Ohne Provision.</span>
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#cbd5e1" }}>
            <span style={{ padding: "8px 16px", borderRadius: 12, background: "rgba(20,211,154,0.12)", color: "#14d39a" }}>29 € im Monat</span>
            <span style={{ padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)" }}>0 % Provision</span>
            <span style={{ padding: "8px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)" }}>30 Tage gratis</span>
          </div>
        </div>
        <div style={{ display: "flex", marginLeft: "auto", marginTop: 40, width: 330, height: 420, borderRadius: 24, background: "#111827", border: "1px solid rgba(255,255,255,0.1)", padding: 24, flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#94a3b8" }}>
            <span>Heute</span>
            <span style={{ color: "#14d39a" }}>412 €</span>
          </div>
          <div style={{ display: "flex", position: "relative", flex: 1, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {blocks.map((b, i) => (
              <div key={i} style={{ position: "absolute", top: b.top, left: 0, right: 0, height: b.h, borderRadius: 12, background: `${b.c}22`, border: `1px solid ${b.c}66`, display: "flex", padding: "8px 12px", fontSize: 18, color: b.c }}>
                {["09:00 Laura", "10:30 Tim", "12:00 Online-Buchung"][i]}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
