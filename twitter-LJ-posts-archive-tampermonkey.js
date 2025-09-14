// ==UserScript==
// @name         X Backup (LJ posts only, no API) + STOP helpers
// @namespace    https://ljubomirj.github.io/
// @version      0.2.0
// @description  Backup your posts/replies from X live search; no API; scrolls to STOP ID, skips reposts, copies + downloads block. Adds STOP helpers.
// @author       LJ
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

// Usage
// 
// - Click “Backup” on your live search page.
// - To set STOP to newest without typing it:
//     - Click “Set STOP to newest visible”.
// - After a backup run, accept the prompt to update STOP to the newest archived ID.
// - Next time, you can just click “Run Backup” (it remembers STOP per handle).
// 
// - Set STOP to newest visible: one click to set STOP to the newest tweet currently on the page.
// - After backup finishes: prompt to set STOP to the newest archived ID so you don’t paste it next time.
// 
// Install/Update
// 
// - Open Tampermonkey → Create a new script (or replace your existing one) → paste the script below → Save.
// - Go to your live search page: https://x.com/search?q=(from%3Aljupc0)&src=typed_query&f=live

(function () {
  'use strict';

  const UI_ID = 'lj-xbk-panel';
  const BTN_ID = 'lj-xbk-btn';

  const getStopKey = (handle) => 'lj_xbk_stop_' + (handle.startsWith('@') ? handle : '@' + handle);
  const ensureAt = (h) => h.startsWith('@') ? h : '@' + h;

  GM_addStyle(`
    #${BTN_ID} {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      background: #1d9bf0; color: #fff; border: none; border-radius: 20px;
      padding: 8px 14px; font-size: 14px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.2);
    }
    #${BTN_ID}:hover { background: #1279bd; }
    #${UI_ID} {
      position: fixed; right: 16px; bottom: 56px; z-index: 2147483647;
      background: #fff; color: #000; border: 1px solid #ccc; border-radius: 8px;
      padding: 10px; width: 340px; box-shadow: 0 6px 20px rgba(0,0,0,.2); display: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px;
    }
    #${UI_ID} label { display: block; margin: 6px 0 4px; font-weight: 600; }
    #${UI_ID} input {
      width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px;
    }
    #${UI_ID} .row { display: flex; gap: 8px; }
    #${UI_ID} .row.wrap { flex-wrap: wrap; }
    #${UI_ID} .row > div { flex: 1; }
    #${UI_ID} .actions { margin-top: 10px; display: flex; gap: 8px; }
    #${UI_ID} button {
      padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;
      background: #1d9bf0; color: #fff;
    }
    #${UI_ID} button.secondary { background: #aaa; color: #fff; }
    #${UI_ID} button.small { padding: 4px 8px; font-size: 12px; }
    .lj-xbk-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2147483646; display: none;
      align-items: center; justify-content: center; color: #fff; font-size: 14px;
    }
    .lj-xbk-overlay .box {
      background: #111; border: 1px solid #333; padding: 14px; border-radius: 8px; width: 420px;
    }
    .lj-xbk-overlay .bar { height: 6px; background: #333; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .lj-xbk-overlay .bar span { display: block; height: 100%; width: 0%; background: #1d9bf0; transition: width .2s; }
  `);

  function isSearchFromPage() {
    const u = new URL(location.href);
    if (u.pathname !== '/search') return false;
    const q = decodeURIComponent(u.searchParams.get('q') || '');
    return /(^|\W)from:/.test(q);
  }

  function extractHandleFromQuery() {
    try {
      const u = new URL(location.href);
      const q = decodeURIComponent(u.searchParams.get('q') || '');
      const m = q.match(/from:([A-Za-z0-9_]+)/i);
      if (m) return '@' + m[1];
    } catch {}
    return '@ljupc0';
  }

  function newestVisibleStatusId() {
    // Use time anchors to avoid IDs from embedded links/cards
    const timeAnchors = Array.from(document.querySelectorAll('a[href*="/status/"] time'))
      .map(t => t.closest('a[href*="/status/"]'))
      .filter(Boolean);
    for (const a of timeAnchors) {
      const m = a.href.match(/status\/(\d+)/);
      if (m && m[1]) return m[1];
    }
    return '';
  }

  function ensureUI() {
    if (!isSearchFromPage()) {
      document.getElementById(BTN_ID)?.remove();
      document.getElementById(UI_ID)?.remove();
      return;
    }
    if (!document.getElementById(BTN_ID)) createUI();
  }

  function createUI() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Backup';
    document.body.appendChild(btn);

    const defaultHandle = extractHandleFromQuery();
    const panel = document.createElement('div');
    panel.id = UI_ID;
    panel.innerHTML = `
      <div><strong>X Backup (no API)</strong></div>
      <label>Handle</label>
      <input type="text" id="lj-xbk-handle" value="${defaultHandle}">
      <label>STOP Tweet ID (already archived)</label>
      <input type="text" id="lj-xbk-stop" placeholder="e.g. 1966936750456271152" value="${GM_getValue(getStopKey(defaultHandle), '')}">
      <div class="row wrap" style="margin-top:6px;">
        <button id="lj-xbk-stop-newest" class="secondary small" title="Set STOP to the newest visible tweet">Set STOP to newest visible</button>
        <button id="lj-xbk-stop-clear" class="secondary small">Clear STOP</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <div>
          <label>Scroll max</label>
          <input type="number" id="lj-xbk-max" min="1" max="300" value="${GM_getValue('lj_xbk_max', 80)}">
        </div>
        <div>
          <label>Pause ms</label>
          <input type="number" id="lj-xbk-pause" min="200" step="100" value="${GM_getValue('lj_xbk_pause', 1200)}">
        </div>
      </div>
      <div class="actions">
        <button id="lj-xbk-run">Run Backup</button>
        <button class="secondary" id="lj-xbk-close">Close</button>
      </div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.className = 'lj-xbk-overlay';
    overlay.innerHTML = `
      <div class="box">
        <div id="lj-xbk-status">Starting…</div>
        <div class="bar"><span id="lj-xbk-bar"></span></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const stopInput = panel.querySelector('#lj-xbk-stop');
    const handleInput = panel.querySelector('#lj-xbk-handle');

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
    });
    panel.querySelector('#lj-xbk-close').addEventListener('click', () => { panel.style.display = 'none'; });

    panel.querySelector('#lj-xbk-stop-newest').addEventListener('click', () => {
      const h = ensureAt(handleInput.value.trim() || defaultHandle);
      const id = newestVisibleStatusId();
      if (!id) {
        alert('Could not find a visible tweet. Scroll the page a bit and try again.');
        return;
      }
      stopInput.value = id;
      GM_setValue(getStopKey(h), id);
      alert('STOP set to newest visible: ' + id);
    });

    panel.querySelector('#lj-xbk-stop-clear').addEventListener('click', () => {
      const h = ensureAt(handleInput.value.trim() || defaultHandle);
      stopInput.value = '';
      GM_setValue(getStopKey(h), '');
      alert('STOP cleared.');
    });

    panel.querySelector('#lj-xbk-run').addEventListener('click', async () => {
      const handle = ensureAt((handleInput.value || '').trim() || defaultHandle);
      const stopId = (stopInput.value || '').trim();
      const maxScroll = parseInt(panel.querySelector('#lj-xbk-max').value || '80', 10);
      const pause = parseInt(panel.querySelector('#lj-xbk-pause').value || '1200', 10);

      GM_setValue(getStopKey(handle), stopId);
      GM_setValue('lj_xbk_max', maxScroll);
      GM_setValue('lj_xbk_pause', pause);

      panel.style.display = 'none';
      overlay.style.display = 'flex';

      try {
        const result = await runBackup({
          handle, stopId, maxScroll, pause,
          onProgress: prog => {
            const s = document.getElementById('lj-xbk-status');
            const b = document.getElementById('lj-xbk-bar');
            if (s) s.textContent = prog.text || '';
            if (b && prog.ratio != null) b.style.width = Math.round(100 * prog.ratio) + '%';
          }
        });

        overlay.style.display = 'none';

        if (!result || !result.block?.trim()) {
          return; // message already shown inside runBackup for empty case
        }

        // Clipboard
        let copied = false;
        try {
          await navigator.clipboard.writeText(result.block);
          copied = true;
        } catch {}
        if (!copied) {
          const ta = document.createElement('textarea');
          ta.value = result.block;
          Object.assign(ta.style, {
            position: 'fixed', top: '5%', left: '5%', width: '90%', height: '80%',
            zIndex: 2147483647, background: '#fff', color: '#000', padding: '10px',
            border: '2px solid #333', fontFamily: 'monospace', fontSize: '12px'
          });
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          try { document.execCommand('copy'); } catch {}
          ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.remove(); });
          alert('Backup done. Textarea shown (Esc to close).');
        } else {
          alert('Backup done. Copied to clipboard and file downloaded.');
        }

        // Download file
        const blob = new Blob([result.block], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'twitter-LJ-posts-archive-block.txt';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);

        // Offer to update STOP to newest archived
        if (result.newestArchivedId) {
          const ok = confirm('Set STOP to newest archived ID now?\n' + result.newestArchivedId);
          if (ok) {
            stopInput.value = result.newestArchivedId;
            GM_setValue(getStopKey(handle), result.newestArchivedId);
          }
        }
      } catch (e) {
        overlay.style.display = 'none';
        alert('Backup failed: ' + e);
        console.error(e);
      }
    });
  }

  async function runBackup({ handle='@ljupc0', stopId='', maxScroll=80, pause=1200, onProgress=()=>{} }) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    handle = ensureAt(handle);

    const formatTime = (iso) => {
      if (!iso) return '';
      const dt = new Date(iso);
      const time = dt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${time} · ${date}`;
    };

    const isRepost = (article) => {
      const sc = article.querySelector('[data-testid="socialContext"]');
      return sc && /reposted/i.test(sc.innerText);
    };

    const parseTweet = (article) => {
      const timeEl = article.querySelector('a[href*="/status/"] time');
      if (!timeEl) return null;
      const a = timeEl.closest('a[href*="/status/"]');
      const url = a?.href || '';
      const m = url.match(/status\/(\d+)/);
      if (!m) return null;
      const id = m[1];

      if (isRepost(article)) return { id, isRepost: true };

      let displayName = '';
      let h = '';
      const nameNode = article.querySelector('div[data-testid="User-Name"]');
      if (nameNode) {
        const spans = Array.from(nameNode.querySelectorAll('span')).map(s => (s.textContent || '').trim()).filter(Boolean);
        h = spans.find(s => s.startsWith('@')) || handle;
        displayName = spans.find(s => !s.startsWith('@')) || '';
      } else {
        h = handle;
        displayName = '';
      }

      const textBlocks = Array.from(article.querySelectorAll('div[data-testid="tweetText"]'));
      let text = textBlocks.length ? textBlocks.map(n => n.innerText).join('\n') : '';
      text = text.replace(/\bShow more\b/gi, '').trim();

      const iso = timeEl.getAttribute('datetime') || '';
      const timeLine = formatTime(iso);

      return { id, url, displayName, handle: h, text, timeLine, isRepost: false };
    };

    const articles = () => Array.from(document.querySelectorAll('article[data-testid="tweet"], article'));
    const seenIds = new Set();
    const collected = new Map(); // id -> tweet

    let foundStop = false;

    for (let i = 0; i < maxScroll && !foundStop; i++) {
      onProgress({ text: `Scanning… (${i+1}/${maxScroll})`, ratio: i / maxScroll });

      for (const art of articles()) {
        const t = parseTweet(art);
        if (!t || !t.id) continue;
        if (t.id === stopId && stopId) { foundStop = true; }
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        if (!t.isRepost) collected.set(t.id, t);
      }

      if (foundStop) break;

      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(pause);
    }

    // Determine order from time anchors (newest first)
    const timeAnchors = Array.from(document.querySelectorAll('a[href*="/status/"] time'))
      .map(t => t.closest('a[href*="/status/"]'))
      .filter(Boolean);
    const idsInOrder = timeAnchors
      .map(a => (a.href.match(/status\/(\d+)/) || [])[1])
      .filter(Boolean);

    const outIds = [];
    for (const id of idsInOrder) {
      if (stopId && id === stopId) break; // stop at already archived head
      if (collected.has(id)) outIds.push(id);
    }

    // De-dup preserving order
    const orderedUnique = [];
    const added = new Set();
    for (const id of outIds) {
      if (!added.has(id)) { added.add(id); orderedUnique.push(id); }
    }

    const formatBlock = (item) => {
      const lines = [];
      lines.push(`  * ${item.url}`);
      lines.push('');
      if (item.displayName) lines.push(item.displayName);
      lines.push(item.handle || handle);
      lines.push('');
      lines.push(item.text || '');
      lines.push(item.timeLine || '');
      return lines.join('\n');
    };

    const block = orderedUnique.map(id => formatBlock(collected.get(id))).join('\n\n');
    if (!block.trim()) {
      onProgress({ text: 'No new posts above STOP.', ratio: 1 });
      alert('No new posts found above STOP.');
      return { block: '' };
    }

    onProgress({ text: 'Done.', ratio: 1 });
    return { block, newestArchivedId: orderedUnique[0] || '' };
  }

  function boot() {
    ensureUI();
    setInterval(ensureUI, 2500); // SPA route changes
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();



// ==UserScript==
// @name         X Backup (LJ posts only, no API)
// @namespace    https://ljubomirj.github.io/
// @version      0.1.0
// @description  Backup your posts/replies from X live search; no API; scrolls to STOP ID, skips reposts, copies + downloads block.
// @author       LJ
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const UI_ID = 'lj-xbk-panel';
  const BTN_ID = 'lj-xbk-btn';

  // Basic styles
  GM_addStyle(`
    #${BTN_ID} {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      background: #1d9bf0; color: #fff; border: none; border-radius: 20px;
      padding: 8px 14px; font-size: 14px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.2);
    }
    #${BTN_ID}:hover { background: #1279bd; }
    #${UI_ID} {
      position: fixed; right: 16px; bottom: 56px; z-index: 2147483647;
      background: #fff; color: #000; border: 1px solid #ccc; border-radius: 8px;
      padding: 10px; width: 320px; box-shadow: 0 6px 20px rgba(0,0,0,.2); display: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px;
    }
    #${UI_ID} label { display: block; margin: 6px 0 4px; font-weight: 600; }
    #${UI_ID} input {
      width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px;
    }
    #${UI_ID} .row { display: flex; gap: 8px; }
    #${UI_ID} .row > div { flex: 1; }
    #${UI_ID} .actions { margin-top: 10px; display: flex; gap: 8px; }
    #${UI_ID} button {
      padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;
      background: #1d9bf0; color: #fff;
    }
    #${UI_ID} button.secondary { background: #aaa; color: #fff; }
    .lj-xbk-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2147483646; display: none;
      align-items: center; justify-content: center; color: #fff; font-size: 14px;
    }
    .lj-xbk-overlay .box {
      background: #111; border: 1px solid #333; padding: 14px; border-radius: 8px; width: 420px;
    }
    .lj-xbk-overlay .bar { height: 6px; background: #333; border-radius: 4px; overflow: hidden; margin-top: 10px; }
    .lj-xbk-overlay .bar span { display: block; height: 100%; width: 0%; background: #1d9bf0; transition: width .2s; }
  `);

  function isSearchFromPage() {
    const u = new URL(location.href);
    if (u.pathname !== '/search') return false;
    const q = decodeURIComponent(u.searchParams.get('q') || '');
    return /(^|\W)from:/.test(q);
  }

  function extractHandleFromQuery() {
    try {
      const u = new URL(location.href);
      const q = decodeURIComponent(u.searchParams.get('q') || '');
      const m = q.match(/from:([A-Za-z0-9_]+)/i);
      if (m) return '@' + m[1];
    } catch {}
    return '@ljupc0';
  }

  function ensureUI() {
    // Only show on the live search page with from:...
    if (!isSearchFromPage()) {
      const btn = document.getElementById(BTN_ID);
      const panel = document.getElementById(UI_ID);
      if (btn) btn.remove();
      if (panel) panel.remove();
      return;
    }
    if (!document.getElementById(BTN_ID)) createUI();
  }

  function createUI() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Backup';
    document.body.appendChild(btn);

    const panel = document.createElement('div');
    panel.id = UI_ID;
    panel.innerHTML = `
      <div><strong>X Backup (no API)</strong></div>
      <label>Handle</label>
      <input type="text" id="lj-xbk-handle" value="${extractHandleFromQuery()}">
      <label>STOP Tweet ID (already archived)</label>
      <input type="text" id="lj-xbk-stop" placeholder="e.g. 1966936750456271152" value="${GM_getValue('lj_xbk_stop_'+extractHandleFromQuery(), '')}">
      <div class="row">
        <div>
          <label>Scroll max</label>
          <input type="number" id="lj-xbk-max" min="1" max="300" value="${GM_getValue('lj_xbk_max', 80)}">
        </div>
        <div>
          <label>Pause ms</label>
          <input type="number" id="lj-xbk-pause" min="200" step="100" value="${GM_getValue('lj_xbk_pause', 1200)}">
        </div>
      </div>
      <div class="actions">
        <button id="lj-xbk-run">Run Backup</button>
        <button class="secondary" id="lj-xbk-close">Close</button>
      </div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.className = 'lj-xbk-overlay';
    overlay.innerHTML = `
      <div class="box">
        <div id="lj-xbk-status">Starting…</div>
        <div class="bar"><span id="lj-xbk-bar"></span></div>
      </div>
    `;
    document.body.appendChild(overlay);

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
    });
    document.getElementById('lj-xbk-close').addEventListener('click', () => { panel.style.display = 'none'; });

    document.getElementById('lj-xbk-run').addEventListener('click', async () => {
      const handle = (document.getElementById('lj-xbk-handle').value || '').trim() || extractHandleFromQuery();
      const stopId = (document.getElementById('lj-xbk-stop').value || '').trim();
      const maxScroll = parseInt(document.getElementById('lj-xbk-max').value || '80', 10);
      const pause = parseInt(document.getElementById('lj-xbk-pause').value || '1200', 10);

      GM_setValue('lj_xbk_stop_'+handle, stopId);
      GM_setValue('lj_xbk_max', maxScroll);
      GM_setValue('lj_xbk_pause', pause);

      panel.style.display = 'none';
      overlay.style.display = 'flex';

      try {
        const result = await runBackup({ handle, stopId, maxScroll, pause, onProgress: prog => {
          const s = document.getElementById('lj-xbk-status');
          const b = document.getElementById('lj-xbk-bar');
          if (s) s.textContent = prog.text || '';
          if (b && prog.ratio != null) b.style.width = Math.round(100*prog.ratio) + '%';
        }});
        overlay.style.display = 'none';

        if (result && result.block) {
          // Copy to clipboard (fallback to textarea)
          let copied = false;
          try {
            await navigator.clipboard.writeText(result.block);
            copied = true;
          } catch {}
          if (!copied) {
            const ta = document.createElement('textarea');
            ta.value = result.block;
            Object.assign(ta.style, {
              position: 'fixed', top: '5%', left: '5%', width: '90%', height: '80%',
              zIndex: 2147483647, background: '#fff', color: '#000', padding: '10px',
              border: '2px solid #333', fontFamily: 'monospace', fontSize: '12px'
            });
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { document.execCommand('copy'); } catch {}
            ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.remove(); });
            alert('Backup done. Textarea shown (Esc to close).');
          } else {
            alert('Backup done. Copied to clipboard and file downloaded.');
          }

          // Download
          const blob = new Blob([result.block], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'twitter-LJ-posts-archive-block.txt';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        overlay.style.display = 'none';
        alert('Backup failed: ' + e);
        console.error(e);
      }
    });
  }

  async function runBackup({ handle='@ljupc0', stopId='', maxScroll=80, pause=1200, onProgress=()=>{} }) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    if (!handle.startsWith('@')) handle = '@' + handle;

    const formatTime = (iso) => {
      if (!iso) return '';
      const dt = new Date(iso);
      const time = dt.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${time} · ${date}`;
    };

    const isRepost = (article) => {
      const sc = article.querySelector('[data-testid="socialContext"]');
      return sc && /reposted/i.test(sc.innerText);
    };

    const parseTweet = (article) => {
      const timeEl = article.querySelector('a[href*="/status/"] time');
      if (!timeEl) return null;
      const a = timeEl.closest('a[href*="/status/"]');
      const url = a?.href || '';
      const m = url.match(/status\/(\d+)/);
      if (!m) return null;
      const id = m[1];

      if (isRepost(article)) return { id, isRepost: true };

      let displayName = '';
      let h = '';
      const nameNode = article.querySelector('div[data-testid="User-Name"]');
      if (nameNode) {
        const spans = Array.from(nameNode.querySelectorAll('span')).map(s => (s.textContent || '').trim()).filter(Boolean);
        h = spans.find(s => s.startsWith('@')) || handle;
        displayName = spans.find(s => !s.startsWith('@')) || '';
      } else {
        h = handle;
        displayName = '';
      }

      const textBlocks = Array.from(article.querySelectorAll('div[data-testid="tweetText"]'));
      let text = textBlocks.length ? textBlocks.map(n => n.innerText).join('\n') : '';
      text = text.replace(/\bShow more\b/gi, '').trim();

      const iso = timeEl.getAttribute('datetime') || '';
      const timeLine = formatTime(iso);

      return { id, url, displayName, handle: h, text, timeLine, isRepost: false };
    };

    const articles = () => Array.from(document.querySelectorAll('article[data-testid="tweet"], article'));
    const seenIds = new Set();
    const collected = new Map(); // id -> tweet

    let foundStop = false;

    for (let i = 0; i < maxScroll && !foundStop; i++) {
      onProgress({ text: `Scanning… (${i+1}/${maxScroll})`, ratio: i / maxScroll });

      for (const art of articles()) {
        const t = parseTweet(art);
        if (!t || !t.id) continue;
        if (t.id === stopId && stopId) { foundStop = true; }
        if (seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        if (!t.isRepost) collected.set(t.id, t);
      }

      if (foundStop) break;

      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await sleep(pause);
    }

    // Build ordered list: from timestamp anchors only (avoids linked statuses within cards)
    const timeAnchors = Array.from(document.querySelectorAll('a[href*="/status/"] time'))
      .map(t => t.closest('a[href*="/status/"]'))
      .filter(Boolean);
    const idsInOrder = timeAnchors
      .map(a => (a.href.match(/status\/(\d+)/) || [])[1])
      .filter(Boolean);

    const outIds = [];
    for (const id of idsInOrder) {
      if (stopId && id === stopId) break; // stop when reaching already archived head
      if (collected.has(id)) outIds.push(id);
    }

    // De-dup while preserving order
    const orderedUnique = [];
    const added = new Set();
    for (const id of outIds) {
      if (!added.has(id)) { added.add(id); orderedUnique.push(id); }
    }

    const formatBlock = (item) => {
      const lines = [];
      lines.push(`  * ${item.url}`);
      lines.push('');
      if (item.displayName) lines.push(item.displayName);
      lines.push(item.handle || handle);
      lines.push('');
      lines.push(item.text || '');
      lines.push(item.timeLine || '');
      return lines.join('\n');
    };

    const block = orderedUnique.map(id => formatBlock(collected.get(id))).join('\n\n');
    if (!block.trim()) {
      onProgress({ text: 'No new posts above STOP.', ratio: 1 });
      alert('No new posts found above STOP.');
      return { block: '' };
    }

    onProgress({ text: 'Done.', ratio: 1 });
    return { block };
  }

  // Keep UI alive across SPA route changes
  function boot() {
    ensureUI();
    setInterval(ensureUI, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

