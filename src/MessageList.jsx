import { useEffect, useRef } from 'react';
import { Star, BellRing, Inbox } from 'lucide-react';
import { listTime, groupLabel, senderName, initials } from './util.js';

export default function MessageList({ title, messages, accounts, selected, onSelect, onFlag }) {
  const listRef = useRef(null);
  const color = Object.fromEntries(accounts.map((a) => [a.id, a.color]));
  const unread = messages.filter((m) => !m.seen).length;

  // Keep the keyboard selection in view.
  useEffect(() => {
    listRef.current?.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  let lastGroup = null;
  return (
    <section className="list">
      <div className="list-head">
        <h1>{title}</h1>
        <span className="list-meta">
          {messages.length} messages{unread ? ` · ${unread} unread` : ''}
        </span>
      </div>
      <div className="rows" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty">
            <Inbox size={28} />
            <p>Nothing here.</p>
          </div>
        )}
        {messages.map((m) => {
          const g = groupLabel(m.date);
          const header = g !== lastGroup ? <div className="group" key={`g-${g}`}>{g}</div> : null;
          lastGroup = g;
          return [
            header,
            <div
              key={m.key}
              role="button"
              tabIndex={-1}
              className={`row${m.seen ? '' : ' unread'}${m.key === selected ? ' selected' : ''}`}
              onClick={() => onSelect(m)}
              style={{ '--acct': color[m.accountId] || '#7d8796' }}
            >
              <div className="avatar" style={{ background: m.color || color[m.accountId] }}>
                {initials(m.from)}
              </div>
              <div className="row-main">
                <div className="row-top">
                  <span className="sender">{senderName(m.from)}</span>
                  {m.notify && <BellRing size={12} className="bell" />}
                  <span className="time">{listTime(m.date)}</span>
                </div>
                <div className="subject">{m.subject}</div>
                {m.views.length > 0 && (
                  <div className="chips">
                    {m.views.map((v) => (
                      <span key={v} className="chip">
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={`star${m.flagged ? ' on' : ''}`}
                aria-label={m.flagged ? 'Unflag' : 'Flag'}
                onClick={(e) => {
                  e.stopPropagation();
                  onFlag(m);
                }}
              >
                <Star size={14} />
              </button>
            </div>,
          ];
        })}
      </div>
    </section>
  );
}
