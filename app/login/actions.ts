'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) redirect('/login?error=' + encodeURIComponent('Enter your email.'));

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000';
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) redirect('/login?error=' + encodeURIComponent(error.message));
  redirect('/login?sent=1');
}
