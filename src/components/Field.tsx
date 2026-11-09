"use client";

export function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string; required?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={props.id} className="text-[13px] text-muted">{props.label}</label>
      <input
        id={props.id}
        className="input"
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required={props.required}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
