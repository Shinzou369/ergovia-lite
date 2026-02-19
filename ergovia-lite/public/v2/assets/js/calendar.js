/**
 * Calendar JavaScript - V2 Premium Dashboard
 * Gantt-style booking bars with color-coded properties
 */

let currentDate = new Date();
let allBookings = [];
let allProperties = [];
let selectedPropertyId = 'all';

// Initialize calendar
document.addEventListener('DOMContentLoaded', async () => {
    await loadCalendarData();
    renderCalendar();
    renderUpcomingBookings();
    renderPropertyLegend();
});

/**
 * Load bookings and properties from backend
 */
async function loadCalendarData() {
    try {
        const [propsResponse, bookingsResponse] = await Promise.all([
            Utils.get(CONFIG.API.GET_PROPERTIES),
            Utils.get(CONFIG.API.GET_BOOKINGS),
        ]);

        if (propsResponse.success) {
            allProperties = propsResponse.properties || [];
        }
        if (bookingsResponse.success) {
            allBookings = bookingsResponse.bookings || [];
        }

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
    allProperties.forEach((property, idx) => {
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
    if (select) selectedPropertyId = select.value;
    renderCalendar();
    renderUpcomingBookings();
}

function previousMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
    renderUpcomingBookings();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
    renderUpcomingBookings();
}

/**
 * Get property color by index or settings
 */
function getPropertyColor(propertyId) {
    const property = allProperties.find(p => p.id === propertyId);
    if (property && property.settings && property.settings.color) {
        return property.settings.color;
    }
    if (property && property.color && property.color !== '#1877f2') {
        return property.color;
    }
    const index = allProperties.findIndex(p => p.id === propertyId);
    if (index >= 0) {
        return CONFIG.PROPERTY_COLORS[index % CONFIG.PROPERTY_COLORS.length];
    }
    return CONFIG.PROPERTY_COLORS[0];
}

/**
 * Get bookings for a specific date
 */
function getBookingsForDate(date) {
    return allBookings.filter(booking => {
        if (selectedPropertyId !== 'all' && booking.propertyId !== selectedPropertyId) {
            return false;
        }
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);
        return date >= checkIn && date < checkOut;
    });
}

/**
 * Main render: Gantt-style calendar with booking bars
 */
function renderCalendar() {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const currentMonthEl = document.getElementById('currentMonth');
    if (currentMonthEl) {
        currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build array of all dates in the grid (including prev/next month fillers)
    const gridDates = [];

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, daysInPrevMonth - i);
        gridDates.push({ date: d, day: daysInPrevMonth - i, otherMonth: true });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        d.setHours(0, 0, 0, 0);
        gridDates.push({ date: d, day, otherMonth: false });
    }

    // Next month leading days to fill to complete weeks
    const remaining = (7 - (gridDates.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
        const d = new Date(year, month + 1, day);
        gridDates.push({ date: d, day, otherMonth: true });
    }

    // Split into week rows
    const weeks = [];
    for (let i = 0; i < gridDates.length; i += 7) {
        weeks.push(gridDates.slice(i, i + 7));
    }

    // Day headers
    const headerRow = document.createElement('div');
    headerRow.className = 'cal-header-row';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(name => {
        const h = document.createElement('div');
        h.className = 'cal-header-cell';
        h.textContent = name;
        headerRow.appendChild(h);
    });
    grid.appendChild(headerRow);

    // Get bookings for this month's visible range
    const visibleBookings = getVisibleBookings(gridDates[0].date, gridDates[gridDates.length - 1].date);

    // Render each week
    weeks.forEach((week, weekIdx) => {
        const weekContainer = document.createElement('div');
        weekContainer.className = 'cal-week-row';

        // Day number cells
        const dayCellsRow = document.createElement('div');
        dayCellsRow.className = 'cal-day-cells';

        week.forEach((dayInfo, colIdx) => {
            const cell = document.createElement('div');
            cell.className = 'cal-day-cell';

            if (dayInfo.otherMonth) cell.classList.add('other-month');

            const isPast = dayInfo.date < today && !dayInfo.otherMonth;
            if (isPast) cell.classList.add('past');

            if (!dayInfo.otherMonth && dayInfo.date.getTime() === today.getTime()) {
                cell.classList.add('today');
            }

            // Weekend subtle highlight
            if (colIdx === 0 || colIdx === 6) {
                cell.classList.add('weekend');
            }

            const dayNum = document.createElement('span');
            dayNum.className = 'cal-day-num';
            dayNum.textContent = dayInfo.day;
            cell.appendChild(dayNum);

            // Click handler for day
            if (!dayInfo.otherMonth) {
                cell.addEventListener('click', () => {
                    const bookings = getBookingsForDate(dayInfo.date);
                    if (bookings.length > 0) {
                        showDayBookings(dayInfo.date, bookings);
                    }
                });
            }

            dayCellsRow.appendChild(cell);
        });

        weekContainer.appendChild(dayCellsRow);

        // Booking bars area
        const barsContainer = document.createElement('div');
        barsContainer.className = 'cal-bars-area';

        const weekStart = week[0].date;
        const weekEnd = new Date(week[6].date);
        weekEnd.setDate(weekEnd.getDate() + 1); // exclusive end

        // Get bookings that overlap this week
        const weekBookings = getBookingsForWeek(visibleBookings, weekStart, weekEnd);

        // Layout bookings to avoid overlaps (assign lanes)
        const lanes = assignLanes(weekBookings, weekStart, weekEnd);

        lanes.forEach((booking, laneIdx) => {
            if (!booking) return;

            const checkIn = new Date(booking.checkIn || booking.checkInDate);
            const checkOut = new Date(booking.checkOut || booking.checkOutDate);
            checkIn.setHours(0, 0, 0, 0);
            checkOut.setHours(0, 0, 0, 0);

            // Calculate start and end columns (0-6)
            const barStart = Math.max(0, daysBetween(weekStart, checkIn));
            const barEnd = Math.min(7, daysBetween(weekStart, checkOut));

            if (barEnd <= barStart) return;

            const bar = document.createElement('div');
            bar.className = 'cal-booking-bar';

            const color = getPropertyColor(booking.propertyId);
            bar.style.left = `${(barStart / 7) * 100}%`;
            bar.style.width = `${((barEnd - barStart) / 7) * 100}%`;
            bar.style.top = `${laneIdx * 26}px`;
            bar.style.backgroundColor = color;

            // Rounded corners based on whether booking starts/ends in this week
            const startsThisWeek = checkIn >= weekStart;
            const endsThisWeek = checkOut <= weekEnd;
            bar.style.borderRadius = `${startsThisWeek ? '4px' : '0'} ${endsThisWeek ? '4px' : '0'} ${endsThisWeek ? '4px' : '0'} ${startsThisWeek ? '4px' : '0'}`;

            // Status indicator
            const statusClass = booking.status === 'pending' ? ' pending' : '';
            if (statusClass) bar.classList.add('pending');

            // Bar content
            const label = document.createElement('span');
            label.className = 'cal-bar-label';
            label.textContent = booking.guestName;
            bar.appendChild(label);

            // Tooltip
            const nights = daysBetween(checkIn, checkOut);
            bar.title = `${booking.guestName}\n${booking.propertyName}\n${formatShortDate(checkIn)} - ${formatShortDate(checkOut)} (${nights} night${nights !== 1 ? 's' : ''})\nStatus: ${booking.status}\nPlatform: ${booking.platform || 'N/A'}`;

            // Click to show details
            bar.addEventListener('click', (e) => {
                e.stopPropagation();
                showBookingDetail(booking);
            });

            barsContainer.appendChild(bar);
        });

        // Set bars area height based on number of lanes
        const maxLane = lanes.length;
        barsContainer.style.height = `${Math.max(0, maxLane * 26)}px`;

        weekContainer.appendChild(barsContainer);
        grid.appendChild(weekContainer);
    });
}

/**
 * Get all bookings visible in the date range
 */
function getVisibleBookings(startDate, endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    return allBookings.filter(booking => {
        if (selectedPropertyId !== 'all' && booking.propertyId !== selectedPropertyId) {
            return false;
        }
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);
        return checkOut > startDate && checkIn < end;
    });
}

