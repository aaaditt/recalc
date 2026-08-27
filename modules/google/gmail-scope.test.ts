import { describe, expect, it } from 'vitest';

import {
  DRIVE_FILE_SCOPE,
  FORBIDDEN_SCOPES,
  GMAIL_READONLY_SCOPE,
  GMAIL_SCOPES,
  authorizeUrl,
  scopesFor,
} from '@/modules/google';

// THE hard constraint of slice 14, the same shape as drive-scope.test.ts is for
// slice 09.
//
//   prompts/14-email-connect.md: "Read-only. The app never sends, replies to,
//   deletes, or labels anything."
//
// The way to keep a promise like that is to be unable to break it. Everything
// Gmail offers beyond reading — gmail.modify (labels, archiving), gmail.send,
// gmail.compose, mail.google.com (deleting) — is on FORBIDDEN_SCOPES, and this
// is the test that says no when a later slice finds one of them convenient.
//
// Pure: no network, no database, no Google account. It reads the URL this app
// would send a browser to.

const CREDENTIALS = {
  clientId: '1234567890-example.apps.googleusercontent.com',
  clientSecret: 'not-a-real-secret',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};

function scopesIn(url: string): string[] {
  return (new URL(url).searchParams.get('scope') ?? '').split(' ').filter(Boolean);
}

describe('the Gmail connect flow asks for gmail.readonly and nothing else', () => {
  it('requests exactly one scope', () => {
    expect([...GMAIL_SCOPES]).toEqual([GMAIL_READONLY_SCOPE]);
    expect(scopesIn(authorizeUrl(CREDENTIALS, 'state-123', GMAIL_SCOPES))).toEqual([
      GMAIL_READONLY_SCOPE,
    ]);
  });

  it('never asks for a scope that could send, label or delete', () => {
    const asked = scopesIn(authorizeUrl(CREDENTIALS, 'state-123', GMAIL_SCOPES));
    for (const forbidden of FORBIDDEN_SCOPES) {
      expect(asked).not.toContain(forbidden);
    }
    // Not by prefix either: gmail.readonly must not be a stem of a wider grant.
    expect(asked.every((scope) => scope === GMAIL_READONLY_SCOPE)).toBe(true);
  });

  it('lists every write scope Gmail offers as forbidden', () => {
    for (const scope of [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://mail.google.com/',
    ]) {
      expect(FORBIDDEN_SCOPES).toContain(scope);
    }
  });

  it('keeps the two features on separate scopes, and one connect flow', () => {
    // Slice 09's URL is untouched by slice 14 — Drive still asks for drive.file
    // alone, and Gmail for gmail.readonly alone. `include_granted_scopes=true`
    // is what makes the second one ADD to the first on the same Google account
    // instead of replacing it, which is why there is one google_accounts row.
    expect(scopesFor('drive')).toEqual([DRIVE_FILE_SCOPE]);
    expect(scopesFor('gmail')).toEqual([GMAIL_READONLY_SCOPE]);

    const url = new URL(authorizeUrl(CREDENTIALS, 'state-123', GMAIL_SCOPES));
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });
});
