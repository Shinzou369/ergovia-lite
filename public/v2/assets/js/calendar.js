/**
 * Calendar JavaScript - V2 Premium Dashboard
 * Multi-property calendar with color-coded bookings (Notion-style)
 */

let currentDate = new Date();
let allBookings = [];
let allProperties = [];
let selectedPropertyId = 'all';

// Initialize calendar
document.addEventListener('DOMContentLoaded', async () => {
    await loadCalendarData();
    renderCalendar();
});

/**
 * Load bookings and properties from backend
 */
async function loadCalendarData() {
    try {
        // Load properties first
        const propsResponse = await Utils.get(CONFIG.API.GET_PROPERTIES);
        if (propsResponse.success) {
            allProperties = propsResponse.properties || [];
        }

        // Load bookings
        const bookingsResponse = await Utils.get(CONFIG.API.GET_BOOKINGS);
        if (bookingsResponse.success) {
            allBookings = bookingsResponse.bookings || [];
        }

        // Populate property filter
        populatePropertyFilter();

        console.log('[Calendar] Loaded', allProperties.length, 'properties and', allBookings.length, 'bookings');

    } catch (error) {
        console.error('[Calendar] Failed to load data:', error);
        Utils.showToast('Failed to load calendar', 'error');
    }
}

/**
 * Populate property filter dropdown
 */
function populatePropertyFilter() {
    const select = document.getElementById('propertyFilter');
    if (!select) return;

    select.innerHTML = '<option value="all">All Properties</option>';

    allProperties.forEach((property) => {
        const option = document.createElement('option');
        option.value = property.id;
        option.textContent = property.name;
        select.appendChild(option);
    });
}

/**
 * Filter calendar by property
 */
function filterCalendar() {
    const select = document.getElementById('propertyFilter');
    if (select) {
        selectedPropertyId = select.value;
    }
    renderCalendar();
}

/**
 * Previous month
 */
function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

/**
 * Next month
 */
function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}

/**
 * Render calendar grid
 */
