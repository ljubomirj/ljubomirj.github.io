javascript:(async () => {
  const HANDLE = '@ljupc0';
  const SCROLL_DELAY_MS = 1200;
  const MAX_SCROLL_LOOPS = 400;
  const MAX_IDLE_LOOPS = 40;
  const EXPAND_LONG_TWEETS = true;
  const BANNED_IDS = new Set([
    /* Known stray post to ignore (Zhihu Frontier) */
    '1987125624599970218',
  ]);

  const STOP_ID = (prompt('Enter STOP tweet ID (already archived):') || '').trim();
  if (STOP_ID && !/^\d+$/.test(STOP_ID)) {
    alert('Invalid STOP ID. Use digits only.');
    return;
  }

  const START_URL = location.href;

  /* Global stop flag so you can halt from console or Escape key. */
  const STOP_FLAG = '__lj_backup_stop__';
  window[STOP_FLAG] = false;
  const requestStop = () => {
    window[STOP_FLAG] = true;
    setStatus('Stop requested...');
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const ensureAt = (h) => (h.startsWith('@') ? h : '@' + h);
  const nodeDepth = (node, root) => {
    let depth = 0;
    let cur = node;
    while (cur && cur !== root) {
      depth += 1;
      cur = cur.parentElement;
    }
    return depth;
  };
  const isNestedTweet = (article) => {
    /* Skip quoted/embedded tweets: those are nested inside another article. */
    const parentArticle = article?.parentElement?.closest('article');
    return Boolean(parentArticle);
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

  const extractText = (article) => {
    const blocks = getMainTweetTextBlocks(article);
    if (!blocks.length) return '';
    const parts = blocks.map((block) => {
      const clone = block.cloneNode(true);
      clone.querySelectorAll('a[href]').forEach((a) => {
        if (a.href) a.textContent = a.href.split('?')[0];
      });
      return clone.textContent || '';
    });
    let text = parts.join('\n');
    text = text.replace(/\bShow more\b/gi, '').trim();
    text = text.replace(/\s*\n\s*/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n /g, '\n').replace(/ \n/g, '\n');
    return text.trim();
  };

  const getMainTweetTextBlocks = (article) => {
    const blocks = Array.from(article.querySelectorAll('div[data-testid="tweetText"]')).filter(
      (block) => block.closest('article') === article
    );
    if (!blocks.length) return [];
    const lengths = blocks.map((block) => (block.textContent || '').trim().length);
    const maxLen = Math.max(...lengths);
    const longest = blocks.filter(
      (block, index) => (block.textContent || '').trim().length === maxLen && maxLen > 0
    );
    return longest.length ? longest : blocks;
  };

  const getMainTextLength = (article) => {
    return getMainTweetTextBlocks(article)
      .map((block) => (block.textContent || '').trim().length)
      .reduce((acc, len) => Math.max(acc, len), 0);
  };

  const expandTweetText = async (article) => {
    if (!EXPAND_LONG_TWEETS) return false;
    let expanded = false;
    const mainBlocks = getMainTweetTextBlocks(article);
    if (!mainBlocks.length) return false;
    const baseLen = getMainTextLength(article);
    const showMoreNodes = (() => {
      const primary = Array.from(
        article.querySelectorAll('[data-testid="tweet-text-show-more-link"]')
      );
      const fallback = Array.from(
        article.querySelectorAll('div[data-testid="tweetText"] [role="button"], div[data-testid="tweetText"] span, div[data-testid="tweetText"] a')
      ).filter((node) => {
        const label = (node.innerText || node.textContent || '').trim();
        return /^show more$/i.test(label);
      });
      return Array.from(new Set([...primary, ...fallback]));
    })();

    const safeClick = (node) => {
      const anchor = node.closest('a[href]');
      const href = anchor ? anchor.getAttribute('href') : '';
      if (anchor) {
        anchor.removeAttribute('href');
        anchor.setAttribute('role', 'button');
      }
      try {
        node.click();
      } catch {
        /* ignore */
      } finally {
        if (anchor && href) anchor.setAttribute('href', href);
      }
    };

    for (const node of showMoreNodes) {
      if (node.closest('article') !== article) continue;
      const block = node.closest('div[data-testid="tweetText"]');
      if (!block || !mainBlocks.includes(block)) continue;
      if (node.closest('a[href*="/status/"]')) continue; /* avoid navigating into a quote */
      safeClick(node);
      expanded = true;
    }
    if (!expanded) return false;

    for (let i = 0; i < 8; i++) {
      await sleep(90);
      const nextLen = getMainTextLength(article);
      if (nextLen > baseLen + 3) break;
    }
    return true;
  };

  const clickLoadMore = () => {
    /* Only click safe pagination/retry buttons; avoid "show more replies". */
    const allow = ['retry', 'try again', 'show more results'];
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

  const pickPrimaryStatusLink = (article) => {
    const timeNodes = Array.from(article.querySelectorAll('a[href*="/status/"] time'));
    const candidates = timeNodes
      .map((time) => ({ time, link: time.closest('a[href*="/status/"]') }))
      .filter((item) => item.link && item.time.closest('article') === article);
    if (!candidates.length) return null;
    const scored = candidates.map((item) => {
      const rect = item.time.getBoundingClientRect();
      return {
        ...item,
        depth: nodeDepth(item.time, article),
        top: Number.isFinite(rect.top) ? rect.top : 0,
      };
    });
    scored.sort((a, b) => a.depth - b.depth || a.top - b.top);
    return scored[0];
  };

  const parseTweet = (article) => {
    const primary = pickPrimaryStatusLink(article);
    if (!primary) return null;

    const timeElement = primary.time;
    const link = primary.link;
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

    const text = extractText(article);

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
    const indent = '  ';
    const headerName = tweet.displayName
      ? `${indent}${tweet.displayName} ${tweet.handle}`
      : `${indent}${tweet.handle || HANDLE}`;

    const lines = [
      `${indent}* ${tweet.url}`,
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

      const didExpand = await expandTweetText(article);
      if (didExpand) {
        await sleep(80);
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
