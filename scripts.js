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

    // *** Add the user's message to the global history ***
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
