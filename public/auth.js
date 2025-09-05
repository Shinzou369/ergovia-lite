// Authentication helper functions
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    
    console.log('Auth status check result:', data);
    
    // If not authenticated but we suspect user should be (coming from auth flow)
    if (!data.authenticated && (
      window.location.search.includes('from_stytch') ||
      sessionStorage.getItem('stytch_auth_completed') ||
      localStorage.getItem('stytch_user_email')
    )) {
      console.log('🔄 Auth flow detected but not authenticated, retrying...');
      
      // Wait and retry once
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryResponse = await fetch('/api/auth/status', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const retryData = await retryResponse.json();
      
      console.log('Auth status retry result:', retryData);
      
      if (retryData.authenticated) {
        // Clear the temporary indicators
        sessionStorage.removeItem('stytch_auth_completed');
        return retryData;
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return { authenticated: false, user: null };
  }
}

async function getUserProfile() {
  try {
    const response = await fetch('/api/profile');
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

function initiateGoogleLogin() {
  window.location.href = '/auth/google';
}

async function logout() {
  try {
    // Clear user data before redirecting
    if (typeof clearUserData !== 'undefined') {
      clearUserData();
    }
    
    // Call Stytch logout endpoint
    await fetch('/api/auth/stytch/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Also handle Google logout if applicable
    window.location.href = '/logout';
  } catch (error) {
    console.error('Logout error:', error);
    // Force redirect even if logout call fails
    window.location.href = '/';
  }
}

// Check auth status on page load
document.addEventListener('DOMContentLoaded', async () => {
  if (window.authCheckInProgress) return;
  window.authCheckInProgress = true;
  
  // Wait longer for session establishment, especially after Stytch auth
  const isFromStytch = window.location.search.includes('from_stytch') || 
                      window.location.pathname === '/stytch-logged-in' ||
                      sessionStorage.getItem('stytch_auth_completed');
  
  if (isFromStytch) {
    console.log('🔄 Coming from Stytch auth, waiting for session...');
    await new Promise(resolve => setTimeout(resolve, 1500));
  } else {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  const authStatus = await checkAuthStatus();

  // Check if we're on auth-related pages or chat page - don't interfere with those flows
  const authPages = ['/stytch-logged-in', '/stytch-auth', '/login', '/signup', '/complete-signup', '/select-role', '/confirm-login', '/chat'];
  const currentPath = window.location.pathname;
  
  // Special handling for stytch-auth page with affiliate flow
  if (currentPath === '/stytch-auth' && window.location.search.includes('flow=affiliate') && authStatus.authenticated) {
    console.log('Stytch user already authenticated, redirecting to chat...');
    window.location.href = '/chat';
    window.authCheckInProgress = false;
    return;
  }
  
  if (authPages.some(page => currentPath === page || currentPath.startsWith(page))) {
    console.log('On authentication page, skipping auth redirect logic');
    window.authCheckInProgress = false;
    return;
  }

  if (authStatus.authenticated) {
    // User is logged in - show main interface
    console.log('✅ User authenticated:', authStatus.user.email, 'Method:', authStatus.user.authMethod);
    // Store user data globally for easy access
    window.currentUser = authStatus.user;
    // Update UI to show user info
    updateUIForLoggedInUser(authStatus.user);
  } else {
    // User not logged in - show login option (log only once per session)
    if (!window.authLoggedOnce) {
      console.log('User not authenticated');
      window.authLoggedOnce = true;
    }
    window.currentUser = null;
    showLoginOption();
  }
  
  window.authCheckInProgress = false;
});

async function updateUIForLoggedInUser(user) {
  // Check if user needs role selection
  if (!user.role || user.needsRoleSelection) {
    // Only redirect to role selection if we're not already there
    if (!window.location.pathname.includes('select-role')) {
      window.location.href = '/select-role';
      return;
    }
  }

  // If user has a role, check if they're on the right page
  if (user.role) {
    const currentPath = window.location.pathname;
    
    // Affiliate users should be on chat page, client users on taskforce
    if (user.role === 'affiliate' && currentPath === '/chat') {
      // Affiliate on correct page, continue with initialization
    } else if (user.role === 'client' && currentPath === '/taskforce') {
      // Client on correct page, continue with initialization  
    } else if (currentPath === '/select-role' || currentPath === '/complete-signup') {
      // User is on role selection or signup completion page, let them complete it
      return;
    } else {
      // User is on wrong page for their role, redirect appropriately
      const targetPage = user.role === 'affiliate' ? '/chat' : '/taskforce';
      if (currentPath !== targetPage) {
        console.log(`Redirecting ${user.role} to appropriate page: ${targetPage}`);
        window.location.href = targetPage;
        return;
      }
    }
  }

  // Set global login state
  if (typeof isUserLoggedIn !== 'undefined') {
    isUserLoggedIn = true;
  }

  // Initialize token counter for authenticated users
  if (typeof TokenCounter !== 'undefined' && !tokenCounter) {
    tokenCounter = new TokenCounter();
  }

  // Load user's threads from server - this will also load messages for the current thread
  if (typeof loadUserThreads !== 'undefined') {
    await loadUserThreads();
  }

  // Update top navigation with user info
  updateTopNavForUser(user);

  // Show/hide premium indicator in sidebar
  const premiumSidebar = document.getElementById('premium-status-sidebar');
  if (premiumSidebar) {
    if (user.isPremium || user.hasUnlimitedAccess) {
      premiumSidebar.style.display = 'flex';
    } else {
      premiumSidebar.style.display = 'none';
    }
  }

  // Personalize hero title
  personalizeHeroTitle(user);

  // Remove any existing login prompts
  const existingLoginBtn = document.querySelector('.auth-placeholder');
  if (existingLoginBtn) {
    existingLoginBtn.remove();
  }

  // Hide login modal if it's showing
  if (typeof hideLoginModal !== 'undefined') {
    hideLoginModal();
  }

  // Update UI with user's data (this will only update the threads list, not messages)
  if (typeof updateUI !== 'undefined') {
    updateUI();
  }
}

function showLoginOption() {
  // Set global login state
  if (typeof isUserLoggedIn !== 'undefined') {
    isUserLoggedIn = false;
  }

  // Clear user data (this will also clear the output box)
  if (typeof clearUserData !== 'undefined') {
    clearUserData();
  }

  // Update top navigation for non-authenticated user
  updateTopNavForGuest();

  // Show generic hero title
  showGenericHeroTitle();

  // Update UI to show empty state (this will clear threads list)
  if (typeof updateUI !== 'undefined') {
    updateUI();
  }

  // Clear token counter
  tokenCounter = null;
  
  // Don't automatically redirect to auth - let users browse freely
}

function updateTopNavForUser(user) {
  const navRight = document.querySelector('.nav-right');

  // Remove existing auth elements
  const existingAuth = navRight.querySelector('.auth-container');
  if (existingAuth) {
    existingAuth.remove();
  }

  // Check if user has premium access
  const isPremium = user.isPremium || user.hasUnlimitedAccess;
  const premiumBadge = isPremium ? '<span class="premium-badge" title="Premium Member">👑</span>' : '';
  const roleBadge = user.role ? `<span class="role-badge" title="${user.role === 'affiliate' ? 'Affiliate Partner' : 'Client'}">${user.role === 'affiliate' ? '💼' : '🚀'}</span>` : '';

  // Create user info container
  const authContainer = document.createElement('div');
  authContainer.className = 'auth-container';
  authContainer.innerHTML = `
    <div class="user-profile">
      <div class="user-avatar">
        ${user.picture ? `<img src="${user.picture}" alt="${user.name}" class="avatar-img">` : '👤'}
      </div>
      <div class="user-info">
        <span class="user-name">${user.name} ${roleBadge} ${premiumBadge}</span>
      </div>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  `;

  // Insert before existing nav items
  const firstChild = navRight.firstChild;
  navRight.insertBefore(authContainer, firstChild);
}

function updateTopNavForGuest() {
  const navRight = document.querySelector('.nav-right');

  // Remove existing auth elements
  const existingAuth = navRight.querySelector('.auth-container');
  if (existingAuth) {
    existingAuth.remove();
  }

  // Create login/signup container
  const authContainer = document.createElement('div');
  authContainer.className = 'auth-container';
  authContainer.innerHTML = `
    <button class="login-btn" onclick="initiateGoogleLogin()">Login</button>
    <button class="signup-btn" onclick="initiateGoogleLogin()">Sign Up</button>
  `;

  // Insert before existing nav items
  const firstChild = navRight.firstChild;
  navRight.insertBefore(authContainer, firstChild);
}

function personalizeHeroTitle(user) {
  const heroTitle = document.querySelector('.hero-title');
  const heroSubtitle = document.querySelector('.hero-subtitle');

  // Don't personalize if we're on templates page or if hero already has taskforce content
  if (window.location.pathname.includes('templates') || 
      (heroTitle && heroTitle.textContent.includes('Taskforce'))) {
    return;
  }

  if (heroTitle) {
    const displayName = user.preferredFirstName || user.name.split(' ')[0];
    const greeting = user.isComplete && user.preferredFirstName ? `Welcome back, ${displayName}!` : `Welcome, ${displayName}!`;
    heroTitle.textContent = greeting;
  }

  if (heroSubtitle) {
    heroSubtitle.innerHTML = `Ready to boost your productivity with <strong>ERGOVIA-AI</strong>? Let's get things done faster with intelligent automation.`;
  }
}

function showGenericHeroTitle() {
  const heroTitle = document.querySelector('.hero-title');
  const heroSubtitle = document.querySelector('.hero-subtitle');

  if (heroTitle) {
    heroTitle.textContent = 'ERGOVIA-AI';
  }

  if (heroSubtitle) {
    heroSubtitle.innerHTML = `Start your own <strong>AI agency with Ergovia.</strong> Deploy ready-to-use automations that handle real business tasks—like messaging, bookings, follow-ups, and reminders—all fully branded under your name and running 24/7.`;
  }
}