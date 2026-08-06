/**
 * Firebase Cloud Messaging (HTTP v1) sender for the Workers runtime.
 *
 * Auth is a Google service account (Firebase → Project settings → Service
 * accounts → Generate new private key). Its JSON is stored whole in the
 * FCM_SERVICE_ACCOUNT env secret. We mint a short-lived OAuth token by signing
 * a JWT with the account's RSA private key (RS256 via WebCrypto), cache it in
 * the isolate until it nears expiry, then POST notifications to FCM.
 *
 * FCM itself is free and unlimited — the only cost is a Firebase project.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Decode a PEM PKCS#8 private key into an importable ArrayBuffer. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Cache the access token across requests in the same isolate.
let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error(`FCM token error: ${data.error ?? res.status}`);
  cachedToken = { value: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

export interface PushMessage { title: string; body: string; }

/**
 * Send one notification to many device tokens. Returns the list of tokens FCM
 * reported as permanently invalid (UNREGISTERED / not-found) so the caller can
 * prune them. Never throws — push is best-effort.
 */
export async function sendPush(
  serviceAccountJson: string, tokens: string[], msg: PushMessage,
  data: Record<string, string> = {},
): Promise<{ dead: string[] }> {
  const dead: string[] = [];
  if (!tokens.length) return { dead };
  let sa: ServiceAccount;
  try { sa = JSON.parse(serviceAccountJson) as ServiceAccount; } catch { return { dead }; }

  let accessToken: string;
  try { accessToken = await getAccessToken(sa); } catch { return { dead }; }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  await Promise.all(tokens.map(async token => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data,
            android: { priority: 'high', notification: { channel_id: 'chat', sound: 'default' } },
          },
        }),
      });
      if (res.status === 404 || res.status === 400) {
        const err = await res.json().catch(() => ({})) as { error?: { status?: string } };
        if (err.error?.status === 'UNREGISTERED' || err.error?.status === 'NOT_FOUND' || res.status === 404) dead.push(token);
      }
    } catch { /* transient — leave the token in place */ }
  }));
  return { dead };
}
