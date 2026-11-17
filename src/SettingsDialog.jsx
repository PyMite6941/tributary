import { useState } from 'react';
import { RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from './api.js';

const PROVIDER_NAMES = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', icloud: 'iCloud', aol: 'AOL', proton: 'Proton', custom: 'IMAP' };

export default function SettingsDialog({ state, onClose, onError }) {
  const [s, setS] = useState(state.settings);
  const [confirmId, setConfirmId] = useState(null);
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

        <h4>Inboxes</h4>
        <div className="acct-table">
          {state.accounts.length === 0 && <p className="muted">No inboxes yet.</p>}
          {state.accounts.map((a) => (
            <div className="acct-row" key={a.id}>
              <span className="dot" style={{ background: a.color }} />
              <div className="grow">
                <div>{a.email}</div>
                <div className="muted small">
                  {PROVIDER_NAMES[a.provider] || a.provider} · {a.authType === 'oauth' ? 'browser sign-in' : 'app password'} ·{' '}
                  <span className={`status-text ${a.status}`}>{a.status}</span>
                  {a.error && (
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
              {confirmId === a.id ? (
                <button className="btn danger small" onClick={() => api.removeAccount(a.id).catch(onError)}>
                  Remove?
                </button>
              ) : (
                <button className="icon-btn" title="Remove inbox" onClick={() => setConfirmId(a.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="muted small">
          Passwords and sign-in tokens are encrypted with your operating system's keystore and never leave this computer. Tributary
          talks directly to your mail servers — there is no Tributary server.
        </p>
      </div>
    </Modal>
  );
}
