/* End-to-end test for twitter-LJ-posts-archive-bookmarklet.{js,txt}.
 *
 * Loads the bookmarklet into a jsdom page that mimics the current X search
 * DOM (from:ljupc0, f=live) and asserts that only self-typed posts are
 * captured: own posts, replies and quote posts are kept; reposts/forwards
 * are skipped no matter whether the "reposted" banner sits inside the
 * article or in the cell wrapper above it, and no matter which author the
 * repost card is attributed to.
 *
 * Usage: node scripts/test-bookmarklet.js [file ...]
 * Defaults to testing both the readable .js and the minified .txt.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/* ---- fixture builders mirroring the X search DOM ---------------------- */

const cell = (inner, banner) => `
  <div data-testid="cellInnerDiv">
    <div>
      <div>
        ${banner ? `<div data-testid="socialContext">${banner}</div>` : ''}
        <article data-testid="tweet" tabindex="-1">${inner}</article>
      </div>
    </div>
  </div>`;

const header = (name, handle) => `
  <div data-testid="User-Name">
    <div><span>${name}</span></div>
    <div><span>@${handle}</span></div>
    <div><span>·</span></div>
    <div><span>Nov 1</span></div>
  </div>`;

const timeLink = (handle, id) => `
  <a role="link" href="https://x.com/${handle}/status/${id}">
    <time datetime="2026-11-01T10:00:00.000Z">Nov 1</time>
  </a>`;

/* One tweet article. permalinkHandle lets repost fixtures point the
 * timestamp link at the original author, like X does. */
const tweet = ({ id, handle = 'ljupc0', name = 'LJ', text, permalinkHandle, replyingTo, quote, pinned }) => {
  const permalink = timeLink(permalinkHandle || handle, id);
  const quoteHtml = quote
    ? `
    <div data-testid="quoteTweet">
      <a role="link" href="https://x.com/${quote.handle}/status/${quote.id}">
        <div data-testid="tweet">
          ${header(quote.name, quote.handle)}
          <div data-testid="tweetText"><span lang="en">${quote.text}</span></div>
        </div>
      </a>
    </div>`
    : '';
  return cell(
    `
      ${header(name, handle)}
      ${pinned ? '<div data-testid="socialContext">Pinned</div>' : ''}
      ${replyingTo ? `<div data-testid="socialContext">Replying to <a href="/${replyingTo}">@${replyingTo}</a></div>` : ''}
      <div data-testid="tweetText"><span lang="en">${text}</span></div>
      ${permalink}
      ${quoteHtml}
    `,
    typeof pinned === 'string' ? pinned : null
  );
};

/* Repost banner lives in the cell wrapper ABOVE the article (X's actual
 * placement), so build those cells by hand instead of via tweet(). */
const repostCell = ({ banner, articleHandle, articleName, text, permalinkHandle, id }) => cell(
  `
      ${header(articleName, articleHandle)}
      <div data-testid="tweetText"><span lang="en">${text}</span></div>
      ${timeLink(permalinkHandle || articleHandle, id)}
    `,
  banner
);

const PAGE_HTML = `<!DOCTYPE html><html><head><title>Search / X</title></head><body>
  <main>
    <div aria-label="Timeline: Search">
      <div style="transform: translateY(0px)">
        ${tweet({ id: '111', text: 'plain own post' })}
        ${tweet({ id: '222', text: 'own reply', replyingTo: 'friend' })}
        ${tweet({ id: '888', text: 'pinned own post', pinned: true })}
        ${repostCell({
          banner: 'You reposted',
          articleHandle: 'otherguy',
          articleName: 'Other Guy',
          text: 'someone else post I forwarded',
          permalinkHandle: 'otherguy',
          id: '333',
        })}
        ${tweet({ id: '444', handle: 'otherguy', name: 'Other Guy', text: 'repost row without banner', permalinkHandle: 'otherguy' })}
        ${repostCell({
          banner: 'LJ reposted',
          articleHandle: 'ljupc0',
          articleName: 'LJ',
          text: 'forward rendered as my own card',
          permalinkHandle: 'ljupc0',
          id: '555',
        })}
        ${tweet({
          id: '666',
          text: 'my quote take',
          quote: { handle: 'quotedguy', name: 'Quoted Person', id: '777', text: 'quoted text' },
        })}
        ${repostCell({
          banner: 'You reposted',
          articleHandle: 'ljupc0',
          articleName: 'LJ',
          text: 'repost of my own earlier post',
          permalinkHandle: 'ljupc0',
          id: '111',
        })}
      </div>
    </div>
  </main>
</body></html>`;

