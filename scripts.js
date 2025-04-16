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
    msgDiv.innerHTML = text.replace(/\n/g, '<br>');
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function triggerSendMessage() {
    const inputElement = document.getElementById('user-input');
    const messageText = inputElement.value;
    sendMessage(messageText);
    inputElement.value = ''; // Clear input after sending
}

async function sendMessage_NOLOGGING(message) {
  const response = await fetch('https://ljubomirj-github-io.vercel.app/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await response.json();
  console.log(data);
}

async function sendMessage(message) { // Make sure 'message' is actually the text from the input
    console.log("Sending message:", message); // Add this line
    // Check if 'message' contains the user's text here
    if (!message || message.trim() === '') {
         console.error("Message is empty");
         return; // Don't send empty messages
    }

    try { // Add try...catch for fetch errors
        const response = await fetch('https://ljubomirj-github-io.vercel.app/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message }), // Make sure this structure matches what your proxy expects
        });

        console.log("Response status:", response.status); // Log status

        if (!response.ok) { // Check for HTTP errors (like 404, 500)
            console.error("Fetch failed with status:", response.status);
            const errorText = await response.text(); // Try to get error message from response body
            console.error("Error response body:", errorText)
            // Handle the error appropriately in the UI
            return;
        }

        const data = await response.json();
        console.log("Received data:", data);
        // Add code here to display the 'data' (AI response) in your #messages div
    } catch (error) {
        console.error("Error during fetch:", error);
        // Handle network errors, etc. in the UI
    }
}

async function sendMessage_DIRECT() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = '';
    input.disabled = true;

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer YOUR_API_KEY',
                'HTTP-Referer': window.location.href,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat',
                messages: [
                    {"role": "system", "content": systemPrompt},
                    {"role": "user", "content": text}
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        addMessage(data.choices[0].message.content, false);
    } catch (error) {
        console.error('Chat error:', error);
        addMessage(`Error: ${error.message}`, false);
    } finally {
        input.disabled = false;
    }
}
