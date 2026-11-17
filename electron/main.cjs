const path = require('node:path');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, nativeImage } = require('electron');
const store = require('./store.cjs');
const providers = require('./providers.cjs');
const oauth = require('./oauth.cjs');
const { evaluate } = require('./rules.cjs');
const { AccountSession, testConnection } = require('./mail.cjs');

const DEV_URL = process.env.VITE_DEV_URL;
// TRIBUTARY_DEMO=1 shows sample data instead of real accounts (for screenshots / demos).
// TRIBUTARY_SHOT=<file.png> captures the window once it has rendered, then quits.
const DEMO = !!process.env.TRIBUTARY_DEMO;
const SHOT = process.env.TRIBUTARY_SHOT;
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

app.setAppUserModelId('dev.pymite.tributary'); // required for Windows toast notifications

let win = null;
let tray = null;
let quitting = false;
let accounts = [];
let rules = [];
let settings = {};
const sessions = new Map(); // accountId -> AccountSession
const tokenCache = new Map(); // accountId -> { accessToken, expiresAt }

// ---------- auth ----------

function authGetter(account) {
  return async () => {
    const secret = store.decrypt(account.secret);
    if (account.authType !== 'oauth') return { user: account.user, pass: secret };
    let t = tokenCache.get(account.id);
    if (!t || t.expiresAt - Date.now() < 5 * 60_000) {
      t = await oauth.refresh(account.oauthProvider, secret);
      tokenCache.set(account.id, t);
      if (t.refreshToken !== secret) {
        account.secret = store.encrypt(t.refreshToken);
        store.saveAccounts(accounts);
      }
    }
    return { user: account.user, accessToken: t.accessToken };
  };
}

// ---------- sessions ----------

const persistTimers = new Map();
function persist(session) {
  clearTimeout(persistTimers.get(session.account.id));
  persistTimers.set(
    session.account.id,
    setTimeout(() => store.saveCache(session.account.id, session.snapshot()), 1000)
  );
}

function startSession(account) {
  const s = new AccountSession(account, authGetter(account), store.loadCache(account.id), settings.messagesPerAccount);
  s.on('status', () => broadcast());
  // The server rejected our access token: drop it so the next attempt forces a refresh.
  s.on('auth-failed', () => tokenCache.delete(account.id));
  s.on('status', ({ status }) => status === 'reauth' && notifyReauth(account));
  s.on('changed', (added) => {
    persist(s);
    handleNewMail(s, added);
    broadcast();
  });
  sessions.set(account.id, s);
  s.start();
}

async function stopSession(id) {
  const s = sessions.get(id);
  sessions.delete(id);
  if (s) await s.stop();
}

function handleNewMail(session, added) {
  for (const msg of added) {
    const r = evaluate(msg, rules);
    if (r.markRead && !msg.seen) session.setSeen(msg.uid, true).catch(() => {});
    if ((r.notify || (settings.notifyAllNew && !r.hide)) && !msg.seen) notify(msg, r);
  }
}

const reauthNotified = new Set();
function notifyReauth(account) {
  if (reauthNotified.has(account.id) || !Notification.isSupported()) return;
  reauthNotified.add(account.id);
  const n = new Notification({ title: 'Tributary needs you to sign in again', body: account.email, icon: ICON });
  n.on('click', () => {
    showWindow();
    win?.webContents.send('ui:settings');
  });
  n.show();
}

function notify(msg, r) {
  if (!Notification.isSupported()) return;
  const sender = msg.from.name || msg.from.address;
  const n = new Notification({
    title: r.views.length ? `${sender} · ${r.views[0]}` : sender,
    body: msg.subject,
    icon: ICON,
    silent: false,
  });
  n.on('click', () => {
    showWindow();
    win?.webContents.send('mail:open', msg.key);
  });
  n.show();
}

// ---------- state sent to the renderer ----------

function publicAccount(a) {
  const s = sessions.get(a.id);
  const { secret, ...rest } = a; // the encrypted secret never crosses into the renderer
  return { ...rest, status: s?.status || 'offline', error: s?.error || null };
}

function buildState() {
  const messages = [];
  for (const s of sessions.values()) {
    for (const m of s.messages.values()) messages.push({ ...m, ...evaluate(m, rules) });
  }
  messages.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { accounts: accounts.map(publicAccount), rules, settings, messages };
}

