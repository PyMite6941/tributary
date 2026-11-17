// Demo backend used when the UI runs in a plain browser (npm run preview:web, or screenshots for docs/).
// Same surface as electron/preload.cjs, with fake data and no network.
const H = 3_600_000;
const ago = (h) => new Date(Date.now() - h * H).toISOString();

const accounts = [
  { id: 'a1', email: 'alex.rivera@gmail.com', label: 'Personal', provider: 'gmail', color: '#4f8cff', status: 'online' },
  { id: 'a2', email: 'arivera@outlook.com', label: 'School', provider: 'outlook', authType: 'oauth', color: '#2bb39a', status: 'online' },
  { id: 'a3', email: 'alexr@yahoo.com', label: 'Old', provider: 'yahoo', color: '#e0a33a', status: 'online' },
  { id: 'a4', email: 'alex@proton.me', label: 'Private', provider: 'proton', color: '#9a6bff', status: 'reauth', authType: 'password', error: 'Login rejected. Use an app password, not your normal password.' },
];

let rules = [
  {
    id: 'r1', name: 'GitHub', enabled: true, match: 'all',
    conditions: [{ field: 'fromDomain', op: 'endsWith', value: 'github.com' }],
    actions: { view: 'Dev', notify: false, markRead: false, hide: false, color: '#4f8cff' },
  },
  {
    id: 'r2', name: 'Admissions', enabled: true, match: 'any',
    conditions: [
      { field: 'fromDomain', op: 'endsWith', value: '.edu' },
      { field: 'subject', op: 'contains', value: 'application' },
    ],
    actions: { view: 'College', notify: true, markRead: false, hide: false, color: '#d6587a' },
  },
  {
    id: 'r3', name: 'Newsletters', enabled: true, match: 'any',
    conditions: [{ field: 'from', op: 'contains', value: 'newsletter' }],
    actions: { view: 'Reading', notify: false, markRead: true, hide: true, color: '#47b4d6' },
  },
];

const raw = [
  ['a2', 'Office of Admissions', 'admissions@wpi.edu', 'Your application portal is ready', 0.4, false, false],
  ['a1', 'GitHub', 'noreply@github.com', '[PyMite/tributary] CI passed on main', 1.2, false, false],
  ['a1', 'Vercel', 'notifications@vercel.com', 'Deployment ready: portfolio-site', 2.5, true, false],
  ['a3', 'The Pragmatic Newsletter', 'newsletter@pragmatic.dev', 'Issue #212 — shipping desktop apps in 2026', 3.1, true, false],
  ['a1', 'Sam Chen', 'sam.chen@gmail.com', 'Robotics meet moved to Saturday', 5, false, true],
  ['a2', 'Ms. Patel', 'r.patel@school.edu', 'AP CS A — Unit 6 project rubric', 9, true, false],
  ['a1', 'GitHub', 'noreply@github.com', 'Security alert: dependency update available', 20, true, false],
  ['a3', 'Amazon', 'shipment-tracking@amazon.com', 'Your package was delivered', 27, true, false],
  ['a1', 'Discord', 'noreply@discord.com', 'You have 4 unread mentions in CTF Club', 30, false, false],
  ['a2', 'Undergraduate Admissions', 'apply@umd.edu', 'Application checklist: 2 items left', 50, false, false],
  ['a1', 'Bank of Somewhere', 'alerts@bank.example', 'Statement available for October', 80, true, false],
  ['a4', 'Proton', 'no-reply@proton.me', 'Welcome to Proton Mail', 200, true, false],
];

function evalDemo(m) {
  const out = { views: [], notify: false, markRead: false, hide: false, color: null, ruleIds: [] };
  for (const r of rules) {
    if (!r.enabled) continue;
    const hit = (c) => {
      const v = c.value.toLowerCase();
      const f = { from: `${m.from.address} ${m.from.name}`.toLowerCase(), fromDomain: m.from.address.split('@')[1], subject: m.subject.toLowerCase() }[c.field] || '';
      return c.op === 'endsWith' ? f.endsWith(v) : c.op === 'equals' ? f === v : f.includes(v);
    };
    if (!(r.match === 'any' ? r.conditions.some(hit) : r.conditions.every(hit))) continue;
    out.ruleIds.push(r.id);
    if (r.actions.view && !out.views.includes(r.actions.view)) out.views.push(r.actions.view);
    out.notify ||= r.actions.notify;
    out.hide ||= r.actions.hide;
    out.color ||= r.actions.color;
  }
  return out;
}

