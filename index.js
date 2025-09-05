
import express from 'express';
import session from 'cookie-session';
import { Client } from 'stytch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

// Initialize Stytch client
const stytchClient = new Client({
  project_id: process.env.STYTCH_PROJECT_ID,
  secret: process.env.STYTCH_SECRET,
  env: process.env.NODE_ENV === 'production' ? 'live' : 'test'
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie session middleware
app.use(session({
  name: 'session',
  keys: [process.env.SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' // HTTPS in production
}));

// Serve static files
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/chat');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

// Magic Link authentication route
app.post('/auth/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get the base URL for redirects
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://${req.get('host')}` 
      : `https://${req.get('host')}`;

    const response = await stytchClient.magicLinks.email.loginOrCreate({
      email: email,
      login_magic_link_url: `${baseUrl}/stytch-callback`,
      signup_magic_link_url: `${baseUrl}/stytch-callback`
    });

    console.log('Magic link sent successfully:', { email, request_id: response.request_id });
    res.json({ 
      success: true, 
      message: 'Magic link sent! Check your email.',
      request_id: response.request_id 
    });

  } catch (error) {
    console.error('Magic link error:', error);
    res.status(500).json({ 
      error: 'Failed to send magic link', 
      details: error.message 
    });
  }
});

// Stytch callback route
app.get('/stytch-callback', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).send('Missing authentication token');
    }

    // Authenticate the magic link token
    const response = await stytchClient.magicLinks.authenticate({
      token: token
    });

    // Save user data to session
    req.session.user = {
      user_id: response.user.user_id,
      email: response.user.emails[0]?.email || 'Unknown',
      created_at: response.user.created_at,
      status: response.user.status
    };

    console.log('User authenticated successfully:', {
      user_id: response.user.user_id,
      email: response.user.emails[0]?.email
    });

    // Redirect to chat page
    res.redirect('/chat');

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).send(`Authentication failed: ${error.message}`);
  }
});

// Protected chat route
app.get('/chat', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const user = req.session.user;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chat - Authenticated</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .user-info { background: #f0f8ff; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .logout-btn { background: #ff4444; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .logout-btn:hover { background: #cc0000; }
      </style>
    </head>
    <body>
      <h1>Welcome to Chat!</h1>
      <div class="user-info">
        <h3>User Information:</h3>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>User ID:</strong> ${user.user_id}</p>
        <p><strong>Status:</strong> ${user.status}</p>
        <p><strong>Member since:</strong> ${new Date(user.created_at).toLocaleDateString()}</p>
      </div>
      
      <h3>Chat functionality would go here...</h3>
      <p>This is a protected route. You can only see this because you're authenticated!</p>
      
      <button class="logout-btn" onclick="logout()">Logout</button>
      
      <script>
        function logout() {
          fetch('/auth/logout', { method: 'POST' })
            .then(() => window.location.href = '/login');
        }
      </script>
    </body>
    </html>
  `);
});

// Login page route
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/chat');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Logout route
app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true, message: 'Logged out successfully' });
});

// Session status check
app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    user: req.session.user || null
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    stytch_configured: !!(process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET)
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Access your app at: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  console.log(`🔐 Stytch configured: ${!!(process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET)}`);
});
