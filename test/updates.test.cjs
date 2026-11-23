const test = require('node:test');
const assert = require('node:assert/strict');
const { isNewer, parse, check } = require('../electron/updates.cjs');

test('version compare is numeric, not alphabetical', () => {
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('v0.2.0', '0.1.0'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.1.0', '0.2.0'), false);
  assert.equal(isNewer('1.0.0', '0.99.99'), true);
  assert.equal(isNewer('garbage', '0.1.0'), false);
  assert.deepEqual(parse('v1.2.3-beta.1'), [1, 2, 3]);
});

test('check reads the latest release, and treats "no releases" as up to date', async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.3.0', html_url: 'https://github.com/x/releases/tag/v0.3.0' }) });
  assert.deepEqual(await check('0.2.0', { fetchImpl: ok }), {
    current: '0.2.0',
    latest: '0.3.0',
    newer: true,
    url: 'https://github.com/x/releases/tag/v0.3.0',
    publishedAt: null,
  });
  const none = async () => ({ ok: false, status: 404 });
  assert.equal((await check('0.2.0', { fetchImpl: none })).newer, false);
  const down = async () => ({ ok: false, status: 503 });
  await assert.rejects(check('0.2.0', { fetchImpl: down }), /503/);
});
