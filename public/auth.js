// Authentication helper functions - Local Auth Only
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

async function logout() {
  try {
    // Clear user data before redirecting
    if (typeof clearUserData !== 'undefined') {
      clearUserData();
    }
    
    // Call logout endpoint
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Redirect to home
    window.location.href = '/';
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
  
  const currentPath = window.location.pathname;
  
  // Prevent auth checks on specific pages to avoid loops
  const skipAuthPages = ['/login', '/signup', '/complete-signup', '/select-role', '/confirm-login', '/no-account', '/account-exists'];
  
  if (skipAuthPages.includes(currentPath)) {
    console.log('On auth flow page, skipping automatic auth check');
    window.authCheckInProgress = false;
    return;
  }
  
  // For chat page, allow auth check but handle carefully
  if (currentPath === '/chat') {
    const authStatus = await checkAuthStatus();
    
    if (authStatus.authenticated) {
      console.log('✅ User authenticated on chat page:', authStatus.user.email);
      window.currentUser = authStatus.user;
      updateUIForLoggedInUser(authStatus.user);
    } else {
      console.log('User not authenticated, showing login options on chat page');
      window.currentUser = null;
      showLoginOptions();
    }
    window.authCheckInProgress = false;
    return;
  }
  
  // For all other pages, check auth normally
  const authStatus = await checkAuthStatus();

  if (authStatus.authenticated) {
    console.log('✅ User authenticated:', authStatus.user.email, 'Method:', authStatus.user.authMethod);
    window.currentUser = authStatus.user;
    updateUIForLoggedInUser(authStatus.user);
  } else {
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
  const currentPath = window.location.pathname;
  
  // Local auth users default to taskforce
  if (currentPath === '/' || currentPath === '/login' || currentPath === '/signup') {
    console.log(`Redirecting local user from ${currentPath} to /taskforce`);
    window.location.href = '/taskforce';
    return;
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
  const roleBadge = user.role ? `<span class="role-badge" title="${user.role === 'affiliate' ? 'Affiliate Partner' : 'Client'}" style="background: ${user.role === 'affiliate' ? 'var(--primary)' : 'var(--success)'}; color: var(--bg-primary); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">${user.role === 'affiliate' ? '🏢 AFFILIATE' : '🚀 CLIENT'}</span>` : '';

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
    <button class="login-btn" onclick="window.location.href='/login'">Login</button>
    <button class="signup-btn" onclick="window.location.href='/signup'">Sign Up</button>
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
