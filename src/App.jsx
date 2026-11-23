import { useEffect, useMemo, useState, useCallback } from 'react';
import { Search, X, AlertCircle, ArrowUpCircle } from 'lucide-react';
import { api, params } from './api.js';
import Sidebar from './Sidebar.jsx';
import MessageList from './MessageList.jsx';
import Reader from './Reader.jsx';
import AccountDialog from './AccountDialog.jsx';
import RulesDialog from './RulesDialog.jsx';
import SettingsDialog from './SettingsDialog.jsx';
import Welcome from './Welcome.jsx';

function filterFor(view, accounts) {
  if (view === 'all') return (m) => !m.hide;
  if (view === 'unread') return (m) => !m.seen && !m.hide;
  if (view === 'flagged') return (m) => m.flagged;
  if (view === 'priority') return (m) => m.notify;
  if (view.startsWith('view:')) {
    const name = view.slice(5);
    return (m) => m.views.includes(name);
  }
  if (view.startsWith('acct:')) {
    const id = view.slice(5);
    return (m) => m.accountId === id;
  }
  return () => true;
}

export function viewTitle(view, accounts) {
  if (view === 'all') return 'All inboxes';
  if (view === 'unread') return 'Unread';
  if (view === 'flagged') return 'Flagged';
  if (view === 'priority') return 'Priority senders';
  if (view.startsWith('view:')) return view.slice(5);
  if (view.startsWith('acct:')) {
    const a = accounts.find((x) => x.id === view.slice(5));
    return a ? a.label || a.email : 'Account';
  }
  return '';
}