/**
 * Get bookings that overlap a specific week
 */
function getBookingsForWeek(allVisible, weekStart, weekEnd) {
    return allVisible.filter(booking => {
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);
        return checkOut > weekStart && checkIn < weekEnd;
    });
}

/**
 * Assign booking bars to non-overlapping lanes
 */
function assignLanes(bookings, weekStart, weekEnd) {
    if (bookings.length === 0) return [];

    // Sort by start date, then by duration (longer first)
    const sorted = [...bookings].sort((a, b) => {
        const aStart = new Date(a.checkIn || a.checkInDate);
        const bStart = new Date(b.checkIn || b.checkInDate);
        if (aStart.getTime() !== bStart.getTime()) return aStart - bStart;
        const aEnd = new Date(a.checkOut || a.checkOutDate);
        const bEnd = new Date(b.checkOut || b.checkOutDate);
        return (bEnd - bStart) - (aEnd - aStart); // longer bookings first
    });

    // lanes[i] = end date of last booking in that lane
    const laneEnds = [];
    const result = [];

    sorted.forEach(booking => {
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        checkIn.setHours(0, 0, 0, 0);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkOut.setHours(0, 0, 0, 0);

        // Find first lane where this booking fits (doesn't overlap)
        let assignedLane = -1;
        for (let i = 0; i < laneEnds.length; i++) {
            if (checkIn >= laneEnds[i]) {
                assignedLane = i;
                break;
            }
        }

        if (assignedLane === -1) {
            assignedLane = laneEnds.length;
            laneEnds.push(null);
        }

        laneEnds[assignedLane] = checkOut;

        // Ensure result array is large enough
        while (result.length <= assignedLane) result.push(null);
        result[assignedLane] = booking;
    });

    // Actually we need one entry per lane per booking, not per lane
    // Re-do: return flat array where index = lane
    const lanes = [];
    const laneEndDates = [];

    sorted.forEach(booking => {
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        checkIn.setHours(0, 0, 0, 0);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkOut.setHours(0, 0, 0, 0);

        let lane = -1;
        for (let i = 0; i < laneEndDates.length; i++) {
            if (checkIn >= laneEndDates[i]) {
                lane = i;
                break;
            }
        }

        if (lane === -1) {
            lane = laneEndDates.length;
            laneEndDates.push(null);
        }

        laneEndDates[lane] = checkOut;
        lanes.push({ ...booking, _lane: lane });
    });

    // Group by lane and return
    const maxLane = Math.max(...lanes.map(l => l._lane), -1) + 1;
    const grouped = [];
    lanes.forEach(b => {
        grouped.push(b);
    });

    return grouped;
}

