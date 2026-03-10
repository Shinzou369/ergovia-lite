/**
 * Notifications JavaScript - V2 Premium Dashboard
 */

let notificationCheckInterval = null;

// Initialize notifications
document.addEventListener('DOMContentLoaded', () => {
    loadNotifications();
    startNotificationPolling();

    // Add event listener to notification bell
    const bell = document.getElementById('notificationBell');
    if (bell) {
        bell.addEventListener('click', toggleNotifications);
    }
});

/**
 * Load notifications from backend
 */
async function loadNotifications() {
    try {
        const response = await Utils.get(CONFIG.API.GET_NOTIFICATIONS);

        if (!response.success) {
            throw new Error(response.error || 'Failed to load notifications');
        }

        const notifications = response.notifications || [];
        const unreadCount = response.unreadCount || notifications.filter(n => !n.read).length;

        // Update badge count
        updateNotificationBadge(unreadCount);

        // Render notifications
        renderNotifications(notifications);

    } catch (error) {
        console.error('[Notifications] Failed to load:', error);
    }
}

/**
 * Update notification badge
 */
function updateNotificationBadge(count) {
    const badges = document.querySelectorAll('#notificationCount');
    badges.forEach(badge => {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    });
}

/**
 * Render notifications in panel
 */
function renderNotifications(notifications) {
    const container = document.getElementById('notificationList');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-gray);">
                <i class="fas fa-bell-slash" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                <p>No notifications</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.read ? '' : 'unread'}"
             data-notification-id="${notification.id}"
             onclick="handleNotificationClick('${notification.id}', '${notification.actionLink || ''}')"
             style="padding: 16px; border-bottom: 1px solid var(--border-gray); cursor: pointer; ${notification.read ? '' : 'background-color: var(--primary-blue-light);'}">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="font-size: 24px; color: ${getNotificationColor(notification.type)};">
                    <i class="fas fa-${getNotificationIcon(notification.type)}"></i>
                </div>
                <div style="flex: 1;">
                    <strong style="display: block; margin-bottom: 4px;">
                        ${escapeHtml(notification.title)}
                    </strong>
                    <p style="font-size: 14px; color: var(--text-gray); margin-bottom: 4px;">
                        ${escapeHtml(notification.message || '')}
                    </p>
                    <small style="font-size: 12px; color: var(--text-gray);">
                        ${getTimeAgo(notification.createdAt)}
                    </small>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get notification icon based on type
 */
function getNotificationIcon(type) {
    const icons = {
        booking: 'calendar-check',
        message: 'comment-dots',
        task: 'clipboard-check',
        alert: 'exclamation-triangle',
        success: 'check-circle',
        info: 'info-circle',
        system: 'cog',
    };
    return icons[type] || 'bell';
}

/**
 * Get notification color based on type
 */
function getNotificationColor(type) {
    const colors = {
        booking: '#42b72a',
        message: '#1877f2',
        task: '#ff9800',
        alert: '#f44336',
        success: '#42b72a',
        info: '#1877f2',
        system: '#9c27b0',
    };
    return colors[type] || '#1877f2';
}

/**
 * Get time ago string
 */
function getTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

    return Utils.formatDate(dateString);
}

/**
 * Toggle notifications panel
 */
function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;

    panel.classList.toggle('active');

    // If opening, mark all as read after 2 seconds
    if (panel.classList.contains('active')) {
        setTimeout(markAllAsRead, 2000);
    }
}

/**
 * Close notifications panel
 */
function closeNotifications() {
    const panel = document.getElementById('notificationPanel');
    if (panel) {
        panel.classList.remove('active');
    }
}

/**
 * Handle notification click
 */
async function handleNotificationClick(notificationId, actionLink) {
    try {
        // Mark as read
        await Utils.post(CONFIG.API.MARK_NOTIFICATION_READ, {
            notificationId: notificationId
        });

        // If there's an action link, navigate to it
        if (actionLink) {
            window.location.href = actionLink;
        }

        // Reload notifications
        await loadNotifications();

    } catch (error) {
        console.error('[Notifications] Failed to handle click:', error);
    }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead() {
    try {
        await Utils.post(CONFIG.API.MARK_NOTIFICATION_READ, {
            markAll: true
        });

        updateNotificationBadge(0);

    } catch (error) {
        console.error('[Notifications] Failed to mark all as read:', error);
    }
}

/**
 * Start polling for new notifications
 */
function startNotificationPolling() {
    if (notificationCheckInterval) return;

    notificationCheckInterval = setInterval(async () => {
        await loadNotifications();
    }, CONFIG.UI.NOTIFICATION_CHECK_INTERVAL);
}

/**
 * Stop notification polling
 */
function stopNotificationPolling() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }
}

// Stop polling when user leaves
window.addEventListener('beforeunload', stopNotificationPolling);

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notificationPanel');
    const bell = document.getElementById('notificationBell');

    if (panel && panel.classList.contains('active')) {
        if (!panel.contains(e.target) && !bell.contains(e.target)) {
            closeNotifications();
        }
    }
});
