
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// --- Configuration from .env file ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const N8N_URL = process.env.N8N_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

// --- Routes ---

// 1. Serve the frontend page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Redirect to Google's OAuth consent screen
app.get('/auth/google', (req, res) => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid` +
        `&access_type=offline` +
        `&prompt=consent`;
    res.redirect(authUrl);
});

// 3. Handle the callback from Google
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Error: No authorization code provided.');
    }

    try {
        // Exchange authorization code for tokens
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        const { access_token, refresh_token } = tokenResponse.data;

        // Get user's email to name the credential
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const userEmail = profileResponse.data.email;
        const credentialName = `Google OAuth2 (${userEmail})`;

        // Prepare the credential data for the n8n API
        const n8nCredentialData = {
            name: credentialName,
            type: 'googleOAuth2Api',
            data: {
                authentication: 'oAuth2',
                oauth2_access_token: access_token,
                oauth2_refresh_token: refresh_token,
                oauth2_token_type: 'Bearer',
                oauth2_expiry_time: (Date.now() / 1000 + 3599), // Assume 1 hour expiry
            },
        };

        // Create the credential in n8n using the master API key
        await axios.post(`${N8N_URL}/api/v1/credentials`, n8nCredentialData, {
            headers: { 'X-N8N-API-KEY': N8N_API_KEY },
        });

        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h1>Success!</h1>
                <p>Your Google account (${userEmail}) has been successfully connected to n8n.</p>
                <p>You can now close this window.</p>
            </div>
        `);

    } catch (error) {
        console.error('Error creating credential:', error.response ? error.response.data : error.message);
        res.status(500).send('An error occurred while creating the credential in n8n.');
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