/**
 * Render with proper lane assignment
 * Override the previous assignLanes - return array of {booking, lane}
 */
function renderBookingBars(barsContainer, weekBookings, weekStart, weekEnd) {
    if (weekBookings.length === 0) return 0;

    const sorted = [...weekBookings].sort((a, b) => {
        const aStart = new Date(a.checkIn || a.checkInDate);
        const bStart = new Date(b.checkIn || b.checkInDate);
        if (aStart.getTime() !== bStart.getTime()) return aStart - bStart;
        const aEnd = new Date(a.checkOut || a.checkOutDate);
        const bEnd = new Date(b.checkOut || b.checkOutDate);
        return (bEnd - bStart) - (aEnd - aStart);
    });

    const laneEndDates = [];

    sorted.forEach(booking => {
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        checkIn.setHours(0, 0, 0, 0);
        checkOut.setHours(0, 0, 0, 0);

        let lane = -1;
        for (let i = 0; i < laneEndDates.length; i++) {
            if (checkIn >= laneEndDates[i]) {
                lane = i;
                break;
            }
        }
        if (lane === -1) {
            lane = laneEndDates.length;
            laneEndDates.push(null);
        }
        laneEndDates[lane] = checkOut;

        const barStart = Math.max(0, daysBetween(weekStart, checkIn));
        const barEnd = Math.min(7, daysBetween(weekStart, checkOut));
        if (barEnd <= barStart) return;

        const bar = document.createElement('div');
        bar.className = 'cal-booking-bar';

        const color = getPropertyColor(booking.propertyId);
        bar.style.left = `calc(${(barStart / 7) * 100}% + 2px)`;
        bar.style.width = `calc(${((barEnd - barStart) / 7) * 100}% - 4px)`;
        bar.style.top = `${lane * 26}px`;
        bar.style.backgroundColor = color;

        if (booking.status === 'pending') bar.classList.add('pending');

        const startsThisWeek = checkIn >= weekStart;
        const endsThisWeek = checkOut <= weekEnd;
        bar.style.borderRadius =
            `${startsThisWeek ? '4px' : '0'} ${endsThisWeek ? '4px' : '0'} ${endsThisWeek ? '4px' : '0'} ${startsThisWeek ? '4px' : '0'}`;

        const label = document.createElement('span');
        label.className = 'cal-bar-label';
        label.textContent = booking.guestName;
        bar.appendChild(label);

        const nights = daysBetween(checkIn, checkOut);
        bar.title = `${booking.guestName} - ${booking.propertyName}\n${formatShortDate(checkIn)} → ${formatShortDate(checkOut)} (${nights}n)\n$${booking.totalPrice || 0} | ${booking.platform || 'direct'} | ${booking.status}`;

        bar.addEventListener('click', (e) => {
            e.stopPropagation();
            showBookingDetail(booking);
        });

        barsContainer.appendChild(bar);
    });

    return laneEndDates.length;
}

