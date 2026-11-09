"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { browserClient } from "@/lib/supabase";
import { useSalon } from "../salon-context";

type Kind = "logo" | "cover";
const SPEC: Record<Kind, { w: number; h: number; column: "logo_url" | "cover_url" }> = {
  logo: { w: 512, h: 512, column: "logo_url" },
  cover: { w: 1600, h: 640, column: "cover_url" },
};
const BUCKET = "salon-media";

/** Center-crops and scales the photo in the browser, so uploads stay small (WebP, well under 1 MB). */
async function toWebp(file: File, w: number, h: number) {
  const img = await createImageBitmap(file);
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
  return new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("encode"))), "image/webp", 0.85));
}

const pathOf = (url: string | null) => url?.split(`/${BUCKET}/`)[1] ?? null;
/** New file name per upload, so browsers and the CDN never show a stale image. */
const newPath = (salonId: string, kind: Kind) => `${salonId}/${kind}-${Date.now()}.webp`;

export function MediaSection() {
  const { salon, reload } = useSalon();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  async function upload(kind: Kind, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ text: "Bitte ein Bild auswählen (JPG, PNG, HEIC oder WebP).", err: true });
    setBusy(kind);
    setMsg(null);
    try {
      const { w, h, column } = SPEC[kind];
      const blob = await toWebp(file, w, h);
      const sb = browserClient();
      const path = newPath(salon.id, kind);
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (up.error) throw up.error;
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await sb.from("salons").update({ [column]: url }).eq("id", salon.id);
      if (error) throw error;
      const old = pathOf(salon[column]);
      if (old) await sb.storage.from(BUCKET).remove([old]);
      await reload();
      setMsg({ text: kind === "logo" ? "Logo gespeichert." : "Titelbild gespeichert." });
    } catch (e) {
      console.error(e);
      setMsg({ text: "Hochladen hat nicht geklappt. Bitte ein anderes Bild versuchen.", err: true });
    }
    setBusy(null);
  }

  async function remove(kind: Kind) {
    const { column } = SPEC[kind];
    setBusy(kind);
    const sb = browserClient();
    await sb.from("salons").update({ [column]: null }).eq("id", salon.id);
    const old = pathOf(salon[column]);
    if (old) await sb.storage.from(BUCKET).remove([old]);
    await reload();
    setBusy(null);
  }

  return (
    <section className="card grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-[15px] font-semibold">Logo &amp; Titelbild</h2>
        <p className="text-sm text-muted">Erscheinen oben auf deiner Buchungsseite und in der Vorschau, wenn jemand den Link teilt.</p>
      </div>

      {/* preview in the same layout as the booking page */}
      <div className="relative max-w-3xl">
        <div className="aspect-[5/2] overflow-hidden rounded-[18px] border border-line bg-card-2">
          {salon.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of a freshly uploaded file
            <img src={salon.cover_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_70%)] text-sm text-dim">
              Noch kein Titelbild
            </div>
          )}
        </div>
        <div className="absolute -bottom-7 left-5 grid size-20 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-card-2 text-accent shadow-lg">
          {salon.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview
            <img src={salon.logo_url} alt="" className="size-full object-cover" />
          ) : (
            <LogoMark size={26} />
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
        {(["logo", "cover"] as Kind[]).map((kind) => {
          const has = Boolean(salon[SPEC[kind].column]);
          return (
            <div key={kind} className="grid gap-2">
              <span className="text-[13px] text-muted">{kind === "logo" ? "Logo (quadratisch)" : "Titelbild (Querformat, z. B. Werkstatt von innen)"}</span>
              <div className="flex flex-wrap gap-2">
                <label className={`btn btn-sm ${busy ? "pointer-events-none opacity-50" : ""}`}>
                  <ImagePlus size={15} /> {busy === kind ? "Lädt hoch …" : has ? "Ersetzen" : "Hochladen"}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {has && (
                  <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => remove(kind)}>
                    <Trash2 size={15} /> Entfernen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-dim">Bilder werden automatisch zugeschnitten und verkleinert. Bitte nur eigene Fotos oder solche mit Nutzungsrecht verwenden.</p>
      {msg && <p className={`text-sm ${msg.err ? "text-danger" : "text-accent"}`}>{msg.text}</p>}
    </section>
  );
}
