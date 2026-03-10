/**
 * Booking JavaScript - V2 Premium Dashboard
 * 2-month calendar modal for manual booking creation
 */

let bookingCalDate = new Date();
let bookingCheckIn = null;
let bookingCheckOut = null;
let bookingSelectedProperty = null;
let bookingProperties = [];

/**
 * Open the new booking modal
 */
function openNewBookingModal() {
    // Reset state
    bookingCheckIn = null;
    bookingCheckOut = null;
    bookingSelectedProperty = null;
    bookingCalDate = new Date();
    bookingCalDate.setDate(1); // Start of current month

    // Reset form fields
    const fields = ['bookingGuestName', 'bookingGuestPhone', 'bookingGuestEmail', 'bookingNotes'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const guestCount = document.getElementById('bookingGuestCount');
    if (guestCount) guestCount.value = '1';
    const platform = document.getElementById('bookingPlatform');
    if (platform) platform.value = 'direct';
    const totalAmount = document.getElementById('bookingTotalAmount');
    if (totalAmount) totalAmount.value = '';

    // Show step 1, hide step 2
    document.getElementById('bookingStep1').style.display = '';
    document.getElementById('bookingStep2').style.display = 'none';

    // Update next button state
    updateBookingNextButton();

    // Load properties for step 2
    loadBookingProperties();

    // Render calendar
    renderBookingCalendar();

    // Show modal
    const modal = document.getElementById('bookingModal');
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '24px';
}

/**
 * Close the booking modal
 */
function closeBookingModal() {
    document.getElementById('bookingModal').style.display = 'none';
}

// Close on outside click
window.addEventListener('click', (e) => {
    const modal = document.getElementById('bookingModal');
    if (e.target === modal) {
        closeBookingModal();
    }
});

/**
 * Load properties for selection
 */
async function loadBookingProperties() {
    try {
        const response = await Utils.get(CONFIG.API.GET_PROPERTIES);
        if (response.success) {
            bookingProperties = response.properties || [];
        }
    } catch (error) {
        console.error('[Booking] Failed to load properties:', error);
    }
}

/**
 * Navigate months
 */
function bookingPrevMonth() {
    bookingCalDate.setMonth(bookingCalDate.getMonth() - 1);
    renderBookingCalendar();
}

function bookingNextMonth() {
    bookingCalDate.setMonth(bookingCalDate.getMonth() + 1);
    renderBookingCalendar();
}

/**
 * Render the 2-month calendar
 */
function renderBookingCalendar() {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const year1 = bookingCalDate.getFullYear();
    const month1 = bookingCalDate.getMonth();

    // Second month
    const month2Date = new Date(year1, month1 + 1, 1);
    const year2 = month2Date.getFullYear();
    const month2 = month2Date.getMonth();

    // Update month labels
    const monthLabels = document.getElementById('bookingCalendarMonths');
    monthLabels.innerHTML = `
        <span>${monthNames[month1]} ${year1}</span>
        <span style="color: var(--text-gray); font-weight: 400; padding: 0 8px;">|</span>
        <span>${monthNames[month2]} ${year2}</span>
    `;

    // Render both months
    renderBookingMonth(document.getElementById('bookingCalMonth1'), year1, month1);
    renderBookingMonth(document.getElementById('bookingCalMonth2'), year2, month2);
}

/**
 * Render a single month grid
 */
function renderBookingMonth(container, year, month) {
    container.innerHTML = '';

    const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    dayHeaders.forEach(day => {
        const header = document.createElement('div');
        header.className = 'booking-cal-header';
        header.textContent = day;
        container.appendChild(header);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Previous month filler days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayEl = document.createElement('div');
        dayEl.className = 'booking-cal-day other-month';
        dayEl.textContent = prevMonthDays - i;
        container.appendChild(dayEl);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        const dayEl = document.createElement('div');
        dayEl.className = 'booking-cal-day';
        dayEl.textContent = day;

        // Past dates are disabled (can't book in the past)
        if (date < today) {
            dayEl.classList.add('disabled');
        } else {
            // Today marker
            if (date.getTime() === today.getTime()) {
                dayEl.classList.add('today');
            }

            // Check existing bookings for visual hint
            const existingBookings = getBookingsForDate(date);
            if (existingBookings && existingBookings.length > 0) {
                dayEl.classList.add('has-existing-booking');
                dayEl.title = existingBookings.map(b => `${b.guestName} @ ${b.propertyName}`).join(', ');
            }

            // Selection states
            if (bookingCheckIn && date.getTime() === bookingCheckIn.getTime()) {
                dayEl.classList.add('selected-start');
            }
            if (bookingCheckOut && date.getTime() === bookingCheckOut.getTime()) {
                dayEl.classList.add('selected-end');
            }
            if (bookingCheckIn && bookingCheckOut &&
                date > bookingCheckIn && date < bookingCheckOut) {
                dayEl.classList.add('in-range');
            }

            // Click handler
            dayEl.addEventListener('click', () => handleBookingDateClick(date));
        }

        container.appendChild(dayEl);
    }

    // Next month filler days
    const totalCells = container.children.length - 7; // subtract headers
    const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (let i = 1; i <= remainingCells; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'booking-cal-day other-month';
        dayEl.textContent = i;
        container.appendChild(dayEl);
    }
}

/**
 * Handle date click in booking calendar
 */
function handleBookingDateClick(date) {
    if (!bookingCheckIn || (bookingCheckIn && bookingCheckOut)) {
        // First click or resetting: set check-in
        bookingCheckIn = date;
        bookingCheckOut = null;
    } else {
        // Second click: set check-out
        if (date <= bookingCheckIn) {
            // Clicked same day or earlier - reset to new check-in
            bookingCheckIn = date;
            bookingCheckOut = null;
        } else {
            bookingCheckOut = date;
        }
    }

    // Update UI
    renderBookingCalendar();
    updateBookingDateSummary();
    updateBookingNextButton();
}

/**
 * Update the date summary text
 */
function updateBookingDateSummary() {
    const summary = document.getElementById('bookingDateSummary');

    if (!bookingCheckIn) {
        summary.innerHTML = 'Click a date to select check-in';
        summary.style.color = 'var(--text-gray)';
        return;
    }

    if (!bookingCheckOut) {
        summary.innerHTML = `<strong>Check-in:</strong> ${formatBookingDate(bookingCheckIn)} &mdash; Now click check-out date`;
        summary.style.color = 'var(--primary-blue)';
        return;
    }

    const nights = Math.round((bookingCheckOut - bookingCheckIn) / (1000 * 60 * 60 * 24));
    summary.innerHTML = `
        <strong>Check-in:</strong> ${formatBookingDate(bookingCheckIn)} &rarr;
        <strong>Check-out:</strong> ${formatBookingDate(bookingCheckOut)}
        &nbsp;|&nbsp; <strong>${nights} night${nights > 1 ? 's' : ''}</strong>
    `;
    summary.style.color = 'var(--success-green)';
}

/**
 * Update the Next button enabled state
 */
function updateBookingNextButton() {
    const btn = document.getElementById('bookingStep1Next');
    btn.disabled = !(bookingCheckIn && bookingCheckOut);
}

/**
 * Format date for display
 */
function formatBookingDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Go to step 2: property & guest details
 */
function goToBookingStep2() {
    if (!bookingCheckIn || !bookingCheckOut) return;

    // Populate property list
    renderBookingPropertyList();

    // Update review summary
    updateBookingReviewSummary();

    // Show step 2
    document.getElementById('bookingStep1').style.display = 'none';
    document.getElementById('bookingStep2').style.display = '';
}

/**
 * Go back to step 1
 */
function goToBookingStep1() {
    document.getElementById('bookingStep1').style.display = '';
    document.getElementById('bookingStep2').style.display = 'none';
}

/**
 * Render property selection cards
 */
function renderBookingPropertyList() {
    const container = document.getElementById('bookingPropertyList');

    if (bookingProperties.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 24px; color: var(--text-gray);">
                <i class="fas fa-building" style="font-size: 32px; opacity: 0.4; margin-bottom: 8px; display: block;"></i>
                No properties found. Add a property first.
            </div>
        `;
        return;
    }

    container.innerHTML = bookingProperties.map((prop, idx) => {
        const color = prop.color || CONFIG.PROPERTY_COLORS[idx % CONFIG.PROPERTY_COLORS.length];
        const selected = bookingSelectedProperty === prop.id ? 'selected' : '';
        return `
            <div class="booking-property-card ${selected}" onclick="selectBookingProperty('${prop.id}')">
                <div class="property-icon" style="background-color: ${color};">
                    <i class="fas fa-home"></i>
                </div>
                <h4>${escapeHtml(prop.name)}</h4>
                <p>${escapeHtml(prop.address || 'No address')}</p>
                <p style="font-weight: 600; color: var(--text-dark); margin-top: 4px;">
                    $${prop.basePrice || 0}/night
                </p>
            </div>
        `;
    }).join('');
}

/**
 * Select a property for booking
 */
function selectBookingProperty(propertyId) {
    bookingSelectedProperty = propertyId;
    renderBookingPropertyList();
    updateBookingReviewSummary();
}

/**
 * Update the review summary at the bottom of step 2
 */
function updateBookingReviewSummary() {
    const summary = document.getElementById('bookingReviewSummary');
    const nights = Math.round((bookingCheckOut - bookingCheckIn) / (1000 * 60 * 60 * 24));
    const property = bookingProperties.find(p => p.id === bookingSelectedProperty);

    summary.innerHTML = `
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <div>
                <i class="fas fa-calendar" style="color: var(--primary-blue);"></i>
                <strong>${formatBookingDate(bookingCheckIn)}</strong> &rarr;
                <strong>${formatBookingDate(bookingCheckOut)}</strong>
                (${nights} night${nights > 1 ? 's' : ''})
            </div>
            ${property ? `
                <div>
                    <i class="fas fa-home" style="color: var(--primary-blue);"></i>
                    <strong>${escapeHtml(property.name)}</strong>
                </div>
            ` : '<div style="color: var(--warning-orange);"><i class="fas fa-exclamation-triangle"></i> No property selected</div>'}
        </div>
    `;
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
 * Submit the booking
 */
async function submitBooking() {
    // Validate
    const guestName = document.getElementById('bookingGuestName').value.trim();
    if (!guestName) {
        Utils.showToast('Please enter a guest name', 'warning');
        return;
    }
    if (!bookingSelectedProperty) {
        Utils.showToast('Please select a property', 'warning');
        return;
    }

    const submitBtn = document.getElementById('bookingSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    try {
        const bookingData = {
            propertyId: bookingSelectedProperty,
            checkIn: bookingCheckIn.toISOString().split('T')[0],
            checkOut: bookingCheckOut.toISOString().split('T')[0],
            guestName: guestName,
            guestPhone: document.getElementById('bookingGuestPhone').value.trim(),
            guestEmail: document.getElementById('bookingGuestEmail').value.trim(),
            guests: parseInt(document.getElementById('bookingGuestCount').value) || 1,
            platform: document.getElementById('bookingPlatform').value,
            totalAmount: parseFloat(document.getElementById('bookingTotalAmount').value) || 0,
            notes: document.getElementById('bookingNotes').value.trim(),
            status: 'confirmed',
        };

        const response = await Utils.post('/bookings', bookingData);

        if (response.success) {
            Utils.showToast('Booking created successfully!', 'success');
            closeBookingModal();

            // Refresh calendar data
            if (typeof loadCalendarData === 'function') {
                await loadCalendarData();
                renderCalendar();
            }
        } else {
            Utils.showToast(response.error || 'Failed to create booking', 'error');
        }
    } catch (error) {
        console.error('[Booking] Submit error:', error);
        Utils.showToast('Failed to create booking', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Create Booking';
    }
}
