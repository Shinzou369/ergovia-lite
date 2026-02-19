/**
 * Auth Guard - Include this on every protected page
 * Checks JWT token validity and redirects to login if invalid
 */

(function() {
    'use strict';

    const AUTH = {
        TOKEN_KEY: 'ergovia_token',
        USER_KEY: 'ergovia_user',
        LOGIN_URL: '/login.html',

        getToken() {
            return localStorage.getItem(this.TOKEN_KEY);
        },

        getUser() {
            try {
                return JSON.parse(localStorage.getItem(this.USER_KEY));
            } catch {
                return null;
            }
        },

        logout() {
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
            window.location.href = this.LOGIN_URL;
        },

        async verify() {
            const token = this.getToken();
            if (!token) {
                this.redirectToLogin();
                return false;
            }

            try {
                const resp = await fetch('/api/auth/verify', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await resp.json();
                if (!data.success) {
                    this.redirectToLogin();
                    return false;
                }
                // Update stored user data
                localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
                return true;
            } catch (e) {
                // Network error — don't redirect (might be offline)
                console.warn('Auth verify failed:', e);
                return !!token; // Trust existing token if network fails
            }
        },

        redirectToLogin() {
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
            if (window.location.pathname !== this.LOGIN_URL) {
                window.location.href = this.LOGIN_URL;
            }
        },

        /**
         * Set up the user display in the navbar (name + logout button)
         */
        setupNavbar() {
            const user = this.getUser();
            if (!user) return;

            // Update user name display if element exists
            const userNameEl = document.querySelector('.user-name');
            if (userNameEl) {
                userNameEl.textContent = user.username;
            }

            // Add logout button if not already present
            const nav = document.querySelector('.nav-actions') || document.querySelector('nav');
            if (nav && !document.getElementById('logoutBtn')) {
                const logoutBtn = document.createElement('button');
                logoutBtn.id = 'logoutBtn';
                logoutBtn.title = 'Sign Out';
                logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                logoutBtn.style.cssText = 'background:none;border:none;color:#65676b;cursor:pointer;font-size:18px;padding:8px;border-radius:50%;transition:all 0.2s;margin-left:8px;';
                logoutBtn.addEventListener('mouseover', () => { logoutBtn.style.background = '#f0f2f5'; logoutBtn.style.color = '#f44336'; });
                logoutBtn.addEventListener('mouseout', () => { logoutBtn.style.background = 'none'; logoutBtn.style.color = '#65676b'; });
                logoutBtn.addEventListener('click', () => AUTH.logout());
                nav.appendChild(logoutBtn);
            }
        }
    };

    // Run auth check on page load
    async function init() {
        // First check if setup is needed (no users)
        try {
            const statusResp = await fetch('/api/auth/status');
            const status = await statusResp.json();
            if (status.setupRequired) {
                // No users yet — redirect to login for first-time setup
                if (window.location.pathname !== '/login.html') {
                    window.location.href = '/login.html';
                }
                return;
            }
        } catch (e) {
            // Server might not be running
        }

        // Verify token
        const valid = await AUTH.verify();
        if (valid) {
            AUTH.setupNavbar();
        }
    }

    // Expose globally
    window.AUTH = AUTH;

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
