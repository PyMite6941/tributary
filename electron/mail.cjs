// One AccountSession per mailbox account: keeps an IMAP connection open on INBOX,
// listens with IDLE for new mail, and reconnects with backoff when the link drops.
const { EventEmitter } = require('node:events');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const FETCH_QUERY = { uid: true, flags: true, envelope: true, internalDate: true };
const MAX_BACKOFF_MS = 5 * 60_000;

// Spam often carries garbage Date headers; never let one crash the sync.
function safeIso(d) {
  const t = new Date(d || Date.now());
  return Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
}

// Turn low-level failures into something a person can act on.
function friendlyError(e, host) {
  if (e.authenticationFailed) return 'Login rejected. Use an app password, not your normal password.';
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (e.code === 'ECONNREFUSED') return loopback ? 'Nothing is listening locally. Is Proton Mail Bridge running?' : `Server refused the connection (${host}).`;
  if (e.code === 'ENOTFOUND') return `Server not found: ${host}. Check the host name.`;
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET') return 'Connection timed out. Check your network or firewall.';
  return e.responseText || e.message || String(e);
}

function summarize(account, m) {
  const env = m.envelope || {};
  const addr = (a) => ({ name: a?.name || '', address: (a?.address || '').toLowerCase() });
  return {
    key: `${account.id}:${m.uid}`,
    accountId: account.id,
    accountEmail: account.email,
    uid: m.uid,
    messageId: env.messageId || null,
    subject: env.subject || '(no subject)',
    from: addr(env.from?.[0] || env.sender?.[0]),
    to: (env.to || []).map(addr),
    date: safeIso(env.date || m.internalDate),
    seen: m.flags?.has('\\Seen') ?? false,
    flagged: m.flags?.has('\\Flagged') ?? false,
  };
}

class AccountSession extends EventEmitter {
  /**
   * @param account   public account record ({ id, email, host, port, secure, user, authType, ... })
   * @param getAuth   async () => ImapFlow auth object ({ user, pass } or { user, accessToken })
   * @param cache     { messages, highestUid } loaded from disk
   * @param limit     how many of the newest INBOX messages to keep
   */
  constructor(account, getAuth, cache, limit) {
    super();
    this.account = account;
    this.getAuth = getAuth;
    this.limit = limit;
    this.messages = new Map((cache.messages || []).map((m) => [m.uid, m]));
    // Anything at or below this UID has been seen by a previous sync, so it never triggers a notification.
    this.highestUid = cache.highestUid || 0;
    this.uidValidity = cache.uidValidity || null;
    this.status = 'offline';
    this.error = null;
    this.client = null;
    this.stopped = false;
    this.backoff = 2000;
    this.retryTimer = null;
    this.resyncTimer = null;
  }

