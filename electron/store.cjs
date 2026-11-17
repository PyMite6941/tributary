// Local persistence. Everything lives in Electron's userData folder; nothing leaves the machine.
// Secrets (IMAP passwords, OAuth refresh tokens) are encrypted with safeStorage, which is
// DPAPI on Windows / Keychain on macOS / libsecret on Linux. They are never sent to the renderer.
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const dir = () => app.getPath('userData');
const file = (name) => path.join(dir(), name);

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

// Write-then-rename so a crash mid-write can't leave a truncated config behind.
function writeJson(name, data) {
  fs.mkdirSync(path.dirname(file(name)), { recursive: true });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
}

function encrypt(plain) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is unavailable; refusing to store the password in plain text.');
  }
  return safeStorage.encryptString(plain).toString('base64');
}

function decrypt(b64) {
  return safeStorage.decryptString(Buffer.from(b64, 'base64'));
}

const DEFAULT_SETTINGS = {
  notifyAllNew: false,      // notify on every new mail, not only rule matches
  blockRemoteImages: true,  // tracking pixels stay off until you ask
  messagesPerAccount: 300,  // how much INBOX history to cache per account
  minimizeToTray: true,
};

module.exports = {
  // accounts.json holds public fields + an encrypted `secret` blob.
  loadAccounts: () => readJson('accounts.json', []),
  saveAccounts: (accounts) => writeJson('accounts.json', accounts),
  loadRules: () => readJson('rules.json', []),
  saveRules: (rules) => writeJson('rules.json', rules),
  loadSettings: () => ({ ...DEFAULT_SETTINGS, ...readJson('settings.json', {}) }),
  saveSettings: (s) => writeJson('settings.json', { ...DEFAULT_SETTINGS, ...s }),
  loadCache: (accountId) => readJson(path.join('cache', `${accountId}.json`), { messages: [] }),
  saveCache: (accountId, data) => writeJson(path.join('cache', `${accountId}.json`), data),
  dropCache: (accountId) => fs.rmSync(file(path.join('cache', `${accountId}.json`)), { force: true }),
  encrypt,
  decrypt,
};
