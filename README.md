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
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/PyMite6941/tributary/issues">Report a bug</a>
</p>

![Tributary](docs/assets/screenshot-reader.png)

**Contents:** [Get started](#get-started-in-2-minutes) · [Features](#features) · [Updating](#updating) · [Sign-in keys](#sign-in-keys-env) · [Privacy & credentials](#privacy--credentials) · [Uninstalling](#uninstalling) · [For developers](#for-developers)

## Get started in 2 minutes

1. **Download** the installer for your computer from [Releases](https://github.com/PyMite6941/tributary/releases/latest):

   | System | File |
   |---|---|
   | Windows 10/11 | `Tributary-Setup-x.y.z.exe` |
   | Mac with Apple silicon (M1 and later) | `Tributary-x.y.z-arm64.dmg` (experimental) |
   | Mac with Intel | `Tributary-x.y.z-x64.dmg` (experimental) |
   | Linux | `.AppImage` (any distro) or `.deb` (Debian/Ubuntu) (experimental) |

2. **Install it.** The builds aren't code-signed yet, so your system will warn you once:
   - **Windows:** on *"Windows protected your PC"*, click **More info → Run anyway**.
   - **macOS:** open the app once. When macOS blocks it, go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. If macOS says the app *"is damaged"*, run `xattr -dr com.apple.quarantine /Applications/Tributary.app` in Terminal, then open it.
   - **Linux:** `chmod +x Tributary-*.AppImage` and run it, or `sudo apt install ./Tributary-*.deb`.
3. **Add your inboxes.** Click **Add your first inbox** and pick your provider:

   | Provider | How you sign in |
   |---|---|
   | Gmail | **Sign in with Google**, or an [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification) |
   | Outlook / Hotmail / Live | **Sign in with Microsoft** (Microsoft no longer allows passwords for this) |
   | Yahoo · AOL · iCloud | An app password from your account's security page |
   | Proton Mail | Needs [Proton Mail Bridge](https://proton.me/mail/bridge) (paid Proton plan). Use the username and password Bridge shows you |
   | Anything else | Host, port and password: Fastmail, Zoho, school or work servers… |

   Step-by-step instructions with links for every provider: **[setup guide](https://pymite6941.github.io/tributary/setup.html)**.

   > *Sign in with Google / Microsoft* needs a **sign-in key**. Release builds can include one; if the button says sign-in isn't set up, use an app password for Gmail, or add your own key under **Settings → Sign-in keys** ([how](https://pymite6941.github.io/tributary/setup.html#oauth)). Outlook needs this step.
4. **Make it yours.** Click **Notify me** on an email to get a desktop alert whenever that sender writes. Open **Rules & filters** to sort mail into views like *College* or *Receipts*.

You stay signed in after that. Tributary refreshes sign-ins in the background. If a provider ever revokes access, the inbox shows *needs sign-in* with a **Sign in again** button instead of failing silently.

## Features

- **Unified inbox.** Every account in one list. A color stripe shows which inbox each email came from. New mail arrives within seconds (IMAP IDLE).
- **Rules across all accounts.** Match on sender, sender domain, recipient, subject or account using *contains / is / starts with / ends with / regex*. A rule can put mail in a sidebar view, notify you, mark it read, or keep it out of "All inboxes".
- **Priority senders.** One click turns on desktop notifications for a sender, whichever account they email.
- **Private by design.** No Tributary server, no account and no telemetry. The app talks directly to your providers. Passwords and sign-in tokens are encrypted with your OS keystore. Email HTML renders without scripts, and remote images (tracking pixels) are blocked until you allow them.
- **Your own sign-in keys.** Keep several Google/Microsoft keys in a local `.env`, attach plan, cost and limits, see usage, and auto-switch new sign-ins when one runs out ([details](#sign-in-keys-env)).
- **Start at sign-in and update notices.** Optionally starts with Windows or macOS, straight to the tray. Once a day it asks GitHub whether there's a new version (you can turn this off).
- **Easy to remove.** One click erases everything it stored and signs out of your providers ([details](#uninstalling)).
- **Keyboard shortcuts.** `j`/`k` move · `e` archive · `#` delete · `s` star · `u` unread · `/` search.

**Not yet:** writing or replying to email, folders other than the inbox, and searching inside message bodies. See [issues](https://github.com/PyMite6941/tributary/issues) for what's planned.

## Updating

When a new version is out, Tributary shows a banner (and **Settings → About → Check for updates** checks on demand). Download the new installer and run it over the old one. Your inboxes, rules, settings and sign-in keys are kept.

Tributary doesn't update itself: the builds aren't code-signed, so silently replacing the app would teach people to trust unsigned updates. The check only asks GitHub's public releases API for the latest version number; nothing about you or your mail is sent. Turn it off with *Tell me when a new version is out* in Settings.

## Sign-in keys (`.env`)

Google and Microsoft sign-in need a one-time app registration ([how-to](https://pymite6941.github.io/tributary/setup.html#oauth)). Each registration is a **sign-in key**. You can have several per provider and switch between them by usage.

Keys live in a `.env` file in Tributary's data folder (see [where](#uninstalling)). **Settings → Sign-in keys** edits it, and **Open .env** opens it for hand edits. Add a suffix for another key; subscription details use the same suffix:

```ini
GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-…
GOOGLE_CLIENT_LABEL="Main project"
GOOGLE_CLIENT_PLAN="Google Cloud free tier"
GOOGLE_CLIENT_DAILY_LIMIT=1000          # requests/day before auto-switch skips it
GOOGLE_CLIENT_MONTHLY_LIMIT=25000
GOOGLE_CLIENT_RENEWS=2027-01-31         # shows a countdown, warns 7 days out
GOOGLE_CLIENT_COST="$0"
GOOGLE_CLIENT_OWNER="personal Google account"
GOOGLE_CLIENT_NOTES="Testing mode: 100-user cap"

GOOGLE_CLIENT_ID_2=5678-def.apps.googleusercontent.com
GOOGLE_CLIENT_LABEL_2=Backup
MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
```

- **Usage** per key (sign-ins, token refreshes, errors, rate limits) is counted for today, this month and the last 30 days, and shown against the key's limits.
- **Switching:** pick the key new sign-ins use. Turn on **Auto-switch at limits** to move new sign-ins to the next key with room when the picked one hits its daily or monthly limit or was rate-limited in the last hour.
- **Each inbox stays on the key it signed in with.** A refresh token only works with the client ID that issued it, so switching never breaks connected inboxes. Use *Sign in again* on an inbox to move it to the selected key. A key that's still in use can't be removed. If one disappears from `.env` or the provider rejects it, its inboxes ask you to sign in again instead of retrying.
- Limits count the requests Tributary makes with the key (about one refresh per inbox per hour). Providers count reading and syncing mail against each mailbox, not the key.

Keys can also come from:

- **Release builds:** repo secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `MICROSOFT_CLIENT_ID` are baked in by the release workflow (`scripts/write-oauth-config.mjs`) and appear as the *built-in* key. You can attach subscription details to it, but you can't remove it.
- **Running from a checkout:** a `.env` in the project root (gitignored) is read too, read-only.

IDs saved by 0.1.0 (*Settings → Sign-in providers*) move into `.env` automatically on first run.

These are public-client IDs. Desktop apps can't keep secrets, and Google documents its desktop-app "secret" as non-confidential. Security comes from PKCE and the loopback redirect.

## Privacy & credentials

- Sign-in stores the provider's **refresh token**, or the app password, encrypted with Electron `safeStorage` (Windows DPAPI / macOS Keychain / Linux libsecret), in `accounts.json` in the data folder. There are no cookies and your real account password is never stored.
- Access tokens live in memory only and refresh 5 minutes before they expire. Microsoft's rotated refresh tokens are re-encrypted and saved.
- When the server rejects an access token, it is dropped and refreshed once. If the refresh returns `invalid_grant`, an app password is rejected, or a fresh token is rejected again, the session **stops** in a `reauth` state. It doesn't loop on bad credentials, which can lock accounts. The UI then shows a banner, one notification, and *Sign in again* / *new app password* in Settings. Covered by `test/session-auth.test.cjs` against a fake IMAP server.
- Message bodies are fetched when you open them and never written to disk. Only sender, subject, date and flags of recent inbox mail are cached.
- `.env` (sign-in keys) is plain text in your user profile (owner-only file permissions on macOS/Linux). It holds client IDs and Google's non-confidential desktop secrets, nothing that can read your mail on its own.
- The only network traffic besides your mail providers is the optional daily update check to `api.github.com`, and revoking Google sign-ins when you remove an inbox.

**Proton Mail Bridge** serves IMAP on `127.0.0.1:1143` with STARTTLS and a self-signed certificate. Tributary skips certificate verification **only** for loopback hosts (`127.0.0.1`, `localhost`, `::1`). Every remote server must present a valid certificate. If Bridge isn't running, the inbox reports *"Is Proton Mail Bridge running?"* and keeps retrying, so it reconnects on its own once Bridge starts.

Found a security problem? Please report it privately: see [SECURITY.md](SECURITY.md).

## Uninstalling

Your email stays with your providers; removing Tributary never deletes any mail.

- **Windows:** **Settings → Apps → Installed apps → Tributary → Uninstall**, or *Uninstall Tributary…* in Tributary's own Settings. The uninstaller asks whether to delete your data too (silent `/S` uninstalls keep it) and always removes the start-at-login entry.
- **macOS / Linux:** in Tributary, **Settings → Remove Tributary → Erase all data**, then drag the app from Applications to the Trash, run `sudo apt remove tributary`, or delete the `.AppImage`.

**Erase all data** signs out of every inbox, revokes Google sign-ins, turns off start at login, deletes your saved passwords and sign-in tokens, rules, cached mail, settings and sign-in keys, and closes Tributary. Microsoft sign-ins and app passwords can't be revoked by the app, so it links to the page where you remove them. Removing a single inbox does the same for that inbox.

To delete your data by hand, remove this folder:

| System | Data folder |
|---|---|
| Windows | `%APPDATA%\Tributary` |
| macOS | `~/Library/Application Support/Tributary` |
| Linux | `~/.config/Tributary` |

---

## For developers

Needs Node 22+.

```bash
git clone https://github.com/PyMite6941/tributary.git
cd tributary
npm install
npm run dev          # Vite + Electron with hot reload
npm test             # node:test suites in test/
npm start            # build the UI once and run Electron
npm run dist         # build an installer for your OS into release/
npm run preview:web  # the UI in a browser with demo data
```

`npm test` covers the rules engine, sign-in failure handling against a fake IMAP server, the sign-in key store, the update check and erase.

### Environment variables

| Variable | Effect |
|---|---|
| `TRIBUTARY_USER_DATA=<folder>` | Run on a separate profile (accounts, keys, `.env`), so testing never touches your real data |
| `TRIBUTARY_DEMO=1` | Sample inboxes and mail instead of real accounts |
| `TRIBUTARY_DEMO_VIEW=<view>` | Open on a view: `rules`, `account`, `settings`, `keys`; with demo data also `reader`, `update`, `erased` |
| `TRIBUTARY_SHOT=<file.png>` | Render offscreen, save a screenshot, quit |

Screenshots in `docs/assets/` come from the real app with demo data:

```powershell
$env:TRIBUTARY_DEMO=1; $env:TRIBUTARY_DEMO_VIEW='reader'
$env:TRIBUTARY_SHOT="$PWD\docs\assets\screenshot-reader.png"; npm start
```

Offscreen captures show the first rendered frame, so a view has to be on screen when it loads; scrolling or clicking afterwards isn't captured.

### Releasing

1. Add the release notes to [CHANGELOG.md](CHANGELOG.md).
2. Bump the version and push the tag. GitHub Actions builds Windows, macOS (Apple silicon + Intel) and Linux installers and attaches them to the release:

   ```bash
   npm version minor     # or patch; bumps package.json and creates the tag
   git push --follow-tags
   ```

To rebuild one platform for an existing release (e.g. a runner failed), run the **Release** workflow by hand with the tag and `os` set to `windows`, `macos` or `ubuntu`. Assets are uploaded with `--clobber`, so re-runs replace them.

### Layout

```
electron/
  main.cjs       window, tray, notifications, IPC, account lifecycle, start at login
  preload.cjs    the only bridge the UI gets (contextIsolation + sandbox)
  mail.cjs       AccountSession: IMAP connect / IDLE / sync / body fetch / flags / move
  rules.cjs      pure rules engine
  oauth.cjs      PKCE + loopback redirect for Google and Microsoft; token refresh and revoke
  keys.cjs       sign-in keys: .env parsing/editing, usage, active key, auto-switch
  updates.cjs    daily GitHub release check
  erase.cjs      which files are ours; where to revoke access after removing an inbox
  store.cjs      JSON persistence in userData; secrets via safeStorage
  providers.cjs  IMAP presets
src/             React UI (Vite). demo.js is a fake backend for browser preview and screenshots.
test/            node:test suites
build/           app icon and installer.nsh (uninstaller extras)
docs/            GitHub Pages site (landing + setup guide)
scripts/         dev launcher, icon generator, CI sign-in key writer
.github/         CI, release workflow, issue templates
```

## License

[MIT](LICENSE)
