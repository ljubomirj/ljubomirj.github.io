(async()=>{
  const HANDLE = '@ljupc0';
  const SCROLL_PAUSE_MS = 1200;
  const SCROLL_MAX = 80;

  const STOP_ID = (prompt('Enter STOP tweet ID (already archived):') || '').trim();
  if (STOP_ID && !/^\d+$/.test(STOP_ID)) {
    alert('Invalid STOP ID. Use digits only.');
    return;
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const formatTime = iso => {
    const dt = new Date(iso);
    const time = dt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${time} · ${date}`;
  };

  const isRepost = article => {
    const sc = article.querySelector('[data-testid="socialContext"]');
    return sc && /reposted/i.test(sc.innerText);
  };

  const parseTweet = article => {
    const timeEl = article.querySelector('a[href*="/status/"] time');
    if (!timeEl) return null;

    const anchor = timeEl.closest('a[href*="/status/"]');
    const url = anchor?.href || '';
    const idMatch = url.match(/status\/(\d+)/);
    if (!idMatch) return null;

    const id = idMatch[1];
    if (isRepost(article)) {
      return { id, isRepost: true };
    }

    let displayName = '';
    let handle = '';
    const nameNode = article.querySelector('div[data-testid="User-Name"]');

    if (nameNode) {
      const spans = Array.from(nameNode.querySelectorAll('span'))
        .map(span => (span.textContent || '').trim())
        .filter(Boolean);

      handle = spans.find(text => text.startsWith('@')) || HANDLE;
      displayName = spans.find(text => !text.startsWith('@')) || '';
    } else {
      handle = HANDLE;
      displayName = '';
    }

    const textBlocks = Array.from(article.querySelectorAll('div[data-testid="tweetText"]'));
    const text = textBlocks.length ? textBlocks.map(node => node.innerText).join('\n') : '';

    const iso = timeEl.getAttribute('datetime') || '';
    const timeLine = iso ? formatTime(iso) : '';

    return { id, url, displayName, handle, text, timeLine, isRepost: false };
  };

  const getAllTweetArticles = () => Array.from(document.querySelectorAll('article'));

  const extractNewerThanStop = seenIds => {
    const articles = getAllTweetArticles();
    const items = [];

    for (const article of articles) {
      const tweet = parseTweet(article);
      if (!tweet || !tweet.id || seenIds.has(tweet.id)) continue;
      seenIds.add(tweet.id);
      items.push(tweet);
    }

    return items;
  };

  const formatBlock = item => {
    const lines = [];
    lines.push(`  * ${item.url}`);
    lines.push('');
    if (item.displayName) lines.push(item.displayName);
    lines.push(item.handle || HANDLE);
    lines.push('');
    lines.push(item.text || '');
    lines.push(item.timeLine || '');
    return lines.join('\n');
  };

  const collectedById = new Map();
  const seenInDom = new Set();
  let foundStop = false;

  for (let i = 0; i < SCROLL_MAX && !foundStop; i += 1) {
    const newlyParsed = extractNewerThanStop(seenInDom);

    if (STOP_ID && document.querySelector(`a[href*="/status/${STOP_ID}"]`)) {
      foundStop = true;
    }

    for (const tweet of newlyParsed) {
      if (tweet.isRepost) continue;
      if (tweet.url && tweet.url.includes('/status/')) {
        collectedById.set(tweet.id, tweet);
      }
    }

    if (foundStop) break;

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await sleep(SCROLL_PAUSE_MS);
  }

  const anchors = Array.from(document.querySelectorAll('a[href*="/status/"]'))
    .map(anchor => anchor.href)
    .filter(href => /\/status\/\d+/.test(href));

  const idsInDomOrder = anchors
    .map(href => (href.match(/status\/(\d+)/) || [])[1])
    .filter(Boolean);

  const outIds = [];

  for (const id of idsInDomOrder) {
    if (STOP_ID && id === STOP_ID) break;
    if (collectedById.has(id)) outIds.push(id);
  }

  const orderedUnique = [];
  const added = new Set();

  for (const id of outIds) {
    if (!added.has(id)) {
      added.add(id);
      orderedUnique.push(id);
    }
  }

  const block = orderedUnique
    .map(id => formatBlock(collectedById.get(id)))
    .join('\n\n');

  if (!block.trim()) {
    alert('No new posts found above STOP.');
    return;
  }

  try {
    await navigator.clipboard.writeText(block);
  } catch (error) {
    console.warn('Clipboard write failed', error);
  }

  const blob = new Blob([block], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = downloadUrl;
  downloadAnchor.download = 'twitter-LJ-posts-archive-block.txt';
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(downloadUrl);

  const textarea = document.createElement('textarea');
  textarea.value = block;
  Object.assign(textarea.style, {
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
    fontSize: '12px'
  });

  document.body.appendChild(textarea);
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Escape') textarea.remove();
  });

  textarea.focus();
  textarea.select();

  alert('New posts copied/downloaded. You can also copy from the big textarea (Esc to close).');
})();
