/**
 * Configuration file for Control Panel V2 (Premium Dashboard)
 * Uses Express.js backend - no n8n dependency
 * Schema is abstracted for easy changes
 */

const CONFIG = {
    // Version
    VERSION: '2.0.0',

    // Backend API endpoints (Express.js)
    API: {
        // Use relative URL (same origin as frontend)
        BASE_URL: '/api/v2',

        // Dashboard endpoints
        GET_DASHBOARD_DATA: '/dashboard',
        GET_STATS: '/stats',

        // Settings/Onboarding endpoints
        SAVE_SETTINGS: '/settings',
        GET_SETTINGS: '/settings',
        ACTIVATE_WORKFLOWS: '/activate',

        // Property management endpoints
        GET_PROPERTIES: '/properties',
        SAVE_PROPERTY: '/properties',
        DELETE_PROPERTY: '/properties', // DELETE method with /:id

        // Bookings/Calendar endpoints
        GET_BOOKINGS: '/bookings',
        CREATE_BOOKING: '/bookings',

        // Tasks endpoints
        GET_TASKS: '/tasks',
        MARK_TASK_COMPLETE: '/tasks/complete',

        // Notifications endpoints
        GET_NOTIFICATIONS: '/notifications',
        MARK_NOTIFICATION_READ: '/notifications/read',

        // Workflow sync endpoints
        SYNC_WORKFLOWS: '/sync/workflows',
        SYNC_SYSTEM_PROMPT: '/sync/system-prompt',
        SYNC_CREDENTIALS: '/sync/credentials',
        SYNC_STATUS: '/sync/status',
    },

    // Local storage keys
    STORAGE: {
        CUSTOMER_ID: 'v2_customer_id',
        FORM_DRAFT: 'v2_form_draft',
        USER_DATA: 'v2_user_data',
        THEME: 'v2_theme',
    },

    // UI Settings
    UI: {
        AUTO_SAVE_DELAY: 2000, // milliseconds
        NOTIFICATION_CHECK_INTERVAL: 30000, // 30 seconds
        DASHBOARD_REFRESH_INTERVAL: 60000, // 1 minute
        TOAST_DURATION: 3000, // 3 seconds
    },

    // Property color palette for calendar
    PROPERTY_COLORS: [
        '#1877f2', // Blue
        '#42b72a', // Green
        '#f44336', // Red
        '#ff9800', // Orange
        '#9c27b0', // Purple
        '#00bcd4', // Cyan
        '#e91e63', // Pink
        '#795548', // Brown
    ],
};

/**
 * Schema Mapping Layer
 * This allows easy adaptation when the actual database schema is finalized
 * Change the mappings here when schema changes - frontend code stays the same
 */
