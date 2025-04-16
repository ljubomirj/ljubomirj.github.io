const fetch = require('node-fetch');

module.exports = async (req, res) => {

    // Allow CORS requests - This is technically handled by vercel.json,
    // but setting headers here can sometimes help with debugging or specific needs.
    // If vercel.json is working, these might not be strictly necessary here.
    // Consider keeping them for clarity or removing if vercel.json is sufficient.
    res.setHeader('Access-Control-Allow-Origin', 'https://ljubomirj.github.io'); // Or your specific origin
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle CORS preflight requests (OPTIONS method)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests for the actual API call
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST', 'OPTIONS']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }


    try {
        // 1. Parse Request Body
        let userMessage, systemPrompt;
        try {
            // Vercel might auto-parse if content-type is json, but explicit parse is safer
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            userMessage = body.userMessage;
            systemPrompt = body.systemPrompt;
        } catch (parseError) {
            console.error("Error parsing request body:", parseError);
            // Use return to stop execution
            return res.status(400).json({ error: 'Invalid request format. Ensure body is valid JSON with userMessage and systemPrompt.' });
        }

        // 2. Basic Validation
        if (!userMessage || typeof userMessage !== 'string' || !systemPrompt || typeof systemPrompt !== 'string') {
            console.error("Validation failed: Missing or invalid userMessage/systemPrompt");
            return res.status(400).json({ error: 'Missing or invalid userMessage or systemPrompt in request body.' });
        }

        // 3. Call OpenRouter API
        console.log("Forwarding request to OpenRouter with system prompt..."); // Log that system prompt is included
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                // Optional: Add referrer for OpenRouter tracking if desired
                // 'HTTP-Referer': 'https://ljubomirj.github.io/',
            },
            body: JSON.stringify({
                model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free', // Make sure this model identifier is correct
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                // Optional: Add other parameters like temperature, max_tokens if needed
                // temperature: 0.7,
                // max_tokens: 1000,
            }),
        });

        // 4. Check OpenRouter Response Status
        if (!openRouterResponse.ok) {
            let errorBody = {};
            try {
                 // Try to parse error details from OpenRouter
                 errorBody = await openRouterResponse.json();
            } catch(e){
                 // If parsing fails, try to get text
                 errorBody = await openRouterResponse.text().catch(()=> 'Could not read error body');
            }
            console.error(`OpenRouter API Error: ${openRouterResponse.status} ${openRouterResponse.statusText}`, errorBody);
            // Forward OpenRouter's status code and a structured error message
            return res.status(openRouterResponse.status || 502).json({
                error: `AI service request failed with status ${openRouterResponse.status}`,
                details: errorBody // Include details from OpenRouter if available
            });
        }

        // 5. Process and Return Success Response from OpenRouter
        const data = await openRouterResponse.json();
        console.log("Successfully received response from OpenRouter.");
        // Send successful response back to the frontend
        res.status(200).json(data);

    } catch (error) {
        // Catch unexpected errors (e.g., network issues during fetch, other code errors)
        console.error("Unhandled Proxy Error:", error);
        // Send a generic 500 Internal Server Error
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

// const fetch = require('node-fetch');
// 
// module.exports = async (req, res) => {
// 
//     try { // Add try...catch for fetch errors
// 
// 		// Assuming frontend sends: { userMessage: "..." }
// 		//const { message } = JSON.parse(req.body);
// 		// Assuming frontend sends: { userMessage: "...", systemPrompt: "..." }
// 		const { userMessage, systemPrompt } = JSON.parse(req.body);
// 
//     } catch (error) {
//         console.error("Error during JSON.parse:", error);
// 		res.status(500).json({ error: 'Failed to contact AI service' })
//     }
// 
//   	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//     	method: 'POST',
//     	headers: {
//       		'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
//       		'Content-Type': 'application/json',
//     	},
// 		// Just userMessage
// //     	body: JSON.stringify({
// //       		//model: 'mistralai/mistral-7b-instruct', // Use a free model
// //       		//model: 'openrouter/deepseek/deepseek-chat:free', // Use a free model
// //       		model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free', // Use a free model
// //       		messages: [{ role: 'user', content: message }],
// //     	}),
// 		// Both userMessage and systemPrompt
// 		body: JSON.stringify({
//   			model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free',
//   			messages: [
//     			{ role: 'system', content: systemPrompt }, // Add system prompt
//     			{ role: 'user', content: userMessage }     // Add user message
//   			],
// 		}),
//   	});
// 
// 	const data = await response.json();
//   	res.json(data);
// };

// Steps to Set Up a Vercel Serverless Function
// 
// Create a GitHub Repo
// 
// If you haven’t already, create a GitHub repo for your project (e.g., ljubomirj.github.io).
// 
// Add a Serverless Function
// 
// In your repo, create a folder called api (this is where Vercel looks for serverless functions).
// Inside the api folder, create a file called proxy.js:
// javascript
// 
// const fetch = require('node-fetch');
// 
// module.exports = async (req, res) => {
//   const { message } = JSON.parse(req.body);
// 
//   const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       model: 'mistralai/mistral-7b-instruct', // Use a free model
//       messages: [{ role: 'user', content: message }],
//     }),
//   });
// 
//   const data = await response.json();
//   res.json(data);
// };
// 
// Deploy to Vercel
// 
// Sign up for Vercel.
// Import your GitHub repo into Vercel.
// During setup, Vercel will automatically detect your serverless function in the api folder.
// 
// Add Environment Variables
// 
// In the Vercel dashboard, go to your project’s settings.
// Add your OpenRouter API key as an environment variable:
// Key: OPENROUTER_API_KEY
// Value: Your OpenRouter API key.
// 
// Use the Proxy in Your Frontend
// 
// In your index.html, make a request to the Vercel function:
// javascript
// 
// async function sendMessage(message) {
//   const response = await fetch('https://your-vercel-app.vercel.app/api/proxy', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ message }),
//   });
//   const data = await response.json();
//   console.log(data);
// }
