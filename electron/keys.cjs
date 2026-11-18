// Sign-in keys: the OAuth client IDs used for "Sign in with Google / Microsoft".
//
// Where keys come from (a client ID found in several places is listed once, first source wins):
//   1. <userData>/.env           yours, kept on this computer; Settings → Sign-in keys edits it
//   2. <project>/.env            only when running from a checkout (npm run dev / npm start); read-only here
//   3. oauth.config.json in app  baked into release builds by CI (scripts/write-oauth-config.mjs)
//
// .env format. Any suffix after the name makes another key (GOOGLE_CLIENT_ID_2, MICROSOFT_CLIENT_ID_WORK, …):
//   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
//   GOOGLE_CLIENT_SECRET=GOCSPX-…
//   GOOGLE_CLIENT_LABEL=Main project
//   MICROSOFT_CLIENT_ID_2=00000000-0000-0000-0000-000000000000
//
// Subscription details can be attached to any key, with the same suffix:
//   GOOGLE_CLIENT_PLAN="Google Cloud free tier"   GOOGLE_CLIENT_DAILY_LIMIT=10000   GOOGLE_CLIENT_MONTHLY_LIMIT=250000
//   GOOGLE_CLIENT_RENEWS=2027-01-31               GOOGLE_CLIENT_COST="$0/mo"        GOOGLE_CLIENT_OWNER=me@example.com
//   GOOGLE_CLIENT_NOTES="Testing mode, 100-user cap"
// Limits count requests this app sends with the key (sign-ins + token refreshes). Mail traffic itself is
// counted by the provider against each mailbox, not against the key. Keys from read-only sources (project .env,
// built-in) keep their attached details in oauth-keys.json instead.
//
// Auto-switch (per provider, off by default): when the chosen key is at a limit or was rate-limited in the last
// hour, new sign-ins use the next key that still has room.
//
// A refresh token only works with the client ID that issued it, so every inbox remembers the key it signed in
// with (account.oauthKeyId) and keeps refreshing through that key. The *active* key only decides which key new
// sign-ins (and "Sign in again") use. That is how you move inboxes from a busy key to a quieter one.
//
// Usage per key (sign-ins, token refreshes, errors, rate limits, per day) is kept in <userData>/oauth-keys.json.
// No Electron imports, so this file is unit-tested directly (test/keys.test.cjs).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROVIDERS = ['google', 'microsoft'];
const VAR = /^(GOOGLE|MICROSOFT)_CLIENT_(ID|SECRET|LABEL|PLAN|DAILY_LIMIT|MONTHLY_LIMIT|RENEWS|COST|OWNER|NOTES)(?:_([A-Za-z0-9]+))?$/;
const FIELD = {
  ID: 'clientId',
  SECRET: 'clientSecret',
  LABEL: 'label',
  PLAN: 'plan',
  DAILY_LIMIT: 'dailyLimit',
  MONTHLY_LIMIT: 'monthlyLimit',
  RENEWS: 'renews',
  COST: 'cost',
  OWNER: 'owner',
  NOTES: 'notes',
};
const VAR_FOR = Object.fromEntries(Object.entries(FIELD).map(([v, f]) => [f, v]));
// Everything attached to a key besides its ID and secret.
const DETAILS = ['label', 'plan', 'dailyLimit', 'monthlyLimit', 'renews', 'cost', 'owner', 'notes'];
const KEEP_DAYS = 62; // covers the current calendar month and the 30 days before today
const RATE_LIMIT_COOLDOWN = 60 * 60_000;

const ENV_HEADER = `# Tributary sign-in keys (OAuth client IDs). This file stays on this computer.
# Add more keys with any suffix: GOOGLE_CLIENT_ID_2, GOOGLE_CLIENT_SECRET_2, GOOGLE_CLIENT_LABEL_2, ...
# Choose which key new sign-ins use in Settings -> Sign-in keys.
# How to create keys: https://pymite6941.github.io/tributary/setup.html#oauth
#
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_CLIENT_LABEL=
# GOOGLE_CLIENT_PLAN=
# GOOGLE_CLIENT_DAILY_LIMIT=
# GOOGLE_CLIENT_MONTHLY_LIMIT=
# GOOGLE_CLIENT_RENEWS=YYYY-MM-DD
# GOOGLE_CLIENT_COST=
# GOOGLE_CLIENT_OWNER=
# GOOGLE_CLIENT_NOTES=
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_LABEL=
`;

