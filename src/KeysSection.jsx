import { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Plus, Pencil, Trash2, AlertTriangle, Loader2, CalendarClock, Shuffle } from 'lucide-react';
import { api, params } from './api.js';

// Sign-in keys = the Google / Microsoft OAuth client IDs, kept in a .env file on this computer (see electron/keys.cjs).
// Each key can carry its subscription details (plan, limits, renewal, cost, owner, notes) and shows its usage,
// so you can pick which key new sign-ins use, by hand or with auto-switch.

const NAMES = { google: 'Google', microsoft: 'Microsoft' };
const SOURCE = { env: '.env', project: 'project .env', 'built-in': 'built-in' };
const fmt = (n) => Number(n || 0).toLocaleString();
const requests = (c) => (c?.signIns || 0) + (c?.refreshes || 0);

function ago(ms) {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function renewal(renews) {
  if (!renews) return null;
  const days = Math.ceil((new Date(`${renews}T00:00:00`) - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days < 0) return { text: `renewal date passed ${-days} day${days === -1 ? '' : 's'} ago`, level: 'bad' };
  if (days === 0) return { text: 'renews today', level: 'warn' };
  return { text: `renews in ${days} day${days === 1 ? '' : 's'} (${renews})`, level: days <= 7 ? 'warn' : '' };
}

function Meter({ label, used, limit }) {
  if (limit == null) {
    return (
      <div className="meter plain">
        <span>{label}</span>
        <b>{fmt(used)}</b> requests
      </div>
    );
  }
  const pct = limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
  const level = pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : '';
  return (
    <div className={`meter ${level}`}>
      <span>{label}</span>
      <b>{fmt(used)}</b> / {fmt(limit)}
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const EMPTY = { label: '', clientId: '', clientSecret: '', plan: '', dailyLimit: '', monthlyLimit: '', renews: '', cost: '', owner: '', notes: '' };

function KeyForm({ provider, initial, isNew, onSave, onCancel }) {
  const [f, setF] = useState({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { clientId, clientSecret, ...details } = f;
      await onSave(isNew ? { clientId, clientSecret, ...details } : details);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="key-form" onSubmit={submit}>
      <label className="span2">
        Name
        <input value={f.label} onChange={set('label')} placeholder="e.g. Main project, Backup, Work tenant" />
      </label>
      {isNew && (
        <>
          <label className={provider === 'google' ? '' : 'span2'}>
            Client ID
            <input required value={f.clientId} onChange={set('clientId')} placeholder={provider === 'google' ? '….apps.googleusercontent.com' : '00000000-0000-…'} autoComplete="off" />
          </label>
          {provider === 'google' && (
            <label>
              Client secret
              <input type="password" value={f.clientSecret} onChange={set('clientSecret')} placeholder="GOCSPX-…" autoComplete="off" />
            </label>
          )}
        </>
      )}
      <div className="form-sub span2">Subscription</div>
      <label>
        Plan
        <input value={f.plan} onChange={set('plan')} placeholder="e.g. Google Cloud free tier, Microsoft 365 Business" />
      </label>
      <label>
        Cost
        <input value={f.cost} onChange={set('cost')} placeholder="e.g. $0, $6/user/mo" />
      </label>
      <label>
        Daily request limit
        <input inputMode="numeric" value={f.dailyLimit ?? ''} onChange={set('dailyLimit')} placeholder="none" />
      </label>
      <label>
        Monthly request limit
        <input inputMode="numeric" value={f.monthlyLimit ?? ''} onChange={set('monthlyLimit')} placeholder="none" />
      </label>
      <label>
        Renews / expires
        <input type="date" value={f.renews} onChange={set('renews')} />
      </label>
      <label>
        Billing account / owner
        <input value={f.owner} onChange={set('owner')} placeholder="which account pays for or owns it" />
      </label>
      <label className="span2">
        Notes
        <input value={f.notes} onChange={set('notes')} placeholder="e.g. Testing mode: 100-user cap; verification pending" />
      </label>
      <div className="form-actions span2">
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary small" disabled={busy}>
          {busy && <Loader2 size={13} className="spin" />} {isNew ? 'Add key' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function KeyCard({ k, provider, chosen, inUse, apply, onError }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const u = k.usage;
  const r = renewal(k.renews);
  const recentRate = u.rateLimitedAt && Date.now() - u.rateLimitedAt < 24 * 3_600_000;

  if (editing) {
    return (
      <div className="key-card editing">
        <KeyForm
          provider={provider}
          initial={{ ...k, dailyLimit: k.dailyLimit ?? '', monthlyLimit: k.monthlyLimit ?? '' }}
          onCancel={() => setEditing(false)}
          onSave={(patch) => apply(api.updateKey(k.id, patch)).then((ok) => ok && setEditing(false))}
        />
      </div>
    );
  }

  return (
    <div className={`key-card${chosen ? ' chosen' : ''}${k.exhausted ? ' exhausted' : ''}`}>
      <div className="key-top">
        <label className="key-pick" title="Use this key for new sign-ins">
          <input type="radio" name={`key-${provider}`} checked={chosen} onChange={() => apply(api.setActiveKey(provider, k.id))} />
          <b>{k.label}</b>
        </label>
        {inUse && <span className="tag ok">new sign-ins</span>}
        {k.plan && <span className="tag plan">{k.plan}</span>}
        <span className="tag">{SOURCE[k.source] || k.source}</span>
        <span className="grow" />
        <button className="icon-btn" title="Edit name & subscription" onClick={() => setEditing(true)}>
          <Pencil size={13} />
        </button>
        {k.editable &&
          (confirm ? (
            <button className="btn danger small" onClick={() => apply(api.removeKey(k.id)).then(() => setConfirm(false))}>
              Remove?
            </button>
          ) : (
            <button className="icon-btn" title="Remove from .env" onClick={() => setConfirm(true)}>
              <Trash2 size={13} />
            </button>
          ))}
      </div>

      <div className="key-meta muted small">
        <code>{k.clientIdHint}</code>
        {provider === 'google' && <span>{k.hasSecret ? 'secret set' : 'no secret'}</span>}
        {k.cost && <span>{k.cost}</span>}
        {k.owner && <span>{k.owner}</span>}
        {r && (
          <span className={r.level}>
            <CalendarClock size={11} /> {r.text}
          </span>
        )}
      </div>

      <div className="meters">
        <Meter label="Today" used={requests(u.today)} limit={k.dailyLimit} />
        <Meter label="This month" used={requests(u.month)} limit={k.monthlyLimit} />
        <div className="meter plain">
          <span>Last 30 days</span>
          <b>{fmt(u.last30.signIns)}</b> sign-ins · <b>{fmt(u.last30.refreshes)}</b> refreshes
          {u.last30.errors > 0 && (
            <>
              {' '}
              · <b className="bad">{fmt(u.last30.errors)}</b> error{u.last30.errors === 1 ? '' : 's'}
            </>
          )}
        </div>
      </div>

      {(k.exhausted || recentRate || (u.lastError && Date.now() - u.lastErrorAt < 24 * 3_600_000)) && (
        <div className="key-warn small">
          <AlertTriangle size={12} />
          {k.exhausted ? `Skipped by auto-switch: ${k.exhausted}.` : recentRate ? `Rate-limited ${ago(u.rateLimitedAt)}.` : `Last error ${ago(u.lastErrorAt)}: ${u.lastError}`}
        </div>
      )}

      <div className="muted small">
        {k.inboxes.length ? `Inboxes on this key: ${k.inboxes.join(', ')}` : 'No inboxes signed in with this key yet.'}
        {u.lastUsedAt ? ` · last used ${ago(u.lastUsedAt)}` : ''}
      </div>
      {k.notes && <div className="key-notes small">{k.notes}</div>}
    </div>
  );
}

function ProviderKeys({ provider, data, apply, onError }) {
  const [adding, setAdding] = useState(false);
  const chosen = data.keys.find((k) => k.id === data.chosenId);
  const switched = data.activeId && data.activeId !== data.chosenId;
  const activeKey = data.keys.find((k) => k.id === data.activeId);

  return (
    <div className="key-provider">
      <div className="key-provider-head">
        <b>{NAMES[provider]}</b>
        <span className="muted small">
          {data.keys.length} key{data.keys.length === 1 ? '' : 's'}
        </span>
        <span className="grow" />
        {data.keys.length > 1 && (
          <label className="check small" title="When the picked key reaches a limit or gets rate-limited, new sign-ins use the next key with room.">
            <input type="checkbox" checked={data.autoSwitch} onChange={(e) => apply(api.setAutoSwitch(provider, e.target.checked))} />
            <Shuffle size={12} /> Auto-switch at limits
          </label>
        )}
      </div>

      {switched && (
        <div className="key-warn small">
          <Shuffle size={12} /> New sign-ins are using <b>{activeKey?.label}</b> because <b>{chosen?.label}</b> is at its limit ({chosen?.exhausted}).
        </div>
      )}

      {data.keys.length === 0 && !adding && <p className="muted small">No {NAMES[provider]} keys yet. Browser sign-in for {provider === 'google' ? 'Gmail' : 'Outlook'} needs one.</p>}

      {data.keys.map((k) => (
        <KeyCard key={k.id} k={k} provider={provider} chosen={k.id === data.chosenId} inUse={k.id === data.activeId} apply={apply} onError={onError} />
      ))}

      {adding ? (
        <div className="key-card editing">
          <KeyForm provider={provider} isNew onCancel={() => setAdding(false)} onSave={(draft) => apply(api.addKey(provider, draft)).then((ok) => ok && setAdding(false))} />
        </div>
      ) : (
        <button className="link add-key" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add {NAMES[provider]} key
        </button>
      )}
    </div>
  );
}

export default function KeysSection({ onError }) {
  const [view, setView] = useState(null);

  const load = useCallback(() => api.listKeys().then(setView).catch(onError), [onError]);
  useEffect(() => {
    load();
  }, [load]);

  // Runs a key action; the main process answers with the fresh list. Resolves true on success.
  const apply = async (promise) => {
    try {
      const next = await promise;
      if (next?.providers) setView(next);
      return true;
    } catch (e) {
      onError(e);
      return false;
    }
  };

  // Demo/screenshot view "keys" scrolls straight here.
  useEffect(() => {
    if (view && params.get('view') === 'keys') document.getElementById('sign-in-keys')?.scrollIntoView();
  }, [view]);

  if (!view) return null;
  return (
    <>
      <h4 id="sign-in-keys">Sign-in keys</h4>
      <p className="muted small">
        The Google and Microsoft client IDs used for browser sign-in, plus the subscription details attached to each one. They're stored in a <code>.env</code> file on this computer.
        Switching keys affects <b>new</b> sign-ins. Each inbox keeps the key it signed in with, so use <i>Sign in again</i> on an inbox to move it to the selected key.{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), api.openExternal('https://pymite6941.github.io/tributary/setup.html#oauth'))}>
          How to get keys
        </a>
      </p>
      <div className="env-bar small">
        <FileText size={13} className="muted" />
        <code className="grow" title={view.envPath}>
          {view.envPath}
        </code>
        <button className="btn small" onClick={() => api.openEnvFile().catch(onError)}>
          Open .env
        </button>
        <button className="icon-btn" title="Reload after editing .env by hand" onClick={load}>
          <RefreshCw size={13} />
        </button>
      </div>
      {['google', 'microsoft'].map((p) => (
        <ProviderKeys key={p} provider={p} data={view.providers[p]} apply={apply} onError={onError} />
      ))}
      <p className="muted small">
        Usage counts the requests this app makes with a key: sign-ins and access-token refreshes, about one per inbox per hour. Providers count reading
        and syncing mail against each mailbox, not against the key.
      </p>
    </>
  );
}
