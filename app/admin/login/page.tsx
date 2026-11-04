import { LoginForm } from "./login-form";

export const metadata = { title: "Admin sign-in · Satsang Portal" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">Coordinator sign-in</h1>
      <p className="text-muted mb-6">For the batch coordinator only.</p>
      <LoginForm />
    </main>
  );
}
