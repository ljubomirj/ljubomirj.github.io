// File: scripts.js

// *** NEW: Global array to store conversation history ***
let chatHistory = [];

// Load the sidebar from the external file
function loadSidebar() {
    fetch('sidebar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('sidebar').innerHTML = data;
        })
        .catch(error => {
            console.error('Error loading sidebar:', error);
        });
}

// Initialize collapsible subpages inside list items
function initSubpageToggles() {
    const makeHandler = (el, targetId, src) => async (evt) => {
        // Allow click or Enter/Space key
        if (evt.type === 'keydown' && !(evt.key === 'Enter' || evt.key === ' ')) return;
        evt.preventDefault();
        await toggleSubpage(targetId, src, el);
    };

    // Bind to explicit toggle controls
    document.querySelectorAll('.li-toggle').forEach(el => {
        const targetId = el.getAttribute('aria-controls') || el.dataset.target;
        const src = el.dataset.src;
        el.addEventListener('click', makeHandler(el, targetId, src));
        el.addEventListener('keydown', makeHandler(el, targetId, src));
    });

    // Also bind clicking the text to toggle
    document.querySelectorAll('.li-text').forEach(el => {
        const targetId = el.dataset.target || el.getAttribute('aria-controls');
        const src = el.dataset.src;
        if (targetId && src) {
            el.style.userSelect = 'none';
            el.addEventListener('click', makeHandler(el.previousElementSibling || el, targetId, src));
        }
    });
}

// Initialize inline section toggles within loaded content (e.g., logbook entries)
function initInlineToggles() {
    const makeHandler = (el, targetId) => (evt) => {
        if (evt.type === 'keydown' && !(evt.key === 'Enter' || evt.key === ' ')) return;
        evt.preventDefault();
        toggleSection(targetId, el);
    };

    document.querySelectorAll('.sec-toggle').forEach(el => {
        const targetId = el.getAttribute('aria-controls') || el.dataset.target;
        if (!targetId) return;
        el.addEventListener('click', makeHandler(el, targetId));
        el.addEventListener('keydown', makeHandler(el, targetId));
    });

    document.querySelectorAll('.sec-text').forEach(el => {
        const targetId = el.dataset.target || el.getAttribute('aria-controls');
        if (!targetId) return;
        el.style.userSelect = 'none';
        el.style.cursor = 'pointer';
        el.addEventListener('click', makeHandler(el.previousElementSibling || el, targetId));
    });
}

function toggleSection(targetId, toggleEl) {
    const container = document.getElementById(targetId);
    if (!container) return;
    const isHidden = container.hasAttribute('hidden');
    if (isHidden) {
        container.removeAttribute('hidden');
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'true');
        if (toggleEl && (toggleEl.classList.contains('li-toggle') || toggleEl.classList.contains('sec-toggle'))) toggleEl.textContent = '−';
    } else {
        container.setAttribute('hidden', '');
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'false');
        if (toggleEl && (toggleEl.classList.contains('li-toggle') || toggleEl.classList.contains('sec-toggle'))) toggleEl.textContent = '+';
    }
}

async function toggleSubpage(targetId, srcUrl, toggleEl) {
    const container = document.getElementById(targetId);
    if (!container) return;

    const isHidden = container.hasAttribute('hidden');
    if (isHidden) {
        // Load once on first open
        if (!container.dataset.loaded && srcUrl) {
            try {
                const resp = await fetch(srcUrl, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`Failed to load ${srcUrl}: ${resp.status}`);
                const html = await resp.text();
                container.innerHTML = html;
                container.dataset.loaded = 'true';
                // Bind inline toggles inside the newly injected content
                initInlineToggles();
            } catch (e) {
                console.error(e);
                container.innerHTML = `<div class="tweet">Failed to load content: ${e}</div>`;
                container.dataset.loaded = 'true';
            }
        }
        container.removeAttribute('hidden');
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'true');
        if (toggleEl && toggleEl.classList.contains('li-toggle')) toggleEl.textContent = '−';
    } else {
        container.setAttribute('hidden', '');
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'false');
        if (toggleEl && toggleEl.classList.contains('li-toggle')) toggleEl.textContent = '+';
    }
}

// Show image
function showImage(imageId) {
    var img = document.getElementById(imageId);
    img.style.display = 'block'; // Show the image
}

