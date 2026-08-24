import { createClient } from '@/lib/supabase/server';

// Bare on purpose — the real Today page is slice 03.
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-sm py-16">
      <h1 className="text-20 font-semibold">Hello</h1>
      <p>Signed in as {user?.email}</p>
    </main>
  );
}
