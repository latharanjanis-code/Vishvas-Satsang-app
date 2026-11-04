"use client";
import { useActionState } from "react";
import { loginAction, type FormState } from "../auth-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {} as FormState);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label htmlFor="username" className="label">
          Username
        </label>
        <input id="username" name="username" className="input" autoComplete="username" required />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p className="rounded-lg bg-bad-soft text-bad px-3 py-2" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
