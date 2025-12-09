const express = require('express');
const axios = require('axios');
const { validateKey } = require('./keyManager');
const { addUsage } = require('./usageTracker');

const router = express.Router();

router.post('/chat/completions', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ error: 'No API key provided.' });
  }

  const client = validateKey(apiKey);
  if (!client) {
    return res.status(403).json({ error: 'Invalid API key.' });
  }

  try {
    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', req.body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    const data = openaiRes.data;

    if (data.usage) {
      addUsage(apiKey, data.usage.total_tokens);
    }

    res.json(data);

  } catch (err) {
    console.error('Proxy error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Proxy server failed.' });
  }
});

module.exports = router;