const SchemaMapper = {
    // Map frontend field names to backend field names
    // Change these when backend schema is finalized

    owner: {
        toBackend: (data) => ({
            owner_name: data.ownerName,
            owner_email: data.ownerEmail,
            owner_phone: data.ownerPhone,
            preferred_platform: data.preferredPlatform,
            telegram_chat_id: data.telegramChatId,
            whatsapp_number: data.whatsappNumber,
        }),
        toFrontend: (data) => ({
            ownerName: data.owner_name || data.ownerName || '',
            ownerEmail: data.owner_email || data.ownerEmail || '',
            ownerPhone: data.owner_phone || data.ownerPhone || '',
            preferredPlatform: data.preferred_platform || data.preferredPlatform || 'telegram',
            telegramChatId: data.telegram_chat_id || data.telegramChatId || '',
            whatsappNumber: data.whatsapp_number || data.whatsappNumber || '',
        }),
    },

    credentials: {
        toBackend: (data) => ({
            telegram_bot_token: data.telegramBotToken,
            twilio_account_sid: data.twilioAccountSid,
            twilio_auth_token: data.twilioAuthToken,
            twilio_phone_number: data.twilioPhoneNumber,
        }),
        toFrontend: (data) => ({
            telegramBotToken: data.telegram_bot_token ? '********' : '',
            twilioAccountSid: data.twilio_account_sid ? '********' : '',
            twilioAuthToken: data.twilio_auth_token ? '********' : '',
            twilioPhoneNumber: data.twilio_phone_number || '',
        }),
    },

    budget: {
        toBackend: (data) => ({
            monthly_budget: data.monthlyBudget,
        }),
        toFrontend: (data) => ({
            monthlyBudget: data.monthly_budget || data.monthlyBudget || 50,
        }),
    },

    property: {
        toBackend: (data) => ({
            id: data.id,
            name: data.name,
            address: data.address,
            property_type: data.type,
            bedrooms: data.bedrooms,
            bathrooms: data.bathrooms,
            max_guests: data.maxGuests,

            // Pricing & Stay Rules
            base_price: data.basePrice,
            weekend_price: data.weekendPrice,
            holiday_price: data.holidayPrice,
            cleaning_fee: data.cleaningFee,
            min_stay_nights: data.minStayNights,
            max_stay_nights: data.maxStayNights,
            check_in_time: data.checkInTime,
            check_out_time: data.checkOutTime,

            // Calendar & Automation
            calendar_url: data.calendarUrl,
            timezone: data.timezone,
            calendar_sync_enabled: data.calendarSyncEnabled,
            auto_approve_bookings: data.autoApproveBookings,
            require_screening: data.requireScreening,

            // Listing platforms
            airbnb_url: data.airbnbUrl,
            booking_com_url: data.bookingComUrl,
            vrbo_url: data.vrboUrl,

            // Access
            door_code: data.doorCode,
            access_instructions: data.accessInstructions,

            // Owner contact per property
            owner_contact: data.ownerContact,
            owner_telegram: data.ownerTelegram,

            // Team contacts
            cleaner_name: data.cleanerName,
            cleaner_phone: data.cleanerPhone,
            maintenance_name: data.maintenanceName,
            maintenance_phone: data.maintenancePhone,

            amenities: data.amenities,
            notes: data.notes,
        }),
        toFrontend: (data) => ({
            id: data.id,
            name: data.name || data.property_name || '',
            address: data.address || '',
            type: data.property_type || data.type || 'apartment',
            bedrooms: data.bedrooms || 1,
            bathrooms: data.bathrooms || 1,
            maxGuests: data.max_guests || data.maxGuests || 2,

            // Pricing & Stay Rules
            basePrice: data.base_price || data.basePrice || null,
            weekendPrice: data.weekend_price || data.weekendPrice || null,
            holidayPrice: data.holiday_price || data.holidayPrice || null,
            cleaningFee: data.cleaning_fee || data.cleaningFee || null,
            minStayNights: data.min_stay_nights || data.minStayNights || 1,
            maxStayNights: data.max_stay_nights || data.maxStayNights || 30,
            checkInTime: data.check_in_time || data.checkInTime || '15:00',
            checkOutTime: data.check_out_time || data.checkOutTime || '11:00',

            // Calendar & Automation
            calendarUrl: data.calendar_url || data.calendarUrl || '',
            timezone: data.timezone || 'UTC',
            calendarSyncEnabled: data.calendar_sync_enabled !== undefined ? data.calendar_sync_enabled : (data.calendarSyncEnabled !== false),
            autoApproveBookings: data.auto_approve_bookings || data.autoApproveBookings || false,
            requireScreening: data.require_screening !== undefined ? data.require_screening : (data.requireScreening !== false),

            // Listing platforms
            airbnbUrl: data.airbnb_url || data.airbnbUrl || '',
            bookingComUrl: data.booking_com_url || data.bookingComUrl || '',
            vrboUrl: data.vrbo_url || data.vrboUrl || '',

            // Access
            doorCode: data.door_code || data.doorCode || '',
            accessInstructions: data.access_instructions || data.accessInstructions || '',

            // Owner contact
            ownerContact: data.owner_contact || data.ownerContact || '',
            ownerTelegram: data.owner_telegram || data.ownerTelegram || '',

            // Team contacts
            cleanerName: data.cleaner_name || data.cleanerName || '',
            cleanerPhone: data.cleaner_phone || data.cleanerPhone || '',
            maintenanceName: data.maintenance_name || data.maintenanceName || '',
            maintenancePhone: data.maintenance_phone || data.maintenancePhone || '',

            amenities: data.amenities || [],
            notes: data.notes || '',
            color: data.color || CONFIG.PROPERTY_COLORS[0],
        }),
    },

    booking: {
        toFrontend: (data) => ({
            id: data.id || data.booking_id,
            propertyId: data.property_id || data.propertyId,
            propertyName: data.property_name || data.propertyName || 'Property',
            guestName: data.guest_name || data.guestName || 'Guest',
            checkIn: data.check_in_date || data.checkIn,
            checkOut: data.check_out_date || data.checkOut,
            guests: data.guests || data.num_guests || 1,
            status: data.booking_status || data.status || 'confirmed',
            totalPrice: data.total_price || data.totalPrice || 0,
            color: data.color || CONFIG.PROPERTY_COLORS[0],
        }),
    },

    task: {
        toFrontend: (data) => ({
            id: data.id || data.task_id,
            title: data.title,
            description: data.description || '',
            priority: data.priority || 'medium',
            icon: data.icon || 'circle',
            actionLink: data.action_link || data.actionLink || null,
            actionText: data.action_text || data.actionText || 'View',
            status: data.status || 'pending',
            createdAt: data.created_at || data.createdAt,
        }),
    },

    notification: {
        toFrontend: (data) => ({
            id: data.id || data.notification_id,
            type: data.type || 'info',
            title: data.title,
            message: data.message || '',
            read: data.read || false,
            actionLink: data.action_link || data.actionLink || null,
            createdAt: data.created_at || data.createdAt,
        }),
    },
};

