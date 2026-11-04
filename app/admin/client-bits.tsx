"use client";
// Tiny client helpers for admin forms.
import type { ReactNode } from "react";

/** A select that submits its form as soon as it changes. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  children,
  label,
}: {
  name: string;
  defaultValue: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      className="input !min-h-9 !py-1 text-sm"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}

/** Submit button that asks first. */
export function ConfirmButton({ children, message, className = "btn" }: { children: ReactNode; message: string; className?: string }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
