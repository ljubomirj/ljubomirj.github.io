javascript:(async () => {
  const HANDLE = '@ljupc0';
  const SCROLL_DELAY_MS = 1200;
  const MAX_SCROLL_LOOPS = 600;
  const MAX_IDLE_LOOPS = 10;

  const STOP_ID = (prompt('Enter STOP tweet ID (already archived):') || '').trim();
  if (STOP_ID && !/^\d+$/.test(STOP_ID)) {
    alert('Invalid STOP ID. Use digits only.');
    return;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (!socialContext) return false;
    return /reposted/i.test(socialContext.innerText || '');
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
      } catch (err) {
        /* ignore */
      }
    }

    return expanded;
  };

  const parseTweet = (article) => {
    const timeElement = article.querySelector('a[href*="/status/"] time');
    if (!timeElement) return null;

    const link = timeElement.closest('a[href*="/status/"]');
    if (!link || !link.href) return null;

    const idMatch = link.href.match(/status\/(\d+)/);
    if (!idMatch) return null;
    const id = idMatch[1];

    if (STOP_ID && id === STOP_ID) {
      return { id, isStop: true };
    }

    if (isRepost(article)) return null;

    let url = link.href.split('?')[0];
    url = url.replace('twitter.com', 'x.com');

    const userNameContainer = article.querySelector('div[data-testid="User-Name"]');
    let displayName = '';
    let handle = '';

    if (userNameContainer) {
      const spans = Array.from(userNameContainer.querySelectorAll('span'))
        .map((span) => (span.textContent || '').trim())
        .filter(Boolean);
      handle = spans.find((text) => text.startsWith('@')) || HANDLE;
      displayName = spans.find((text) => !text.startsWith('@')) || '';
    } else {
      handle = HANDLE;
    }

    if (handle.toLowerCase() !== HANDLE.toLowerCase()) {
      return null;
    }

    const textNode = article.querySelector('div[data-testid="tweetText"]');
    const text = textNode ? textNode.innerText.trim() : '';

    const timeLine = formatTime(timeElement.getAttribute('datetime'));

    return {
      id,
      url,
      displayName,
      handle,
      text,
      timeLine,
    };
  };

  const tweetsById = new Map();
  const orderedIds = [];
  const seenIds = new Set();

  let foundStop = false;
  let loops = 0;
  let idleLoops = 0;
  let lastScrollHeight = 0;

  while (!foundStop && loops < MAX_SCROLL_LOOPS && idleLoops <= MAX_IDLE_LOOPS) {
    const articles = Array.from(document.querySelectorAll('article'));
    let newItemsThisPass = 0;

    for (const article of articles) {
      const didExpand = expandTweetText(article);
      if (didExpand) {
        await sleep(60);
      }

      const parsed = parseTweet(article);
      if (!parsed) continue;

      if (parsed.isStop) {
        foundStop = true;
        break;
      }

      const { id } = parsed;
      if (seenIds.has(id)) continue;

      seenIds.add(id);
      tweetsById.set(id, parsed);
      orderedIds.push(id);
      newItemsThisPass += 1;
    }

    if (foundStop) break;

    if (newItemsThisPass === 0) {
      idleLoops += 1;
    } else {
      idleLoops = 0;
    }

    const currentHeight = document.documentElement.scrollHeight;
    if (currentHeight <= lastScrollHeight) {
      idleLoops += 1;
    } else {
      lastScrollHeight = currentHeight;
    }

    window.scrollTo({ top: currentHeight, behavior: 'smooth' });
    await sleep(SCROLL_DELAY_MS);
    loops += 1;
  }

  const outputIds = [];
  for (const id of orderedIds) {
    if (STOP_ID && id === STOP_ID) break;
    outputIds.push(id);
  }

  if (!outputIds.length) {
    alert('No new posts found above the STOP tweet.');
    return;
  }

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

  const blocks = outputIds
    .map((id) => tweetsById.get(id))
    .filter(Boolean)
    .map((tweet) => formatBlock(tweet))
    .filter((block) => block.trim().length > 0);

  const output = blocks.join('\n\n');

  if (!output.trim()) {
    alert('Collected posts were empty after formatting.');
    return;
  }

  let stopWarning = '';
  if (STOP_ID && !foundStop) {
    stopWarning = `\n\nWARNING: STOP tweet ${STOP_ID} was not reached before scrolling stopped.`;
  }

  try {
    await navigator.clipboard.writeText(output);
  } catch (err) {
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
})();
