import { describe, expect, it } from 'vitest';

import {
  DRIVE_FILE_SCOPE,
  DRIVE_SCOPES,
  FORBIDDEN_SCOPES,
  authorizeUrl,
} from '@/modules/google';

// THE hard constraint of slice 09.
//
//   prompts/09-drive.md: "drive.file only. Never drive.readonly or drive.
//   Those are restricted scopes, they grant access to my entire Drive, and we
//   do not need them."
//
//   docs/SCHEMA.md: "Because drive.file is non-sensitive and per-file, Drive
//   lands before email in the build order."
//
// It is not a preference and it is not a comment — it is the reason this slice
// comes ninth instead of fifteenth, and the reason connecting Drive does not
// need a Google security assessment. If a later slice widens the scope to make
// something easier, this test is what says no.
//
// Pure: no network, no database, no credentials. It reads the URL this app
// would send a browser to.

const CREDENTIALS = {
  clientId: '1234567890-example.apps.googleusercontent.com',
  clientSecret: 'not-a-real-secret',
  redirectUri: 'http://localhost:3000/api/auth/google/callback',
};

function scopesIn(url: string): string[] {
  return (new URL(url).searchParams.get('scope') ?? '').split(' ').filter(Boolean);
}

describe('the connect flow asks for drive.file and nothing else', () => {
  it('requests exactly one scope', () => {
    expect([...DRIVE_SCOPES]).toEqual([DRIVE_FILE_SCOPE]);
    expect(scopesIn(authorizeUrl(CREDENTIALS, 'state-123'))).toEqual([DRIVE_FILE_SCOPE]);
  });

  it('never requests drive, drive.readonly or either metadata scope', () => {
    const url = authorizeUrl(CREDENTIALS, 'state-123');

    for (const forbidden of FORBIDDEN_SCOPES) {
      expect(scopesIn(url), forbidden).not.toContain(forbidden);
    }
    // Also not as a substring anywhere in the URL — a scope smuggled into
    // another parameter would still be granted.
    expect(url).not.toContain('drive.readonly');
    expect(url).not.toContain('drive.metadata');
  });

  it('drive.file is not one of the forbidden ones, so the list above means something', () => {
    expect(FORBIDDEN_SCOPES).not.toContain(DRIVE_FILE_SCOPE);
    // The two restricted scopes the docs name by name are both on the list.
    expect(FORBIDDEN_SCOPES).toContain('https://www.googleapis.com/auth/drive');
    expect(FORBIDDEN_SCOPES).toContain('https://www.googleapis.com/auth/drive.readonly');
  });
});

describe('the rest of the authorize URL', () => {
  it('asks for offline access with consent, or there is no refresh token', () => {
    const url = new URL(authorizeUrl(CREDENTIALS, 'state-123'));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('keeps scopes already granted, so slice 14 can add Gmail to the same account', () => {
    expect(
      new URL(authorizeUrl(CREDENTIALS, 'state-123')).searchParams.get(
        'include_granted_scopes'
      )
    ).toBe('true');
  });

  it('carries the state and the exact redirect URI it was given', () => {
    const url = new URL(authorizeUrl(CREDENTIALS, 'state-123'));

    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('redirect_uri')).toBe(CREDENTIALS.redirectUri);
    expect(url.searchParams.get('client_id')).toBe(CREDENTIALS.clientId);
  });

  it('never puts the client secret in a URL the browser will follow', () => {
    expect(authorizeUrl(CREDENTIALS, 'state-123')).not.toContain(CREDENTIALS.clientSecret);
  });
});
