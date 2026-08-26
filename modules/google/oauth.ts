import { DRIVE_SCOPES, GoogleReconnectRequired } from './schema';

// Google's OAuth 2.0 endpoints, over plain fetch.
//
// docs/DECISIONS.md records why there is no `googleapis` SDK here: it is a very
// large dependency for four HTTP calls, and CLAUDE.md asks for boring, minimal
// code. Everything below is a documented REST endpoint.
//
// Nothing in this file reads the environment. The client id and secret are
// passed in by the service, which reads them once — that keeps this file a pure
// HTTP wrapper that a test can call with fake credentials.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the OAuth client, exactly. */
  redirectUri: string;
};

/**
 * Where to send the browser to ask for Drive access.
 *
 * `access_type=offline` plus `prompt=consent` is the only combination that
 * reliably returns a refresh token — without them Google hands back an access
 * token that dies in an hour and the connection is useless the next morning.
 *
 * `include_granted_scopes=true` means slice 14 can add gmail.readonly to the
 * same Google account without losing drive.file, which is the whole reason
 * google_accounts is one shared table.
 */
export function authorizeUrl(
  credentials: GoogleCredentials,
  state: string,
  scopes: readonly string[] = DRIVE_SCOPES
): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', credentials.clientId);
  url.searchParams.set('redirect_uri', credentials.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

export type TokenResponse = {
  accessToken: string;
  /** Absent on a refresh — Google only sends it when consent is granted. */
  refreshToken: string | null;
  /** Exactly what Google granted, which is not always what was asked for. */
  scopes: string[];
  expiresInSeconds: number;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Google returned something that is not JSON. Fall through to the error
    // below with the raw body, which is more useful than a parse failure.
  }

  if (!response.ok) {
    const code = typeof payload.error === 'string' ? payload.error : '';
    // invalid_grant is what a revoked, expired or already-used token looks
    // like. It is the one error retrying cannot fix.
    if (code === 'invalid_grant') throw new GoogleReconnectRequired();
    throw new Error(
      `google oauth: ${response.status} ${code || text.slice(0, 200)}`
    );
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string') {
    throw new Error('google oauth: no access token in the response');
  }

  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
    expiresInSeconds: typeof payload.expires_in === 'number' ? payload.expires_in : 3600,
  };
}

/** Swap the one-time code from the callback for tokens. */
export async function exchangeCode(
  credentials: GoogleCredentials,
  code: string
): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      grant_type: 'authorization_code',
    })
  );
}

/** A fresh access token from the stored refresh token. Good for about an hour. */
export async function refreshAccessToken(
  credentials: Pick<GoogleCredentials, 'clientId' | 'clientSecret'>,
  refreshToken: string
): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token',
    })
  );
}

/**
 * Tell Google to forget the grant.
 *
 * Best effort: disconnecting locally must succeed even if Google is down or the
 * token was already revoked, otherwise "disconnect" is a button that sometimes
 * does nothing and gives no way out.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Already gone, or unreachable. Either way the local row is being deleted.
  }
}
