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

        // 3. Choice of API
        // 3a. Call OpenRouter API
        // 3b. Call Z.AI API
        const zaiApiKey = process.env.ZAI_API_KEY;
        if (!zaiApiKey) {
            console.error("ZAI_API_KEY is not set in environment variables.");
            if (isOriginAllowed) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            return res.status(500).json({ error: 'Server configuration error: ZAI_API_KEY is missing.' });
        }

        // Prefer the coding endpoint when available (required for Coding plan)
        const zaiBaseUrl = (process.env.ZAI_API_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/$/, '');
        const zaiUrl = `${zaiBaseUrl}/chat/completions`;

        // Streaming isn't wired through the proxy/frontend yet; keep responses JSON.
        // If the client asks for streaming, we log and force it off to avoid breaking the JSON parse below.
        const streamRequested = body?.stream === true;
        if (streamRequested) {
            console.warn("Stream=true requested but proxy currently returns buffered JSON. Forcing stream=false.");
        }

        const zaiPayload = {
            model: process.env.ZAI_MODEL || 'glm-4.6',
            messages,
            temperature: body?.temperature ?? 0.7,
            max_tokens: body?.max_tokens ?? 4096,
            stream: false, // keep compatibility with frontend expectation
            // Thinking mode is optional; enable only if explicitly requested to avoid surprise costs/timeouts.
            ...(body?.thinking ? { thinking: body.thinking } : {})
        };

        console.log(`Forwarding request to Z.AI with ${messages.length} messages...`);
        console.log(`Z.AI endpoint: ${zaiUrl} | stream: ${zaiPayload.stream}`);

        const routerResponse = await fetch(zaiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${zaiApiKey}`,
                'Content-Type': 'application/json',
                'Accept-Language': 'en-US,en'
            },
            body: JSON.stringify(zaiPayload),
        });
//        // 3a. Call OpenRouter API
//        console.log(`Forwarding request to OpenRouter with ${messages.length} messages in history...`);
//        const routerResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//            method: 'POST',
//            headers: {
//                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
//                'Content-Type': 'application/json',
//            },
//            // *** Pass the received messages array directly to OpenRouter ***
//            // Option free openrouter models
//            // + aider --list-models openrouter/
//            // - openrouter/deepseek/deepseek-chat-v3.1
//            // - openrouter/deepseek/deepseek-chat-v3-0324:free
//            // - openrouter/deepseek/deepseek-chat:free
//            // - openrouter/deepseek/deepseek-r1:free
//            // - openrouter/tngtech/deepseek-r1t-chimera:free
//            // - openrouter/google/gemini-2.0-flash-exp:free
//            // - openrouter/google/gemini-2.5-pro-exp-03-25:free
//            // - openrouter/meta-llama/llama-3-8b-instruct:free
//            // - openrouter/mistralai/mistral-7b-instruct:free
//            body: JSON.stringify({
//                //model: 'google/gemini-2.5-pro', // Or your preferred model
//                model: 'z-ai/glm-4.6',
//                //model: 'google/gemini-2.5-flash',
//                //model: 'google/gemma-3-27b-it',
//                //model: 'deepseek/deepseek-r1-0528',
//                //model: 'tngtech/deepseek-r1t2-chimera',
//                //model: 'deepseek/deepseek-chat-v3.1',
//                //model: 'x-ai/grok-4-fast',
//                //model: 'qwen/qwen3-235b-a22b',
//                //model: 'moonshotai/kimi-k2',
//                //model: 'baidu/ernie-4.5-300b-a47b',
//                //model: 'arliai/qwq-32b-arliai-rpr-v1',
//                messages: messages,
//            }),
//        });

        // 3b. Call Z.AI API




        // 4. Check Router Response Status
        if (!routerResponse.ok) {
            // ... (Error handling for failed Router fetch) ...
            let errorBody = {};
            try {
                errorBody = await routerResponse.json();
            } catch (e) {
                errorBody = await routerResponse.text().catch(() => 'Could not read error body');
            }
            console.error(`Router API Error: ${routerResponse.status} ${routerResponse.statusText}`, errorBody);
            // Set CORS headers for error response if origin was allowed initially
            if (isOriginAllowed) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            return res.status(routerResponse.status || 502).json({
                error: `AI service request failed with status ${routerResponse.status}`,
                details: errorBody
            });
        }

        // 5. Process and Return Success Response from Router
        const data = await routerResponse.json();
        console.log("Successfully received response body from Router:", JSON.stringify(data, null, 2));

        // Optional: You could still add the backend check for expected structure here if desired
        if (!(data && data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content)) {
            console.error("Router returned unexpected structure:", data);
            // Set CORS headers for error response if origin was allowed initially
            if (isOriginAllowed) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            return res.status(502).json({ error: 'Received unexpected response structure from AI service.' });
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
