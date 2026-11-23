import { useState } from 'react';
import { Trash2, FolderOpen, Loader2, ExternalLink, CheckCircle2, LogOut } from 'lucide-react';
import { api } from './api.js';

// How to remove the app itself, per install type (from main's packaging()).
function removeSteps(packaging) {
  switch (packaging) {
    case 'nsis':
      return 'Uninstall it like any Windows app: the button below, or Settings → Apps → Installed apps → Tributary. The uninstaller asks whether to delete your data too.';
    case 'portable':
      return 'Erase your data below, then delete the Tributary .exe.';
    case 'mac':
      return 'Erase your data below if you want it gone, then quit Tributary and drag it from Applications to the Trash.';
    case 'deb':
      return 'Erase your data below if you want it gone, then run: sudo apt remove tributary';
    case 'appimage':
      return 'Erase your data below if you want it gone, then delete the .AppImage file.';
    default:
      return "You're running from source: erase your data below, then delete the folder you cloned.";
  }
}

// "Go remove access here" links for things the app can't revoke itself.
export function AccessHints({ hints }) {
  if (!hints?.length) return null;
  return (
    <div className="access-hints">
      {hints.map((h, i) => (
        <div key={i} className="key-warn small">
          <span className="grow">
            <b>{h.email}:</b> {h.text}
          </span>
          {h.url && (
            <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal(h.url))}>
              Open <ExternalLink size={11} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RemoveSection({ info, onError, onErased }) {
  const [step, setStep] = useState('idle'); // idle | confirm | busy
  const erase = async () => {
    setStep('busy');
    try {
      onErased(await api.eraseAll());
    } catch (e) {
      onError(e);
      setStep('idle');
    }
  };
  return (
    <>
      <h4>Remove Tributary</h4>
      <div className="remove-box">
        <p className="small muted">{removeSteps(info?.packaging)}</p>
        <div className="data-line small">
          <span className="muted">Your data:</span> <code className="grow">{info?.dataDir || '…'}</code>
          <button className="btn small" onClick={() => api.openDataFolder().catch(onError)}>
            <FolderOpen size={13} /> Show
          </button>
        </div>

        {step === 'idle' && (
          <div className="form-actions">
            {info?.canUninstall && (
              <button className="btn small" onClick={() => api.uninstall().catch(onError)}>
                <LogOut size={13} /> Uninstall Tributary…
              </button>
            )}
            <button className="btn small danger" onClick={() => setStep('confirm')}>
              <Trash2 size={13} /> Erase all data…
            </button>
          </div>
        )}

        {step !== 'idle' && (
          <div className="erase-confirm small">
            <b>Erase everything Tributary stored on this computer?</b>
            <ul>
              <li>Signs out of every inbox, and revokes Google sign-ins.</li>
              <li>Deletes saved passwords and sign-in tokens, rules, cached mail, settings and your sign-in keys (.env).</li>
              <li>Turns off start at login, then Tributary closes.</li>
            </ul>
            <span className="muted">Your email stays with your providers; nothing is deleted there. This can't be undone.</span>
            <div className="form-actions">
              <button className="btn small" onClick={() => setStep('idle')} disabled={step === 'busy'}>
                Cancel
              </button>
              <button className="btn small danger-solid" onClick={erase} disabled={step === 'busy'}>
                {step === 'busy' ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Erase everything
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Replaces the whole window after an erase: what's left to do by hand, then quit.
export function ErasedScreen({ hints, uninstall }) {
  return (
    <div className="erased">
      <div className="erased-card">
        <CheckCircle2 size={28} className="ok" />
        <h2>Your Tributary data is erased</h2>
        <p className="muted">Nothing from your inboxes is left on this computer.</p>
        {hints.length > 0 && (
          <>
            <p>A few providers still let Tributary in until you remove it yourself:</p>
            <AccessHints hints={hints} />
          </>
        )}
        <div className="form-actions">
          {uninstall && (
            <button className="btn" onClick={() => api.uninstall()}>
              <LogOut size={14} /> Uninstall the app too
            </button>
          )}
          <button className="btn primary" onClick={() => api.quit()}>
            Quit Tributary
          </button>
        </div>
      </div>
    </div>
  );
}