let broadcastTimer = null;
function broadcast() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    const state = buildState();
    win?.webContents.send('state', state);
    const unread = state.messages.filter((m) => !m.seen && !m.hide).length;
    win?.setTitle(unread ? `Tributary (${unread})` : 'Tributary');
    tray?.setToolTip(unread ? `Tributary — ${unread} unread` : 'Tributary');
  }, 120);
}

// ---------- window + tray ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    title: 'Tributary',
    icon: ICON,
    backgroundColor: '#0d1015',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#9aa4b2', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Screenshot mode renders offscreen: a hidden or occluded window never paints, so capturePage would hang.
      ...(SHOT ? { offscreen: true } : {}),
    },
    ...(SHOT ? { show: false } : {}),
  });

  // Links clicked in an email open in the real browser; nothing navigates the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });

  win.on('close', (e) => {
    if (!quitting && settings.minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });

  const query = DEMO ? { demo: '1', ...(process.env.TRIBUTARY_DEMO_VIEW ? { view: process.env.TRIBUTARY_DEMO_VIEW } : {}) } : {};
  if (DEV_URL) win.loadURL(DEV_URL + (DEMO ? `?${new URLSearchParams(query)}` : ''));
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });

  if (SHOT) {
    // Offscreen windows deliver frames through 'paint'. Once the UI has settled, force a fresh frame and save it.
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message));
    win.webContents.once('did-finish-load', () => {
      win.webContents.insertCSS('*,*::before,*::after{animation:none!important;transition:none!important}');
      setTimeout(() => {
        win.webContents.once('paint', (_e, _dirty, image) => {
          require('node:fs').writeFileSync(SHOT, image.toPNG());
          quitting = true;
          app.exit(0);
        });
        win.webContents.invalidate();
      }, 3000);
    });
  }
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Tributary');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Tributary', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', showWindow);
}

// ---------- IPC ----------

function sessionFor(key) {
  const i = key.lastIndexOf(':');
  const s = sessions.get(key.slice(0, i));
  if (!s) throw new Error('Account not found');
  return [s, Number(key.slice(i + 1))];
}

function handle(channel, fn) {
  // Errors are returned as values so the renderer gets a readable message instead of Electron's wrapper.
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  });
}

