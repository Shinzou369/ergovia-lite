/**
 * Lightweight Auth Guard for V1 pages
 * Redirects to login if no valid token
 */
(function() {
    const token = localStorage.getItem('ergovia_token');
    if (!token) {
        // Check if setup is needed first
        fetch('/api/auth/status')
            .then(r => r.json())
            .then(data => {
                if (data.setupRequired) {
                    window.location.href = '/login.html';
                } else if (!token) {
                    window.location.href = '/login.html';
                }
            })
            .catch(() => {
                // Server might not be up yet
            });
        return;
    }

    // Verify token
    fetch('/api/auth/verify', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            localStorage.removeItem('ergovia_token');
            localStorage.removeItem('ergovia_user');
            window.location.href = '/login.html';
        }
    })
    .catch(() => {});

    // Add auth header to all fetch calls
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        if (typeof url === 'string' && url.startsWith('/api/') && !url.includes('/api/auth/')) {
            options.headers = options.headers || {};
            if (!options.headers['Authorization']) {
                options.headers['Authorization'] = 'Bearer ' + localStorage.getItem('ergovia_token');
            }
        }
        return originalFetch.call(this, url, options);
    };
})();
