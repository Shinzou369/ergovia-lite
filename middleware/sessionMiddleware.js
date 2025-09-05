// Check for Stytch session validation using cookies
  const stytchCookie = req.cookies.stytch_session;
  const userEmailCookie = req.cookies.user_email;

  if (stytchCookie && userEmailCookie) {
    try {
      if (stytchClient) {
        // Validate session with Stytch using cookie
        const sessionResponse = await stytchClient.sessions.authenticate({
          session_jwt: stytchCookie
        });

        if (sessionResponse && sessionResponse.user) {
          const stytchUser = sessionResponse.user;

          // Update session data with validated user info
          req.session.user = {
            email: stytchUser.emails?.[0]?.email || userEmailCookie,
            first_name: stytchUser.name?.first_name || '',
            last_name: stytchUser.name?.last_name || '',
            stytch_name: `${stytchUser.name?.first_name || ''} ${stytchUser.name?.last_name || ''}`.trim(),
            stytch_user_id: stytchUser.user_id,
            stytch_session_id: stytchCookie
          };

          req.session.stytch_session_id = stytchCookie;

          console.log('✅ Stytch session validated via cookie for:', stytchUser.emails?.[0]?.email);
        }
      }
    } catch (error) {
      console.log('⚠️ Stytch session validation failed:', error.message);
      // Clear invalid session data and cookies
      delete req.session.stytch_session_id;
      delete req.session.user;
      res.clearCookie('stytch_session');
      res.clearCookie('user_email');
    }
  } else if (req.session.stytch_session_id && req.session.user) {
    // Fallback to session-based validation for existing sessions
    try {
      if (stytchClient) {
        const sessionResponse = await stytchClient.sessions.authenticate({
          session_jwt: req.session.stytch_session_id
        });

        if (sessionResponse && sessionResponse.user) {
          const stytchUser = sessionResponse.user;

          req.session.user = {
            email: stytchUser.emails?.[0]?.email || req.session.user.email,
            first_name: stytchUser.name?.first_name || req.session.user.first_name,
            last_name: stytchUser.name?.last_name || req.session.user.last_name,
            stytch_name: `${stytchUser.name?.first_name || ''} ${stytchUser.name?.last_name || ''}`.trim(),
            stytch_user_id: stytchUser.user_id,
            stytch_session_id: req.session.stytch_session_id
          };

          console.log('✅ Stytch session validated via session store for:', stytchUser.emails?.[0]?.email);
        }
      }
    } catch (error) {
      console.log('⚠️ Stytch session validation failed:', error.message);
      // Clear invalid session data
      delete req.session.stytch_session_id;
      delete req.session.user;
    }
  }