import type { GoogleFetch } from './oauth';

// "Which Google account is this?", asked with a scope we already have.
//
// The Drive answer lives in drive.ts (`about.get`), and needs drive.file. A
// Gmail-only connection has no Drive scope at all, so it asks Gmail instead:
// `users.getProfile` returns the address and is covered by gmail.readonly.
//
// This is one read-only GET, and it is here rather than in modules/gmail
// because modules/google owns `google_accounts` — including the fact of which
// address a row is. modules/gmail depends on modules/google for a token; if
// modules/google depended back on modules/gmail for an address, the two would
// import each other in a circle.

const PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

/**
 * The connected mailbox's own address.
 *
 * Nothing about a message is read here, and nothing is logged: the only field
 * taken off the response is `emailAddress`.
 */
export async function getGmailAddress(
  accessToken: string,
  fetchImpl: GoogleFetch = fetch
): Promise<string> {
  const response = await fetchImpl(PROFILE_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`gmail profile: ${response.status}`);
  }

  const payload = (await response.json()) as { emailAddress?: unknown };
  const address = payload.emailAddress;
  if (typeof address !== 'string' || address === '') {
    throw new Error('gmail profile: Google did not say which account this is');
  }
  return address;
}