  snapshot() {
    return { messages: [...this.messages.values()], highestUid: this.highestUid, uidValidity: this.uidValidity };
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit('status', { status, error });
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.resyncTimer);
    const c = this.client;
    this.client = null;
    if (c) await c.logout().catch(() => c.close());
    this.setStatus('offline');
  }

  scheduleReconnect() {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  async connect() {
    if (this.stopped) return;
    this.setStatus('connecting');
    const a = this.account;
    const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(a.host);
    let client;
    try {
      client = new ImapFlow({
        host: a.host,
        port: a.port,
        secure: a.secure,
        auth: await this.getAuth(),
        logger: false,
        // Proton Bridge serves a self-signed cert on loopback. Only relax verification there.
        tls: isLoopback ? { rejectUnauthorized: false } : undefined,
        maxIdleTime: 4 * 60_000, // re-issue IDLE before NATs and servers drop it
      });
      this.client = client;

      client.on('exists', (d) => d.path === 'INBOX' && this.fetchNew(d.prevCount, d.count));
      client.on('expunge', () => this.scheduleResync());
      client.on('flags', (d) => this.onFlags(d));
      client.on('error', (e) => this.setStatus('error', e.message));
      client.on('close', () => {
        if (this.client !== client) return; // superseded or stopped
        this.client = null;
        if (!this.stopped) {
          this.setStatus('error', 'Connection closed — reconnecting');
          this.scheduleReconnect();
        }
      });

      await client.connect();
      const box = await client.mailboxOpen('INBOX');
      if (this.uidValidity && String(box.uidValidity) !== String(this.uidValidity)) {
        // Server renumbered the mailbox; cached UIDs are meaningless now.
        this.messages.clear();
        this.highestUid = 0;
      }
      this.uidValidity = String(box.uidValidity);
      await this.fullSync(box.exists);
      this.backoff = 2000;
      this.setStatus('online');
      // imapflow drops into IDLE by itself once the connection goes quiet.
    } catch (e) {
      this.client = null;
      client?.close();
      this.setStatus('error', friendlyError(e, a.host));
      this.emit('auth-failed', !!e.authenticationFailed);
      this.scheduleReconnect();
    }
  }

  // Re-read the newest `limit` envelopes. Envelopes are small, so this is cheap even for big mailboxes.
  async fullSync(exists) {
    const fresh = new Map();
    if (exists > 0) {
      const from = Math.max(1, exists - this.limit + 1);
      for await (const m of this.client.fetch(`${from}:*`, FETCH_QUERY)) {
        fresh.set(m.uid, summarize(this.account, m));
      }
    }
    const firstEver = this.highestUid === 0;
    const added = [];
    for (const [uid, m] of fresh) {
      if (!firstEver && uid > this.highestUid) added.push(m);
    }
    this.messages = fresh;
    this.highestUid = Math.max(this.highestUid, ...fresh.keys(), 0);
    this.emit('changed', added);
  }

  async fetchNew(prevCount, count) {
    if (!this.client || count <= prevCount) return;
    try {
      const added = [];
      for await (const m of this.client.fetch(`${prevCount + 1}:*`, FETCH_QUERY)) {
        if (this.messages.has(m.uid)) continue;
        const s = summarize(this.account, m);
        this.messages.set(m.uid, s);
        if (m.uid > this.highestUid) added.push(s);
        this.highestUid = Math.max(this.highestUid, m.uid);
      }
      this.trim();
      this.emit('changed', added);
    } catch (e) {
      this.scheduleResync();
    }
  }

  onFlags(d) {
    const m = d.uid && this.messages.get(d.uid);
    if (!m) return;
    m.seen = d.flags.has('\\Seen');
    m.flagged = d.flags.has('\\Flagged');
    this.emit('changed', []);
  }

  scheduleResync() {
    clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(async () => {
      if (!this.client) return;
      try {
        const st = await this.client.status('INBOX', { messages: true });
        await this.fullSync(st.messages);
      } catch {}
    }, 500);
  }

  trim() {
    if (this.messages.size <= this.limit) return;
    const uids = [...this.messages.keys()].sort((a, b) => a - b);
    for (const uid of uids.slice(0, uids.length - this.limit)) this.messages.delete(uid);
  }

  requireClient() {
    if (!this.client) throw new Error(`${this.account.email} is offline`);
    return this.client;
  }

  async withInbox(fn) {
    const client = this.requireClient();
    const lock = await client.getMailboxLock('INBOX');
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  }

  async getBody(uid) {
    const msg = await this.withInbox((c) => c.fetchOne(String(uid), { source: true }, { uid: true }));
    if (!msg) throw new Error('Message no longer exists on the server');
    const parsed = await simpleParser(msg.source);
    let html = parsed.html || null;
    // Inline images (cid:) become data: URIs so the sandboxed reader can show them without network.
    if (html) {
      for (const att of parsed.attachments || []) {
        if (att.contentId && att.content) {
          const cid = att.contentId.replace(/^<|>$/g, '');
          html = html.split(`cid:${cid}`).join(`data:${att.contentType};base64,${att.content.toString('base64')}`);
        }
      }
    }
    return {
      html,
      text: parsed.text || '',
      cc: (parsed.cc?.value || []).map((a) => ({ name: a.name, address: a.address })),
      attachments: (parsed.attachments || [])
        .filter((a) => a.contentDisposition === 'attachment' || !a.contentId)
        .map((a) => ({ filename: a.filename || 'attachment', size: a.size, contentType: a.contentType })),
    };
  }

  async setSeen(uid, seen) {
    await this.withInbox((c) =>
      seen
        ? c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        : c.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
    );
    const m = this.messages.get(uid);
    if (m) m.seen = seen;
    this.emit('changed', []);
  }

  async setFlagged(uid, flagged) {
    await this.withInbox((c) =>
      flagged
        ? c.messageFlagsAdd(String(uid), ['\\Flagged'], { uid: true })
        : c.messageFlagsRemove(String(uid), ['\\Flagged'], { uid: true })
    );
    const m = this.messages.get(uid);
    if (m) m.flagged = flagged;
    this.emit('changed', []);
  }

  async specialFolder(use) {
    const list = await this.requireClient().list();
    return list.find((f) => f.specialUse === use)?.path || null;
  }

  async move(uid, kind) {
    let dest =
      kind === 'archive' ? this.account.archive || (await this.specialFolder('\\Archive')) : await this.specialFolder('\\Trash');
    if (!dest) throw new Error(`This account has no ${kind} folder`);
    await this.withInbox((c) => c.messageMove(String(uid), dest, { uid: true }));
    this.messages.delete(uid);
    this.emit('changed', []);
  }
}

// One-off connection used by "Test connection" in the Add Account dialog.
async function testConnection({ host, port, secure, auth }) {
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth,
    logger: false,
    tls: isLoopback ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await client.connect();
    const st = await client.status('INBOX', { messages: true, unseen: true });
    return { ok: true, messages: st.messages, unseen: st.unseen };
  } catch (e) {
    return { ok: false, error: friendlyError(e, host) };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

module.exports = { AccountSession, testConnection };
