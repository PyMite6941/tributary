import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, CheckCircle2, AlertCircle, LogIn } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from './api.js';
import { RULE_COLORS } from './util.js';

const LOGOS = { gmail: 'G', outlook: 'O', yahoo: 'Y!', icloud: '', aol: 'Aol', proton: 'P', custom: '@' };

export default function AccountDialog({ onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [preset, setPreset] = useState(null);
  const [form, setForm] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(null); // 'test' | 'add'
  const [result, setResult] = useState(null); // { ok, text }

  useEffect(() => {
    api.listProviders().then(setCatalog);
  }, []);

  const choose = (p) => {
    setPreset(p);
    setResult(null);
    setShowAdvanced(p.id === 'custom');
    setForm({
      provider: p.id,
      authType: p.oauth && catalog.oauth[p.oauth] ? 'oauth' : p.auth,
      host: p.host,
      port: p.port,
      secure: p.secure,
      email: '',
      user: '',
      password: '',
      label: '',
      color: RULE_COLORS[Math.floor(Math.random() * RULE_COLORS.length)],
    });
  };

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Username defaults to the email address, which is right for every listed provider.
      if (k === 'email' && (!f.user || f.user === f.email)) next.user = v;
      return next;
    });
  };

  const run = async (kind) => {
    setBusy(kind);
    setResult(null);
    try {
      if (kind === 'test') {
        const r = await api.testAccount(form);
        setResult(r.ok ? { ok: true, text: `Connected — ${r.messages} messages, ${r.unseen} unread.` } : { ok: false, text: r.error });
      } else {
        await api.addAccount(form);
        onClose();
      }
    } catch (e) {
      setResult({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const oauthReady = preset?.oauth && catalog?.oauth?.[preset.oauth];
  // Gmail supports both; Outlook is OAuth-only.
  const canChooseAuth = preset?.id === 'gmail';

  return (
    <Modal title={preset ? `Add ${preset.name}` : 'Add an inbox'} onClose={onClose}>
      {!catalog && <Loader2 className="spin" />}

      {catalog && !preset && (
        <div className="provider-grid">
          {catalog.providers.map((p) => (
            <button key={p.id} className={`provider p-${p.id}`} onClick={() => choose(p)}>
              <span className="provider-logo">{LOGOS[p.id] ?? '@'}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}

      {preset && (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            run('add');
          }}
        >
          <button type="button" className="link back" onClick={() => setPreset(null)}>
            <ArrowLeft size={14} /> All providers
          </button>

          {preset.help && (
            <p className="help">
              {preset.help}{' '}
              {preset.helpUrl && (
                <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal(preset.helpUrl))}>
                  Open <ExternalLink size={12} />
                </a>
              )}
            </p>
          )}

          {canChooseAuth && (
            <div className="segmented">
              <button type="button" className={form.authType === 'password' ? 'on' : ''} onClick={() => setForm({ ...form, authType: 'password' })}>
                App password
              </button>
              <button type="button" className={form.authType === 'oauth' ? 'on' : ''} onClick={() => setForm({ ...form, authType: 'oauth' })}>
                Sign in with Google
              </button>
            </div>
          )}

          {form.authType === 'oauth' ? (
            <div className="oauth-box">
              {oauthReady ? (
                <p>
                  Your browser opens so you can sign in with {preset.oauth === 'google' ? 'Google' : 'Microsoft'}. Tributary never sees your
                  password; it stores an encrypted sign-in token and stays signed in.
                </p>
              ) : (
                <p className="warn">
                  <AlertCircle size={15} />
                  <span>
                    Browser sign-in needs a {preset.oauth === 'google' ? 'Google' : 'Microsoft'} sign-in key first. Add one under{' '}
                    <strong>Settings → Sign-in keys</strong>.{' '}
                    <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal('https://pymite6941.github.io/tributary/setup.html#oauth'))}>
                      How to get one
                    </a>
                  </span>
                </p>
              )}
            </div>
          ) : (
            <>
              <label>
                Email address
                <input type="email" required autoFocus value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </label>
              <label>
                {preset.id === 'proton' ? 'Bridge password' : 'App password'}
                <input type="password" required value={form.password} onChange={set('password')} autoComplete="off" />
              </label>
            </>
          )}

          <div className="row2">
            <label>
              Label <span className="muted">(optional)</span>
              <input value={form.label} onChange={set('label')} placeholder="Personal, School, Work…" />
            </label>
            <label className="color-field">
              Color
              <input type="color" value={form.color} onChange={set('color')} />
            </label>
          </div>

          {form.authType !== 'oauth' && (
            <>
              <button type="button" className="link" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? 'Hide' : 'Show'} server settings
              </button>
              {showAdvanced && (
                <div className="advanced">
                  <label>
                    Username
                    <input value={form.user} onChange={set('user')} />
                  </label>
                  <div className="row2">
                    <label>
                      IMAP host
                      <input required value={form.host} onChange={set('host')} />
                    </label>
                    <label className="port">
                      Port
                      <input type="number" required value={form.port} onChange={set('port')} />
                    </label>
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={form.secure} onChange={set('secure')} /> Use TLS from the start (port 993). Off = STARTTLS.
                  </label>
                </div>
              )}
            </>
          )}

          {result && (
            <div className={`result ${result.ok ? 'ok' : 'bad'}`}>
              {result.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {result.text}
            </div>
          )}

          <div className="form-actions">
            {form.authType !== 'oauth' && (
              <button type="button" className="btn" disabled={!!busy || !form.email || !form.password} onClick={() => run('test')}>
                {busy === 'test' && <Loader2 size={14} className="spin" />} Test connection
              </button>
            )}
            <button type="submit" className="btn primary" disabled={!!busy || (form.authType === 'oauth' && !oauthReady)}>
              {busy === 'add' && <Loader2 size={14} className="spin" />}
              {form.authType === 'oauth' ? (
                <>
                  <LogIn size={14} /> Sign in
                </>
              ) : (
                'Add inbox'
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
