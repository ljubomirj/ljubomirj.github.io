
// Option 2: Use a Free Cloud Function
// If you prefer a cloud provider, you can use Google Cloud Functions or AWS Lambda (both have free tiers).
// 
// 1. Google Cloud Functions
// 
// Create a index.js file:
// 
// javascript

const fetch = require('node-fetch');

exports.proxy = async (req, res) => {
  const { message } = req.body;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistralai/mistral-7b-instruct', // Use a free model
      messages: [{ role: 'user', content: message }],
    }),
  });

  const data = await response.json();
  res.json(data);
};

// Deploy to Google Cloud:
// 
// 2. Follow the Google Cloud Functions guide to deploy your function.
// https://cloud.google.com/functions/docs/quickstart
// https://cloud.google.com/functions/docs/get-started-in-cloud-run
// Set the OpenRouter API key as an environment variable.
// 
// 3. Use the proxy in your frontend:
// 
// javascript

async function sendMessage(message) {
  const response = await fetch('https://your-cloud-function-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await response.json();
  console.log(data);
}

