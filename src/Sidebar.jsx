import { Inbox, Mail, Star, BellRing, Plus, SlidersHorizontal, Settings, Tag } from 'lucide-react';

function Item({ icon: Icon, label, count, active, onClick, color, status }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} title={label}>
      {color ? <span className="dot" style={{ background: color }} /> : <Icon size={16} />}
      <span className="nav-label">{label}</span>
      {status && status !== 'online' && <span className={`status ${status}`} title={status} />}
      {count > 0 && <span className="count">{count}</span>}
    </button>
  );
}

export default function Sidebar({ state, view, setView, onAddAccount, onRules, onSettings }) {
  const { messages, accounts, rules } = state;
  const unread = (f) => messages.filter((m) => !m.seen && f(m)).length;

  // Smart views come from rules: every distinct `actions.view` becomes a sidebar entry.
  const views = [];
  for (const r of rules) {
    const v = r.actions?.view;
    if (r.enabled && v && !views.some((x) => x.name === v)) views.push({ name: v, color: r.actions.color || '#7d8796' });
  }

  return (
    <nav className="sidebar">
      <div className="nav-group">
        <Item icon={Inbox} label="All inboxes" count={unread((m) => !m.hide)} active={view === 'all'} onClick={() => setView('all')} />
        <Item icon={Mail} label="Unread" count={0} active={view === 'unread'} onClick={() => setView('unread')} />
        <Item icon={Star} label="Flagged" count={messages.filter((m) => m.flagged).length} active={view === 'flagged'} onClick={() => setView('flagged')} />
        <Item icon={BellRing} label="Priority senders" count={unread((m) => m.notify)} active={view === 'priority'} onClick={() => setView('priority')} />
      </div>

      {views.length > 0 && (
        <div className="nav-group">
          <div className="nav-heading">
            <Tag size={12} /> Views
          </div>
          {views.map((v) => (
            <Item
              key={v.name}
              label={v.name}
              color={v.color}
              count={unread((m) => m.views.includes(v.name))}
              active={view === `view:${v.name}`}
              onClick={() => setView(`view:${v.name}`)}
            />
          ))}
        </div>
      )}

      <div className="nav-group">
        <div className="nav-heading">Accounts</div>
        {accounts.map((a) => (
          <Item
            key={a.id}
            label={a.label ? `${a.label} · ${a.email}` : a.email}
            color={a.color}
            status={a.status}
            count={unread((m) => m.accountId === a.id)}
            active={view === `acct:${a.id}`}
            onClick={() => setView(`acct:${a.id}`)}
          />
        ))}
        <button className="nav-item muted" onClick={onAddAccount}>
          <Plus size={16} />
          <span className="nav-label">Add inbox</span>
        </button>
      </div>

      <div className="nav-footer">
        <button className="nav-item" onClick={onRules}>
          <SlidersHorizontal size={16} />
          <span className="nav-label">Rules & filters</span>
        </button>
        <button className="nav-item" onClick={onSettings}>
          <Settings size={16} />
          <span className="nav-label">Settings</span>
        </button>
      </div>
    </nav>
  );
}
