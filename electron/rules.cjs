// Rules engine. Pure functions, no Electron imports, so it runs under `node --test`.
//
// Rule shape:
// {
//   id, name, enabled,
//   match: 'all' | 'any',
//   conditions: [{ field, op, value }],
//     field: 'from' | 'fromDomain' | 'to' | 'subject' | 'account'
//     op:    'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex'
//   actions: { view: string|null, notify: bool, markRead: bool, hide: bool, color: string|null }
// }
//
// A message can match many rules. Their actions merge: views accumulate, any notify/markRead/hide wins,
// and the first matching rule with a color sets the color.

function fieldValues(msg, field) {
  switch (field) {
    case 'from':
      return [msg.from?.address, msg.from?.name].filter(Boolean);
    case 'fromDomain': {
      const addr = msg.from?.address || '';
      return [addr.slice(addr.lastIndexOf('@') + 1)];
    }
    case 'to':
      return (msg.to || []).flatMap((t) => [t.address, t.name]).filter(Boolean);
    case 'subject':
      return [msg.subject || ''];
    case 'account':
      return [msg.accountId || '', msg.accountEmail || ''];
    default:
      return [];
  }
}

const regexCache = new Map();
function toRegex(src) {
  if (!regexCache.has(src)) {
    let re = null;
    try {
      re = new RegExp(src, 'i');
    } catch {
      // An invalid pattern simply never matches; the editor flags it.
    }
    regexCache.set(src, re);
  }
  return regexCache.get(src);
}

function testCondition(msg, { field, op, value }) {
  if (value == null || value === '') return false;
  const needle = String(value).trim().toLowerCase();
  return fieldValues(msg, field).some((raw) => {
    const hay = String(raw).toLowerCase();
    switch (op) {
      case 'contains':
        return hay.includes(needle);
      case 'equals':
        return hay === needle;
      case 'startsWith':
        return hay.startsWith(needle);
      case 'endsWith':
        // endsWith on a domain also matches subdomains: "example.com" matches "mail.example.com".
        return hay.endsWith(needle);
      case 'regex':
        return toRegex(String(value))?.test(String(raw)) ?? false;
      default:
        return false;
    }
  });
}

function ruleMatches(msg, rule) {
  if (!rule.enabled || !rule.conditions?.length) return false;
  const test = (c) => testCondition(msg, c);
  return rule.match === 'any' ? rule.conditions.some(test) : rule.conditions.every(test);
}

function evaluate(msg, rules) {
  const out = { views: [], notify: false, markRead: false, hide: false, color: null, ruleIds: [] };
  for (const rule of rules) {
    if (!ruleMatches(msg, rule)) continue;
    const a = rule.actions || {};
    out.ruleIds.push(rule.id);
    if (a.view && !out.views.includes(a.view)) out.views.push(a.view);
    if (a.notify) out.notify = true;
    if (a.markRead) out.markRead = true;
    if (a.hide) out.hide = true;
    if (a.color && !out.color) out.color = a.color;
  }
  return out;
}

module.exports = { evaluate, ruleMatches, testCondition };
