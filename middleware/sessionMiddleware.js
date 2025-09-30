
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
      // No Stytch session cookie found - preserve any existing authentication (like Google OAuth)
      return next();
    }

    if (!stytchClient) {
      console.error('❌ Stytch client not available for session validation');
      res.clearCookie('stytch_session');
      // Don't clear req.user - preserve existing authentication
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
    
    // Clear invalid Stytch session but preserve Google OAuth if present
    res.clearCookie('stytch_session');
    delete req.session.user;
    delete req.session.stytch_session_id;
    // Only clear req.user if it was a Stytch user
    if (req.user && req.user.authMethod === 'stytch') {
      req.user = null;
    }
    
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
    googleUser: req.session?.googleUser ? 'present' : 'missing',
    pendingSignup: req.session?.pendingSignup
  });
  
  // Check for local authentication (session-based)
  if (req.session?.user) {
    console.log('✅ Local auth user found in session, allowing access');
    return next();
  }
  
  // Passport.js removed - using local authentication only
  // if (req.user || (req.isAuthenticated && req.isAuthenticated())) {
  //   console.log('✅ Passport user found, allowing access');
  //   return next();
  // }
  
  // Check for Stytch authentication
  if (req.session?.stytch_session_id) {
    console.log('✅ Stytch user found, allowing access');
    return next();
  }
  
  console.log('❌ No authentication found, redirecting to login');
  return res.redirect('/login?return_to=' + encodeURIComponent(req.originalUrl));
}

/**
 * Get authentication status for API endpoints
 */
function getAuthStatus(req, res) {
  console.log('🔍 Auth Status Check:', {
    hasUser: !!req.user,
    hasSessionUser: !!req.session?.user,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    hasGoogleInSession: !!req.session?.googleUser,
    hasStytchUser: !!(req.user && req.user.stytch_user_id)
  });

  // Check local authentication first (session-based)
  if (req.session?.user) {
    const user = req.session.user;
    console.log('✅ Returning local auth user status for:', user.email);
    return res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.email,
        authMethod: 'local',
        role: 'client',
        isPremium: false,
        hasUnlimitedAccess: false,
        isComplete: !!user.name,
        needsRoleSelection: false
      }
    });
  }

  // Check Stytch authentication
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
        role: 'affiliate',
        isPremium: false,
        hasUnlimitedAccess: false,
        isComplete: !!(req.user.first_name && req.user.last_name),
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
