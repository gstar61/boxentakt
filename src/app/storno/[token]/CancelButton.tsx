"use client";

import { useState, useTransition } from "react";
import { CalendarX2 } from "lucide-react";
import { cancelAction } from "@/app/actions";

export default function CancelButton({ token, slug }: { token: string; slug: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "done" | "error">("idle");
  const [refunded, setRefunded] = useState(false);
  const [pending, start] = useTransition();

  if (state === "done")
    return (
      <div className="grid gap-3">
        <p className="text-accent">Der Termin ist abgesagt. Danke für die Info.{refunded ? " Die Anzahlung wird erstattet." : ""}</p>
        <a className="btn w-fit" href={`/${slug}`}>Neuen Termin buchen</a>
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === "confirm" ? (
        <>
          <button
            className="btn btn-danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await cancelAction(token);
                setRefunded(r.refunded);
                setState(r.ok ? "done" : "error");
              })
            }
          >
            <CalendarX2 size={18} /> {pending ? "Wird abgesagt …" : "Ja, Termin absagen"}
          </button>
          <button className="btn btn-ghost" onClick={() => setState("idle")}>Doch nicht</button>
        </>
      ) : (
        <button className="btn btn-danger" onClick={() => setState("confirm")}>
          <CalendarX2 size={18} /> Termin absagen
        </button>
      )}
      {state === "error" && <p className="w-full text-sm text-danger">Absagen hat nicht geklappt. Bitte im Betrieb anrufen.</p>}
    </div>
  );
}
