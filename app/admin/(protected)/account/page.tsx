// Change password; forced at first login (spec A1).
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PageTitle } from "../../ui";
import { PasswordForm } from "./password-form";

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await connection();
  const s = await requireAdmin({ allowPasswordChange: true });
  return (
    <div className="max-w-md">
      <PageTitle sub={`Signed in as ${s.username}.`}>Change password</PageTitle>
      {s.mustChangePassword && (
        <p className="rounded-lg bg-warn-soft text-warn px-3 py-2 mb-4 font-medium">
          First sign-in: please replace the initial password before using the portal.
        </p>
      )}
      <PasswordForm />
    </div>
  );
}
