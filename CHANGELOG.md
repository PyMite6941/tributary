# Changelog

## 0.2.0

- **Sign-in keys in a local `.env`.** Google and Microsoft app keys live in `.env` in Tributary's data folder (`%APPDATA%\Tributary\.env` on Windows). You can keep several per provider.
- **Subscription details per key:** plan, cost, daily/monthly request limits, renewal date, billing owner and notes.
- **Usage per key** for today, this month and the last 30 days, shown against its limits, with recent errors and rate limits.
- **Switching:** pick the key new sign-ins use, or turn on *Auto-switch at limits*. Connected inboxes stay on the key they signed in with; *Sign in again* moves one.
- **Start at sign-in** (Windows/macOS installs), opening in the tray.
- **Update notices:** a daily check of GitHub's public releases, with a dismissible banner. Can be switched off.
- **About** section in Settings with the version, *Check for updates* and links.
- IDs saved by 0.1.0 under *Sign-in providers* move into `.env` automatically.
- Releases: macOS now ships both Apple silicon and Intel `.dmg`s; one platform can be rebuilt on its own.

## 0.1.0

First release: unified inbox for Gmail, Outlook, Yahoo, iCloud, AOL, Proton (via Bridge) and any IMAP server, with cross-account rules, priority senders, real-time IMAP IDLE, and blocked tracking pixels.
