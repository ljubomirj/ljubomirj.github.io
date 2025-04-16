// File: scripts.js

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

    // Display user message immediately
    addMessage(messageText, true);

    // Disable input and button while waiting
    inputElement.disabled = true;
    const sendButton = inputElement.nextElementSibling; // Assumes button is right after input
    if (sendButton) sendButton.disabled = true;

    // Call the async function to send message and handle response
    sendMessage(messageText, inputElement, sendButton);

    inputElement.value = ''; // Clear input after initiating send
}

async function sendMessage(userMessage, inputElement, sendButton) { // Pass input/button for disabling
    console.log("Sending message to proxy:", userMessage);
    // systemPrompt is available globally from post-chat-LJ.html script block

    try {
        const response = await fetch('https://ljubomirj-github-io.vercel.app/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userMessage: userMessage,
                systemPrompt: typeof systemPrompt !== 'undefined' ? systemPrompt : 'You are a helpful assistant.' // Fallback if systemPrompt isn't loaded
            }),
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            console.error("Fetch failed with status:", response.status);
            let errorText = await response.text(); // Try to get error message from response body
            try {
                // Attempt to parse error as JSON for more details from proxy
                const errorJson = JSON.parse(errorText);
                errorText = errorJson.error || errorText; // Use specific error if available
                console.error("Error response body (JSON):", errorJson);
            } catch (e) {
                // If it's not JSON, use the raw text
                console.error("Error response body (Text):", errorText);
            }
            addMessage(`Sorry, an error occurred (${response.status}): ${errorText}`, false); // Display error to user
            return; // Stop processing
        }

        const data = await response.json();
        console.log("Received data:", data);

        if (data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            addMessage(data.choices[0].message.content, false);
        } else {
            console.error("Unexpected response structure:", data);
            addMessage("Sorry, I received an unexpected response from the AI.", false);
        }

    } catch (error) {
        console.error("Error during fetch/processing:", error);
        addMessage("Sorry, a network error occurred. Please try again.", false); // Display error to user
    } finally {
        if (inputElement) inputElement.disabled = false;
        if (sendButton) sendButton.disabled = false;
        if (inputElement) inputElement.focus(); // Set focus back to input
    }
}