function registerIpc() {
  handle('state:get', () => buildState());
  handle('providers:list', () => ({ providers, oauth: oauth.configured() }));

  handle('account:test', async (draft) =>
    testConnection({
      host: draft.host,
      port: Number(draft.port),
      secure: !!draft.secure,
      auth: { user: draft.user, pass: draft.password },
    })
  );

  handle('account:add', async (draft) => {
    const preset = providers.find((p) => p.id === draft.provider) || providers.at(-1);
    let account;
    if (draft.authType === 'oauth') {
      const result = await oauth.signIn(preset.oauth);
      if (!result.refreshToken) throw new Error('The provider did not return a refresh token.');
      if (!result.email) throw new Error('The provider did not say which address you signed in with.');
      account = {
        email: result.email,
        user: result.email,
        authType: 'oauth',
        oauthProvider: preset.oauth,
        secret: store.encrypt(result.refreshToken),
        _token: { accessToken: result.accessToken, expiresAt: result.expiresAt },
      };
    } else {
      const t = await testConnection({
        host: draft.host,
        port: Number(draft.port),
        secure: !!draft.secure,
        auth: { user: draft.user, pass: draft.password },
      });
      if (!t.ok) throw new Error(t.error);
      account = { email: draft.email || draft.user, user: draft.user, authType: 'password', secret: store.encrypt(draft.password) };
    }
    if (accounts.some((a) => a.email.toLowerCase() === account.email.toLowerCase())) {
      throw new Error(`${account.email} is already added`);
    }
    Object.assign(account, {
      id: crypto.randomUUID(),
      provider: preset.id,
      label: draft.label || '',
      color: draft.color || pickColor(),
      host: draft.host || preset.host,
      port: Number(draft.port || preset.port),
      secure: draft.secure ?? preset.secure,
      archive: preset.archive || null,
    });
    // Reuse the access token from sign-in so the first connection doesn't need an extra refresh.
    if (account._token) tokenCache.set(account.id, account._token);
    delete account._token;
    accounts.push(account);
    store.saveAccounts(accounts);
    startSession(account);
    broadcast();
    return publicAccount(account);
  });

  handle('account:update', async (id, patch) => {
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new Error('Account not found');
    for (const k of ['label', 'color']) if (k in patch) a[k] = patch[k];
    store.saveAccounts(accounts);
    broadcast();
  });

  handle('account:remove', async (id) => {
    await stopSession(id);
    accounts = accounts.filter((a) => a.id !== id);
    tokenCache.delete(id);
    store.saveAccounts(accounts);
    store.dropCache(id);
    broadcast();
  });

  // Fix an account whose sign-in expired or whose app password changed, keeping its cache, color and rules.
  handle('account:reauth', async (id, draft = {}) => {
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new Error('Account not found');
    if (a.authType === 'oauth') {
      const result = await oauth.signIn(a.oauthProvider);
      if (result.email && result.email.toLowerCase() !== a.email.toLowerCase()) {
        throw new Error(`You signed in as ${result.email}, but this inbox is ${a.email}. Sign in with ${a.email}.`);
      }
      if (!result.refreshToken) throw new Error('The provider did not return a refresh token.');
      a.secret = store.encrypt(result.refreshToken);
      tokenCache.set(a.id, { accessToken: result.accessToken, expiresAt: result.expiresAt });
    } else {
      if (!draft.password) throw new Error('Enter the new app password.');
      const t = await testConnection({ host: a.host, port: a.port, secure: a.secure, auth: { user: a.user, pass: draft.password } });
      if (!t.ok) throw new Error(t.error);
      a.secret = store.encrypt(draft.password);
    }
    store.saveAccounts(accounts);
    reauthNotified.delete(a.id);
    await stopSession(a.id);
    startSession(a);
    broadcast();
  });

  handle('oauth:getConfig', () => ({ ...oauth.userConfig(), builtIn: oauth.builtInProviders() }));
  handle('oauth:saveConfig', (cfg) => oauth.saveConfig(cfg));

  handle('account:reconnect', async (id) => {
    await stopSession(id);
    const a = accounts.find((x) => x.id === id);
    if (a) startSession(a);
  });

  handle('rules:save', async (next) => {
    rules = next;
    store.saveRules(rules);
    broadcast();
  });

  handle('settings:save', async (next) => {
    const limitChanged = next.messagesPerAccount !== settings.messagesPerAccount;
    settings = { ...settings, ...next };
    store.saveSettings(settings);
    if (limitChanged) for (const s of sessions.values()) s.limit = settings.messagesPerAccount;
    broadcast();
  });

  handle('mail:body', async (key) => {
    const [s, uid] = sessionFor(key);
    return s.getBody(uid);
  });
  handle('mail:seen', async (key, seen) => {
    const [s, uid] = sessionFor(key);
    await s.setSeen(uid, seen);
  });
  handle('mail:flag', async (key, flagged) => {
    const [s, uid] = sessionFor(key);
    await s.setFlagged(uid, flagged);
  });
  handle('mail:move', async (key, kind) => {
    const [s, uid] = sessionFor(key);
    await s.move(uid, kind);
  });
  handle('open:external', async (url) => {
    if (/^https:\/\//i.test(url)) await shell.openExternal(url);
  });
}

const PALETTE = ['#4f8cff', '#2bb39a', '#e0a33a', '#d6587a', '#9a6bff', '#47b4d6', '#e2734a', '#7cb342'];
function pickColor() {
  return PALETTE[accounts.length % PALETTE.length];
}

// ---------- lifecycle ----------

if (!SHOT && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    accounts = store.loadAccounts();
    rules = store.loadRules();
    settings = store.loadSettings();
    registerIpc();
    createWindow();
    if (!SHOT) createTray();
    if (!DEMO) accounts.forEach(startSession);
  });
  app.on('before-quit', () => {
    quitting = true;
    for (const s of sessions.values()) store.saveCache(s.account.id, s.snapshot());
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !settings.minimizeToTray) app.quit();
  });
  app.on('activate', showWindow);
}
