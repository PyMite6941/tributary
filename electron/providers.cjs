// IMAP presets. Every provider here speaks IMAP; what differs is how you log in.
//   auth: 'password' -> an app password (the normal account password is rejected by all of these)
//   auth: 'oauth'    -> browser sign-in; needs a client ID in oauth.config.json (see README)
// `help` is shown in the Add Account dialog.
module.exports = [
  {
    id: 'gmail',
    name: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: 'password',
    oauth: 'google',
    archive: '[Gmail]/All Mail',
    help: 'Turn on 2-Step Verification, then create an app password at myaccount.google.com/apppasswords.',
    helpUrl: 'https://myaccount.google.com/apppasswords',
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail / Live',
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    // Microsoft switched off password (basic) auth for IMAP on consumer accounts in 2024.
    auth: 'oauth',
    oauth: 'microsoft',
    help: 'Microsoft only allows browser sign-in (OAuth) for IMAP now.',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    host: 'imap.mail.yahoo.com',
    port: 993,
    secure: true,
    auth: 'password',
    help: 'Account Security → Generate app password.',
    helpUrl: 'https://login.yahoo.com/account/security',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    auth: 'password',
    help: 'Sign-In and Security → App-Specific Passwords.',
    helpUrl: 'https://account.apple.com',
  },
  {
    id: 'aol',
    name: 'AOL Mail',
    host: 'imap.aol.com',
    port: 993,
    secure: true,
    auth: 'password',
    help: 'Account Security → Generate app password.',
  },
  {
    id: 'proton',
    name: 'Proton Mail (via Bridge)',
    host: '127.0.0.1',
    port: 1143,
    secure: false, // Bridge uses STARTTLS on loopback with a self-signed cert
    auth: 'password',
    help: 'Proton only exposes IMAP through Proton Mail Bridge (paid plans). Use the username and password Bridge shows you, not your Proton password.',
    helpUrl: 'https://proton.me/mail/bridge',
  },
  {
    id: 'custom',
    name: 'Other IMAP server',
    host: '',
    port: 993,
    secure: true,
    auth: 'password',
    help: 'Any IMAP server: Fastmail, Zoho, a school or work server, etc.',
  },
];