let messages = raw.map(([accountId, name, address, subject, h, seen, flagged], i) => ({
  key: `${accountId}:${i + 1}`,
  accountId,
  accountEmail: accounts.find((a) => a.id === accountId).email,
  uid: i + 1,
  subject,
  from: { name, address },
  to: [{ name: 'Alex Rivera', address: accounts.find((a) => a.id === accountId).email }],
  date: ago(h),
  seen,
  flagged,
}));

let settings = { notifyAllNew: false, blockRemoteImages: true, messagesPerAccount: 300, minimizeToTray: true };
const listeners = new Set();

function state() {
  return {
    accounts,
    rules,
    settings,
    messages: messages.map((m) => ({ ...m, ...evalDemo(m) })).sort((a, b) => (a.date < b.date ? 1 : -1)),
    demo: true,
  };
}
const emit = () => listeners.forEach((fn) => fn(state()));
const patch = (key, p) => {
  messages = messages.map((m) => (m.key === key ? { ...m, ...p } : m));
  emit();
};

export const demoApi = {
  getState: async () => state(),
  listProviders: async () => ({
    providers: [
      { id: 'gmail', name: 'Gmail', auth: 'password', host: 'imap.gmail.com', port: 993, secure: true, help: 'Create an app password at myaccount.google.com/apppasswords.' },
      { id: 'outlook', name: 'Outlook / Hotmail / Live', auth: 'oauth', host: 'outlook.office365.com', port: 993, secure: true, help: 'Microsoft only allows browser sign-in (OAuth) for IMAP now.' },
      { id: 'yahoo', name: 'Yahoo Mail', auth: 'password', host: 'imap.mail.yahoo.com', port: 993, secure: true, help: 'Account Security → Generate app password.' },
      { id: 'icloud', name: 'iCloud Mail', auth: 'password', host: 'imap.mail.me.com', port: 993, secure: true, help: 'Sign-In and Security → App-Specific Passwords.' },
      { id: 'aol', name: 'AOL Mail', auth: 'password', host: 'imap.aol.com', port: 993, secure: true, help: '' },
      { id: 'proton', name: 'Proton Mail (via Bridge)', auth: 'password', host: '127.0.0.1', port: 1143, secure: false, help: 'Requires Proton Mail Bridge.' },
      { id: 'custom', name: 'Other IMAP server', auth: 'password', host: '', port: 993, secure: true, help: '' },
    ],
    oauth: { google: false, microsoft: false },
  }),
  testAccount: async () => ({ ok: false, error: 'Demo mode — run the desktop app to connect real accounts.' }),
  addAccount: async () => { throw new Error('Demo mode — run the desktop app to connect real accounts.'); },
  updateAccount: async () => {},
  removeAccount: async () => {},
  reconnectAccount: async () => {},
  reauthAccount: async () => { throw new Error('Demo mode: run the desktop app to connect real accounts.'); },
  getOAuthConfig: async () => ({}),
  saveOAuthConfig: async () => {},
  onOpenSettings: () => () => {},
  saveRules: async (r) => { rules = r; emit(); },
  saveSettings: async (s) => { settings = { ...settings, ...s }; emit(); },
  getBody: async (key) => {
    const m = messages.find((x) => x.key === key);
    return {
      html: `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1d2330;max-width:620px">
        <h2 style="margin:0 0 12px">${m.subject}</h2>
        <p>Hi Alex,</p>
        <p>This is a demo message from <b>${m.from.name}</b>. In the desktop app this pane shows the real email,
        rendered in a sandbox with scripts disabled and remote images blocked until you allow them.</p>
        <p><a href="https://example.com">An example link</a> opens in your normal browser.</p>
        <p style="color:#6b7385">— ${m.from.name}</p></div>`,
      text: '',
      cc: [],
      attachments: m.subject.includes('rubric') ? [{ filename: 'unit6-rubric.pdf', size: 184_320, contentType: 'application/pdf' }] : [],
    };
  },
  setSeen: async (key, seen) => patch(key, { seen }),
  setFlagged: async (key, flagged) => patch(key, { flagged }),
  move: async (key) => { messages = messages.filter((m) => m.key !== key); emit(); },
  openExternal: async (url) => window.open(url, '_blank', 'noopener'),
  onState: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  onOpenMessage: () => () => {},
};
