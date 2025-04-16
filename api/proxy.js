const fetch = require('node-fetch');

module.exports = async (req, res) => {

    // --- Assume it's a POST request and proceed ---
    // The rest of your try/catch block remains the same
    try {
        // 1. Parse Request Body
        let userMessage, systemPrompt;
        try {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            userMessage = body.userMessage;
            systemPrompt = body.systemPrompt;
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            return res.status(400).json({ error: 'Invalid request format. Ensure body is valid JSON with userMessage and systemPrompt.' });
        }

        // 2. Basic Validation (Still useful)
        if (!userMessage || typeof userMessage !== 'string' || !systemPrompt || typeof systemPrompt !== 'string') {
            console.error("Validation failed: Missing or invalid userMessage/systemPrompt");
            return res.status(400).json({ error: 'Missing or invalid userMessage or systemPrompt in request body.' });
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
                model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free', // Make sure this model identifier is correct
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