/**
 * Utility functions
 */
const Utils = {
    /**
     * Make API call to Express backend
     */
    async apiCall(endpoint, data = null, method = 'GET') {
        try {
            const options = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };

            // Add body for POST/PUT/PATCH
            if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
                options.body = JSON.stringify(data);
            }

            const url = CONFIG.API.BASE_URL + endpoint;
            console.log(`[API] ${method} ${url}`, data || '');

            const response = await fetch(url, options);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    },

    /**
     * GET request helper
     */
    async get(endpoint) {
        return this.apiCall(endpoint, null, 'GET');
    },

    /**
     * POST request helper
     */
    async post(endpoint, data) {
        return this.apiCall(endpoint, data, 'POST');
    },

    /**
     * PUT request helper
     */
    async put(endpoint, data) {
        return this.apiCall(endpoint, data, 'PUT');
    },

    /**
     * DELETE request helper
     */
    async delete(endpoint) {
        return this.apiCall(endpoint, null, 'DELETE');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${this.getToastIcon(type)}"></i>
            <span>${message}</span>
        `;

        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '16px 24px',
            borderRadius: '8px',
            backgroundColor: this.getToastColor(type),
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '9999',
            animation: 'slideIn 0.3s ease',
        });

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.UI.TOAST_DURATION);
    },

    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle',
        };
        return icons[type] || 'info-circle';
    },

    getToastColor(type) {
        const colors = {
            success: '#42b72a',
            error: '#f44336',
            warning: '#ff9800',
            info: '#1877f2',
        };
        return colors[type] || '#1877f2';
    },

    /**
     * Format date to readable string
     */
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format date range
     */
    formatDateRange(startDate, endDate) {
        return `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
    },

    /**
     * Format relative time (e.g., "2 hours ago")
     */
    formatRelativeTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return this.formatDate(dateString);
    },

    /**
     * Save form draft to localStorage
     */
    saveDraft(formData) {
        localStorage.setItem(CONFIG.STORAGE.FORM_DRAFT, JSON.stringify(formData));
    },

    /**
     * Load form draft from localStorage
     */
    loadDraft() {
        const draft = localStorage.getItem(CONFIG.STORAGE.FORM_DRAFT);
        return draft ? JSON.parse(draft) : null;
    },

    /**
     * Clear form draft
     */
    clearDraft() {
        localStorage.removeItem(CONFIG.STORAGE.FORM_DRAFT);
    },

    /**
     * Generate unique ID
     */
    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
};

// Add CSS animations for toasts
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Log version on load
console.log(`Control Panel V2 loaded - Version ${CONFIG.VERSION}`);
