"use client";
import { useEffect } from "react";

export function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="no-print text-sm text-muted text-center">
      Choose &quot;Save as PDF&quot; in the print window. <button className="underline" onClick={() => window.print()}>Open print window</button>
    </p>
  );
}
