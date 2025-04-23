const fetch = require('node-fetch');

module.exports = async (req, res) => {

    // *** Explicitly handle OPTIONS requests first ***
    if (req.method === 'OPTIONS') {
        console.log("Handling OPTIONS request explicitly.");
        // Set CORS headers manually *just for the OPTIONS response*
        // These should ideally match vercel.json if it were working for OPTIONS
        res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // Specify allowed methods
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers (Content-Type is crucial)
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400'); // Optional: Cache preflight response for 1 day
        res.status(204).end(); // Use 204 No Content for OPTIONS success is standard practice
        return; // Stop processing further for OPTIONS request
    }

    // If it's not OPTIONS, assume POST and continue
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
            // Set CORS headers for error response
            res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
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
          // - openrouter/google/gemini-2.0-flash-exp:free
          // - openrouter/google/gemini-2.5-pro-exp-03-25:free
          // - openrouter/meta-llama/llama-3-8b-instruct:free
          // - openrouter/mistralai/mistral-7b-instruct:free
            body: JSON.stringify({
                //model: 'google/gemini-2.0-flash-exp:free',
                //model: 'google/gemini-2.5-pro-exp-03-25:free',
                model: 'google/gemini-2.5-flash-preview',
                //model: 'deepseek/deepseek-chat:free',
                //model: 'deepseek/deepseek-chat-v3-0324:free',
                //model: 'deepseek/deepseek-r1:free',
                //model: 'deepseek/deepseek-r1',
                //model: 'qwen/qwq-32b:free',
                //model: 'google/gemini-2.5-pro-exp-03-25:free', // Or your preferred model
                messages: messages,
            }),
        });

        // 4. Check OpenRouter Response Status
        if (!openRouterResponse.ok) {
            let errorBody = {};
            try {
                 errorBody = await openRouterResponse.json();
            } catch(e){
                 errorBody = await openRouterResponse.text().catch(()=> 'Could not read error body');
            }
            console.error(`OpenRouter API Error: ${openRouterResponse.status} ${openRouterResponse.statusText}`, errorBody);
            // Set CORS headers for error response
            res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
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
             res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
             res.setHeader('Access-Control-Allow-Credentials', 'true');
             return res.status(502).json({ error: 'Received unexpected response structure from AI service.'});
        }

        console.log("Data structure looks good. Sending back to frontend.");
        res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.status(200).json(data); // Send the valid data

    } catch (error) {
        console.error("Unhandled Proxy Error:", error);
        res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
