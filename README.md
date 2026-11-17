<p align="center">
  <img src="docs/assets/icon.png" width="88" alt="" />
</p>

<h1 align="center">Tributary</h1>

<p align="center"><b>Every inbox, one stream.</b><br/>
A free desktop app that puts Gmail, Outlook, Yahoo, iCloud, AOL, Proton and any IMAP inbox in one place, with filters that span every account and notifications only for the senders you choose.</p>

<p align="center">
  <a href="https://github.com/PyMite6941/tributary/releases/latest"><b>Download</b></a> ·
  <a href="https://pymite6941.github.io/tributary/">Website</a> ·
  <a href="https://pymite6941.github.io/tributary/setup.html">Setup guide</a> ·
  <a href="https://github.com/PyMite6941/tributary/issues">Report a bug</a>
</p>

![Tributary](docs/assets/screenshot-reader.png)

## Get started in 2 minutes

1. **Download** the installer from [Releases](https://github.com/PyMite6941/tributary/releases/latest):
   - Windows: `Tributary-Setup-x.y.z.exe`
   - macOS: `.dmg` (experimental)
   - Linux: `.AppImage` or `.deb` (experimental)
2. **Install it.** The builds aren't code-signed yet, so Windows may show *"Windows protected your PC"*. Click **More info → Run anyway**. On macOS, right-click the app and choose **Open** the first time.
3. **Add your inboxes.** Click **Add your first inbox** and pick your provider:

   | Provider | How you sign in |
   |---|---|
   | Gmail | **Sign in with Google**, or an [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification) |
   | Outlook / Hotmail / Live | **Sign in with Microsoft** (Microsoft no longer allows passwords for this) |
   | Yahoo · AOL · iCloud | An app password from your account's security page |
   | Proton Mail | Needs [Proton Mail Bridge](https://proton.me/mail/bridge) (paid Proton plan). Use the username and password Bridge shows you |
   | Anything else | Host, port and password: Fastmail, Zoho, school or work servers… |

   Step-by-step instructions with links for every provider: **[setup guide](https://pymite6941.github.io/tributary/setup.html)**.

   > *Sign in with Google / Microsoft* works in release builds that include sign-in IDs. If the button says sign-in isn't set up, use an app password for Gmail, or add IDs under **Settings → Sign-in providers** ([how](https://pymite6941.github.io/tributary/setup.html#oauth)). Outlook needs this step.
4. **Make it yours.** Click **Notify me** on an email to get a desktop alert whenever that sender writes. Open **Rules & filters** to sort mail into views like *College* or *Receipts*.

You stay signed in after that. Tributary refreshes sign-ins in the background. If a provider ever revokes access, the inbox shows *needs sign-in* with a **Sign in again** button instead of failing silently.

## Features

- **Unified inbox.** Every account in one list. A color stripe shows which inbox each email came from. New mail arrives within seconds (IMAP IDLE).
- **Rules across all accounts.** Match on sender, sender domain, recipient, subject or account using *contains / is / starts with / ends with / regex*. A rule can put mail in a sidebar view, notify you, mark it read, or keep it out of "All inboxes".
- **Priority senders.** One click turns on desktop notifications for a sender, whichever account they email.
- **Private by design.** No Tributary server, no account and no telemetry. The app talks directly to your providers. Passwords and sign-in tokens are encrypted with your OS keystore. Email HTML renders without scripts, and remote images (tracking pixels) are blocked until you allow them.
- **Keyboard shortcuts.** `j`/`k` move · `e` archive · `#` delete · `s` star · `u` unread · `/` search.

**Not yet:** writing or replying to email, folders other than the inbox, and searching inside message bodies. See [issues](https://github.com/PyMite6941/tributary/issues) for what's planned.

---

## For developers

```bash
git clone https://github.com/PyMite6941/tributary.git
cd tributary
npm install
npm run dev          # Vite + Electron with hot reload
npm test             # rules engine + sign-in failure tests
npm run dist         # build an installer for your OS into release/
npm run preview:web  # the UI in a browser with demo data
```

### Releasing

Push a version tag and GitHub Actions builds Windows, macOS and Linux installers and attaches them to the release:

```bash
npm version patch     # bumps package.json and creates the tag
git push --follow-tags
```

### Browser sign-in (OAuth) client IDs

Google and Microsoft sign-in need a one-time app registration ([how-to](https://pymite6941.github.io/tributary/setup.html#oauth)). There are three ways to supply the IDs:

- **Release builds:** add repo secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `MICROSOFT_CLIENT_ID`. The release workflow bakes them in (`scripts/write-oauth-config.mjs`), so users get one-click sign-in.
- **Per user:** Settings → Sign-in providers. These override the built-in IDs for that provider.
- **Local dev:** `oauth.config.json` in the project root (gitignored):
  ```json
  { "microsoft": { "clientId": "…" }, "google": { "clientId": "…apps.googleusercontent.com", "clientSecret": "GOCSPX-…" } }
  ```

These are public-client IDs. Desktop apps can't keep secrets, and Google documents its desktop-app "secret" as non-confidential. Security comes from PKCE and the loopback redirect.

### How credentials are kept

- Sign-in stores the provider's **refresh token**, or the app password, encrypted with Electron `safeStorage` (DPAPI / Keychain / libsecret), in `userData/accounts.json`. There are no cookies and no account passwords.
- Access tokens live in memory only and refresh 5 minutes before they expire. Microsoft's rotated refresh tokens are re-encrypted and saved.
- When the server rejects an access token, it is dropped and refreshed once. If the refresh returns `invalid_grant`, an app password is rejected, or a fresh token is rejected again, the session **stops** in a `reauth` state. It doesn't loop on bad credentials, which can lock accounts. The UI then shows a banner, one notification, and *Sign in again* / *new app password* in Settings. Covered by `test/session-auth.test.cjs` against a fake IMAP server.

### Proton Mail Bridge

Bridge serves IMAP on `127.0.0.1:1143` with STARTTLS and a self-signed certificate. Tributary skips certificate verification **only** for loopback hosts (`127.0.0.1`, `localhost`, `::1`). Every remote server must present a valid certificate. If Bridge isn't running, the inbox reports *"Is Proton Mail Bridge running?"* and keeps retrying, so it reconnects on its own once Bridge starts.

### Layout

```
electron/
  main.cjs       window, tray, notifications, IPC, account lifecycle
  preload.cjs    the only bridge the UI gets (contextIsolation + sandbox)
  mail.cjs       AccountSession: IMAP connect / IDLE / sync / body fetch / flags / move
  rules.cjs      pure rules engine
  oauth.cjs      PKCE + loopback redirect for Google and Microsoft
  store.cjs      JSON persistence in userData; secrets via safeStorage
  providers.cjs  IMAP presets
src/             React UI (Vite). demo.js is a fake backend for browser preview and screenshots.
docs/            GitHub Pages site (landing + setup guide)
scripts/         dev launcher, icon generator, CI OAuth config writer
.github/         CI, release workflow, issue templates
```

Screenshots in `docs/assets/` are generated from the real app with demo data:

```powershell
$env:TRIBUTARY_DEMO=1; $env:TRIBUTARY_DEMO_VIEW='reader'   # reader | rules | account | settings
$env:TRIBUTARY_SHOT="$PWD\docs\assets\screenshot-reader.png"; npm start
```

## License

[MIT](LICENSE)