/* ---- harness ----------------------------------------------------------- */

const loadBody = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('/* CREATE_BOOKMARKLET_COPY')[0]
    .replace(/^javascript:\s*/i, '')
    .trim();

const runBookmarklet = async (file) => {
  const body = loadBody(file);
  const virtualConsole = new VirtualConsole(); /* silence jsdom "not implemented" noise */
  const dom = new JSDOM(PAGE_HTML, {
    url: 'https://x.com/search?q=from%3Aljupc0&src=typed_query&f=live',
    runScripts: 'dangerously',
    virtualConsole,
  });
  const { window } = dom;

  const alerts = [];
  let lastCopied = '';
  window.prompt = () => '';
  window.alert = (msg) => alerts.push(String(msg));
  window.scrollTo = () => {};
  window.setTimeout = (fn) => {
    fn();
    return 0;
  }; /* collapse all waits so the scroll loop finishes instantly */
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { lastCopied = t; } },
  });
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};

  window.eval(body);

  /* Wait for the final overlay textarea (appended near the very end). */
  const deadline = Date.now() + 5000;
  let overlay = null;
  while (Date.now() < deadline) {
    overlay = Array.from(window.document.querySelectorAll('textarea')).find(
      (el) => el.style && el.style.top === '5%' && el.value
    );
    if (overlay) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const output = overlay ? overlay.value : '';
  return { output, lastCopied, alerts, dom };
};

/* ---- expectations ------------------------------------------------------ */

const check = (output, alerts, file) => {
  const mustContain = [
    ['own plain post', '/ljupc0/status/111'],
    ['own reply kept (Replying-to must not trip the repost filter)', '/ljupc0/status/222'],
    ['pinned own post kept ("Pinned" is not a repost)', '/ljupc0/status/888'],
    ['own quote post kept', '/ljupc0/status/666'],
    ['quote link preserved (46e6e79 regression)', 'https://x.com/quotedguy/status/777'],
  ];
  const mustNotContain = [
    ['repost banner outside article, original-author permalink', '/otherguy/status/333'],
    ['repost row without banner, original-author permalink', '/otherguy/status/444'],
    ['repost rendered as own card + banner outside article', '/ljupc0/status/555'],
  ];

  const failures = [];
  for (const [label, needle] of mustContain) {
    try {
      assert.ok(output.includes(needle), `expected output to contain ${needle}`);
      console.log(`  ok   ${label}`);
    } catch (e) {
      failures.push(e.message);
      console.log(`  FAIL ${label} — ${e.message}`);
    }
  }
  for (const [label, needle] of mustNotContain) {
    try {
      assert.ok(!output.includes(needle), `output must not contain ${needle}`);
      console.log(`  ok   excluded: ${label}`);
    } catch (e) {
      failures.push(e.message);
      console.log(`  FAIL excluded: ${label} — ${e.message}`);
    }
  }

  const occurrences = (output.match(/status\/111/g) || []).length;
  try {
    assert.strictEqual(occurrences, 1, 'repost of own post must not duplicate id 111');
    console.log('  ok   repost of own earlier post skipped (no duplicate id 111)');
  } catch (e) {
    failures.push(e.message);
    console.log(`  FAIL repost of own post — ${e.message}`);
  }

  try {
    assert.ok(!alerts.some((a) => a.includes('No new posts')), 'must not hit the empty-output path');
    console.log('  ok   produced a non-empty capture');
  } catch (e) {
    failures.push(e.message);
    console.log(`  FAIL empty-output path — ${e.message}`);
  }

  return failures;
};

/* ---- main -------------------------------------------------------------- */

(async () => {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : ['twitter-LJ-posts-archive-bookmarklet.js', 'twitter-LJ-posts-archive-bookmarklet.txt']
        .map((f) => path.join(ROOT, f))
        .filter((f) => fs.existsSync(f));

  if (!files.length) {
    console.error('No bookmarklet files found to test.');
    process.exit(2);
  }

  let failed = false;
  for (const file of files) {
    console.log(`\n=== ${path.basename(file)} ===`);
    const { output, alerts } = await runBookmarklet(file);
    if (!output) {
      console.log('  FAIL bookmarklet produced no output. alerts:', alerts);
      failed = true;
      continue;
    }
    const failures = check(output, alerts, file);
    if (failures.length) {
      failed = true;
      console.log('\n--- captured output (debug) ---\n' + output + '\n------------------------------');
    }
  }
  process.exit(failed ? 1 : 0);
})();
