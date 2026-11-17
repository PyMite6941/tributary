// OAuth 2.0 for desktop apps: authorization code + PKCE, redirected to a one-shot loopback server.
// The system browser handles the sign-in, so this app never sees the account password.
//
// Client IDs come from oauth.config.json (gitignored), looked up in userData first, then the app folder:
//   { "google": { "clientId": "...", "clientSecret": "..." }, "microsoft": { "clientId": "..." } }
// Google "Desktop app" clients ship a secret that Google itself documents as not confidential.
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://mail.google.com/ openid email',
    redirectHost: '127.0.0.1',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access openid email',
    // Entra ID matches "http://localhost" registrations on any port.
    redirectHost: 'localhost',
    extraAuthParams: { prompt: 'select_account' },
  },
};

function loadConfig() {
  for (const p of [
    path.join(app.getPath('userData'), 'oauth.config.json'),
    path.join(app.getAppPath(), 'oauth.config.json'),
  ]) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
  }
  return {};
}

function clientFor(provider) {
  const c = loadConfig()[provider];
  if (!c?.clientId) {
    throw new Error(
      `No ${provider} OAuth client configured. Add it to oauth.config.json (see README → "OAuth setup").`
    );
  }
  return c;
}

const b64url = (buf) => buf.toString('base64url');

function decodeJwtPayload(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `Token endpoint returned ${res.status}`);
    // invalid_grant = the refresh token was revoked, expired, or the password changed. Only a new sign-in fixes it.
    err.reauth = json.error === 'invalid_grant';
    throw err;
  }
  return json;
}

// Opens the browser, waits for the redirect, exchanges the code. Resolves { email, refreshToken, accessToken, expiresAt }.
function signIn(provider) {
  const p = PROVIDERS[provider];
  const client = clientFor(provider);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    let redirectUri;
    const timeout = setTimeout(() => finish(new Error('Sign-in timed out after 5 minutes.')), 5 * 60_000);

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const page = (msg) =>
        `<!doctype html><meta charset="utf-8"><title>Tributary</title>` +
        `<body style="font:16px system-ui;background:#0e1116;color:#e6e9ef;display:grid;place-items:center;height:100vh">` +
        `<p>${msg}</p></body>`;

      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(page('State mismatch. Close this tab and try again.'));
        return finish(new Error('OAuth state mismatch.'));
      }
      const err = url.searchParams.get('error');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(page('Sign-in was cancelled. You can close this tab.'));
        return finish(new Error(url.searchParams.get('error_description') || err));
      }
      try {
        const tok = await postForm(p.tokenUrl, {
          grant_type: 'authorization_code',
          code: url.searchParams.get('code'),
          redirect_uri: redirectUri,
          client_id: client.clientId,
          ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
          code_verifier: verifier,
        });
        const claims = decodeJwtPayload(tok.id_token || '');
        const email = claims.email || claims.preferred_username || '';
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Signed in. You can close this tab and go back to Tributary.'));
        finish(null, {
          email,
          refreshToken: tok.refresh_token,
          accessToken: tok.access_token,
          expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('Token exchange failed. Check the app for details.'));
        finish(e);
      }
    });

    function finish(err, value) {
      clearTimeout(timeout);
      server.close();
      err ? reject(err) : resolve(value);
    }

    // Port 0: the OS picks a free port. Bound to loopback only.
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://${p.redirectHost}:${server.address().port}/callback`;
      const params = new URLSearchParams({
        client_id: client.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: p.scope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...p.extraAuthParams,
      });
      shell.openExternal(`${p.authUrl}?${params}`);
    });
    server.on('error', finish);
  });
}

async function refresh(provider, refreshToken) {
  const p = PROVIDERS[provider];
  const client = clientFor(provider);
  const tok = await postForm(p.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    ...(provider === 'microsoft' ? { scope: p.scope } : {}),
  });
  return {
    accessToken: tok.access_token,
    // Microsoft rotates refresh tokens; Google usually doesn't return a new one.
    refreshToken: tok.refresh_token || refreshToken,
    expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
  };
}

// Settings -> Sign-in providers writes here, so nobody has to hand-edit JSON.
function saveConfig(next) {
  const file = path.join(app.getPath('userData'), 'oauth.config.json');
  const clean = {};
  for (const k of ['google', 'microsoft']) {
    const c = next[k] || {};
    if (c.clientId?.trim()) {
      clean[k] = { clientId: c.clientId.trim(), ...(c.clientSecret?.trim() ? { clientSecret: c.clientSecret.trim() } : {}) };
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clean, null, 2));
}

function configured() {
  const c = loadConfig();
  return { google: !!c.google?.clientId, microsoft: !!c.microsoft?.clientId };
}

module.exports = { signIn, refresh, configured, loadConfig, saveConfig };
