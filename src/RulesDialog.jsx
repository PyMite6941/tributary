import { useState } from 'react';
import { Plus, Trash2, BellRing, EyeOff, MailCheck, Tag } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from './api.js';
import { uid, RULE_COLORS } from './util.js';

const FIELDS = [
  ['from', 'Sender'],
  ['fromDomain', 'Sender domain'],
  ['to', 'Recipient'],
  ['subject', 'Subject'],
  ['account', 'Account'],
];
const OPS = [
  ['contains', 'contains'],
  ['equals', 'is'],
  ['startsWith', 'starts with'],
  ['endsWith', 'ends with'],
  ['regex', 'matches regex'],
];

function blankRule(draft) {
  return {
    id: uid(),
    name: draft?.name || 'New rule',
    enabled: true,
    match: draft?.match || 'all',
    conditions: draft?.conditions || [{ field: 'from', op: 'contains', value: '' }],
    actions: { view: draft?.name || '', notify: false, markRead: false, hide: false, color: RULE_COLORS[0] },
  };
}

function badRegex(c) {
  if (c.op !== 'regex') return false;
  try {
    new RegExp(c.value);
    return false;
  } catch {
    return true;
  }
}

export default function RulesDialog({ rules, accounts, draft, onClose, onError }) {
  const [list, setList] = useState(() => (draft ? [...rules, blankRule(draft)] : rules));
  // A prefilled draft (from "Make rule" in the reader) opens selected.
  const [activeId, setActiveId] = useState(() => list.at(draft ? -1 : 0)?.id);
  const [dirty, setDirty] = useState(!!draft);
  const active = list.find((r) => r.id === activeId) || list[0];

  const update = (patch) => {
    setList((l) => l.map((r) => (r.id === active.id ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const updateAction = (patch) => update({ actions: { ...active.actions, ...patch } });
  const updateCond = (i, patch) => update({ conditions: active.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const add = () => {
    const r = blankRule();
    setList((l) => [...l, r]);
    setActiveId(r.id);
    setDirty(true);
  };
  const remove = () => {
    setList((l) => l.filter((r) => r.id !== active.id));
    setActiveId(null);
    setDirty(true);
  };

  const save = async () => {
    try {
      // Empty view names mean "no view".
      await api.saveRules(list.map((r) => ({ ...r, actions: { ...r.actions, view: r.actions.view?.trim() || null } })));
      onClose();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Modal
      title="Rules & filters"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small">Rules apply to every inbox. A message can match several.</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!dirty} onClick={save}>
            Save rules
          </button>
        </>
      }
    >
      <div className="rules">
        <aside className="rule-list">
          {list.map((r) => (
            <button key={r.id} className={`rule-item${r.id === active?.id ? ' active' : ''}${r.enabled ? '' : ' off'}`} onClick={() => setActiveId(r.id)}>
              <span className="dot" style={{ background: r.actions.color || '#7d8796' }} />
              <span className="nav-label">{r.name}</span>
              {r.actions.notify && <BellRing size={12} />}
            </button>
          ))}
          <button className="rule-item add" onClick={add}>
            <Plus size={14} /> New rule
          </button>
        </aside>

        {!active ? (
          <div className="rule-empty">
            <p>Rules sort mail from all your inboxes into views, and can notify you when a specific sender writes.</p>
            <button className="btn primary" onClick={add}>
              <Plus size={14} /> Create your first rule
            </button>
          </div>
        ) : (
          <div className="rule-editor">
            <div className="row2">
              <label className="grow">
                Name
                <input value={active.name} onChange={(e) => update({ name: e.target.value })} />
              </label>
              <label className="check toggle">
                <input type="checkbox" checked={active.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> Enabled
              </label>
            </div>

            <div className="section-title">
              When
              <select value={active.match} onChange={(e) => update({ match: e.target.value })}>
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
              of these are true
            </div>

            {active.conditions.map((c, i) => (
              <div className="cond" key={i}>
                <select value={c.field} onChange={(e) => updateCond(i, { field: e.target.value, value: '' })}>
                  {FIELDS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {c.field === 'account' ? (
                  <>
                    <span className="muted">is</span>
                    <select value={c.value} onChange={(e) => updateCond(i, { op: 'equals', value: e.target.value })}>
                      <option value="">Choose…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label ? `${a.label} · ${a.email}` : a.email}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select value={c.op} onChange={(e) => updateCond(i, { op: e.target.value })}>
                      {OPS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      className={badRegex(c) ? 'invalid' : ''}
                      value={c.value}
                      placeholder={c.field === 'fromDomain' ? 'example.com' : c.field === 'from' ? 'name@example.com' : ''}
                      onChange={(e) => updateCond(i, { value: e.target.value })}
                    />
                  </>
                )}
                <button
                  className="icon-btn"
                  aria-label="Remove condition"
                  disabled={active.conditions.length === 1}
                  onClick={() => update({ conditions: active.conditions.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button className="link" onClick={() => update({ conditions: [...active.conditions, { field: 'from', op: 'contains', value: '' }] })}>
              <Plus size={13} /> Add condition
            </button>

            <div className="section-title">Then</div>
            <div className="actions-grid">
              <label className="action">
                <Tag size={15} />
                <span>
                  Put in view
                  <input value={active.actions.view || ''} placeholder="e.g. College, Dev, Receipts" onChange={(e) => updateAction({ view: e.target.value })} />
                </span>
              </label>
              <label className="action">
                <span className="swatches">
                  {RULE_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      className={`swatch${active.actions.color === col ? ' on' : ''}`}
                      style={{ background: col }}
                      onClick={() => updateAction({ color: col })}
                      aria-label={`Color ${col}`}
                    />
                  ))}
                </span>
              </label>
              <label className="action check">
                <input type="checkbox" checked={active.actions.notify} onChange={(e) => updateAction({ notify: e.target.checked })} />
                <BellRing size={15} /> Send a desktop notification
              </label>
              <label className="action check">
                <input type="checkbox" checked={active.actions.markRead} onChange={(e) => updateAction({ markRead: e.target.checked })} />
                <MailCheck size={15} /> Mark as read automatically
              </label>
              <label className="action check">
                <input type="checkbox" checked={active.actions.hide} onChange={(e) => updateAction({ hide: e.target.checked })} />
                <EyeOff size={15} /> Keep out of “All inboxes” (still in its view)
              </label>
            </div>

            <button className="btn danger" onClick={remove}>
              <Trash2 size={14} /> Delete rule
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
