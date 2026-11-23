const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { eraseOwnedFiles, accessHint } = require('../electron/erase.cjs');

test('erase removes only the files Tributary owns', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trib-erase-'));
  try {
    for (const f of ['accounts.json', 'rules.json', 'settings.json', '.env', 'oauth-keys.json', 'settings.json.tmp']) fs.writeFileSync(path.join(dir, f), '{}');
    fs.mkdirSync(path.join(dir, 'cache'));
    fs.writeFileSync(path.join(dir, 'cache', 'a1.json'), '{}');
    // Not ours: must survive (e.g. TRIBUTARY_USER_DATA pointed at a folder with other things in it).
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    // Chromium's data in the same folder (one folder on Windows, where names are case-insensitive).
    fs.mkdirSync(path.join(dir, 'cache', 'Cache_Data'));
    fs.writeFileSync(path.join(dir, 'cache', 'Cache_Data', 'index'), 'x');
    const removed = eraseOwnedFiles(dir);
    assert.ok(removed.includes('.env') && removed.includes('cache/a1.json') && removed.includes('settings.json.tmp'));
    assert.ok(fs.existsSync(path.join(dir, 'cache', 'Cache_Data', 'index')), "Chromium's files are left alone");
    const left = fs.readdirSync(dir).sort();
    assert.ok(left.includes('notes.txt'));
    for (const f of ['accounts.json', 'rules.json', 'settings.json', '.env', 'oauth-keys.json', 'settings.json.tmp']) assert.ok(!left.includes(f), f);
    assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep me');
    assert.deepEqual(eraseOwnedFiles(dir), []); // second run: nothing left
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('access hints point to the right place per provider', () => {
  assert.equal(accessHint({ authType: 'oauth', oauthProvider: 'google' }, true), null);
  assert.match(accessHint({ authType: 'oauth', oauthProvider: 'google' }, false).url, /google\.com/);
  assert.match(accessHint({ authType: 'oauth', oauthProvider: 'microsoft' }).url, /account\.live\.com/);
  assert.match(accessHint({ authType: 'password', provider: 'gmail' }).url, /apppasswords/);
  assert.match(accessHint({ authType: 'password', provider: 'yahoo' }).url, /yahoo/);
  assert.equal(accessHint({ authType: 'password', provider: 'custom' }).url, null);
});
