const fetch = require('node-fetch');

// Define allowed origins (can be the same as your other proxy)
const allowedOrigins = [
    'https://ljubomirj.github.io',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];

module.exports = async (req, res) => {
    const requestOrigin = req.headers.origin;
    let isOriginAllowed = false;

    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        isOriginAllowed = true;
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else if (requestOrigin) {
        console.warn(`[oEmbed] Origin ${requestOrigin} is not in the allowed list.`);
    } else {
        console.warn(`[oEmbed] Request received without an Origin header.`);
    }

    if (isOriginAllowed) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); // oEmbed will be GET
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
        console.log("[oEmbed] Handling OPTIONS request.");
        if (isOriginAllowed) {
            res.status(204).end();
        } else {
            console.log(`[oEmbed] OPTIONS request denied for origin: ${requestOrigin}`);
            res.status(403).end();
        }
        return;
    }

    if (!isOriginAllowed && requestOrigin) {
        console.log(`[oEmbed] GET request denied for origin: ${requestOrigin}`);
        if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
           res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        }
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    if (req.method !== 'GET') {
        console.log(`[oEmbed] Method Not Allowed: ${req.method}`);
         if (isOriginAllowed) {
             res.setHeader('Access-Control-Allow-Origin', requestOrigin);
         }
        return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
    }

    const tweetUrl = req.query.url;

    if (!tweetUrl) {
        console.error("[oEmbed] Missing 'url' query parameter.");
         if (isOriginAllowed) {
             res.setHeader('Access-Control-Allow-Origin', requestOrigin);
         }
        return res.status(400).json({ error: "Missing 'url' query parameter." });
    }

    // Construct the Twitter oEmbed URL
    // Adding omit_script=true, maxwidth for better control, and dnt=true for privacy
    const oembedApiUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true&maxwidth=400&dnt=true&theme=light`; // Or theme=dark

    console.log(`[oEmbed] Fetching from Twitter: ${oembedApiUrl}`);

    try {
        const twitterResponse = await fetch(oembedApiUrl);

        if (!twitterResponse.ok) {
            const errorText = await twitterResponse.text();
            console.error(`[oEmbed] Twitter API Error: ${twitterResponse.status}`, errorText);
             if (isOriginAllowed) {
                 res.setHeader('Access-Control-Allow-Origin', requestOrigin);
             }
            return res.status(twitterResponse.status).json({
                error: `Twitter oEmbed API request failed with status ${twitterResponse.status}`,
                details: errorText
            });
        }

        const data = await twitterResponse.json();
        console.log("[oEmbed] Successfully received oEmbed data from Twitter.");
         // CORS headers should already be set if origin was allowed
        res.status(200).json(data);

    } catch (error) {
        console.error("[oEmbed] Unhandled Proxy Error:", error);
         if (isOriginAllowed) {
             res.setHeader('Access-Control-Allow-Origin', requestOrigin);
         }
        res.status(500).json({ error: 'An internal server error occurred while fetching oEmbed data.' });
    }
};