export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState('all');
  const [selected, setSelected] = useState(() => params.get('view') === 'reader' ? 'a2:1' : null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(() => ({ rules: 'rules', account: 'account', settings: 'settings', keys: 'settings', about: 'settings' })[params.get('view')] || null); // 'account' | 'rules' | 'settings'
  const [ruleDraft, setRuleDraft] = useState(null); // prefilled rule when opening the rules dialog
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.getState().then(setState);
    const offState = api.onState(setState);
    const offOpen = api.onOpenMessage((key) => {
      setView('all');
      setSelected(key);
    });
    const offSettings = api.onOpenSettings(() => setDialog('settings'));
    return () => {
      offState();
      offOpen();
      offSettings();
    };
  }, []);

  const showError = useCallback((e) => {
    setToast(e.message || String(e));
    setTimeout(() => setToast(null), 4500);
  }, []);

  const accounts = state?.accounts || [];
  const messages = state?.messages || [];

  const visible = useMemo(() => {
    const f = filterFor(view, accounts);
    const q = query.trim().toLowerCase();
    return messages.filter(
      (m) =>
        f(m) &&
        (!q ||
          m.subject.toLowerCase().includes(q) ||
          m.from.address.includes(q) ||
          m.from.name.toLowerCase().includes(q))
    );
  }, [messages, view, query, accounts]);

  const current = messages.find((m) => m.key === selected) || null;

  const act = useCallback(
    async (fn) => {
      try {
        await fn();
      } catch (e) {
        showError(e);
      }
    },
    [showError]
  );

  const moveSelection = useCallback(
    (delta) => {
      if (!visible.length) return;
      const i = visible.findIndex((m) => m.key === selected);
      const next = visible[Math.min(visible.length - 1, Math.max(0, i + delta))];
      if (next) setSelected(next.key);
    },
    [visible, selected]
  );

  const removeCurrent = useCallback(
    (kind) => {
      if (!current) return;
      const i = visible.findIndex((m) => m.key === current.key);
      const next = visible[i + 1] || visible[i - 1];
      setSelected(next?.key || null);
      act(() => api.move(current.key, kind));
    },
    [current, visible, act]
  );

  // Keyboard shortcuts, Gmail-flavoured.
  useEffect(() => {
    const onKey = (e) => {
      if (dialog || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      const k = e.key;
      if (k === 'j' || k === 'ArrowDown') moveSelection(1);
      else if (k === 'k' || k === 'ArrowUp') moveSelection(-1);
      else if (k === '/') {
        e.preventDefault();
        document.getElementById('search')?.focus();
      } else if (!current) return;
      else if (k === 'e') removeCurrent('archive');
      else if (k === '#' || k === 'Delete') removeCurrent('trash');
      else if (k === 's') act(() => api.setFlagged(current.key, !current.flagged));
      else if (k === 'u') act(() => api.setSeen(current.key, !current.seen));
      else if (k === 'Escape') setSelected(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, current, moveSelection, removeCurrent, act]);

  const openRuleFor = (preset) => {
    setRuleDraft(preset);
    setDialog('rules');
  };

  if (!state) return <div className="boot" />;
  const needSignIn = accounts.filter((a) => a.status === 'reauth');

  return (
    <div className={`app platform-${window.tributary?.platform || 'web'}`}>
      <header className="titlebar">
        <div className="brand">
          <span className="logo" aria-hidden />
          Tributary
          {state.demo && <span className="demo-pill">Demo</span>}
        </div>
        <label className="search">
          <Search size={15} />
          <input
            id="search"
            className="search-input"
            placeholder="Search sender or subject   /"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
      </header>

      <Sidebar
        state={state}
        view={view}
        setView={(v) => {
          setView(v);
          setSelected(null);
        }}
        onAddAccount={() => setDialog('account')}
        onRules={() => openRuleFor(null)}
        onSettings={() => setDialog('settings')}
      />

      {accounts.length === 0 ? (
        <Welcome onAdd={() => setDialog('account')} />
      ) : (
        <>
          <MessageList
            title={viewTitle(view, accounts)}
            messages={visible}
            accounts={accounts}
            selected={selected}
            onSelect={(m) => {
              setSelected(m.key);
              if (!m.seen) act(() => api.setSeen(m.key, true));
            }}
            onFlag={(m) => act(() => api.setFlagged(m.key, !m.flagged))}
          />
          <Reader
            message={current}
            account={accounts.find((a) => a.id === current?.accountId)}
            rules={state.rules}
            settings={state.settings}
            onSeen={(seen) => act(() => api.setSeen(current.key, seen))}
            onFlag={() => act(() => api.setFlagged(current.key, !current.flagged))}
            onArchive={() => removeCurrent('archive')}
            onTrash={() => removeCurrent('trash')}
            onCreateRule={openRuleFor}
            onToggleNotify={(address) => act(() => toggleSenderNotify(state.rules, address))}
            onError={showError}
          />
        </>
      )}

      {dialog === 'account' && <AccountDialog onClose={() => setDialog(null)} />}
      {dialog === 'rules' && (
        <RulesDialog
          rules={state.rules}
          accounts={accounts}
          draft={ruleDraft}
          onClose={() => {
            setDialog(null);
            setRuleDraft(null);
          }}
          onError={showError}
        />
      )}
      {dialog === 'settings' && (
        <SettingsDialog state={state} onClose={() => setDialog(null)} onError={showError} />
      )}

      {needSignIn.length > 0 && !dialog && (
        <div className="reauth-banner" role="status">
          <AlertCircle size={15} />
          <span>
            {needSignIn.map((a) => a.email).join(', ')} {needSignIn.length === 1 ? 'needs' : 'need'} you to sign in again.
          </span>
          <button className="btn small primary" onClick={() => setDialog('settings')}>
            Fix
          </button>
        </div>
      )}

      {state.update?.newer && state.settings.checkForUpdates !== false && state.settings.dismissedUpdate !== state.update.latest && !dialog && (
        <div className="update-banner" role="status">
          <ArrowUpCircle size={15} />
          <span>Tributary {state.update.latest} is available.</span>
          <button className="btn small primary" onClick={() => api.openExternal(state.update.url)}>
            Download
          </button>
          <button className="icon-btn" title="Dismiss" onClick={() => api.saveSettings({ dismissedUpdate: state.update.latest }).catch(showError)}>
            <X size={14} />
          </button>
        </div>
      )}

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}

// The one-click bell in the reader: a dedicated "Notify: <sender>" rule, added or removed.
async function toggleSenderNotify(rules, address) {
  const existing = rules.find(
    (r) =>
      r.quick === 'notify' &&
      r.conditions.length === 1 &&
      r.conditions[0].field === 'from' &&
      r.conditions[0].value === address
  );
  if (existing) return api.saveRules(rules.filter((r) => r !== existing));
  return api.saveRules([
    ...rules,
    {
      id: Math.random().toString(36).slice(2, 10),
      name: `Notify: ${address}`,
      quick: 'notify',
      enabled: true,
      match: 'all',
      conditions: [{ field: 'from', op: 'equals', value: address }],
      actions: { view: null, notify: true, markRead: false, hide: false, color: null },
    },
  ]);
}