function renderCalendar() {
    // Update header
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const currentMonthEl = document.getElementById('currentMonth');
    if (currentMonthEl) {
        currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }

    // Generate calendar grid
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    grid.innerHTML = '';

    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.textContent = day;
        header.style.cssText = 'text-align: center; font-weight: 600; color: var(--text-gray); padding: 8px;';
        grid.appendChild(header);
    });

    // Get first day of month and number of days
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Add previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const dayEl = createDayElement(day, true);
        grid.appendChild(dayEl);
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        const dayEl = createDayElement(day, false);

        // Check if it's today
        if (date.getTime() === today.getTime()) {
            dayEl.classList.add('today');
            dayEl.style.border = '2px solid var(--primary-blue)';
        }

        // Get bookings for this day
        const bookingsForDay = getBookingsForDate(date);

        if (bookingsForDay.length > 0) {
            dayEl.classList.add('has-booking');
            dayEl.style.backgroundColor = 'var(--primary-blue-light)';

            // Add colored dots for each property (max 3)
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'calendar-day-dots';
            dotsContainer.style.cssText = 'display: flex; gap: 2px; justify-content: center; margin-top: 4px;';

            bookingsForDay.slice(0, 3).forEach(booking => {
                const dot = document.createElement('div');
                dot.className = 'booking-dot';
                dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background-color: ${booking.color || getPropertyColor(booking.propertyId)};`;
                dot.title = `${booking.guestName} - ${booking.propertyName}`;
                dotsContainer.appendChild(dot);
            });

            if (bookingsForDay.length > 3) {
                const more = document.createElement('span');
                more.style.cssText = 'font-size: 10px; color: var(--text-gray);';
                more.textContent = `+${bookingsForDay.length - 3}`;
                dotsContainer.appendChild(more);
            }

            dayEl.appendChild(dotsContainer);
        }

        // Add click handler
        dayEl.addEventListener('click', () => showDayBookings(date, bookingsForDay));
        dayEl.style.cursor = 'pointer';

        grid.appendChild(dayEl);
    }

    // Add next month's leading days
    const totalCells = grid.children.length - 7; // Subtract day headers
    const remainingCells = 42 - totalCells; // 6 weeks * 7 days

    for (let day = 1; day <= remainingCells && day <= 14; day++) {
        const dayEl = createDayElement(day, true);
        grid.appendChild(dayEl);
    }
}

/**
 * Create a calendar day element
 */
function createDayElement(dayNumber, isOtherMonth) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.style.cssText = 'padding: 8px; min-height: 60px; border: 1px solid var(--border-gray); border-radius: 4px; transition: background-color 0.2s;';

    if (isOtherMonth) {
        dayEl.classList.add('other-month');
        dayEl.style.opacity = '0.4';
    }

    const dayNumberEl = document.createElement('div');
    dayNumberEl.className = 'calendar-day-number';
    dayNumberEl.textContent = dayNumber;
    dayNumberEl.style.cssText = 'font-weight: 500; font-size: 14px;';

    dayEl.appendChild(dayNumberEl);

    // Hover effect
    dayEl.addEventListener('mouseenter', () => {
        if (!isOtherMonth) {
            dayEl.style.backgroundColor = 'var(--bg-gray)';
        }
    });
    dayEl.addEventListener('mouseleave', () => {
        if (!isOtherMonth && !dayEl.classList.contains('has-booking')) {
            dayEl.style.backgroundColor = '';
        } else if (dayEl.classList.contains('has-booking')) {
            dayEl.style.backgroundColor = 'var(--primary-blue-light)';
        }
    });

    return dayEl;
}

/**
 * Get bookings for a specific date
 */
function getBookingsForDate(date) {
    const dateStr = date.toISOString().split('T')[0];

    return allBookings.filter(booking => {
        // Filter by selected property if not "all"
        if (selectedPropertyId !== 'all' && booking.propertyId !== selectedPropertyId) {
            return false;
        }

        // Check if date is within booking range
        // Use checkIn/checkOut (our format) or checkInDate/checkOutDate (legacy format)
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);

        return date >= checkIn && date < checkOut;
    });
}

/**
 * Get property color
 */
function getPropertyColor(propertyId) {
    const property = allProperties.find(p => p.id === propertyId);
    if (property && property.color) {
        return property.color;
    }
    const index = allProperties.findIndex(p => p.id === propertyId);
    return CONFIG.PROPERTY_COLORS[index % CONFIG.PROPERTY_COLORS.length] || '#1877f2';
}

/**
 * Show bookings for a specific day (modal or popup)
 */
function showDayBookings(date, bookings) {
    if (bookings.length === 0) {
        Utils.showToast('No bookings on this day', 'info');
        return;
    }

    // Create modal HTML
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');

    if (!modal || !modalTitle || !modalText) {
        // Fallback to alert
        const bookingsList = bookings.map(b => `${b.guestName} @ ${b.propertyName}`).join('\n');
        alert(`Bookings on ${Utils.formatDate(date)}:\n\n${bookingsList}`);
        return;
    }

    modalTitle.textContent = `Bookings on ${Utils.formatDate(date)}`;

    const bookingsList = bookings.map(booking => {
        const propertyColor = booking.color || getPropertyColor(booking.propertyId);
        const checkIn = booking.checkIn || booking.checkInDate;
        const checkOut = booking.checkOut || booking.checkOutDate;

        return `
            <div style="padding: 12px; margin-bottom: 8px; border-left: 4px solid ${propertyColor}; background-color: #f0f2f5; border-radius: 6px;">
                <strong style="font-size: 16px;">${escapeHtml(booking.guestName)}</strong><br>
                <span style="color: #65676b;">
                    <i class="fas fa-home"></i> ${escapeHtml(booking.propertyName)}<br>
                    <i class="fas fa-calendar"></i> ${Utils.formatDate(checkIn)} - ${Utils.formatDate(checkOut)}<br>
                    <i class="fas fa-users"></i> ${booking.guests || 1} guest${(booking.guests || 1) > 1 ? 's' : ''}
                </span>
            </div>
        `;
    }).join('');

    modalText.innerHTML = bookingsList;
    modal.style.display = 'flex';
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
 * Close modal
 */
function closeModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
