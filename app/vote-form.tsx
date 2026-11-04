"use client";
import { useActionState } from "react";
import { submitAvailability, type VoteState } from "./actions";
import { CHOICE_LABEL } from "@/lib/labels";

const initial: VoteState = { status: "idle" };

export function VoteForm({ closesAt }: { closesAt: string }) {
  const [state, action, pending] = useActionState(submitAvailability, initial);

  return (
    <form action={action} className="card space-y-5" noValidate>
      <div>
        <label htmlFor="name" className="label">
          Your name
        </label>
        {/* Keeps what was typed after an error (React resets forms after an action). */}
        <input
          key={state.status === "error" ? state.at : "fresh"}
          id="name"
          name="name"
          className="input text-lg"
          autoComplete="name"
          defaultValue={state.status === "error" ? state.name : ""}
          required
        />
        <p className="text-sm text-muted mt-1">Type it exactly as on the group&apos;s list. Capital letters don&apos;t matter.</p>
      </div>

      <fieldset>
        <legend className="label">This Saturday I am…</legend>
        <div className="space-y-2">
          {(Object.keys(CHOICE_LABEL) as (keyof typeof CHOICE_LABEL)[]).map((key) => (
            <label key={key} className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-3 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name="choice" value={key} required className="size-5 accent-[var(--accent)]" />
              <span className="text-base">{CHOICE_LABEL[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Honeypot: hidden from people, often filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="btn w-full text-lg" disabled={pending}>
        {pending ? "Saving…" : "Submit"}
      </button>

      <div aria-live="polite">
        {state.status === "error" && (
          <p className="rounded-lg bg-bad-soft text-bad px-3 py-2 font-medium">{state.message}</p>
        )}
        {state.status === "saved" && state.choice && (
          <div className="rounded-lg bg-ok-soft text-ok px-3 py-2">
            <p className="font-semibold">
              {state.changed ? "Updated" : "Saved"} — thank you, {state.name}.
            </p>
            <p>
              Your answer: <strong>{state.choice}</strong> (at {state.at} IST).
            </p>
            <p className="text-sm mt-1">You can change it until {closesAt}.</p>
          </div>
        )}
      </div>
    </form>
  );
}
