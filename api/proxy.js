
const fetch = require('node-fetch');

module.exports = async (req, res) => {

    try {
        // *** Log the raw request body and its type ***
        console.log("Received req.body:", req.body);
        console.log("Type of req.body:", typeof req.body);

        // 1. Extract and Parse Request Body More Robustly
        let body;
        if (req.body) { // Check if req.body exists
            if (typeof req.body === 'string') {
                try {
                    body = JSON.parse(req.body);
                } catch (parseError) {
                    console.error("Error parsing req.body string:", parseError);
                    // Send specific error for bad JSON format
                    return res.status(400).json({ error: 'Invalid JSON format in request body.' });
                }
            } else if (typeof req.body === 'object') {
                // Assume Vercel already parsed it if it's an object
                body = req.body;
            } else {
                // Handle unexpected type
                 console.error("Unexpected type for req.body:", typeof req.body);
                 return res.status(400).json({ error: 'Unexpected request body type.' });
            }
        } else {
            // Handle case where req.body is null or undefined
            console.error("Request body (req.body) is missing or empty.");
            return res.status(400).json({ error: 'Request body is missing.' });
        }

        // Now 'body' should be a valid object if we reached here
        const userMessage = body.userMessage;
        const systemPrompt = body.systemPrompt;

        // 2. Basic Validation (Check if properties exist on the parsed body)
        if (!userMessage || typeof userMessage !== 'string' || !systemPrompt || typeof systemPrompt !== 'string') {
            console.error("Validation failed: Missing or invalid userMessage/systemPrompt in parsed body.", body); // Log the parsed body for inspection
            return res.status(400).json({ error: 'Missing or invalid userMessage or systemPrompt in request body.' });
        }

        // --- Rest of your code remains the same ---

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
        // Catch unexpected errors during processing (not related to parsing/validation handled above)
        console.error("Unhandled Proxy Error:", error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

