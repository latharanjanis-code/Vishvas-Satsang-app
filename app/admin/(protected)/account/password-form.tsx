"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, type FormState } from "../../auth-actions";

export function PasswordForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(changePasswordAction, {} as FormState);

  // After the first-login change, go straight to the dashboard.
  useEffect(() => {
    if (state.next) router.replace(state.next);
  }, [state.next, router]);

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label htmlFor="current" className="label">
          Current password
        </label>
        <input id="current" name="current" type="password" className="input" autoComplete="current-password" required />
      </div>
      <div>
        <label htmlFor="next" className="label">
          New password (at least 10 characters)
        </label>
        <input id="next" name="next" type="password" minLength={10} className="input" autoComplete="new-password" required />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          New password again
        </label>
        <input id="confirm" name="confirm" type="password" minLength={10} className="input" autoComplete="new-password" required />
      </div>
      {state.error && <p className="rounded-lg bg-bad-soft text-bad px-3 py-2">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-ok-soft text-ok px-3 py-2">{state.ok}</p>}
      <button className="btn" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
