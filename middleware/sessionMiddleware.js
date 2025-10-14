/**
 * Session Middleware - Local Authentication Only
 * Handles session-based authentication without third-party providers
 */

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  if (req.session?.user) {
    req.user = req.session.user;
    return next();
  }
  
  if (req.user) {
    return next();
  }
  
  return res.status(401).json({ 
    error: 'Authentication required',
    redirect: '/login'
  });
}

/**
 * Middleware to redirect unauthenticated users to login
 */
function redirectToLogin(req, res, next) {
  console.log('🔍 Route Protection Check:', {
    path: req.originalUrl,
    hasUser: !!req.user,
    sessionId: req.session?.id,
    hasSessionUser: !!req.session?.user
  });
  
  // Check for local authentication (session-based)
  if (req.session?.user) {
    console.log('✅ Local auth user found in session, allowing access');
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
    hasSessionUser: !!req.session?.user
  });

  // Check local authentication (session-based)
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
  
  console.log('❌ No authentication found, returning false');
  return res.json({ 
    authenticated: false, 
    user: null 
  });
}

module.exports = {
  requireAuth,
  redirectToLogin,
  getAuthStatus
};
