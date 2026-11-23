// "Is there a newer Tributary?" Asks GitHub's public releases API; nothing about you or your mail is sent.
// Builds aren't code-signed, so instead of silently replacing itself the app links to the release page.
const RELEASES = 'https://api.github.com/repos/PyMite6941/tributary/releases/latest';

// "v0.10.2" -> [0, 10, 2]. Pre-release/build suffixes are ignored; /releases/latest never returns pre-releases.
function parse(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}

// true when `latest` is a higher version than `current`.
function isNewer(latest, current) {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function check(current, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const res = await fetchImpl(RELEASES, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tributary-update-check' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return { current, latest: null, newer: false, url: null }; // no releases yet
  if (!res.ok) throw new Error(`GitHub answered ${res.status} while checking for updates.`);
  const rel = await res.json();
  const latest = String(rel.tag_name || '').replace(/^v/i, '');
  return { current, latest, newer: isNewer(latest, current), url: rel.html_url || null, publishedAt: rel.published_at || null };
}

module.exports = { check, isNewer, parse };