// Show or hide image, depending on the current state
function toggleShowImage(imageId) {
    var img = document.getElementById(imageId);
    if (img.style.display === 'none' || img.style.display === '') {
        // Show the image
        img.style.display = 'block';
    } else {
        // Hide the image
        img.style.display = 'none';
    }
}

// Zoom or unzoom image, depending on the current state
function zoomImage(img) {
    // Check the current width to toggle between states
    if (img.style.width === '100%' || img.style.width === '') {
        // Zoom in
        img.style.imageRendering = 'pixelated';
        img.style.width = 'auto';
        img.style.height = 'auto';
    } else {
        // Reset to original state
        img.style.imageRendering = 'auto';
        img.style.width = '100%';
        img.style.height = 'auto';
    }
}

// Chat functions
function addMessage(text, isUser) {
    const messagesDiv = document.getElementById('messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = isUser ? 'user-msg' : 'ai-msg';
    // Basic sanitation to prevent raw HTML injection, consider a proper library for production
    // Note: Be careful with just replacing < and > - might break legitimate uses if AI generates HTML/XML examples.
    // Consider a more robust sanitizer or displaying code blocks differently if that's needed.
    const safeText = text.replace(/</g, "<").replace(/>/g, ">");
    msgDiv.innerHTML = safeText.replace(/\n/g, '<br>'); // Replace newlines after sanitizing
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Simple retrieval function
function retrieveContext(query, knowledgeBase, topK = 300) {
    if (!knowledgeBase || knowledgeBase.length === 0) return "";

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3); // Filter short words
    if (terms.length === 0) return "";

    // Score chunks based on term frequency
    const scoredChunks = knowledgeBase.map(chunk => {
        let score = 0;
        const contentLower = chunk.content.toLowerCase();
        for (const term of terms) {
            if (contentLower.includes(term)) {
                score += 1;
            }
        }
        return { ...chunk, score };
    });

    // Sort by score descending
    scoredChunks.sort((a, b) => b.score - a.score);

    // Take top K
    const topChunks = scoredChunks.slice(0, topK).filter(c => c.score > 0);

    if (topChunks.length === 0) return "";

    console.log("Retrieved chunks:", topChunks.map(c => ({ source: c.source, score: c.score })));

    return topChunks.map(c => `[Source: ${c.source}]\n${c.content}`).join("\n\n");
}

function triggerSendMessage() {
    const inputElement = document.getElementById('user-input');
    const messageText = inputElement.value.trim(); // Trim whitespace

    if (!messageText) {
        console.error("Message is empty");
        return; // Don't send empty messages
    }

    // *** Initialize history with system prompt if it's the first message ***
    if (chatHistory.length === 0) {
        if (typeof systemPrompt !== 'undefined' && systemPrompt) {
            chatHistory.push({ role: "system", content: systemPrompt });
            console.log("Chat history initialized.");
        } else {
            console.warn("System prompt is undefined or empty. Using a default.");
            chatHistory.push({ role: "system", content: "You are a helpful assistant." });
        }
    }

    // Display user message immediately
    addMessage(messageText, true);

    // Server now handles RAG via semantic embeddings; send the raw user message.
    chatHistory.push({ role: "user", content: messageText });
    console.log("History after user turn:", JSON.stringify(chatHistory, null, 2));

    // Disable input and button while waiting
    inputElement.disabled = true;
    const sendButton = inputElement.nextElementSibling; // Assumes button is right after input
    if (sendButton) sendButton.disabled = true;

    // Call the async function to send message and handle response
    // *** Pass a *copy* of the current history to avoid potential race conditions ***
    sendMessage([...chatHistory], inputElement, sendButton);

    inputElement.value = ''; // Clear input after initiating send
}

// *** Function signature changed: now takes the history array ***
async function sendMessage(currentHistoryToSend, inputElement, sendButton) {
    console.log("Sending history to proxy:", currentHistoryToSend);

    try {
        const response = await fetch('https://ljubomirj-github-io.vercel.app/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // *** Send the entire history array under the 'messages' key ***
            body: JSON.stringify({
                messages: currentHistoryToSend
            }),
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            console.error("Fetch failed with status:", response.status);
            let errorText = await response.text();
            try {
                const errorJson = JSON.parse(errorText);
                errorText = errorJson.error || errorText;
                console.error("Error response body (JSON):", errorJson);
            } catch (e) {
                console.error("Error response body (Text):", errorText);
            }
            addMessage(`Sorry, an error occurred (${response.status}): ${errorText}`, false); // Display error to user
            // *** Do NOT add failed response to history ***
            return; // Stop processing
        }

        const data = await response.json();
        console.log("Received data:", data);

        // *** IMPORTANT: Check the structure returned by *your proxy* (which should match OpenRouter's) ***
        if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            const aiMessageContent = data.choices[0].message.content;
            addMessage(aiMessageContent, false); // Display AI message

            // *** Add the AI's response to the global history ***
            // Ensure the role is 'assistant' as expected by the API standard
            chatHistory.push({ role: "assistant", content: aiMessageContent });
            console.log("History after AI turn:", JSON.stringify(chatHistory, null, 2));

        } else {
            console.error("Unexpected response structure from proxy/AI:", data);
            addMessage("Sorry, I received an unexpected response from the AI.", false);
            // *** Do NOT add failed/malformed response to history ***
        }

    } catch (error) {
        console.error("Error during fetch/processing:", error);
        addMessage("Sorry, a network error occurred. Please try again.", false);
    } finally {
        if (inputElement) inputElement.disabled = false;
        if (sendButton) sendButton.disabled = false;
        if (inputElement) inputElement.focus(); // Set focus back to input
    }
}

