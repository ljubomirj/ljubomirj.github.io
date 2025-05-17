const fetch = require('node-fetch');

// Define allowed origins
const allowedOrigins = [
    'https://ljubomirj.github.io', // Your production frontend
    'http://localhost:8000',       // Your local dev server (adjust port if needed)
    'http://127.0.0.1:8000'        // Another common local address
    // Add any other origins you might test from
];

module.exports = async (req, res) => {

    const requestOrigin = req.headers.origin;
    let isOriginAllowed = false;

    // Check if the request origin is in our allowed list
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
        // Dynamically set the Allow-Origin header to the requesting origin
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else if (requestOrigin) {
         console.warn(`Origin ${requestOrigin} is not in the allowed list.`);
         // Optionally, you could return an error here, but letting CORS fail is often enough
    } else {
        console.warn(`Request received without an Origin header.`);
        // Requests without an Origin (e.g., same-origin, server-to-server) don't need CORS headers usually
        // But browser requests requiring CORS *will* have an Origin header
    }


    // Set common CORS headers IF the origin was allowed
    if (isOriginAllowed) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
    }

    // *** Handle OPTIONS requests first ***
    if (req.method === 'OPTIONS') {
        console.log("Handling OPTIONS request explicitly.");
        if (isOriginAllowed) {
            res.status(204).end(); // Success for allowed origins
        } else {
            // If origin wasn't allowed, the browser will block based on missing/incorrect headers
            // You could explicitly send a 403 Forbidden here if desired
             console.log(`OPTIONS request denied for origin: ${requestOrigin}`);
             res.status(403).end();
        }
        return; // Stop processing further for OPTIONS request
    }

    // If it's not OPTIONS, assume POST and continue
    // BUT only if the origin was allowed for the initial checks
    if (!isOriginAllowed && requestOrigin) {
         console.log(`POST request denied for origin: ${requestOrigin}`);
         // Need to set the Allow-Origin header even on error for browser to read the response
         if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
             res.setHeader('Access-Control-Allow-Origin', requestOrigin);
         }
         return res.status(403).json({ error: 'Origin not allowed.' });
    }


    try {
        console.log("Handling POST request.");
        // Log headers for POST request to confirm Content-Type
        console.log("Received POST request headers:", req.headers);

        // Directly access req.body (assuming Vercel parsed it for POST)
        const body = req.body;

        // *** Get the messages array from the request body ***
        const messages = body?.messages;

        // *** Validate the messages array ***
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            console.error("Validation failed for POST: req.body is missing, or 'messages' array invalid/missing.", body);
             // Set CORS headers for error response if origin was allowed initially
             if (isOriginAllowed) {
                 res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                 res.setHeader('Access-Control-Allow-Credentials', 'true');
             }
            return res.status(400).json({ error: 'Invalid or missing request body for POST. Expected JSON with a non-empty messages array.' });
        }

        // 3. Call OpenRouter API
        console.log(`Forwarding request to OpenRouter with ${messages.length} messages in history...`);
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            // *** Pass the received messages array directly to OpenRouter ***
            // Option free openrouter models
            // + aider --list-models openrouter/
            // - openrouter/deepseek/deepseek-chat-v3-0324:free
            // - openrouter/deepseek/deepseek-chat:free
            // - openrouter/deepseek/deepseek-r1:free
            // - openrouter/tngtech/deepseek-r1t-chimera:free
            // - openrouter/google/gemini-2.0-flash-exp:free
            // - openrouter/google/gemini-2.5-pro-exp-03-25:free
            // - openrouter/meta-llama/llama-3-8b-instruct:free
            // - openrouter/mistralai/mistral-7b-instruct:free
            body: JSON.stringify({
                //model: 'google/gemini-2.0-flash-exp:free',
                //model: 'google/gemini-2.5-pro-exp-03-25:free',
                //model: 'google/gemini-2.5-flash-preview',
                //model: 'deepseek/deepseek-chat:free',
                //model: 'deepseek/deepseek-chat-v3-0324:free',
                //model: 'deepseek/deepseek-r1:free',
                //model: 'tngtech/deepseek-r1t-chimera:free',
                //model: 'deepseek/deepseek-r1',
                //model: 'deepseek/deepseek-chat-v3-0324',
                //model: 'qwen/qwq-32b:free',
                //model: 'google/gemini-2.5-pro-exp-03-25:free', // Or your preferred model
                model: 'qwen/qwen3-235b-a22b',
                messages: messages,
            }),
        });

        // 4. Check OpenRouter Response Status
        if (!openRouterResponse.ok) {
            // ... (Error handling for failed OpenRouter fetch) ...
            let errorBody = {};
            try {
                 errorBody = await openRouterResponse.json();
            } catch(e){
                 errorBody = await openRouterResponse.text().catch(()=> 'Could not read error body');
            }
            console.error(`OpenRouter API Error: ${openRouterResponse.status} ${openRouterResponse.statusText}`, errorBody);
             // Set CORS headers for error response if origin was allowed initially
             if (isOriginAllowed) {
                 res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                 res.setHeader('Access-Control-Allow-Credentials', 'true');
             }
            return res.status(openRouterResponse.status || 502).json({
                error: `AI service request failed with status ${openRouterResponse.status}`,
                details: errorBody
            });
        }

        // 5. Process and Return Success Response from OpenRouter
        const data = await openRouterResponse.json();
        console.log("Successfully received response body from OpenRouter:", JSON.stringify(data, null, 2));

        // Optional: You could still add the backend check for expected structure here if desired
        if (!(data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content)) {
             console.error("OpenRouter returned unexpected structure:", data);
              // Set CORS headers for error response if origin was allowed initially
             if (isOriginAllowed) {
                 res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                 res.setHeader('Access-Control-Allow-Credentials', 'true');
             }
             return res.status(502).json({ error: 'Received unexpected response structure from AI service.'});
        }

        console.log("Data structure looks good. Sending back to frontend.");
        // CORS Headers are already set at the top if origin was allowed
        res.status(200).json(data); // Send the valid data

    } catch (error) {
        console.error("Unhandled Proxy Error:", error);
        // Set CORS headers for error response if origin was allowed initially
        if (isOriginAllowed) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