/**
 * Rewritten renderCalendar using the cleaner renderBookingBars
 */
// Override the main render
(function() {
    const originalRender = renderCalendar;
    renderCalendar = function() {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const currentMonthEl = document.getElementById('currentMonth');
        if (currentMonthEl) {
            currentMonthEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
        }

        const grid = document.getElementById('calendarGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Build grid dates
        const gridDates = [];
        for (let i = firstDay - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, daysInPrevMonth - i);
            d.setHours(0, 0, 0, 0);
            gridDates.push({ date: d, day: daysInPrevMonth - i, otherMonth: true });
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            d.setHours(0, 0, 0, 0);
            gridDates.push({ date: d, day, otherMonth: false });
        }
        const remaining = (7 - (gridDates.length % 7)) % 7;
        for (let day = 1; day <= remaining; day++) {
            const d = new Date(year, month + 1, day);
            d.setHours(0, 0, 0, 0);
            gridDates.push({ date: d, day, otherMonth: true });
        }

        const weeks = [];
        for (let i = 0; i < gridDates.length; i += 7) {
            weeks.push(gridDates.slice(i, i + 7));
        }

        // Header
        const headerRow = document.createElement('div');
        headerRow.className = 'cal-header-row';
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(name => {
            const h = document.createElement('div');
            h.className = 'cal-header-cell';
            h.textContent = name;
            headerRow.appendChild(h);
        });
        grid.appendChild(headerRow);

        // Visible bookings
        const visibleBookings = getVisibleBookings(gridDates[0].date, gridDates[gridDates.length - 1].date);

        // Weeks
        weeks.forEach(week => {
            const weekContainer = document.createElement('div');
            weekContainer.className = 'cal-week-row';

            const dayCellsRow = document.createElement('div');
            dayCellsRow.className = 'cal-day-cells';

            week.forEach((dayInfo, colIdx) => {
                const cell = document.createElement('div');
                cell.className = 'cal-day-cell';

                if (dayInfo.otherMonth) cell.classList.add('other-month');
                if (dayInfo.date < today && !dayInfo.otherMonth) cell.classList.add('past');
                if (!dayInfo.otherMonth && dayInfo.date.getTime() === today.getTime()) cell.classList.add('today');
                if (colIdx === 0 || colIdx === 6) cell.classList.add('weekend');

                const dayNum = document.createElement('span');
                dayNum.className = 'cal-day-num';
                dayNum.textContent = dayInfo.day;

                if (!dayInfo.otherMonth && dayInfo.date.getTime() === today.getTime()) {
                    const todayBadge = document.createElement('span');
                    todayBadge.className = 'cal-today-badge';
                    todayBadge.textContent = 'Today';
                    cell.appendChild(todayBadge);
                }

                cell.appendChild(dayNum);

                if (!dayInfo.otherMonth) {
                    cell.addEventListener('click', () => {
                        const bookings = getBookingsForDate(dayInfo.date);
                        if (bookings.length > 0) {
                            showDayBookings(dayInfo.date, bookings);
                        }
                    });
                }

                dayCellsRow.appendChild(cell);
            });

            weekContainer.appendChild(dayCellsRow);

            // Booking bars
            const barsContainer = document.createElement('div');
            barsContainer.className = 'cal-bars-area';

            const weekStart = week[0].date;
            const weekEnd = new Date(week[6].date);
            weekEnd.setDate(weekEnd.getDate() + 1);

            const weekBookings = getBookingsForWeek(visibleBookings, weekStart, weekEnd);
            const numLanes = renderBookingBars(barsContainer, weekBookings, weekStart, weekEnd);

            barsContainer.style.minHeight = numLanes > 0 ? `${numLanes * 26 + 4}px` : '0';

            weekContainer.appendChild(barsContainer);
            grid.appendChild(weekContainer);
        });
    };
})();