function parseEnv(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.endsWith(v[0])) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out.push([m[1], v]);
  }
  return out;
}

const envLine = (name, value) => `${name}=${/[\s#'"=]/.test(value) ? `"${value.replace(/"/g, '')}"` : value}`;
const varName = (provider, field, slot) => `${provider.toUpperCase()}_CLIENT_${field}${slot ? `_${slot}` : ''}`;
const keyId = (provider, clientId) => `${provider}-${crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 10)}`;

function groupEnv(entries, source) {
  const slots = new Map();
  for (const [name, value] of entries) {
    const m = name.match(VAR);
    if (!m) continue;
    const provider = m[1].toLowerCase();
    const slot = m[3] || '';
    const k = `${provider}:${slot}`;
    if (!slots.has(k)) slots.set(k, { provider, slot, source });
    slots.get(k)[FIELD[m[2]]] = value;
  }
  return [...slots.values()].filter((s) => s.clientId);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Token endpoints answer 429 or name the quota/rate limit in the error text.
const isRateLimit = (err) => err?.status === 429 || /rate.?limit|quota|too many requests|throttl/i.test(err?.message || '');

// Cleans user-entered subscription details. Empty string = "not set".
function cleanDetails(d = {}) {
  const out = {};
  for (const f of DETAILS) {
    if (!(f in d)) continue;
    let v = d[f] == null ? '' : String(d[f]).replace(/["\r\n]/g, '').trim();
    if ((f === 'dailyLimit' || f === 'monthlyLimit') && v !== '') {
      v = v.replace(/[,_\s]/g, '');
      if (!/^\d+$/.test(v)) throw new Error(`${f === 'dailyLimit' ? 'Daily' : 'Monthly'} limit must be a whole number.`);
      v = String(Number(v));
    }
    if (f === 'renews' && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Renewal date must look like 2027-01-31.');
    out[f] = v;
  }
  return out;
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const emptyCounts = () => ({ signIns: 0, refreshes: 0, errors: 0 });
const requests = (c) => c.signIns + c.refreshes;
const FIELD_FOR = { signIn: 'signIns', refresh: 'refreshes', error: 'errors' };

function createKeyStore({ userDir, devDir = null, builtInFile = null, now = () => Date.now() }) {
  const envPath = path.join(userDir, '.env');
  const statePath = path.join(userDir, 'oauth-keys.json');

  const loadState = () => ({ active: {}, autoSwitch: {}, meta: {}, usage: {}, ...readJson(statePath, {}) });
  const saveState = (s) => writeAtomic(statePath, JSON.stringify(s, null, 2));

  function builtIns() {
    if (!builtInFile) return [];
    const cfg = readJson(builtInFile, {});
    return PROVIDERS.filter((p) => cfg[p]?.clientId).map((p) => ({
      provider: p,
      slot: null,
      clientId: cfg[p].clientId,
      clientSecret: cfg[p].clientSecret,
      label: 'Built-in',
      source: 'built-in',
    }));
  }

  function list() {
    const raw = [
      ...groupEnv(parseEnv(readText(envPath)), 'env'),
      ...(devDir ? groupEnv(parseEnv(readText(path.join(devDir, '.env'))), 'project') : []),
      ...builtIns(),
    ];
    const meta = loadState().meta;
    const seen = new Set();
    const keys = [];
    for (const k of raw) {
      const clientId = k.clientId.trim();
      const id = keyId(k.provider, clientId);
      if (seen.has(id)) continue;
      seen.add(id);
      const editable = k.source === 'env';
      const d = editable ? k : { ...k, ...meta[id] };
      keys.push({
        id,
        provider: k.provider,
        slot: k.slot,
        label: d.label || (k.slot ? `Key ${k.slot}` : 'Main key'),
        clientId,
        clientSecret: (k.clientSecret || '').trim(),
        source: k.source,
        editable,
        plan: d.plan || '',
        dailyLimit: num(d.dailyLimit),
        monthlyLimit: num(d.monthlyLimit),
        renews: d.renews || '',
        cost: d.cost || '',
        owner: d.owner || '',
        notes: d.notes || '',
      });
    }
    return keys;
  }

  const get = (id) => list().find((k) => k.id === id) || null;

  // The key you picked, or the first one available when nothing (or a since-removed key) was picked.
  function chosen(provider) {
    const keys = list().filter((k) => k.provider === provider);
    const id = loadState().active[provider];
    return keys.find((k) => k.id === id) || keys[0] || null;
  }

  // Why a key shouldn't take new sign-ins right now, or null if it has room.
  function exhausted(k, u = usage(k.id)) {
    if (k.dailyLimit != null && requests(u.today) >= k.dailyLimit) return 'daily limit reached';
    if (k.monthlyLimit != null && requests(u.month) >= k.monthlyLimit) return 'monthly limit reached';
    if (u.rateLimitedAt && now() - u.rateLimitedAt < RATE_LIMIT_COOLDOWN) return 'rate-limited in the last hour';
    return null;
  }

  // The key new sign-ins use: the picked one, unless auto-switch is on and it is exhausted; then the next key
  // (list order, wrapping) that still has room. If every key is exhausted, the picked one.
  function active(provider) {
    const pick = chosen(provider);
    if (!pick || !loadState().autoSwitch[provider] || !exhausted(pick)) return pick;
    const keys = list().filter((k) => k.provider === provider);
    const i = keys.findIndex((k) => k.id === pick.id);
    const order = [...keys.slice(i + 1), ...keys.slice(0, i)];
    return order.find((k) => !exhausted(k)) || pick;
  }

  function setAutoSwitch(provider, on) {
    const s = loadState();
    s.autoSwitch[provider] = !!on;
    saveState(s);
  }
  const autoSwitch = (provider) => !!loadState().autoSwitch[provider];

  function setActive(provider, id) {
    const k = get(id);
    if (!k || k.provider !== provider) throw new Error('That key no longer exists. Reload the list.');
    const s = loadState();
    s.active[provider] = id;
    saveState(s);
  }

  function ensureEnvFile() {
    if (!fs.existsSync(envPath)) writeAtomic(envPath, ENV_HEADER);
    return envPath;
  }

  function add(provider, { clientId = '', clientSecret = '', ...rest } = {}) {
    if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider: ${provider}`);
    clientId = String(clientId).trim();
    clientSecret = String(clientSecret).trim();
    const details = cleanDetails(rest);
    if (!clientId) throw new Error('Enter a client ID.');
    if (/\s/.test(clientId) || /\s/.test(clientSecret)) throw new Error('Client IDs and secrets cannot contain spaces.');
    const id = keyId(provider, clientId);
    const dup = get(id);
    if (dup) throw new Error(`That client ID is already added as “${dup.label}”.`);

    ensureEnvFile();
    const text = readText(envPath);
    const used = new Set(groupEnv(parseEnv(text), 'env').filter((k) => k.provider === provider).map((k) => k.slot));
    // Slot names already present in the file, including half-written ones without an ID, are never reused.
    for (const [name] of parseEnv(text)) {
      const m = name.match(VAR);
      if (m && m[1].toLowerCase() === provider) used.add(m[3] || '');
    }
    let slot = '';
    for (let n = 2; used.has(slot); n++) slot = String(n);

    const lines = [`# Added by Tributary ${localDay(now())}`, envLine(varName(provider, 'ID', slot), clientId)];
    if (clientSecret) lines.push(envLine(varName(provider, 'SECRET', slot), clientSecret));
    for (const f of DETAILS) if (details[f]) lines.push(envLine(varName(provider, VAR_FOR[f], slot), details[f]));
    const sep = text === '' || text.endsWith('\n') ? '' : '\n';
    writeAtomic(envPath, `${text}${sep}\n${lines.join('\n')}\n`);
    return id;
  }

  // Change what is attached to a key (label, plan, limits, renewal, cost, owner, notes).
  // .env keys are rewritten in place: changed lines replaced, emptied ones removed, new ones added under the key.
  function update(id, patch) {
    const k = get(id);
    if (!k) throw new Error('That key no longer exists. Reload the list.');
    const details = cleanDetails(patch);
    if (!k.editable) {
      const s = loadState();
      s.meta[id] = { ...s.meta[id], ...details };
      saveState(s);
      return;
    }
    const lines = readText(envPath).split(/\r?\n/);
    const slotField = (line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/)?.[1]?.match(VAR);
      return m && m[1].toLowerCase() === k.provider && (m[3] || '') === k.slot ? FIELD[m[2]] : null;
    };
    const pending = { ...details };
    const out = [];
    for (const line of lines) {
      const f = slotField(line);
      if (f && f in pending) {
        if (pending[f] !== '') out.push(envLine(varName(k.provider, VAR_FOR[f], k.slot), pending[f]));
        delete pending[f];
        continue;
      }
      out.push(line);
    }
    const extra = DETAILS.filter((f) => pending[f]).map((f) => envLine(varName(k.provider, VAR_FOR[f], k.slot), pending[f]));
    if (extra.length) {
      // Insert after the last line belonging to this key so its settings stay together.
      let at = -1;
      out.forEach((line, i) => {
        if (slotField(line)) at = i;
      });
      out.splice(at + 1, 0, ...extra);
    }
    writeAtomic(envPath, out.join('\n'));
  }

  function remove(id) {
    const k = get(id);
    if (!k) return;
    if (!k.editable) {
      throw new Error(k.source === 'built-in' ? 'The built-in key ships with the app and cannot be removed.' : 'This key comes from the project .env file. Remove it there.');
    }
    const lines = readText(envPath).split(/\r?\n/);
    const keep = [];
    for (const line of lines) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/)?.[1]?.match(VAR);
      if (m && m[1].toLowerCase() === k.provider && (m[3] || '') === k.slot) {
        // Also drop the "# Added by Tributary" marker written with it.
        if (keep.length && /^# Added by Tributary/.test(keep[keep.length - 1])) keep.pop();
        continue;
      }
      keep.push(line);
    }
    writeAtomic(envPath, keep.join('\n').replace(/\n{3,}/g, '\n\n'));
    const s = loadState();
    if (s.active[k.provider] === id) delete s.active[k.provider];
    delete s.meta[id];
    saveState(s);
  }

  // kind: 'signIn' | 'refresh' | 'error'
  function record(id, kind, err) {
    const field = FIELD_FOR[kind];
    if (!id || !field) return;
    const s = loadState();
    const u = (s.usage[id] ||= { total: emptyCounts(), days: {} });
    const t = now();
    const day = localDay(t);
    u.total[field]++;
    (u.days[day] ||= emptyCounts())[field]++;
    u.lastUsedAt = t;
    if (err) {
      u.lastError = String(err.message || err).slice(0, 300);
      u.lastErrorAt = t;
      if (isRateLimit(err)) u.rateLimitedAt = t;
    }
    const oldest = localDay(t - KEEP_DAYS * 86_400_000);
    for (const d of Object.keys(u.days)) if (d < oldest) delete u.days[d];
    saveState(s);
  }

  function usage(id) {
    const u = loadState().usage[id];
    const today = emptyCounts();
    const month = emptyCounts();
    const last30 = emptyCounts();
    if (!u) return { today, month, last30, total: emptyCounts(), lastUsedAt: null, lastError: null, lastErrorAt: null, rateLimitedAt: null };
    const t = now();
    const todayKey = localDay(t);
    const monthKey = todayKey.slice(0, 7);
    const oldest = localDay(t - 29 * 86_400_000);
    for (const [d, c] of Object.entries(u.days)) {
      for (const f of Object.keys(last30)) {
        const n = c[f] || 0;
        if (d >= oldest) last30[f] += n;
        if (d.startsWith(monthKey)) month[f] += n;
        if (d === todayKey) today[f] += n;
      }
    }
    return {
      today,
      month,
      last30,
      total: { ...emptyCounts(), ...u.total },
      lastUsedAt: u.lastUsedAt || null,
      lastError: u.lastError || null,
      lastErrorAt: u.lastErrorAt || null,
      rateLimitedAt: u.rateLimitedAt || null,
    };
  }

  // Earlier versions saved IDs from Settings to <userData>/oauth.config.json. Move them into .env once.
  function migrateLegacy(file) {
    if (!fs.existsSync(file)) return [];
    const cfg = readJson(file, null);
    const added = [];
    if (cfg) {
      for (const p of PROVIDERS) {
        const c = cfg[p];
        if (!c?.clientId || get(keyId(p, c.clientId.trim()))) continue;
        added.push(add(p, { label: 'From earlier settings', clientId: c.clientId, clientSecret: c.clientSecret || '' }));
      }
    }
    fs.renameSync(file, `${file}.migrated`);
    return added;
  }

  return {
    envPath,
    list,
    get,
    chosen,
    active,
    exhausted,
    setActive,
    autoSwitch,
    setAutoSwitch,
    add,
    update,
    remove,
    record,
    usage,
    ensureEnvFile,
    migrateLegacy,
  };
}

module.exports = { createKeyStore, parseEnv, keyId, isRateLimit, PROVIDERS };
