// CI helper: turns GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / MICROSOFT_CLIENT_ID env vars into
// oauth.config.json, which electron-builder packs into the app. Writes nothing if none are set.
// These are public-client IDs (desktop apps can't keep secrets; Google documents its desktop
// "secret" as non-confidential), so shipping them inside the installer is the intended model.
import { writeFileSync } from 'node:fs';

const cfg = {};
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID } = process.env;
if (GOOGLE_CLIENT_ID) cfg.google = { clientId: GOOGLE_CLIENT_ID, ...(GOOGLE_CLIENT_SECRET ? { clientSecret: GOOGLE_CLIENT_SECRET } : {}) };
if (MICROSOFT_CLIENT_ID) cfg.microsoft = { clientId: MICROSOFT_CLIENT_ID };

if (Object.keys(cfg).length) {
  writeFileSync('oauth.config.json', JSON.stringify(cfg, null, 2));
  console.log(`oauth.config.json written for: ${Object.keys(cfg).join(', ')}`);
} else {
  console.log('No OAuth secrets set; release will use app passwords (users can add client IDs in Settings).');
}