/**
 * Days between two dates
 */
function daysBetween(a, b) {
    const msPerDay = 86400000;
    return Math.round((b - a) / msPerDay);
}

/**
 * Format date short
 */
function formatShortDate(date) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Show booking detail in modal
 */
function showBookingDetail(booking) {
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');
    if (!modal || !modalTitle || !modalText) return;

    const color = getPropertyColor(booking.propertyId);
    const checkIn = booking.checkIn || booking.checkInDate;
    const checkOut = booking.checkOut || booking.checkOutDate;
    const nights = daysBetween(new Date(checkIn), new Date(checkOut));

    modalTitle.innerHTML = `<i class="fas fa-calendar-check" style="color:${color}"></i> Booking Details`;

    const statusBadge = booking.status === 'confirmed'
        ? '<span style="background:#42b72a;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Confirmed</span>'
        : '<span style="background:#ff9800;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Pending</span>';

    modalText.innerHTML = `
        <div style="border-left: 4px solid ${color}; padding: 16px; background: #f8f9fa; border-radius: 8px; margin-bottom: 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h3 style="margin:0;font-size:20px;">${escapeHtml(booking.guestName)}</h3>
                ${statusBadge}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Property</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-home" style="color:${color};margin-right:4px;"></i>${escapeHtml(booking.propertyName)}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Duration</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-moon" style="color:#9c27b0;margin-right:4px;"></i>${nights} night${nights !== 1 ? 's' : ''}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Check-in</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-sign-in-alt" style="color:#42b72a;margin-right:4px;"></i>${Utils.formatDate(checkIn)}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Check-out</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-sign-out-alt" style="color:#f44336;margin-right:4px;"></i>${Utils.formatDate(checkOut)}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Guests</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-users" style="color:#1877f2;margin-right:4px;"></i>${booking.guests || 1}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-dollar-sign" style="color:#42b72a;margin-right:4px;"></i>$${(booking.totalPrice || 0).toLocaleString()}</div>
                </div>
                <div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Platform</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-tag" style="color:#ff9800;margin-right:4px;"></i>${booking.platform || 'Direct'}</div>
                </div>
                ${booking.guestPhone ? `<div>
                    <div style="color:#65676b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Phone</div>
                    <div style="font-weight:600;margin-top:2px;"><i class="fas fa-phone" style="color:#00bcd4;margin-right:4px;"></i>${escapeHtml(booking.guestPhone)}</div>
                </div>` : ''}
            </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
            ${booking.status !== 'cancelled' ? `
                <button onclick="cancelBooking('${booking.id}')" style="padding:8px 18px;border:1px solid #f44336;color:#f44336;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='#fff'">
                    <i class="fas fa-times"></i> Cancel Booking
                </button>
            ` : ''}
            <button onclick="editBookingStatus('${booking.id}', '${booking.status === 'confirmed' ? 'pending' : 'confirmed'}')" style="padding:8px 18px;border:none;color:#fff;background:${booking.status === 'confirmed' ? '#ff9800' : '#42b72a'};border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s;">
                <i class="fas fa-${booking.status === 'confirmed' ? 'pause' : 'check'}"></i> ${booking.status === 'confirmed' ? 'Mark Pending' : 'Confirm'}
            </button>
        </div>
    `;

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '24px';
}

/**
 * Show bookings for a specific day
 */
