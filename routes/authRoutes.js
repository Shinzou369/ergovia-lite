
const express = require('express');
const stytch = require('stytch');
const router = express.Router();

// Initialize Stytch client (same as in server.js)
let stytchClient = null;
try {
  if (process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET) {
    const stytchEnv = stytch.envs.test;
    
    stytchClient = new stytch.Client({
      project_id: process.env.STYTCH_PROJECT_ID,
      secret: process.env.STYTCH_SECRET,
      env: stytchEnv
    });
    
    console.log('✅ Auth routes: Stytch client initialized');
  } else {
    console.log('⚠️ Auth routes: Stytch not configured');
  }
} catch (error) {
  console.error('❌ Auth routes: Failed to initialize Stytch client:', error.message);
  stytchClient = null;
}

// Handle magic link callback
router.get('/callback', async (req, res) => {
  try {
    if (!stytchClient) {
      return res.status(500).json({ error: 'Authentication service not configured' });
    }

    const { token, stytch_token_type } = req.query;
    
    if (!token) {
      return res.redirect('/stytch-auth?error=missing_token');
    }

    console.log('🔄 Processing magic link token...');

    // Authenticate the magic link token
    const response = await stytchClient.magicLinks.authenticate({
      token: token,
      session_duration_minutes: 60 * 24 * 7 // 7 days
    });

    const user = response.user;
    const session = response.session;

    console.log('✅ Stytch authentication successful for:', user.emails[0].email);

    // Create user data
    const userData = {
      stytch_user_id: user.user_id,
      email: user.emails[0].email,
      email_verified: user.emails[0].verified,
      first_name: user.name?.first_name || '',
      last_name: user.name?.last_name || '',
      createdAt: user.created_at,
      authMethod: 'stytch'
    };

    // Store session in secure HTTP-only cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    };

    res.cookie('stytch_session', session.session_jwt, cookieOptions);

    // Store user data in session for easier access
    req.session.user = userData;
    req.session.stytch_session_id = session.session_id;

    // Save session before redirecting
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.redirect('/stytch-auth?error=session_save_failed');
      }
      
      console.log('✅ Session saved, redirecting to stytch-logged-in');
      res.redirect('/stytch-logged-in');
    });

  } catch (error) {
    console.error('❌ Stytch authentication error:', error);
    
    // Clear any potentially invalid cookies
    res.clearCookie('stytch_session');
    
    let errorMessage = 'auth_failed';
    if (error.status_code === 400) {
      errorMessage = 'invalid_token';
    } else if (error.status_code === 401) {
      errorMessage = 'expired_token';
    }
    
    res.redirect(`/stytch-auth?error=${errorMessage}`);
  }
});

// Send magic link endpoint
router.post('/magic-links/send', async (req, res) => {
  try {
    if (!stytchClient) {
      return res.status(500).json({ 
        success: false,
        error: 'Authentication service not configured'
      });
    }

    const { email, first_name, last_name, return_to } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid email format' 
      });
    }

    // Use dynamic redirect URL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const finalHost = host.includes('repl.co') || host.includes('localhost') ? host : 'ergovia-ai.com';
    const redirectUrl = `${protocol}://${finalHost}/auth/callback`;
    
    // Store return_to in session
    req.session.stytch_return_to = return_to || '/chat';
    
    const params = {
      email: email,
      login_magic_link_url: redirectUrl,
      signup_magic_link_url: redirectUrl
    };

    // Store name data in session for use after authentication
    if (first_name || last_name) {
      req.session.stytch_user_first_name = first_name || '';
      req.session.stytch_user_last_name = last_name || '';
    }

    console.log('🔄 Sending Stytch magic link to:', email);
    const response = await stytchClient.magicLinks.email.loginOrCreate(params);

    console.log('✅ Stytch magic link sent successfully:', response.request_id);

    res.json({
      success: true,
      message: 'Magic link sent! Check your email (including spam folder).',
      request_id: response.request_id
    });

  } catch (error) {
    console.error('❌ Stytch magic link error:', error);
    
    let userMessage = 'Failed to send magic link';
    let statusCode = 500;
    
    if (error.status_code === 400) {
      userMessage = 'Invalid email address or request parameters';
      statusCode = 400;
    } else if (error.status_code === 429) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
      statusCode = 429;
    }

    res.status(statusCode).json({
      success: false,
      error: userMessage,
      details: error.message
    });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const sessionJWT = req.cookies.stytch_session;
    
    if (stytchClient && sessionJWT) {
      try {
        // Revoke the Stytch session
        await stytchClient.sessions.revoke({
          session_jwt: sessionJWT
        });
        console.log('✅ Revoked Stytch session');
      } catch (revokeError) {
        console.warn('⚠️ Failed to revoke Stytch session:', revokeError.message);
      }
    }

    // Clear the session cookie
    res.clearCookie('stytch_session');
    
    // Destroy server session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }

      console.log('✅ Session destroyed');
      res.json({ success: true, message: 'Logged out successfully' });
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    // Still try to clear cookies and session
    res.clearCookie('stytch_session');
    req.session.destroy(() => {
      res.json({ success: true, message: 'Logged out successfully (partial)' });
    });
  }
});

module.exports = router;
