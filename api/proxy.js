const fetch = require('node-fetch');

module.exports = async (req, res) => {

    try {
        // *** Log headers to double-check Content-Type ***
        console.log("Received request headers:", req.headers);

        // 1. Directly access req.body (assuming Vercel parsed it)
        const body = req.body;

        // 2. Check if body exists AND has the required properties
        // Use optional chaining (?.) for safer access
        const userMessage = body?.userMessage;
        const systemPrompt = body?.systemPrompt;

        if (!body || !userMessage || typeof userMessage !== 'string' || !systemPrompt || typeof systemPrompt !== 'string') {
            console.error("Validation failed: req.body is missing, or userMessage/systemPrompt invalid/missing.", body); // Log the body we received
            return res.status(400).json({ error: 'Invalid or missing request body. Expected JSON with userMessage and systemPrompt.' });
        }

        // 3. Call OpenRouter API
        console.log("Forwarding request to OpenRouter with system prompt...");
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
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
            return res.status(openRouterResponse.status || 502).json({
                error: `AI service request failed with status ${openRouterResponse.status}`,
                details: errorBody
            });
        }

        // 5. Process and Return Success Response from OpenRouter
        const data = await openRouterResponse.json();
        console.log("Successfully received response from OpenRouter.");
        res.status(200).json(data);

    } catch (error) {
        console.error("Unhandled Proxy Error:", error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
