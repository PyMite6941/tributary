// Credential-failure behaviour of AccountSession. Uses a local fake IMAP server so it runs offline:
// the server answers every LOGIN / AUTHENTICATE with NO [AUTHENTICATIONFAILED].
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { AccountSession } = require('../electron/mail.cjs');

function fakeImap() {
  let logins = 0;
  const server = net.createServer((sock) => {
    sock.write('* OK [CAPABILITY IMAP4rev1 AUTH=PLAIN AUTH=XOAUTH2] fake ready\r\n');
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const [tag, cmd = ''] = line.split(' ');
        const c = cmd.toUpperCase();
        if (c === 'CAPABILITY') sock.write(`* CAPABILITY IMAP4rev1 AUTH=PLAIN AUTH=XOAUTH2\r\n${tag} OK done\r\n`);
        else if (c === 'LOGIN' || c === 'AUTHENTICATE') {
          logins++;
          sock.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        } else if (c === 'LOGOUT') sock.end(`* BYE\r\n${tag} OK bye\r\n`);
        else if (tag) sock.write(`${tag} BAD unsupported\r\n`);
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, logins: () => logins }))
  );
}

const waitFor = (fn, ms = 8000) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => (fn() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout')) : setTimeout(tick, 50));
    tick();
  });

test('wrong app password: stops at reauth after one attempt, no retry loop', async () => {
  const { server, port, logins } = await fakeImap();
  const account = { id: 'x', email: 'me@example.com', host: '127.0.0.1', port, secure: false, user: 'me', authType: 'password' };
  const s = new AccountSession(account, async () => ({ user: 'me', pass: 'bad' }), {}, 50);
  s.start();
  await waitFor(() => s.status === 'reauth');
  await new Promise((r) => setTimeout(r, 2500)); // longer than the first backoff (2s)
  assert.equal(s.status, 'reauth');
  assert.equal(logins(), 1);
  await s.stop();
  server.close();
});

test('revoked OAuth grant (refresh fails with reauth): stops without touching the server', async () => {
  const { server, port, logins } = await fakeImap();
  const account = { id: 'y', email: 'me@example.com', host: '127.0.0.1', port, secure: false, user: 'me', authType: 'oauth' };
  const s = new AccountSession(
    account,
    async () => {
      const e = new Error('Token has been expired or revoked.');
      e.reauth = true;
      throw e;
    },
    {},
    50
  );
  s.start();
  await waitFor(() => s.status === 'reauth');
  assert.equal(logins(), 0);
  await s.stop();
  server.close();
});

test('OAuth access token rejected: drops the token, retries once, then asks for sign-in', async () => {
  const { server, port, logins } = await fakeImap();
  const account = { id: 'z', email: 'me@example.com', host: '127.0.0.1', port, secure: false, user: 'me', authType: 'oauth' };
  let dropped = 0;
  const s = new AccountSession(account, async () => ({ user: 'me', accessToken: 'stale' }), {}, 50);
  s.on('auth-failed', () => dropped++);
  s.start();
  await waitFor(() => s.status === 'reauth');
  assert.equal(dropped, 1, 'first failure clears the cached token so the retry refreshes it');
  assert.equal(logins(), 2);
  await s.stop();
  server.close();
});
