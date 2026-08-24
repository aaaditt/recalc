import { sendMagicLink } from './actions';

// Bare on purpose — the design system arrives in slice 02.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4">
      <h1 className="text-20 font-semibold">Recalc</h1>

      {sent ? (
        <p>Check your email for a sign-in link.</p>
      ) : (
        <form action={sendMagicLink} className="flex flex-col gap-2">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="border px-2 py-1"
          />
          <button type="submit" className="border px-2 py-1">
            Send magic link
          </button>
        </form>
      )}

      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
