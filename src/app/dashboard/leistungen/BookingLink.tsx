"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, MapPin, QrCode } from "lucide-react";

/** Booking link with copy button and a printable QR code (counter, shop window, business card). */
export function BookingLink({ slug, name }: { slug: string; name: string }) {
  const url = `${location.origin}/${slug}`;
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [google, setGoogle] = useState(false);

  async function toggleQr() {
    if (svg) return setSvg("");
    setSvg(await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0b1220", light: "#ffffff" } }));
  }

  async function downloadPng() {
    const a = document.createElement("a");
    a.href = await QRCode.toDataURL(url, { width: 1200, margin: 2, color: { dark: "#0b1220", light: "#ffffff" } });
    a.download = `buchung-${slug}.png`;
    a.click();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        Buchungslink: <span className="select-all font-mono text-fg">{url}</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            await navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy size={15} /> {copied ? "Kopiert" : "Kopieren"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={toggleQr}><QrCode size={15} /> QR-Code</button>
        <button className="btn btn-sm btn-ghost" aria-expanded={google} onClick={() => setGoogle(!google)}><MapPin size={15} /> Bei Google eintragen</button>
      </div>
      {google && (
        <ol className="grid max-w-xl list-decimal gap-1.5 rounded-xl border border-line bg-card-2 py-3 pr-4 pl-8 text-sm text-muted">
          <li>Bei Google nach dem eigenen Betrieb suchen (angemeldet mit dem Konto des Unternehmensprofils) oder <span className="text-fg">business.google.com</span> öffnen.</li>
          <li>„Profil bearbeiten“ → Reiter „Buchungen“ bzw. „Links für Terminvereinbarung“.</li>
          <li>Den Buchungslink oben einfügen und speichern. Bei mehreren Links diesen als bevorzugt festlegen.</li>
          <li>Nach Prüfung durch Google erscheint im Profil und in Maps ein Knopf „Termin buchen“, meist innerhalb weniger Tage.</li>
        </ol>
      )}
      {svg && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-44 rounded-xl bg-white p-2" role="img" aria-label={`QR-Code zur Buchungsseite von ${name}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="grid gap-2 text-sm text-muted">
            <p className="max-w-xs">Zum Ausdrucken für Empfangstresen, Schaufenster oder Visitenkarte. Kunden scannen und buchen direkt.</p>
            <button className="btn btn-sm w-fit" onClick={downloadPng}><Download size={15} /> Als Bild speichern</button>
          </div>
        </div>
      )}
    </div>
  );
}
