const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../electron/rules.cjs');

const msg = (over = {}) => ({
  accountId: 'a1',
  accountEmail: 'me@gmail.com',
  subject: 'Your application portal is ready',
  from: { name: 'Office of Admissions', address: 'admissions@mail.wpi.edu' },
  to: [{ name: 'Me', address: 'me@gmail.com' }],
  ...over,
});

const rule = (conditions, actions = {}, extra = {}) => ({
  id: Math.random().toString(36),
  name: 't',
  enabled: true,
  match: 'all',
  conditions,
  actions: { view: null, notify: false, markRead: false, hide: false, color: null, ...actions },
  ...extra,
});

test('sender domain endsWith matches subdomains', () => {
  const r = evaluate(msg(), [rule([{ field: 'fromDomain', op: 'endsWith', value: 'wpi.edu' }], { view: 'College' })]);
  assert.deepEqual(r.views, ['College']);
});

test('matching is case-insensitive and trims the value', () => {
  const r = evaluate(msg(), [rule([{ field: 'from', op: 'equals', value: '  ADMISSIONS@mail.wpi.edu ' }], { notify: true })]);
  assert.equal(r.notify, true);
});

test('from matches display name too', () => {
  const r = evaluate(msg(), [rule([{ field: 'from', op: 'contains', value: 'admissions' }], { view: 'X' })]);
  assert.deepEqual(r.views, ['X']);
});

test('all vs any', () => {
  const conds = [
    { field: 'subject', op: 'contains', value: 'application' },
    { field: 'fromDomain', op: 'equals', value: 'nope.com' },
  ];
  assert.equal(evaluate(msg(), [rule(conds, { notify: true })]).notify, false);
  assert.equal(evaluate(msg(), [rule(conds, { notify: true }, { match: 'any' })]).notify, true);
});

test('disabled rules and empty values never match', () => {
  const r = evaluate(msg(), [
    rule([{ field: 'subject', op: 'contains', value: 'application' }], { notify: true }, { enabled: false }),
    rule([{ field: 'subject', op: 'contains', value: '' }], { hide: true }),
  ]);
  assert.equal(r.notify, false);
  assert.equal(r.hide, false);
});

test('invalid regex does not throw', () => {
  const r = evaluate(msg(), [rule([{ field: 'subject', op: 'regex', value: '([' }], { notify: true })]);
  assert.equal(r.notify, false);
});

test('regex works', () => {
  const r = evaluate(msg(), [rule([{ field: 'subject', op: 'regex', value: '^your\\s+app' }], { notify: true })]);
  assert.equal(r.notify, true);
});

test('actions merge across rules; first color wins; views deduped', () => {
  const r = evaluate(msg(), [
    rule([{ field: 'fromDomain', op: 'endsWith', value: '.edu' }], { view: 'College', color: '#111' }),
    rule([{ field: 'subject', op: 'contains', value: 'portal' }], { view: 'College', notify: true, color: '#222' }),
    rule([{ field: 'account', op: 'equals', value: 'a1' }], { view: 'Personal', markRead: true }),
  ]);
  assert.deepEqual(r.views, ['College', 'Personal']);
  assert.equal(r.notify, true);
  assert.equal(r.markRead, true);
  assert.equal(r.color, '#111');
  assert.equal(r.ruleIds.length, 3);
});

test('message with no from does not crash', () => {
  const r = evaluate(msg({ from: undefined }), [rule([{ field: 'fromDomain', op: 'equals', value: 'x' }])]);
  assert.deepEqual(r.views, []);
});
