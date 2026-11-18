// OAuth 2.0 for desktop apps: authorization code + PKCE, redirected to a one-shot loopback server.
// The system browser handles the sign-in, so this app never sees the account password.
//
// Client IDs ("sign-in keys") come from a local .env file and can be switched per provider; see keys.cjs.
// Google "Desktop app" clients ship a secret that Google itself documents as not confidential.
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const { createKeyStore } = require('./keys.cjs');

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

const NAMES = { google: 'Google', microsoft: 'Microsoft' };

let store = null;
function keys() {
  if (!store) {
    store = createKeyStore({
      userDir: app.getPath('userData'),
      devDir: app.isPackaged ? null : app.getAppPath(),
      builtInFile: path.join(app.getAppPath(), 'oauth.config.json'),
    });
    store.migrateLegacy(path.join(app.getPath('userData'), 'oauth.config.json'));
  }
  return store;
}

function missingKey(message) {
  const e = new Error(message);
  e.reauth = true; // only a new sign-in (with a key that exists) can fix this
  e.userMessage = message;
  return e;
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
    err.status = res.status;
    // invalid_grant = the refresh token was revoked, expired, or the password changed. Only a new sign-in fixes it.
    err.reauth = json.error === 'invalid_grant';
    err.code = json.error;
    throw err;
  }
  return json;
}

// Opens the browser, waits for the redirect, exchanges the code with the provider's *active* key.
// Resolves { email, refreshToken, accessToken, expiresAt, keyId }.
function signIn(provider) {
  const p = PROVIDERS[provider];
  const client = keys().active(provider);
  if (!client) {
    return Promise.reject(new Error(`No ${NAMES[provider]} sign-in key yet. Add one in Settings → Sign-in keys.`));
  }
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
        keys().record(client.id, 'signIn');
        finish(null, {
          keyId: client.id,
          email,
          refreshToken: tok.refresh_token,
          accessToken: tok.access_token,
          expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('Token exchange failed. Check the app for details.'));
        if (e.status) keys().record(client.id, 'error', e);
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

// Refreshes through the key the inbox signed in with (keyId). Inboxes saved before keys existed have no keyId;
// they use the active key and the caller binds them to it.
async function refresh(provider, refreshToken, keyId) {
  const p = PROVIDERS[provider];
  const client = keyId ? keys().get(keyId) : keys().active(provider);
  if (!client) {
    throw missingKey(
      keyId
        ? `The ${NAMES[provider]} sign-in key this inbox used is no longer in your .env file. Sign in again to use the active key.`
        : `No ${NAMES[provider]} sign-in key is set up. Add one in Settings → Sign-in keys, then sign in again.`
    );
  }
  let tok;
  try {
    tok = await postForm(p.tokenUrl, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: client.clientId,
      ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
      ...(provider === 'microsoft' ? { scope: p.scope } : {}),
    });
  } catch (e) {
    if (e.status) keys().record(client.id, 'error', e); // network failures aren't the key's fault
    // The provider doesn't accept the key itself (deleted, disabled, wrong secret). Retrying can't fix that.
    if (/invalid_client|unauthorized_client|client was not found|client_secret/i.test(e.message) || e.code === 'invalid_client') {
      e.reauth = true;
      e.userMessage = `${NAMES[provider]} rejected the sign-in key “${client.label}” (${e.message}). Fix it in Settings → Sign-in keys, or pick another key and sign in again.`;
    }
    throw e;
  }
  keys().record(client.id, 'refresh');
  return {
    keyId: client.id,
    accessToken: tok.access_token,
    // Microsoft rotates refresh tokens; Google usually doesn't return a new one.
    refreshToken: tok.refresh_token || refreshToken,
    expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
  };
}

function configured() {
  return { google: !!keys().active('google'), microsoft: !!keys().active('microsoft') };
}

module.exports = { signIn, refresh, configured, keys };
