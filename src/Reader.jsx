import { useEffect, useState } from 'react';
import { Archive, Trash2, Star, MailOpen, Mail, BellRing, BellOff, Filter, ImageOff, Image, Paperclip, Loader2 } from 'lucide-react';
import { api } from './api.js';
import { fullTime, senderName, initials, domainOf, formatSize } from './util.js';

// Email HTML is untrusted. It renders in an iframe with no allow-scripts and no allow-same-origin,
// so it can't run code or reach the app. Its own CSP blocks remote loads (tracking pixels) unless allowed.
function buildDoc(html, allowRemote) {
  const csp = allowRemote
    ? "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https: http:; font-src https: http: data:"
    : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html,body{margin:0;background:#fff;color:#1d2330}
  body{padding:24px 28px;font:15px/1.55 "Segoe UI",system-ui,sans-serif;word-wrap:break-word}
  img{max-width:100%;height:auto} a{color:#2f6fe0} pre{white-space:pre-wrap}
  blockquote{margin:0 0 0 .5em;padding-left:1em;border-left:3px solid #d5dae3;color:#555}
</style></head><body>${html}</body></html>`;
}

function hasRemoteContent(html) {
  return /<img[^>]+src=["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html) || /<link[^>]+href=["']?https?:/i.test(html);
}

// Plain-text mail: escape, then turn bare URLs into links (opened externally by the main process).
function TextBody({ text }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <pre className="text-body">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href="#" onClick={(e) => (e.preventDefault(), api.openExternal(p))}>
            {p}
          </a>
        ) : (
          p
        )
      )}
    </pre>
  );
}

export default function Reader({ message, account, rules, settings, onSeen, onFlag, onArchive, onTrash, onCreateRule, onToggleNotify, onError }) {
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allowRemote, setAllowRemote] = useState(false);
  const key = message?.key;

  useEffect(() => {
    setBody(null);
    setAllowRemote(!settings.blockRemoteImages);
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    api
      .getBody(key)
      .then((b) => !cancelled && setBody(b))
      .catch((e) => !cancelled && onError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, settings.blockRemoteImages, onError]);

  if (!message) {
    return (
      <section className="reader empty-reader">
        <div className="hint">
          <Mail size={32} />
          <p>Select a message</p>
          <div className="keys">
            <span><kbd>j</kbd> <kbd>k</kbd> move</span>
            <span><kbd>e</kbd> archive</span>
            <span><kbd>s</kbd> star</span>
            <span><kbd>u</kbd> unread</span>
            <span><kbd>/</kbd> search</span>
          </div>
        </div>
      </section>
    );
  }

  const addr = message.from.address;
  const notifyOn = rules.some((r) => r.quick === 'notify' && r.conditions[0]?.value === addr);
  const blocked = body?.html && !allowRemote && hasRemoteContent(body.html);

  return (
    <section className="reader">
      <div className="toolbar">
        <button className="tool" onClick={onArchive} title="Archive (e)">
          <Archive size={16} />
        </button>
        <button className="tool" onClick={onTrash} title="Delete (#)">
          <Trash2 size={16} />
        </button>
        <button className="tool" onClick={() => onSeen(!message.seen)} title="Toggle read (u)">
          {message.seen ? <Mail size={16} /> : <MailOpen size={16} />}
        </button>
        <button className={`tool${message.flagged ? ' on' : ''}`} onClick={onFlag} title="Flag (s)">
          <Star size={16} />
        </button>
        <span className="spacer" />
        <button className={`tool labeled${notifyOn ? ' on' : ''}`} onClick={() => onToggleNotify(addr)} title="Get a desktop notification whenever this sender emails you">
          {notifyOn ? <BellRing size={15} /> : <BellOff size={15} />}
          {notifyOn ? 'Notifying' : 'Notify me'}
        </button>
        <button
          className="tool labeled"
          title="Create a rule for this sender"
          onClick={() =>
            onCreateRule({
              name: senderName(message.from),
              match: 'any',
              conditions: [{ field: 'from', op: 'equals', value: addr }],
              domainHint: domainOf(addr),
            })
          }
        >
          <Filter size={15} />
          Make rule
        </button>
      </div>

      <div className="mail-head">
        <h2>{message.subject}</h2>
        <div className="from-line">
          <div className="avatar lg" style={{ background: message.color || account?.color }}>
            {initials(message.from)}
          </div>
          <div className="from-meta">
            <div>
              <strong>{senderName(message.from)}</strong> <span className="muted">&lt;{addr}&gt;</span>
            </div>
            <div className="muted small">
              to {message.to.map((t) => t.address).join(', ') || 'undisclosed recipients'}
              {body?.cc?.length ? ` · cc ${body.cc.map((c) => c.address).join(', ')}` : ''}
            </div>
          </div>
          <div className="when">
            <span className="acct-chip" style={{ '--acct': account?.color }}>
              {account?.label || account?.email}
            </span>
            <span className="muted small">{fullTime(message.date)}</span>
          </div>
        </div>
        {message.views.length > 0 && (
          <div className="chips">
            {message.views.map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
          </div>
        )}
      </div>

      {blocked && (
        <div className="banner">
          <ImageOff size={15} /> Remote images are blocked to stop tracking pixels.
          <button className="link" onClick={() => setAllowRemote(true)}>
            <Image size={14} /> Load them
          </button>
        </div>
      )}

      {body?.attachments?.length > 0 && (
        <div className="attachments">
          {body.attachments.map((a, i) => (
            <span key={i} className="attachment">
              <Paperclip size={13} /> {a.filename} <span className="muted">{formatSize(a.size)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mail-body">
        {loading && (
          <div className="loading">
            <Loader2 size={20} className="spin" />
          </div>
        )}
        {body &&
          (body.html ? (
            <iframe
              key={`${key}-${allowRemote}`}
              title="Message body"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={buildDoc(body.html, allowRemote)}
            />
          ) : (
            <TextBody text={body.text} />
          ))}
      </div>
    </section>
  );
}
