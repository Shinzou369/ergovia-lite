/**
 * V2 Data Service - Premium Dashboard Data Layer
 *
 * PostgreSQL bridge: properties, bookings, owners, tasks → remote PostgreSQL
 * Local storage: credentials, AI config, media, notifications → in-memory
 *
 * This ensures the settings page writes to the SAME database
 * that n8n workflows read from.
 */

const { Pool } = require('pg');

// PostgreSQL connection (same DB as n8n workflows)
const pool = new Pool({
  host: process.env.PG_HOST || '116.203.115.12',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'ergovia_db',
  user: process.env.PG_USER || 'ergovia_user',
  password: process.env.PG_PASSWORD || 'ergovia_secure_2026',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('[v2-data] PostgreSQL connected'))
  .catch(err => console.error('[v2-data] PostgreSQL connection failed:', err.message));

// ============================================
// LOCAL STORAGE (not in PostgreSQL schema)
// ============================================
let localData = {
  credentials: {
    telegramBotToken: '',
    whatsappApiKey: '',
    airbnbCalendarLink: '',
  },
  ai: {
    aiNotes: '',
    pricingRules: '',
  },
  media: {
    propertyPhotosLink: '',
    propertyVideosLink: '',
    documentationLink: '',
  },
  notifications: [],
};

// Initialize some demo notifications
localData.notifications = [
  {
    id: 'notif_1',
    type: 'system',
    title: 'AI Assistant Active',
    message: 'Your AI assistant is connected to PostgreSQL',
    read: false,
    createdAt: new Date().toISOString(),
  },
];

// ============================================
// FIELD MAPPERS (frontend camelCase ↔ DB snake_case)
// ============================================

function propertyFromDb(row) {
  const s = row.settings || {};
  return {
    id: row.property_id,
    name: row.property_name || '',
    address: row.address || '',
    type: s.property_type || 'apartment',
    bedrooms: row.bedrooms || 0,
    bathrooms: row.bathrooms || 0,
    maxGuests: row.max_guests || 0,
    basePrice: parseFloat(row.base_price || 0),
    weekendPrice: parseFloat(row.weekend_price || 0),
    holidayPrice: parseFloat(row.holiday_price || 0),
    cleaningFee: parseFloat(row.cleaning_fee || 0),
    minStayNights: row.min_stay_nights || 1,
    maxStayNights: row.max_stay_nights || 30,
    checkInTime: s.check_in_time || '15:00',
    checkOutTime: s.check_out_time || '11:00',
    calendarUrl: row.calendar_url || '',
    calendarSyncEnabled: row.calendar_sync_enabled || false,
    timezone: row.timezone || 'UTC',
    autoApproveBookings: row.auto_approve_bookings || false,
    requireScreening: row.require_screening !== false,
    ownerContact: row.owner_contact || '',
    ownerTelegram: row.owner_telegram || '',
    ownerName: row.owner_name || '',
    ownerPhone: row.owner_phone || '',
    ownerEmail: row.owner_email || '',
    amenities: s.amenities || [],
    houseRules: s.house_rules || '',
    notes: s.notes || '',
    status: row.property_status || 'active',
    settings: s,
    color: '#1877f2',
  };
}

function bookingFromDb(row) {
  return {
    id: row.booking_id,
    propertyId: row.property_id || '',
    propertyName: row.property_name || 'Unknown Property',
    guestName: row.guest_name || '',
    guestPhone: row.guest_phone || '',
    guestEmail: row.guest_email || '',
    checkIn: row.check_in_date ? new Date(row.check_in_date).toISOString().split('T')[0] : '',
    checkOut: row.check_out_date ? new Date(row.check_out_date).toISOString().split('T')[0] : '',
    guests: row.guests || 0,
    status: row.booking_status || 'pending',
    totalPrice: parseFloat(row.total_amount || 0),
    platform: row.platform || '',
    notes: row.notes || '',
    color: '#1877f2',
  };
}

function taskFromDb(row) {
  return {
    id: row.task_id,
    title: row.task_type || 'Task',
    description: row.description || '',
    priority: row.priority <= 3 ? 'high' : row.priority <= 6 ? 'medium' : 'low',
    icon: row.priority <= 3 ? 'exclamation-circle' : 'tasks',
    actionLink: null,
    actionText: 'View',
    status: row.status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

function ownerFromDb(row) {
  return {
    ownerName: row.owner_name || '',
    ownerEmail: row.owner_email || '',
    ownerPhone: row.owner_phone || '',
    preferredPlatform: row.preferred_platform || 'telegram',
    telegramChatId: row.owner_chat_id || '',
    whatsappNumber: row.owner_phone || '',
  };
}

// ============================================
// V2 DATA SERVICE
// ============================================

const V2DataService = {
  // ============================================
  // DASHBOARD
  // ============================================

  async getDashboardData() {
    const [properties, bookings, tasks] = await Promise.all([
      this.getProperties(),
      this.getBookings(),
      this.getTasks('pending'),
    ]);

    const owner = await this.getOwner();

    const activeBookings = bookings.filter(b => {
      const checkOut = new Date(b.checkOut);
      return checkOut >= new Date();
    });

    return {
      owner,
      stats: {
        totalBookings: activeBookings.length,
        totalProperties: properties.length,
        activeConversations: 0,
        monthlyRevenue: activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      },
      upcomingBookings: activeBookings.slice(0, 5),
      tasks: tasks.slice(0, 5),
      recentNotifications: localData.notifications.slice(0, 10),
    };
  },

  async getStats() {
    const [properties, bookings] = await Promise.all([
      this.getProperties(),
      this.getBookings(),
    ]);

    const activeBookings = bookings.filter(b => {
      const checkOut = new Date(b.checkOut);
      return checkOut >= new Date();
    });

    return {
      totalBookings: activeBookings.length,
      totalProperties: properties.length,
      activeConversations: 0,
      monthlyRevenue: activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    };
  },

  // ============================================
  // OWNER (from PostgreSQL owners table)
  // ============================================

  async getOwner() {
    try {
      const result = await pool.query(
        'SELECT * FROM owners ORDER BY created_at DESC LIMIT 1'
      );
      if (result.rows.length > 0) {
        return ownerFromDb(result.rows[0]);
      }
    } catch (err) {
      console.error('[v2-data] getOwner error:', err.message);
    }
    return {
      ownerName: '', ownerEmail: '', ownerPhone: '',
      preferredPlatform: 'telegram', telegramChatId: '', whatsappNumber: '',
    };
  },

  async saveOwner(data) {
    try {
      const ownerId = 'owner-' + Date.now();
      await pool.query(`
        INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (owner_id) DO UPDATE SET
          owner_name = EXCLUDED.owner_name,
          owner_email = EXCLUDED.owner_email,
          owner_phone = EXCLUDED.owner_phone,
          owner_chat_id = EXCLUDED.owner_chat_id,
          preferred_platform = EXCLUDED.preferred_platform
      `, [
        ownerId,
        data.ownerName || data.name || '',
        data.ownerEmail || data.email || '',
        data.ownerPhone || data.phone || '',
        data.telegramChatId || '',
        data.preferredPlatform || data.platform || 'telegram',
      ]);
      return { success: true, ownerId };
    } catch (err) {
      console.error('[v2-data] saveOwner error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async savePropertyContacts(propertyId, contacts) {
    if (!propertyId) return { success: false, error: 'No propertyId provided' };
    try {
      const result = await pool.query(`
        UPDATE property_configurations SET
          owner_telegram = COALESCE(NULLIF($2, ''), owner_telegram),
          owner_phone = COALESCE(NULLIF($3, ''), owner_phone),
          owner_email = COALESCE(NULLIF($4, ''), owner_email),
          owner_name = COALESCE(NULLIF($5, ''), owner_name),
          preferred_platform = COALESCE(NULLIF($6, ''), preferred_platform),
          updated_at = NOW()
        WHERE property_id = $1
      `, [
        propertyId,
        contacts.owner_telegram || '',
        contacts.owner_phone || '',
        contacts.owner_email || '',
        contacts.owner_name || '',
        contacts.preferred_platform || '',
      ]);
      console.log('[v2-data] savePropertyContacts: updated', result.rowCount, 'rows for', propertyId);
      return { success: true, updated: result.rowCount };
    } catch (err) {
      console.error('[v2-data] savePropertyContacts error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // ============================================
  // SETTINGS (hybrid: owner from PG, rest local)
  // ============================================

  async getSettings(section = null) {
    const owner = await this.getOwner();

    if (section === 'owner') return owner;
    if (section === 'credentials') {
      return {
        telegramBotToken: localData.credentials.telegramBotToken ? '********' : '',
        whatsappApiKey: localData.credentials.whatsappApiKey ? '********' : '',
        airbnbCalendarLink: localData.credentials.airbnbCalendarLink || '',
      };
    }
    if (section === 'team') return [];
    if (section === 'ai') return localData.ai;
    if (section === 'media') return localData.media;

    return {
      owner,
      credentials: {
        telegramBotToken: localData.credentials.telegramBotToken ? '********' : '',
        whatsappApiKey: localData.credentials.whatsappApiKey ? '********' : '',
        airbnbCalendarLink: localData.credentials.airbnbCalendarLink || '',
      },
      team: [],
      ai: localData.ai,
      media: localData.media,
    };
  },

  async saveSettings(section, data) {
    if (section === 'owner') {
      return await this.saveOwner(data);
    }
    if (['credentials', 'ai', 'media'].includes(section)) {
      localData[section] = { ...localData[section], ...data };
      return { success: true, section, data: localData[section] };
    }
    return { success: false, error: `Unknown section: ${section}` };
  },

  // ============================================
  // PROPERTIES (PostgreSQL property_configurations)
  // ============================================

  async getProperties() {
    try {
      const result = await pool.query(
        "SELECT * FROM property_configurations WHERE property_status = 'active' ORDER BY created_at DESC"
      );
      return result.rows.map(propertyFromDb);
    } catch (err) {
      console.error('[v2-data] getProperties error:', err.message);
      return [];
    }
  },

  async getProperty(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM property_configurations WHERE property_id = $1',
        [id]
      );
      if (result.rows.length > 0) {
        return propertyFromDb(result.rows[0]);
      }
    } catch (err) {
      console.error('[v2-data] getProperty error:', err.message);
    }
    return null;
  },

  async saveProperty(property) {
    try {
      const db = propertyToDb(property);

      // Get customer_id from owners → customers link
      let customerId = null;
      try {
        const custResult = await pool.query(
          "SELECT id FROM customers WHERE status = 'active' LIMIT 1"
        );
        if (custResult.rows.length > 0) {
          customerId = custResult.rows[0].id;
        }
      } catch (e) { /* no customers table or no active customer */ }

      const result = await pool.query(`
        INSERT INTO property_configurations (
          property_id, property_name, address,
          bedrooms, bathrooms, max_guests,
          base_price, weekend_price, holiday_price, cleaning_fee,
          min_stay_nights, max_stay_nights,
          calendar_url, calendar_sync_enabled, timezone,
          auto_approve_bookings, require_screening,
          owner_contact, owner_telegram, owner_name, owner_phone, owner_email,
          property_status, settings, customer_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24::jsonb, $25
        )
        ON CONFLICT (property_id) DO UPDATE SET
          property_name = EXCLUDED.property_name,
          address = EXCLUDED.address,
          bedrooms = EXCLUDED.bedrooms,
          bathrooms = EXCLUDED.bathrooms,
          max_guests = EXCLUDED.max_guests,
          base_price = EXCLUDED.base_price,
          weekend_price = EXCLUDED.weekend_price,
          holiday_price = EXCLUDED.holiday_price,
          cleaning_fee = EXCLUDED.cleaning_fee,
          min_stay_nights = EXCLUDED.min_stay_nights,
          max_stay_nights = EXCLUDED.max_stay_nights,
          calendar_url = EXCLUDED.calendar_url,
          calendar_sync_enabled = EXCLUDED.calendar_sync_enabled,
          timezone = EXCLUDED.timezone,
          auto_approve_bookings = EXCLUDED.auto_approve_bookings,
          require_screening = EXCLUDED.require_screening,
          owner_contact = EXCLUDED.owner_contact,
          owner_telegram = EXCLUDED.owner_telegram,
          owner_name = EXCLUDED.owner_name,
          owner_phone = EXCLUDED.owner_phone,
          owner_email = EXCLUDED.owner_email,
          property_status = EXCLUDED.property_status,
          settings = EXCLUDED.settings,
          customer_id = EXCLUDED.customer_id
        RETURNING property_id
      `, [
        db.property_id, db.property_name, db.address,
        db.bedrooms, db.bathrooms, db.max_guests,
        db.base_price, db.weekend_price, db.holiday_price, db.cleaning_fee,
        db.min_stay_nights, db.max_stay_nights,
        db.calendar_url, db.calendar_sync_enabled, db.timezone,
        db.auto_approve_bookings, db.require_screening,
        db.owner_contact, db.owner_telegram, db.owner_name, db.owner_phone, db.owner_email,
        db.property_status, JSON.stringify(db.settings), customerId,
      ]);

      const savedId = result.rows[0].property_id;
      const saved = await this.getProperty(savedId);
      return { success: true, property: saved };
    } catch (err) {
      console.error('[v2-data] saveProperty error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async deleteProperty(id) {
    try {
      const result = await pool.query(
        "UPDATE property_configurations SET property_status = 'inactive' WHERE property_id = $1",
        [id]
      );
      if (result.rowCount > 0) {
        return { success: true };
      }
      return { success: false, error: 'Property not found' };
    } catch (err) {
      console.error('[v2-data] deleteProperty error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // ============================================
  // BOOKINGS (PostgreSQL bookings table)
  // ============================================

  async getBookings(propertyId = null, startDate = null, endDate = null) {
    try {
      let query = 'SELECT * FROM bookings WHERE 1=1';
      const params = [];
      let idx = 1;

      if (propertyId && propertyId !== 'all') {
        query += ` AND property_id = $${idx++}`;
        params.push(propertyId);
      }
      if (startDate) {
        query += ` AND check_out_date >= $${idx++}`;
        params.push(startDate);
      }
      if (endDate) {
        query += ` AND check_in_date <= $${idx++}`;
        params.push(endDate);
      }

      query += ' ORDER BY check_in_date DESC';

      const result = await pool.query(query, params);
      return result.rows.map(bookingFromDb);
    } catch (err) {
      console.error('[v2-data] getBookings error:', err.message);
      return [];
    }
  },

  async createBooking(data) {
    try {
      const bookingId = 'booking-' + Date.now();
      const property = data.propertyId ? await this.getProperty(data.propertyId) : null;

      await pool.query(`
        INSERT INTO bookings (
          booking_id, property_id, property_name,
          guest_name, guest_phone, guest_email,
          check_in_date, check_out_date, guests,
          booking_status, total_amount, platform,
          notes, channel_type, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        bookingId,
        data.propertyId || '',
        property ? property.name : (data.propertyName || ''),
        data.guestName || '',
        data.guestPhone || '',
        data.guestEmail || '',
        data.checkIn,
        data.checkOut,
        data.guests || 1,
        data.status || 'confirmed',
        data.totalAmount || 0,
        data.platform || 'direct',
        data.notes || '',
        'manual',
        data.totalAmount > 0 ? 'pending' : 'none',
      ]);

      return { success: true, bookingId };
    } catch (err) {
      console.error('[v2-data] createBooking error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // ============================================
  // TASKS (PostgreSQL manual_tasks table)
  // ============================================

  async getTasks(status = null) {
    try {
      let query = 'SELECT * FROM manual_tasks';
      const params = [];
      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }
      query += ' ORDER BY priority ASC, created_at DESC';

      const result = await pool.query(query, params);
      return result.rows.map(taskFromDb);
    } catch (err) {
      console.error('[v2-data] getTasks error:', err.message);
      return [];
    }
  },

  async completeTask(taskId) {
    try {
      const result = await pool.query(
        "UPDATE manual_tasks SET status = 'completed', completed_at = NOW() WHERE task_id = $1",
        [taskId]
      );
      if (result.rowCount > 0) {
        return { success: true };
      }
      return { success: false, error: 'Task not found' };
    } catch (err) {
      console.error('[v2-data] completeTask error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // ============================================
  // NOTIFICATIONS (local — no PG table yet)
  // ============================================

  getNotifications(unreadOnly = false) {
    let notifications = [...localData.notifications];
    if (unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }
    return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markNotificationRead(notificationId) {
    const notification = localData.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      return { success: true };
    }
    return { success: false, error: 'Notification not found' };
  },

  markAllNotificationsRead() {
    localData.notifications.forEach(n => n.read = true);
    return { success: true };
  },

  getUnreadCount() {
    return localData.notifications.filter(n => !n.read).length;
  },

  // ============================================
  // ACTIVATION
  // ============================================

  async activate(allData) {
    if (allData.owner) await this.saveOwner(allData.owner);
    if (allData.credentials) localData.credentials = { ...localData.credentials, ...allData.credentials };
    if (allData.ai) localData.ai = { ...localData.ai, ...allData.ai };
    if (allData.media) localData.media = { ...localData.media, ...allData.media };

    return {
      success: true,
      message: 'Settings saved to PostgreSQL. Activation would trigger deployment in production.',
    };
  },

  // ============================================
  // UTILITY
  // ============================================

  async resetToDemo() {
    localData.notifications = [
      {
        id: 'notif_1',
        type: 'system',
        title: 'Demo Reset',
        message: 'Data has been reset. Properties still come from PostgreSQL.',
        read: false,
        createdAt: new Date().toISOString(),
      },
    ];
    return { success: true, message: 'Local data reset. PostgreSQL data unchanged.' };
  },
};

module.exports = V2DataService;