function showDayBookings(date, bookings) {
    if (bookings.length === 0) return;
    if (bookings.length === 1) {
        showBookingDetail(bookings[0]);
        return;
    }

    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');
    if (!modal || !modalTitle || !modalText) return;

    modalTitle.textContent = `Bookings on ${Utils.formatDate(date)}`;
    modalText.innerHTML = bookings.map(booking => {
        const color = getPropertyColor(booking.propertyId);
        return `
            <div style="padding:12px;margin-bottom:8px;border-left:4px solid ${color};background:#f8f9fa;border-radius:8px;cursor:pointer;transition:transform 0.15s;"
                 onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform=''">
                <strong>${escapeHtml(booking.guestName)}</strong>
                <span style="float:right;font-size:12px;background:${color};color:#fff;padding:1px 8px;border-radius:10px;">${booking.status}</span><br>
                <span style="color:#65676b;font-size:13px;">
                    <i class="fas fa-home"></i> ${escapeHtml(booking.propertyName)} &middot;
                    ${Utils.formatDate(booking.checkIn)} - ${Utils.formatDate(booking.checkOut)} &middot;
                    $${(booking.totalPrice || 0).toLocaleString()}
                </span>
            </div>`;
    }).join('');

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '24px';
}

/**
 * Render upcoming bookings list
 */
function renderUpcomingBookings() {
    const container = document.getElementById('upcomingBookings');
    if (!container) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcoming = allBookings
        .filter(b => {
            if (selectedPropertyId !== 'all' && b.propertyId !== selectedPropertyId) return false;
            const checkIn = new Date(b.checkIn || b.checkInDate);
            checkIn.setHours(0, 0, 0, 0);
            return checkIn >= now;
        })
        .sort((a, b) => new Date(a.checkIn || a.checkInDate) - new Date(b.checkIn || b.checkInDate))
        .slice(0, 6);

    if (upcoming.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:32px;color:var(--text-gray);">
                <i class="fas fa-calendar-times" style="font-size:32px;opacity:0.4;display:block;margin-bottom:8px;"></i>
                No upcoming check-ins
            </div>`;
        return;
    }

    container.innerHTML = upcoming.map(booking => {
        const color = getPropertyColor(booking.propertyId);
        const checkIn = new Date(booking.checkIn || booking.checkInDate);
        const checkOut = new Date(booking.checkOut || booking.checkOutDate);
        const nights = daysBetween(checkIn, checkOut);
        const daysUntil = daysBetween(now, checkIn);

        let urgencyClass = '';
        let urgencyText = '';
        if (daysUntil === 0) { urgencyClass = 'today-checkin'; urgencyText = 'Today'; }
        else if (daysUntil === 1) { urgencyClass = 'tomorrow-checkin'; urgencyText = 'Tomorrow'; }
        else if (daysUntil <= 3) { urgencyClass = 'soon-checkin'; urgencyText = `In ${daysUntil} days`; }
        else { urgencyText = `In ${daysUntil} days`; }

        return `
            <div class="booking-item ${urgencyClass}" style="border-left-color:${color};cursor:pointer;" onclick="showBookingDetail(${JSON.stringify(booking).replace(/"/g, '&quot;')})">
                <div class="booking-info">
                    <h4>${escapeHtml(booking.guestName)}</h4>
                    <p><i class="fas fa-home" style="color:${color};"></i> ${escapeHtml(booking.propertyName)} &middot; ${nights}n &middot; ${booking.guests || 1} guest${(booking.guests || 1) > 1 ? 's' : ''}</p>
                </div>
                <div class="booking-date">
                    <strong style="color:${daysUntil <= 1 ? 'var(--danger-red)' : 'var(--text-dark)'};">${urgencyText}</strong><br>
                    <span>${formatShortDate(checkIn)} → ${formatShortDate(checkOut)}</span>
                </div>
            </div>`;
    }).join('');
}

/**
 * Render property color legend
 */
function renderPropertyLegend() {
    const legendContainer = document.getElementById('propertyLegend');
    if (!legendContainer) return;

    if (allProperties.length === 0) {
        legendContainer.innerHTML = '<span style="color:var(--text-gray);font-size:13px;">No properties loaded</span>';
        return;
    }

    legendContainer.innerHTML = allProperties.map((prop, idx) => {
        const color = getPropertyColor(prop.id);
        return `<span class="legend-item"><span class="legend-dot" style="background:${color};"></span>${escapeHtml(prop.name)}</span>`;
    }).join('');
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
    if (modal) modal.style.display = 'none';
}
