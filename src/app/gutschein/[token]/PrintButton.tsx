"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> Drucken</button>;
}
