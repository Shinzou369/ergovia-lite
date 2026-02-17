/**
 * Dashboard Page JavaScript - V2 Premium Dashboard
 * Uses Express.js backend via /api/v2/ endpoints
 */

let dashboardData = null;
let refreshInterval = null;

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Dashboard] Initializing...');
    await loadDashboard();
    startAutoRefresh();
});

/**
 * Load all dashboard data
 */
async function loadDashboard() {
    try {
        // Load dashboard data from backend
        const response = await Utils.get(CONFIG.API.GET_DASHBOARD_DATA);

        if (!response.success) {
            throw new Error(response.error || 'Failed to load dashboard');
        }

        dashboardData = response;

        // Update UI components
        updateWelcomeBanner(dashboardData.owner);
        updateStats(dashboardData.stats);
        updateTasks(dashboardData.tasks || []);
        updateUpcomingBookings(dashboardData.upcomingBookings || []);

        // Update user info in navbar
        const ownerName = dashboardData.owner?.ownerName || dashboardData.owner?.name || 'Owner';
        const userNameEl = document.getElementById('userName');
        const ownerNameEl = document.getElementById('ownerName');

        if (userNameEl) userNameEl.textContent = ownerName;
        if (ownerNameEl) ownerNameEl.textContent = ownerName;

        console.log('[Dashboard] Loaded successfully', dashboardData);

    } catch (error) {
        console.error('[Dashboard] Failed to load:', error);
        Utils.showToast('Failed to load dashboard data', 'error');
    }
}

/**
 * Update welcome banner
 */
function updateWelcomeBanner(owner) {
    const messages = [
        'Your AI assistant is working for you',
        'Everything is running smoothly',
        'Managing your properties 24/7',
        'Your bookings are up to date',
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) welcomeEl.textContent = randomMessage;
}

/**
 * Update statistics cards
 */
function updateStats(stats) {
    if (!stats) return;

    const totalBookingsEl = document.getElementById('totalBookings');
    const totalPropertiesEl = document.getElementById('totalProperties');
    const activeConvoEl = document.getElementById('activeConversations');
    const revenueEl = document.getElementById('monthlyRevenue');

    if (totalBookingsEl) totalBookingsEl.textContent = stats.totalBookings || 0;
    if (totalPropertiesEl) totalPropertiesEl.textContent = stats.totalProperties || 0;
    if (activeConvoEl) activeConvoEl.textContent = stats.activeConversations || 0;
    if (revenueEl) revenueEl.textContent = `$${stats.monthlyRevenue || 0}`;
}

/**
 * Update tasks section
 */
function updateTasks(tasks) {
    const container = document.getElementById('tasksContainer');
    if (!container) return;

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="task-item completed">
                <div class="task-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="task-content">
                    <h4>All Set!</h4>
                    <p>You have no pending tasks</p>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.priority === 'high' || task.priority === 'urgent' ? 'urgent' : ''}"
             data-task-id="${task.id}">
            <div class="task-icon">
                <i class="fas fa-${task.icon || 'circle'}"></i>
            </div>
            <div class="task-content">
                <h4>${escapeHtml(task.title)}</h4>
                <p>${escapeHtml(task.description || '')}</p>
            </div>
            <div class="task-action">
                ${task.actionLink ?
                    `<a href="${task.actionLink}" class="btn-primary">${escapeHtml(task.actionText || 'View')}</a>` :
                    `<button class="btn-primary" onclick="markTaskComplete('${task.id}')">
                        <i class="fas fa-check"></i> Done
                    </button>`
                }
            </div>
        </div>
    `).join('');
}

/**
 * Mark task as complete
 */
async function markTaskComplete(taskId) {
    try {
        const response = await Utils.post(CONFIG.API.MARK_TASK_COMPLETE, { taskId });

        if (response.success) {
            Utils.showToast('Task completed!', 'success');
            await loadDashboard(); // Refresh
        } else {
            throw new Error(response.error || 'Failed to complete task');
        }
    } catch (error) {
        console.error('[Dashboard] Failed to mark task complete:', error);
        Utils.showToast('Failed to complete task', 'error');
    }
}

/**
 * Update upcoming bookings list
 */
function updateUpcomingBookings(bookings) {
    const container = document.getElementById('upcomingBookings');
    if (!container) return;

    if (!bookings || bookings.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-gray); padding: 20px;">
                <i class="fas fa-calendar-times" style="font-size: 32px; opacity: 0.5;"></i>
                <p style="margin-top: 12px;">No upcoming check-ins</p>
            </div>
        `;
        return;
    }

    container.innerHTML = bookings.slice(0, 5).map(booking => {
        // Calculate nights
        const checkIn = new Date(booking.checkIn);
        const checkOut = new Date(booking.checkOut);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

        return `
            <div class="booking-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-gray);">
                <div class="booking-info">
                    <h4 style="margin: 0; font-size: 15px;">${escapeHtml(booking.guestName || 'Guest')}</h4>
                    <p style="margin: 4px 0 0; color: var(--text-gray); font-size: 13px;">
                        <i class="fas fa-home"></i> ${escapeHtml(booking.propertyName || 'Property')}
                    </p>
                </div>
                <div class="booking-date" style="text-align: right;">
                    <strong style="color: var(--primary-blue);">${Utils.formatDate(booking.checkIn)}</strong>
                    <p style="margin: 4px 0 0; color: var(--text-gray); font-size: 12px;">${nights} night${nights > 1 ? 's' : ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Start auto-refresh for dashboard
 */
function startAutoRefresh() {
    if (refreshInterval) return; // Already running

    refreshInterval = setInterval(async () => {
        console.log('[Dashboard] Auto-refreshing...');
        await loadDashboard();
    }, CONFIG.UI.DASHBOARD_REFRESH_INTERVAL);
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show modal with info
 */
function showModal(title, text) {
    const modal = document.getElementById('infoModal');
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');

    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (modal) modal.style.display = 'flex';
}

/**
 * Close modal
 */
function closeModal() {
    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
}

/**
 * Seed demo data (properties + bookings)
 */
async function seedDemoData() {
    try {
        Utils.showToast('Loading demo data...', 'info');
        const response = await Utils.post('/seed', {});
        if (response.success) {
            Utils.showToast(`Loaded ${response.properties} properties & ${response.bookings} bookings!`, 'success');
            await loadDashboard();
            await loadCalendarData();
            renderCalendar();
            renderUpcomingBookings();
            renderPropertyLegend();
        } else {
            Utils.showToast(response.error || 'Failed to seed data', 'error');
        }
    } catch (error) {
        console.error('[Dashboard] Seed error:', error);
        Utils.showToast('Failed to load demo data', 'error');
    }
}

// Help button info texts
const helpTexts = {
    tasks: 'This section shows your pending tasks and reminders. Complete them to keep your property management running smoothly.',
    calendar: 'View all your bookings across properties. Color-coded for easy identification. Click on a date to see details.',
};

// Handle help buttons
document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-help')) {
        const infoType = e.target.closest('.btn-help').dataset.info;
        if (helpTexts[infoType]) {
            showModal('Help', helpTexts[infoType]);
        }
    }
});

// Stop refresh when user leaves page
window.addEventListener('beforeunload', stopAutoRefresh);

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.id === 'infoModal') {
        closeModal();
    }
});
