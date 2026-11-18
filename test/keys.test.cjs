// Sign-in keys: .env parsing/editing, active-key switching, usage counting, limits and auto-switch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeyStore, parseEnv, keyId } = require('../electron/keys.cjs');

function setup({ env, dev, builtIn, at = '2026-11-18T10:00:00' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trib-keys-'));
  const userDir = path.join(root, 'user');
  const devDir = path.join(root, 'dev');
  fs.mkdirSync(userDir);
  fs.mkdirSync(devDir);
  if (env != null) fs.writeFileSync(path.join(userDir, '.env'), env);
  if (dev != null) fs.writeFileSync(path.join(devDir, '.env'), dev);
  const builtInFile = path.join(root, 'oauth.config.json');
  if (builtIn) fs.writeFileSync(builtInFile, JSON.stringify(builtIn));
  const clock = { t: new Date(at).getTime() };
  const ks = createKeyStore({ userDir, devDir, builtInFile, now: () => clock.t });
  const envText = () => fs.readFileSync(path.join(userDir, '.env'), 'utf8');
  return { ks, clock, envText, userDir };
}

test('parseEnv handles comments, quotes, export and inline comments', () => {
  const e = parseEnv('# c\nexport A=1\nB="two words"\nC=x # note\n D = y \nnot a line\n');
  assert.deepEqual(e, [['A', '1'], ['B', 'two words'], ['C', 'x'], ['D', 'y']]);
});

test('lists keys from .env, project .env and built-in; duplicates collapse to the first source', () => {
  const { ks } = setup({
    env: 'GOOGLE_CLIENT_ID=g1\nGOOGLE_CLIENT_SECRET=s1\nGOOGLE_CLIENT_LABEL="Main project"\nGOOGLE_CLIENT_ID_2=g2\nMICROSOFT_CLIENT_ID=m1\nGOOGLE_CLIENT_SECRET_9=orphan\n',
    dev: 'GOOGLE_CLIENT_ID=g3\nGOOGLE_CLIENT_ID_X=g1\n',
    builtIn: { google: { clientId: 'gb', clientSecret: 'sb' }, microsoft: { clientId: 'm1' } },
  });
  const keys = ks.list();
  assert.deepEqual(
    keys.map((k) => [k.provider, k.clientId, k.source, k.label]),
    [
      ['google', 'g1', 'env', 'Main project'],
      ['google', 'g2', 'env', 'Key 2'],
      ['microsoft', 'm1', 'env', 'Main key'],
      ['google', 'g3', 'project', 'Main key'],
      ['google', 'gb', 'built-in', 'Built-in'],
    ]
  );
  assert.equal(keys[0].clientSecret, 's1');
  assert.equal(keys[0].id, keyId('google', 'g1'));
});

test('active key defaults to the first, can be switched, and falls back when the chosen key disappears', () => {
  const { ks } = setup({ env: 'GOOGLE_CLIENT_ID=g1\nGOOGLE_CLIENT_ID_2=g2\n' });
  assert.equal(ks.active('google').clientId, 'g1');
  ks.setActive('google', keyId('google', 'g2'));
  assert.equal(ks.active('google').clientId, 'g2');
  ks.remove(keyId('google', 'g2'));
  assert.equal(ks.active('google').clientId, 'g1');
  assert.equal(ks.active('microsoft'), null);
  assert.throws(() => ks.setActive('microsoft', keyId('google', 'g1')), /no longer exists/);
});

test('add appends to .env without touching existing lines, picks a free slot, rejects duplicates', () => {
  const { ks, envText } = setup({ env: '# my notes\nOTHER_VAR=keep\nGOOGLE_CLIENT_ID=g1' });
  ks.add('google', { clientId: ' g2 ', clientSecret: 'sec', label: 'Backup', plan: 'Free tier', dailyLimit: '1,000' });
  const text = envText();
  assert.match(text, /^# my notes\nOTHER_VAR=keep\nGOOGLE_CLIENT_ID=g1\n/);
  assert.match(text, /GOOGLE_CLIENT_ID_2=g2\nGOOGLE_CLIENT_SECRET_2=sec\nGOOGLE_CLIENT_LABEL_2=Backup\nGOOGLE_CLIENT_PLAN_2="Free tier"\nGOOGLE_CLIENT_DAILY_LIMIT_2=1000\n/);
  const k = ks.get(keyId('google', 'g2'));
  assert.equal(k.label, 'Backup');
  assert.equal(k.plan, 'Free tier');
  assert.equal(k.dailyLimit, 1000);
  assert.throws(() => ks.add('google', { clientId: 'g2' }), /already added as “Backup”/);
  assert.throws(() => ks.add('google', { clientId: '' }), /Enter a client ID/);
  assert.throws(() => ks.add('google', { clientId: 'g9', dailyLimit: 'lots' }), /whole number/);
  assert.throws(() => ks.add('google', { clientId: 'g9', renews: 'next week' }), /2027-01-31/);
  ks.add('microsoft', { clientId: 'm1' });
  assert.match(envText(), /\nMICROSOFT_CLIENT_ID=m1\n/); // first microsoft key gets the unsuffixed slot
});

test('creating .env from scratch writes the documented header, and the file round-trips', () => {
  const { ks, envText } = setup();
  ks.add('google', { clientId: 'g1', notes: 'Testing mode, 100-user cap' });
  assert.match(envText(), /^# Tributary sign-in keys/);
  assert.equal(ks.list().length, 1);
  assert.equal(ks.list()[0].notes, 'Testing mode, 100-user cap');
});

test('update rewrites attached subscription details in place and keeps them with their key', () => {
  const { ks, envText } = setup({
    env: 'GOOGLE_CLIENT_ID=g1\nGOOGLE_CLIENT_PLAN=Old\nGOOGLE_CLIENT_COST=$5\n\nGOOGLE_CLIENT_ID_2=g2\n# tail comment\n',
  });
  ks.update(keyId('google', 'g1'), { plan: 'Pro', cost: '', renews: '2027-01-31', monthlyLimit: '50000' });
  const text = envText();
  assert.equal(
    text,
    'GOOGLE_CLIENT_ID=g1\nGOOGLE_CLIENT_PLAN=Pro\nGOOGLE_CLIENT_MONTHLY_LIMIT=50000\nGOOGLE_CLIENT_RENEWS=2027-01-31\n\nGOOGLE_CLIENT_ID_2=g2\n# tail comment\n'
  );
  const k = ks.get(keyId('google', 'g1'));
  assert.deepEqual([k.plan, k.cost, k.renews, k.monthlyLimit], ['Pro', '', '2027-01-31', 50000]);
  assert.equal(ks.get(keyId('google', 'g2')).plan, ''); // the other key is untouched
});

test('details on read-only keys (built-in) are stored beside usage, not in a file the app does not own', () => {
  const { ks, userDir } = setup({ builtIn: { google: { clientId: 'gb' } } });
  const id = keyId('google', 'gb');
  ks.update(id, { plan: 'Shipped with app', dailyLimit: '500', label: 'Release key' });
  assert.equal(ks.get(id).plan, 'Shipped with app');
  assert.equal(ks.get(id).label, 'Release key');
  assert.equal(fs.existsSync(path.join(userDir, '.env')), false);
  assert.throws(() => ks.remove(id), /built-in key/);
});

test('remove deletes only that key’s lines (and its marker), keeping everything else', () => {
  const { ks, envText } = setup({ env: 'A=1\nGOOGLE_CLIENT_ID=g1\n' });
  ks.add('google', { clientId: 'g2', label: 'Backup', plan: 'Paid' });
  ks.remove(keyId('google', 'g2'));
  assert.equal(envText().trimEnd(), 'A=1\nGOOGLE_CLIENT_ID=g1');
  assert.equal(ks.list().length, 1);
});

test('usage counts per day, month and 30 days; only token-endpoint answers count; old days are pruned', () => {
  const { ks, clock } = setup({ env: 'GOOGLE_CLIENT_ID=g1\n', at: '2026-11-01T09:00:00' });
  const id = keyId('google', 'g1');
  ks.record(id, 'signIn');
  ks.record(id, 'refresh');
  clock.t = new Date('2026-11-18T09:00:00').getTime();
  ks.record(id, 'refresh');
  ks.record(id, 'refresh');
  ks.record(id, 'error', Object.assign(new Error('invalid_client'), { status: 401 }));
  let u = ks.usage(id);
  assert.deepEqual(u.today, { signIns: 0, refreshes: 2, errors: 1 });
  assert.deepEqual(u.month, { signIns: 1, refreshes: 3, errors: 1 });
  assert.deepEqual(u.last30, { signIns: 1, refreshes: 3, errors: 1 });
  assert.equal(u.lastError, 'invalid_client');
  assert.equal(u.rateLimitedAt, null);

  clock.t = new Date('2026-12-02T09:00:00').getTime(); // new month: month resets, 30-day window still has Nov 18
  u = ks.usage(id);
  assert.deepEqual(u.month, { signIns: 0, refreshes: 0, errors: 0 });
  assert.deepEqual(u.last30, { signIns: 0, refreshes: 2, errors: 1 });
  assert.equal(u.total.refreshes, 3);

  clock.t = new Date('2027-03-01T09:00:00').getTime();
  ks.record(id, 'refresh'); // triggers pruning of days older than the retention window
  u = ks.usage(id);
  assert.deepEqual(u.last30, { signIns: 0, refreshes: 1, errors: 0 });
  assert.equal(u.total.refreshes, 4); // lifetime totals survive pruning
});

test('auto-switch moves new sign-ins off a key at its daily limit or rate-limited, and back when it recovers', () => {
  const { ks, clock } = setup({
    env: 'GOOGLE_CLIENT_ID=g1\nGOOGLE_CLIENT_DAILY_LIMIT=2\nGOOGLE_CLIENT_ID_2=g2\nGOOGLE_CLIENT_ID_3=g3\n',
  });
  const [g1, g2, g3] = ['g1', 'g2', 'g3'].map((c) => keyId('google', c));
  ks.record(g1, 'signIn');
  ks.record(g1, 'refresh');
  assert.equal(ks.exhausted(ks.get(g1)), 'daily limit reached');
  assert.equal(ks.active('google').id, g1, 'auto-switch is off by default');

  ks.setAutoSwitch('google', true);
  assert.equal(ks.active('google').id, g2);

  ks.record(g2, 'error', Object.assign(new Error('Too Many Requests'), { status: 429 }));
  assert.equal(ks.exhausted(ks.get(g2)), 'rate-limited in the last hour');
  assert.equal(ks.active('google').id, g3);

  ks.record(g3, 'error', new Error('Quota exceeded for quota metric'));
  assert.equal(ks.active('google').id, g1, 'everything exhausted: stay on the chosen key');

  clock.t += 2 * 60 * 60_000; // rate-limit cooldown over; g1 still at its daily limit
  assert.equal(ks.active('google').id, g2);
  assert.equal(ks.chosen('google').id, g1, 'auto-switch never changes what you picked');

  clock.t = new Date('2026-11-19T08:00:00').getTime(); // next day: g1 has room again
  assert.equal(ks.active('google').id, g1);
});

test('monthly limit counts sign-ins and refreshes across the calendar month', () => {
  const { ks, clock } = setup({ env: 'MICROSOFT_CLIENT_ID=m1\nMICROSOFT_CLIENT_MONTHLY_LIMIT=3\nMICROSOFT_CLIENT_ID_2=m2\n', at: '2026-11-02T10:00:00' });
  const m1 = keyId('microsoft', 'm1');
  ks.setAutoSwitch('microsoft', true);
  ks.record(m1, 'signIn');
  clock.t = new Date('2026-11-10T10:00:00').getTime();
  ks.record(m1, 'refresh');
  ks.record(m1, 'refresh');
  assert.equal(ks.active('microsoft').clientId, 'm2');
  clock.t = new Date('2026-12-01T10:00:00').getTime();
  assert.equal(ks.active('microsoft').clientId, 'm1');
});

test('legacy oauth.config.json from Settings is moved into .env once', () => {
  const { ks, userDir, envText } = setup({ env: 'GOOGLE_CLIENT_ID=g1\n' });
  const legacy = path.join(userDir, 'oauth.config.json');
  fs.writeFileSync(legacy, JSON.stringify({ google: { clientId: 'g1' }, microsoft: { clientId: 'm1' } }));
  ks.migrateLegacy(legacy);
  assert.equal(fs.existsSync(legacy), false);
  assert.equal(fs.existsSync(`${legacy}.migrated`), true);
  assert.match(envText(), /MICROSOFT_CLIENT_ID=m1\nMICROSOFT_CLIENT_LABEL="From earlier settings"/);
  assert.equal(ks.list().filter((k) => k.clientId === 'g1').length, 1, 'no duplicate of an existing key');
  ks.migrateLegacy(legacy); // second run is a no-op
  assert.equal(ks.list().length, 2);
});
