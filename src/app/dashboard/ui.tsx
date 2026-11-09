"use client";

import { useEffect } from "react";
import { Copy, X } from "lucide-react";

export function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="card grid content-start gap-1 px-3 py-2.5 sm:px-5 sm:py-4">
      <span className="label">{label}</span>
      <span className={`text-lg font-semibold tabular-nums tracking-tight sm:text-[26px] ${danger ? "text-danger" : ""}`}>{value}</span>
    </div>
  );
}

export function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><i className={`size-2.5 rounded-[3px] border ${cls}`} />{label}</span>;
}

export function Row({ k, v, copy, onCopied }: { k: string; v: string; copy?: string; onCopied?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="flex items-center gap-2 text-right select-text">
        {v}
        {copy && (
          <button className="icon-btn !size-8" aria-label="Kopieren" onClick={() => navigator.clipboard.writeText(copy).then(onCopied, () => {})}>
            <Copy size={14} />
          </button>
        )}
      </dd>
    </div>
  );
}

export function Drawer({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-20 bg-[#03060c]/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={title} className="fixed inset-y-0 right-0 z-21 grid w-full max-w-[420px] content-start gap-5 overflow-y-auto border-l border-line bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1.5">
            <span className="label">{eyebrow}</span>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <select id={id} className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export function TextField({ id, label, value, onChange, type }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <input id={id} type={type ?? "text"} className="input input-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
