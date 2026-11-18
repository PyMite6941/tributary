import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, AlertCircle, LogIn, KeyRound, Loader2 } from 'lucide-react';
import Modal from './Modal.jsx';
import KeysSection from './KeysSection.jsx';
import { api } from './api.js';

const PROVIDER_NAMES = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', icloud: 'iCloud', aol: 'AOL', proton: 'Proton', custom: 'IMAP' };
const STATUS_LABEL = { online: 'connected', connecting: 'connecting…', error: 'retrying', reauth: 'needs sign-in', offline: 'offline' };

// One inbox row. When the provider rejects our credentials the session stops retrying (status "reauth")
// and this row offers the fix: browser sign-in again, or a new app password.
function AccountRow({ a, onError }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [editing, setEditing] = useState(false);
  const oauth = a.authType === 'oauth';
  const needs = a.status === 'reauth';

  const reauth = async () => {
    setBusy(true);
    try {
      await api.reauthAccount(a.id, oauth ? {} : { password: pw });
      setPw('');
      setEditing(false);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`acct-row${a.status === 'reauth' ? ' needs' : ''}`}>
      <div className="acct-line">
        <span className="dot" style={{ background: a.color }} />
        <div className="grow">
          <div>{a.email}</div>
          <div className="muted small">
            {PROVIDER_NAMES[a.provider] || a.provider} · {oauth ? `browser sign-in${a.oauthKeyLabel ? ` (key: ${a.oauthKeyLabel})` : ''}` : 'app password'} ·{' '}
            <span className={`status-text ${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
            {a.error && a.status !== 'online' && (
              <span className="err">
                {' '}
                <AlertCircle size={11} /> {a.error}
              </span>
            )}
          </div>
        </div>
        <button className="icon-btn" title="Reconnect" onClick={() => api.reconnectAccount(a.id).catch(onError)}>
          <RefreshCw size={14} />
        </button>
        {confirm ? (
          <button className="btn danger small" onClick={() => api.removeAccount(a.id).catch(onError)}>
            Remove?
          </button>
        ) : (
          <button className="icon-btn" title="Remove inbox" onClick={() => setConfirm(true)}>
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {!needs && !editing && (
        <div className="reauth-row">
          <button className="link" onClick={() => (oauth ? reauth() : setEditing(true))} disabled={busy}>
            {oauth ? <LogIn size={12} /> : <KeyRound size={12} />} {oauth ? 'Sign in again' : 'Change app password'}
          </button>
        </div>
      )}
      {(needs || editing) && (
        <div className="reauth-row">
          {oauth ? (
            <button className="btn primary small" disabled={busy} onClick={reauth}>
              {busy ? <Loader2 size={13} className="spin" /> : <LogIn size={13} />} Sign in again
            </button>
          ) : (
            <form
              className="pw-update"
              onSubmit={(e) => {
                e.preventDefault();
                reauth();
              }}
            >
              <KeyRound size={13} className="muted" />
              <input type="password" placeholder={a.status === 'reauth' ? 'New app password' : 'Change app password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
              <button className={`btn small${a.status === 'reauth' ? ' primary' : ''}`} disabled={busy || !pw}>
                {busy && <Loader2 size={13} className="spin" />} Save
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsDialog({ state, onClose, onError }) {
  const [s, setS] = useState(state.settings);
  const toggle = (k) => (e) => setS({ ...s, [k]: e.target.checked });

  const save = async () => {
    try {
      await api.saveSettings({ ...s, messagesPerAccount: Math.max(50, Math.min(5000, Number(s.messagesPerAccount) || 300)) });
      onClose();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="settings">
        <h4>Inboxes</h4>
        <div className="acct-table">
          {state.accounts.length === 0 && <p className="muted">No inboxes yet.</p>}
          {state.accounts.map((a) => (
            <AccountRow key={a.id} a={a} onError={onError} />
          ))}
        </div>
        <p className="muted small">
          App passwords and sign-in tokens are encrypted with Windows' own keystore (DPAPI) and stay signed in across restarts.
          Access tokens refresh automatically. If a provider revokes access, the inbox shows “needs sign-in” here instead of
          retrying with bad credentials.
        </p>

        <h4>Notifications</h4>
        <label className="check">
          <input type="checkbox" checked={s.notifyAllNew} onChange={toggle('notifyAllNew')} />
          Notify for every new email <span className="muted">(off = only rules with notifications)</span>
        </label>

        <h4>Privacy</h4>
        <label className="check">
          <input type="checkbox" checked={s.blockRemoteImages} onChange={toggle('blockRemoteImages')} />
          Block remote images by default <span className="muted">(stops tracking pixels)</span>
        </label>

        <h4>App</h4>
        <label className="check">
          <input type="checkbox" checked={s.minimizeToTray} onChange={toggle('minimizeToTray')} />
          Keep running in the tray when the window is closed
        </label>
        <label className="inline">
          Messages kept per inbox
          <input type="number" min={50} max={5000} step={50} value={s.messagesPerAccount} onChange={(e) => setS({ ...s, messagesPerAccount: e.target.value })} />
        </label>

        <KeysSection onError={onError} />
      </div>
    </Modal>
  );
}
