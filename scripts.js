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
