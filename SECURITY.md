# Security policy

Tributary handles email credentials, so security reports are very welcome.

**Please report vulnerabilities privately** through [GitHub's private advisory form](https://github.com/PyMite6941/tributary/security/advisories/new), not as public issues. Include steps to reproduce and the affected version. You'll get a response as soon as possible, and fixes ship as a new release.

## What's in scope

- Credential storage (`electron/store.cjs`: OS-keystore encryption of app passwords and refresh tokens)
- The OAuth flow (`electron/oauth.cjs`: PKCE, state check, loopback redirect)
- Rendering untrusted email HTML (`src/Reader.jsx`: sandboxed iframe with no scripts and a per-message CSP)
- The IPC surface between the UI and the main process (`electron/preload.cjs`, `electron/main.cjs`)
- TLS handling (certificate checks are skipped **only** for loopback hosts, for Proton Mail Bridge)

## Design notes

- There is no Tributary server. Mail goes directly between your computer and your providers.
- No telemetry or analytics.
- Message bodies are fetched on demand and are not written to disk. Only sender, subject, date and flags for recent inbox mail are cached locally.