// ===================== Site search (footer widget) =====================
// Spec: [Search] [input] ( ) this page / (•) site, in the footer row next to
// the LJ HPD signature. Queries are BM25 over the prebuilt MiniSearch index
// (search-index.json, built by scripts/build-search-index.js); queries given
// as /pattern/ or re:pattern run as regex passes over the full texts
// (search-texts.json, fetched lazily). Results deep-link into the page
// (tweet chunks carry their div id as anchor); non-anchored chunks are
// located by text. Phase 3 will fuse MiniLM semantic results via RRF.
(function () {
    const SEARCH_INDEX_URL = 'search-index.json';
    const SEARCH_TEXTS_URL = 'search-texts.json';
    const MINISEARCH_URL = 'search/minisearch.js';
    const MAX_HITS = 25;

    let indexPromise = null; // { ms, docs: Map }
    let textsPromise = null; // array of full chunk texts

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Failed to load ' + url));
            document.head.appendChild(s);
        });
    }

    function ensureIndex() {
        if (!indexPromise) {
            indexPromise = loadScript(MINISEARCH_URL)
                .then(() => fetch(SEARCH_INDEX_URL))
                .then(r => { if (!r.ok) throw new Error(r.status + ' ' + SEARCH_INDEX_URL); return r.json(); })
                .then(payload => {
                    const ms = window.MiniSearch.loadJS(payload.ms, {
                        idField: 'id',
                        fields: ['title', 'text'],
                        storeFields: ['page', 'page_title', 'anchor', 'title'],
                        searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
                    });
                    return { ms, docs: payload.docs };
                });
            indexPromise.catch(() => { indexPromise = null; });
        }
        return indexPromise;
    }

    function ensureTexts() {
        if (!textsPromise) {
            textsPromise = fetch(SEARCH_TEXTS_URL)
                .then(r => { if (!r.ok) throw new Error(r.status + ' ' + SEARCH_TEXTS_URL); return r.json(); });
        }
        return textsPromise;
    }

    function currentPage() {
        return (location.pathname.split('/').pop() || 'index.html');
    }

    function parseQuery(q) {
        const slashed = q.match(/^\/([\s\S]+)\/$/);
        if (slashed) return { type: 'regex', pattern: slashed[1] };
        if (q.startsWith('re:')) return { type: 'regex', pattern: q.slice(3).trim() };
        return { type: 'lexical', query: q };
    }

    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Mark query terms inside a snippet (lexical mode only; regex snippets
    // get their own marking from the match itself).
    function markSnippet(snippet, query) {
        let html = escapeHtml(snippet);
        for (const term of query.split(/\s+/).filter(t => t.length > 1)) {
            html = html.replace(new RegExp('(' + escapeRegExp(escapeHtml(term)) + ')', 'gi'), '<mark>$1</mark>');
        }
        return html;
    }

    async function runQuery(q, scope) {
        const parsed = parseQuery(q);
        const samePage = d => d.page === currentPage();
        if (parsed.type === 'regex') {
            const [{ docs }, texts] = await Promise.all([ensureIndex(), ensureTexts()]);
            const re = new RegExp(parsed.pattern, 'i');
            const hits = [];
            for (const d of docs) {
                if (scope === 'page' && !samePage(d)) continue;
                const m = re.exec(texts[d.id]);
                if (m) {
                    const start = Math.max(0, m.index - 60);
                    hits.push({ doc: d, snippet: (start > 0 ? '…' : '') + texts[d.id].slice(start, m.index + 100).trim() + '…', matchText: m[0] });
                    if (hits.length >= MAX_HITS) break;
                }
            }
            return { hits, query: parsed };
        }
        const { ms } = await ensureIndex();
        const results = ms.search(parsed.query).filter(r => scope === 'site' || samePage(r));
        return {
            hits: results.slice(0, MAX_HITS).map(r => ({ doc: r, snippet: r.snippet || '' })),
            query: parsed,
        };
    }

    // ---- locating & highlight ----
    function flashRect(rect) {
        const div = document.createElement('div');
        div.className = 'lj-flash';
        div.style.left = (rect.left + window.scrollX - 4) + 'px';
        div.style.top = (rect.top + window.scrollY - 4) + 'px';
        div.style.width = (rect.width + 8) + 'px';
        div.style.height = (rect.height + 8) + 'px';
        document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; }, 1400);
        setTimeout(() => div.remove(), 2800);
    }

    function flashElement(el) {
        el.scrollIntoView({ block: 'center' });
        flashRect(el.getBoundingClientRect());
    }

    function locateByText(needleFull) {
        const needle = needleFull.replace(/\s+/g, ' ').trim().slice(0, 30);
        if (!needle) return false;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (n.nodeValue && n.nodeValue.trim()) nodes.push(n);
        }
        for (const n of nodes) {
            const hay = n.nodeValue.replace(/\s+/g, ' ');
            const idx = hay.indexOf(needle);
            if (idx === -1) continue;
            // Map normalized offset back to the raw node (whitespace only
            // collapses, so lengths differ only inside runs).
            let raw = 0, norm = 0;
            const value = n.nodeValue;
            while (norm < idx && raw < value.length) {
                norm += /\s/.test(value[raw]) ? 0 : 1;
                raw++;
            }
            const range = document.createRange();
            range.setStart(n, raw);
            const endNeedle = needle.length;
            let end = raw;
            for (let seen = 0; end < value.length && seen < endNeedle; end++) {
                if (!/\s/.test(value[end])) seen++;
            }
            range.setEnd(n, Math.min(end, value.length));
            const rect = range.getBoundingClientRect();
            window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: 'smooth' });
            flashRect(range.getBoundingClientRect());
            return true;
        }
        return false;
    }

    async function locateInPage(doc, textHead) {
        if (doc && doc.anchor) {
            const el = document.getElementById(doc.anchor);
            if (el) { flashElement(el); return true; }
        }
        if (textHead && locateByText(textHead)) return true;
        return false;
    }

    function pendingKey() { return 'ljSearchPending'; }

    async function openHit(hit) {
        const d = hit.doc;
        const texts = hit.snippet && !d.anchor ? await ensureTexts().then(t => t[d.id]).catch(() => null) : null;
        if (d.page === currentPage()) {
            await locateInPage(d, texts || (d.snippet || ''));
            closeResults();
            return;
        }
        try { sessionStorage.setItem(pendingKey(), JSON.stringify({ anchor: d.anchor || '', textHead: d.snippet || '', page: d.page })); } catch (e) { /* private mode */ }
        closeResults();
        location.href = d.anchor ? d.page + '#' + d.anchor : d.page;
    }

    function consumePending() {
        try {
            const raw = sessionStorage.getItem(pendingKey());
            if (!raw) return;
            sessionStorage.removeItem(pendingKey());
            const p = JSON.parse(raw);
            if (p.page !== currentPage()) return;
            // Give the page a beat to lay out, then locate and flash.
            setTimeout(() => locateInPage(p.anchor ? { anchor: p.anchor } : null, p.textHead), 400);
        } catch (e) { /* ignore */ }
    }

    // ---- UI ----
    let panel = null, input = null, hits = [], selected = -1;

    function closeResults() {
        if (panel) { panel.hidden = true; panel.innerHTML = ''; }
        hits = []; selected = -1;
    }

    function renderPanel(list, query) {
        panel.innerHTML = '';
        hits = list;
        if (!list.length) {
            panel.innerHTML = '<div class="lj-search-status">No results for ' + escapeHtml(query.type === 'regex' ? '/' + query.pattern + '/' : query.query) + '</div>';
            panel.hidden = false;
            return;
        }
        list.forEach((hit, i) => {
            const d = hit.doc;
            const el = document.createElement('div');
            el.className = 'lj-hit';
            const markHtml = query.type === 'regex'
                ? escapeHtml(hit.snippet).replace(new RegExp('(' + escapeRegExp(escapeHtml(hit.matchText || '')) + ')', 'i'), '<mark>$1</mark>')
                : markSnippet(hit.snippet || d.snippet || '', query.query);
            el.innerHTML =
                '<div class="lj-hit-title">' + escapeHtml(d.page_title) + (d.title && d.title !== d.page_title ? ' · ' + escapeHtml(d.title) : '') +
                (d.date ? ' <span class="lj-hit-date">' + escapeHtml(d.date) + '</span>' : '') + '</div>' +
                '<div class="lj-hit-snippet">' + markHtml + '</div>';
            el.addEventListener('click', () => openHit(hit));
            panel.appendChild(el);
        });
        panel.hidden = false;
        setSelected(0);
    }

    function setSelected(i) {
        if (!hits.length) return;
        selected = (i + hits.length) % hits.length;
        [...panel.children].forEach((el, j) => el.classList.toggle('selected', j === selected));
        const el = panel.children[selected];
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    async function doSearch() {
        const q = input.value.trim();
        if (!q) return;
        const scope = document.querySelector('input[name="lj-search-scope"]:checked').value;
        panel.innerHTML = '<div class="lj-search-status">Searching…</div>';
        panel.hidden = false;
        try {
            const { hits: list, query } = await runQuery(q, scope);
            renderPanel(list, query);
        } catch (err) {
            console.error('Search failed:', err);
            panel.innerHTML = '<div class="lj-search-status">Search failed: ' + escapeHtml(String(err.message || err)) + '</div>';
            panel.hidden = false;
        }
    }

    function injectWidget() {
        const widget = document.createElement('div');
        widget.id = 'lj-search';
        widget.className = 'lj-search';
        widget.innerHTML =
            '<button id="lj-search-btn" type="button">Search</button>' +
            '<input id="lj-search-input" type="text" placeholder="search…  /regex/ for exact" aria-label="Search">' +
            '<label><input type="radio" name="lj-search-scope" value="page"> this page</label>' +
            '<label><input type="radio" name="lj-search-scope" value="site" checked> site</label>';

        panel = document.createElement('div');
        panel.id = 'lj-search-results';
        panel.hidden = true;

        const row = document.createElement('div');
        row.className = 'lj-footer-row';
        row.appendChild(widget);
        row.appendChild(panel);

        // The LJ HPD signature <p> is the right-hand half of the row.
        const ps = document.querySelectorAll('p');
        let footerP = null;
        for (let i = ps.length - 1; i >= 0; i--) {
            if (/LJ HPD/.test(ps[i].textContent)) { footerP = ps[i]; break; }
        }
        if (footerP) {
            footerP.parentNode.insertBefore(row, footerP);
            row.appendChild(footerP);
        } else {
            (document.getElementById('content') || document.body).appendChild(row);
        }

        input = widget.querySelector('#lj-search-input');
        widget.querySelector('#lj-search-btn').addEventListener('click', doSearch);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch();
            else if (e.key === 'Escape') { closeResults(); input.blur(); }
        });
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(selected + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(selected - 1); }
            else if (e.key === 'Enter' && selected >= 0) { e.preventDefault(); openHit(hits[selected]); }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) closeResults();
        });
        // Click outside closes the panel.
        document.addEventListener('click', (e) => {
            if (!panel.hidden && !panel.contains(e.target) && !widget.contains(e.target)) closeResults();
        });
    }

    function init() {
        injectWidget();
        consumePending();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
