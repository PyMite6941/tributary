// Removing Tributary cleanly: which files are ours, and where to revoke access a mailbox still grants.
// No Electron imports, so it's unit-tested (test/erase.test.cjs).
const fs = require('node:fs');
const path = require('node:path');

// Every file Tributary writes in its data folder. Erase removes exactly these (and their .tmp siblings),
// never "everything in the folder": TRIBUTARY_USER_DATA can point at a folder that holds other things.
const OWNED_FILES = ['accounts.json', 'rules.json', 'settings.json', '.env', 'oauth-keys.json', 'oauth.config.json', 'oauth.config.json.migrated'];
// Message caches are cache/<accountId>.json. On Windows "cache" is the same folder as Chromium's "Cache"
// (names are case-insensitive), so only our .json files go; the folder itself is left to Chromium.
const CACHE_DIR = 'cache';

function eraseOwnedFiles(dir) {
  const removed = [];
  for (const name of OWNED_FILES) {
    for (const f of [name, `${name}.tmp`]) {
      const p = path.join(dir, f);
      try {
        fs.unlinkSync(p);
        removed.push(f);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  }
  const cache = path.join(dir, CACHE_DIR);
  let entries = [];
  try {
    entries = fs.readdirSync(cache, { withFileTypes: true });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  for (const ent of entries) {
    if (!ent.isFile() || !/\.json(\.tmp)?$/.test(ent.name)) continue;
    fs.unlinkSync(path.join(cache, ent.name));
    removed.push(`${CACHE_DIR}/${ent.name}`);
  }
  try {
    fs.rmdirSync(cache); // only succeeds when empty, i.e. not shared with Chromium
  } catch {}
  return removed;
}

// After an inbox is removed, the mailbox may still let Tributary in: a Microsoft sign-in can't be revoked
// by the app, and an app password stays valid until you delete it. Google sign-ins are revoked automatically.
const PAGES = {
  googleAccess: 'https://myaccount.google.com/connections',
  googleAppPasswords: 'https://myaccount.google.com/apppasswords',
  microsoftAccess: 'https://account.live.com/consent/Manage',
  yahoo: 'https://login.yahoo.com/account/security',
  apple: 'https://account.apple.com/account/manage',
  aol: 'https://login.aol.com/account/security',
};

function accessHint(account, revoked = false) {
  const { provider, authType, oauthProvider } = account;
  if (authType === 'oauth') {
    if (oauthProvider === 'google') {
      return revoked ? null : { text: "Google didn't confirm the sign-in was revoked. Remove Tributary from your Google account's connected apps.", url: PAGES.googleAccess };
    }
    return { text: 'Microsoft keeps the sign-in until you remove it. Remove Tributary from the apps that can access your account.', url: PAGES.microsoftAccess };
  }
  const page = { gmail: PAGES.googleAppPasswords, yahoo: PAGES.yahoo, icloud: PAGES.apple, aol: PAGES.aol }[provider];
  if (page) return { text: "The app password still works until you delete it. Delete the one you made for Tributary.", url: page };
  if (provider === 'proton') return { text: 'If you no longer use Proton Mail Bridge, you can remove it too.', url: null };
  return { text: "If you made an app password for Tributary, delete it in your mail provider's security settings.", url: null };
}

module.exports = { eraseOwnedFiles, accessHint, OWNED_FILES };
