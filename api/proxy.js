const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const { message } = JSON.parse(req.body);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      //model: 'mistralai/mistral-7b-instruct', // Use a free model
      //model: 'openrouter/deepseek/deepseek-chat:free', // Use a free model
      model: 'openrouter/google/gemini-2.5-pro-exp-03-25:free', // Use a free model
      messages: [{ role: 'user', content: message }],
    }),
  });

  const data = await response.json();
  res.json(data);
};

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
