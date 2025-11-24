javascript:(async () => {
  const HANDLE = '@ljupc0';
  const SCROLL_DELAY_MS = 1200;
  const MAX_SCROLL_LOOPS = 400;
  const MAX_IDLE_LOOPS = 40;
  const BANNED_IDS = new Set([
    /* Known stray post to ignore (Zhihu Frontier) */
    '1987125624599970218',
  ]);

  const STOP_ID = (prompt('Enter STOP tweet ID (already archived):') || '').trim();
  if (STOP_ID && !/^\d+$/.test(STOP_ID)) {
    alert('Invalid STOP ID. Use digits only.');
    return;
  }

  /* Global stop flag so you can halt from console or Escape key. */
  const STOP_FLAG = '__lj_backup_stop__';
  window[STOP_FLAG] = false;
  const requestStop = () => {
    window[STOP_FLAG] = true;
    setStatus('Stop requested...');
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ensureAt = (h) => (h.startsWith('@') ? h : '@' + h);
  const isNestedTweet = (article) => {
    /* Skip if this article lives inside another article (quoted/embedded) */
    const ancestor = article?.closest('article');
    if (ancestor && ancestor !== article) return true;
    /* Skip if it contains a child article (embedded/quoted) */
    const child = article.querySelector('article');
    if (child && child !== article) return true;
    return false;
  };

  /* Minimal status badge in the corner + console logging so you can see progress. */
  const statusEl = (() => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '12px',
      left: '12px',
      padding: '6px 8px',
      background: 'rgba(0,0,0,0.65)',
      color: '#fff',
      fontSize: '11px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 999999,
      borderRadius: '6px',
      pointerEvents: 'auto',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
    });
    el.textContent = 'Starting backup...';
    document.body.appendChild(el);
    return el;
  })();
  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg;
    console.debug('[LJ backup]', msg);
  };

  /* Live buffer + copy button so progress can be recovered mid-run. */
  const liveBuffer = document.createElement('textarea');
  Object.assign(liveBuffer.style, {
    position: 'fixed',
    bottom: '48px',
    left: '12px',
    width: '260px',
    height: '120px',
    opacity: 0.05,
    zIndex: 999999,
    background: '#fff',
    color: '#000',
    padding: '4px',
    border: '1px solid #ccc',
    fontFamily: 'monospace',
    fontSize: '11px',
    resize: 'vertical',
  });
  liveBuffer.setAttribute(
    'title',
    'Live backup buffer (auto-updated). Click "Copy" to copy without selecting.'
  );
  document.body.appendChild(liveBuffer);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  Object.assign(copyBtn.style, {
    position: 'fixed',
    bottom: '12px',
    left: '12px',
    padding: '4px 8px',
    zIndex: 1000000,
    background: '#1d9bf0',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    cursor: 'pointer',
  });
  document.body.appendChild(copyBtn);

  let liveOutput = '';
  const updateLiveBuffer = () => {
    liveBuffer.value = liveOutput;
  };
  const appendLive = async (block) => {
    if (!block || !block.trim()) return;
    liveOutput = liveOutput ? `${liveOutput}\n\n${block}` : block;
    updateLiveBuffer();
    try {
      await navigator.clipboard.writeText(liveOutput);
    } catch {
      /* clipboard may require gesture; ignore */
    }
  };
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(liveOutput);
      setStatus('Copied live buffer.');
    } catch {
      liveBuffer.focus();
      liveBuffer.select();
      setStatus('Select/copy live buffer manually.');
    }
  });

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const timePart = date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const datePart = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${timePart} · ${datePart}`;
  };

  const isRepost = (article) => {
    const socialContext = article.querySelector('[data-testid="socialContext"]');
    return socialContext ? /reposted/i.test(socialContext.innerText || '') : false;
  };

  const expandTweetText = (article) => {
    let expanded = false;
    const showMoreNodes = Array.from(
      article.querySelectorAll('[data-testid="tweet-text-show-more-link"]')
    );
    for (const node of showMoreNodes) {
      const clickable = node.closest('div[role="button"],button') || node;
      try {
        clickable.click();
        expanded = true;
      } catch {
        /* ignore */
      }
    }
    return expanded;
  };

  const clickLoadMore = () => {
    /* Only click safe pagination/retry buttons; avoid "show more replies". */
    const allow = ['retry', 'try again', 'show more results', 'show more'];
    const deny = ['reply', 'repl', 'replies'];
    const buttons = Array.from(document.querySelectorAll('button,div[role="button"]'));
    for (const btn of buttons) {
      const label = (btn.innerText || '').trim().toLowerCase();
      if (!label) continue;
      if (deny.some((d) => label.includes(d))) continue;
      if (allow.some((t) => label.includes(t))) {
        try {
          btn.click();
          return true;
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  };

  const parseTweet = (article) => {
    const timeElement = article.querySelector('a[href*="/status/"] time');
    if (!timeElement) return null;
    const owningArticle = timeElement.closest('article');
    if (owningArticle && owningArticle !== article) return null; /* reject if time belongs to nested tweet */

    const link = timeElement.closest('a[href*="/status/"]');
    if (!link || !link.href) return null;

    const idMatch = link.href.match(/status\/(\d+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    if (BANNED_IDS.has(id)) return null;

    let url = link.href.split('?')[0];
    url = url.replace('twitter.com', 'x.com');

    /* Strong handle check: prefer URL path segment. */
    let handleFromUrl = '';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[1] === 'status') {
        handleFromUrl = ensureAt(parts[0]);
      }
    } catch {
      /* ignore URL parse */
    }

    const userNameContainer = article.querySelector('div[data-testid="User-Name"]');
    let displayName = '';
    let handleFromSpans = '';

    if (userNameContainer) {
      const spans = Array.from(userNameContainer.querySelectorAll('span'))
        .map((span) => (span.textContent || '').trim())
        .filter(Boolean);
      handleFromSpans = spans.find((text) => text.startsWith('@')) || '';
      displayName = spans.find((text) => !text.startsWith('@')) || '';
    }

    const handle = ensureAt(handleFromUrl || handleFromSpans);
    if (!handle || handle.toLowerCase() !== HANDLE.toLowerCase()) {
      return null; /* skip anything not from the target handle */
    }

    const textBlocks = Array.from(article.querySelectorAll('div[data-testid="tweetText"]'));
    let text = textBlocks.length ? textBlocks.map((n) => n.innerText).join('\n') : '';
    text = text.replace(/\bShow more\b/gi, '').trim();

    const timeLine = formatTime(timeElement.getAttribute('datetime'));

    return {
      id,
      url,
      displayName,
      handle,
      text,
      timeLine,
      isStop: STOP_ID && id === STOP_ID,
      isRepost: isRepost(article),
    };
  };

  const formatBlock = (tweet) => {
    if (!tweet) return '';
    const headerName = tweet.displayName
      ? `  ${tweet.displayName} ${tweet.handle}`
      : `  ${tweet.handle || HANDLE}`;

    const lines = [
      `  * ${tweet.url}`,
      headerName,
      '',
      tweet.text,
      tweet.timeLine,
    ];

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  };

  const tweetsById = new Map();
  const seenIds = new Set();
  let foundStop = false;
  let idleLoops = 0;

  const getArticles = () => {
    const timeline =
      document.querySelector('div[aria-label^="Timeline"]') ||
      document.querySelector('main');
    const scope = timeline || document;
    return Array.from(scope.querySelectorAll('article[data-testid="tweet"], article'));
  };

  setStatus('Scanning... loop 0/' + MAX_SCROLL_LOOPS);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') requestStop();
  });
  statusEl.addEventListener('click', requestStop);
  window.ljBackupStop = requestStop; /* manual console stop: ljBackupStop() */

  for (
    let loops = 0;
    loops < MAX_SCROLL_LOOPS && idleLoops <= MAX_IDLE_LOOPS && !foundStop && !window[STOP_FLAG];
    loops++
  ) {
    let newItemsThisPass = 0;

    for (const article of getArticles()) {
      if (isNestedTweet(article)) continue; /* skip quoted/embedded tweets */

      const didExpand = expandTweetText(article);
      if (didExpand) {
        await sleep(50);
      }

      const parsed = parseTweet(article);
      if (!parsed || parsed.isRepost) continue;

      if (parsed.isStop) {
        foundStop = true;
      }

      if (seenIds.has(parsed.id)) continue;
      seenIds.add(parsed.id);
      tweetsById.set(parsed.id, parsed);
      await appendLive(formatBlock(parsed));
      newItemsThisPass += 1;
    }

    if (foundStop) break;

    idleLoops = newItemsThisPass === 0 ? idleLoops + 1 : 0;
    setStatus(
      `Scanning... loop ${loops + 1}/${MAX_SCROLL_LOOPS} | kept ${tweetsById.size} | idle ${idleLoops}`
    );

    clickLoadMore();

    const nearBottom =
      document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    const target =
      nearBottom < window.innerHeight * 2
        ? document.documentElement.scrollHeight
        : window.scrollY + window.innerHeight * 2;
    window.scrollTo({ top: target, behavior: 'smooth' });
    await sleep(SCROLL_DELAY_MS);
  }

  const timeAnchors = Array.from(document.querySelectorAll('a[href*="/status/"] time'))
    .map((timeNode) => timeNode.closest('a[href*="/status/"]'))
    .filter(Boolean);
  const orderedIds = [];
  for (const anchor of timeAnchors) {
    const match = anchor.href.match(/status\/(\d+)/);
    if (!match) continue;
    const id = match[1];
    if (STOP_ID && id === STOP_ID) break;
    if (tweetsById.has(id)) orderedIds.push(id);
  }

  const outputIds = [];
  const added = new Set();
  for (const id of orderedIds) {
    if (added.has(id)) continue;
    added.add(id);
    outputIds.push(id);
  }

  if (!outputIds.length) {
    setStatus('No new posts above STOP.');
    setTimeout(() => statusEl.remove(), 4000);
    alert('No new posts found above the STOP tweet.');
    return;
  }

  const blocks = outputIds
    .map((id) => tweetsById.get(id))
    .filter(Boolean)
    .map((tweet) => formatBlock(tweet))
    .filter((block) => block.trim().length > 0);

  const output = blocks.join('\n\n');

  if (!output.trim()) {
    setStatus('Collected posts were empty after formatting.');
    setTimeout(() => statusEl.remove(), 4000);
    alert('Collected posts were empty after formatting.');
    return;
  }

  let stopWarning = '';
  if (STOP_ID && !foundStop) {
    stopWarning = `\n\nWARNING: STOP tweet ${STOP_ID} was not reached before scrolling stopped.`;
  }

  setStatus(`Done. Saved ${outputIds.length} post(s).`);

  try {
    await navigator.clipboard.writeText(output);
  } catch {
    /* Clipboard permissions are optional */
  }

  const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = 'twitter-LJ-posts-archive-block.txt';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(downloadUrl);

  const overlay = document.createElement('textarea');
  overlay.value = output;
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '5%',
    left: '5%',
    width: '90%',
    height: '80%',
    zIndex: 999999,
    background: '#fff',
    color: '#000',
    padding: '10px',
    border: '2px solid #333',
    fontFamily: 'monospace',
    fontSize: '12px',
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
  overlay.focus();
  overlay.select();

  alert('New posts copied/downloaded. You can also copy from the big textarea (Esc to close).' + stopWarning);
  setTimeout(() => statusEl.remove(), 6000);
})();

/* CREATE_BOOKMARKLET_COPY

node - <<'NODE'
const fs = require('fs');
const src = fs.readFileSync('twitter-LJ-posts-archive-bookmarklet.js','utf8');
const beforeComment = src.split('/* CREATE_BOOKMARKLET_COPY')[0]; /* ignore instructions */
const body = beforeComment.replace(/^javascript:\s*/i, '').trim();
const min = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
const one = 'javascript:' + min;
fs.writeFileSync('twitter-LJ-posts-archive-bookmarklet.txt', one);
require('child_process').spawnSync('pbcopy', { input: one }); /* use xclip if preferred */
console.log('Copied to clipboard and saved to twitter-LJ-posts-archive-bookmarklet.txt');
console.log('Length:', one.length);
console.log('Preview:', one.slice(0, 120) + ' ... ' + one.slice(-40));
NODE

*/
