
const stytch = require('stytch');

// Initialize Stytch client
let stytchClient = null;
try {
  if (process.env.STYTCH_PROJECT_ID && process.env.STYTCH_SECRET) {
    const stytchEnv = stytch.envs.test;
    
    stytchClient = new stytch.Client({
      project_id: process.env.STYTCH_PROJECT_ID,
      secret: process.env.STYTCH_SECRET,
      env: stytchEnv
    });
    
    console.log('✅ Session middleware: Stytch client initialized');
  }
} catch (error) {
  console.error('❌ Session middleware: Failed to initialize Stytch client:', error.message);
}

/**
 * Middleware to validate Stytch sessions
 */
async function validateSession(req, res, next) {
  try {
    const sessionJWT = req.cookies?.stytch_session;
    
    if (!sessionJWT) {
      // No session cookie found
      req.user = null;
      return next();
    }

    if (!stytchClient) {
      console.error('❌ Stytch client not available for session validation');
      res.clearCookie('stytch_session');
      req.user = null;
      return next();
    }

    // Validate session with Stytch
    const response = await stytchClient.sessions.authenticate({
      session_jwt: sessionJWT
    });

    if (response && response.session && response.user) {
      // Session is valid, attach user to request
      req.user = {
        user_id: response.user.user_id,
        email: response.user.emails[0].email,
        email_verified: response.user.emails[0].verified,
        first_name: response.user.name?.first_name || '',
        last_name: response.user.name?.last_name || '',
        stytch_session_id: response.session.session_id,
        authMethod: 'stytch'
      };

      // Update session data in server session
      req.session.user = req.user;
      req.session.stytch_session_id = response.session.session_id;

      console.log('✅ Valid Stytch session for:', req.user.email);
      return next();
    } else {
      throw new Error('Invalid session response');
    }

  } catch (error) {
    console.warn('⚠️ Session validation failed:', error.message);
    
    // Clear invalid session
    res.clearCookie('stytch_session');
    delete req.session.user;
    delete req.session.stytch_session_id;
    req.user = null;
    
    return next();
  }
}

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      redirect: '/stytch-auth'
    });
  }
  next();
}

/**
 * Middleware to redirect unauthenticated users to login
 */
function redirectToLogin(req, res, next) {
  console.log('🔍 Route Protection Check:', {
    path: req.originalUrl,
    hasUser: !!req.user,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    sessionId: req.session?.id,
    googleUser: req.session?.googleUser ? 'present' : 'missing'
  });
  
  // Check for Google OAuth in session (our implementation)
  if (req.session?.googleUser) {
    console.log('✅ Google user found in session, allowing access');
    return next();
  }
  
  // Check for Passport.js authentication
  if (req.user || (req.isAuthenticated && req.isAuthenticated())) {
    console.log('✅ Passport user found, allowing access');
    return next();
  }
  
  // Check for Stytch authentication
  if (req.session?.user || req.session?.stytch_session_id) {
    console.log('✅ Stytch user found, allowing access');
    return next();
  }
  
  console.log('❌ No authentication found, redirecting to login');
  return res.redirect('/?login_required=1&return_to=' + encodeURIComponent(req.originalUrl));
}

/**
 * Get authentication status for API endpoints
 */
function getAuthStatus(req, res) {
  console.log('🔍 Auth Status Check:', {
    hasUser: !!req.user,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    hasGoogleInSession: !!req.session?.googleUser,
    hasStytchUser: !!(req.user && req.user.stytch_user_id)
  });

  // Check Stytch authentication first
  if (req.user && req.user.stytch_user_id) {
    console.log('✅ Returning Stytch user status');
    return res.json({
      authenticated: true,
      user: {
        user_id: req.user.user_id,
        email: req.user.email,
        email_verified: req.user.email_verified,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        name: req.user.first_name && req.user.last_name ? 
          `${req.user.first_name} ${req.user.last_name}` : req.user.email,
        authMethod: 'stytch',
        role: 'affiliate', // Stytch users are affiliates
        isPremium: false,
        hasUnlimitedAccess: false,
        isComplete: !!(req.user.first_name && req.user.last_name),
        needsRoleSelection: false
      }
    });
  }
  
  // Check Google OAuth authentication via Passport.js
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const googleUser = req.user;
    console.log('✅ Returning Google Passport user status for:', googleUser.emails?.[0]?.value);
    return res.json({
      authenticated: true,
      user: {
        user_id: googleUser.id,
        email: googleUser.emails?.[0]?.value || '',
        email_verified: googleUser.emails?.[0]?.verified || true,
        first_name: googleUser.name?.givenName || '',
        last_name: googleUser.name?.familyName || '',
        name: googleUser.displayName || googleUser.emails?.[0]?.value || '',
        authMethod: 'google',
        role: 'client', // Google users are clients only
        isPremium: false,
        hasUnlimitedAccess: false,
        isComplete: !!(googleUser.name?.givenName && googleUser.name?.familyName),
        needsRoleSelection: false
      }
    });
  }
  
  // Check Google OAuth user stored in session (our fallback)
  if (req.session?.googleUser) {
    const googleUser = req.session.googleUser;
    console.log('✅ Returning Google session user status for:', googleUser.emails?.[0]?.value);
    return res.json({
      authenticated: true,
      user: {
        user_id: googleUser.id,
        email: googleUser.emails?.[0]?.value || '',
        email_verified: googleUser.emails?.[0]?.verified || true,
        first_name: googleUser.name?.givenName || '',
        last_name: googleUser.name?.familyName || '',
        name: googleUser.displayName || googleUser.emails?.[0]?.value || '',
        authMethod: 'google',
        role: 'client', // Google users are clients only
        isPremium: false,
        hasUnlimitedAccess: false,
        isComplete: !!(googleUser.name?.givenName && googleUser.name?.familyName),
        needsRoleSelection: false
      }
    });
  }
  
  console.log('❌ No authentication found, returning false');
  return res.json({ 
    authenticated: false, 
    user: null 
  });
}

module.exports = {
  validateSession,
  requireAuth,
  redirectToLogin,
  getAuthStatus
};
