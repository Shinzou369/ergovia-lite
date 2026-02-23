/**
 * V2 Data Service - Premium Dashboard Data Layer
 *
 * PostgreSQL bridge: properties, bookings, owners, tasks → remote PostgreSQL
 * Local storage: credentials, AI config, media → SQLite (persistent)
 *
 * This ensures the settings page writes to the SAME database
 * that n8n workflows read from.
 */

const { Pool } = require('pg');
const localDb = require('../db');

// PostgreSQL connection (same DB as n8n workflows)
const pgSsl = process.env.PG_SSL || process.env.POSTGRES_SSL;
const pool = new Pool({
  host: process.env.PG_HOST || '116.203.115.12',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'ergovia_db',
  user: process.env.PG_USER || 'ergovia_user',
  password: process.env.PG_PASSWORD || 'ergovia_secure_2026',
  ssl: pgSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection on startup
// Ensure critical tables exist in PostgreSQL
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS property_configurations (
        id SERIAL PRIMARY KEY,
        property_id VARCHAR(255) UNIQUE NOT NULL,
        property_name VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255),
        address TEXT,
        location_description TEXT,
        max_guests INTEGER DEFAULT 0,
        bedrooms INTEGER DEFAULT 0,
        bathrooms INTEGER DEFAULT 0,
        base_price DECIMAL(10,2) DEFAULT 0,
        weekend_price DECIMAL(10,2) DEFAULT 0,
        holiday_price DECIMAL(10,2) DEFAULT 0,
        cleaning_fee DECIMAL(10,2) DEFAULT 0,
        owner_name VARCHAR(255),
        owner_phone VARCHAR(50),
        owner_email VARCHAR(255),
        owner_telegram VARCHAR(100),
        owner_contact VARCHAR(255),
        auto_approve_bookings BOOLEAN DEFAULT false,
        require_screening BOOLEAN DEFAULT true,
        min_stay_nights INTEGER DEFAULT 1,
        max_stay_nights INTEGER DEFAULT 30,
        calendar_sync_enabled BOOLEAN DEFAULT true,
        calendar_url TEXT,
        timezone VARCHAR(50) DEFAULT 'UTC',
        property_status VARCHAR(50) DEFAULT 'active',
        settings JSONB DEFAULT '{}',
        payment_link TEXT,
        payment_instructions TEXT,
        preferred_platform VARCHAR(50) DEFAULT 'telegram',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        booking_id VARCHAR(255) UNIQUE NOT NULL,
        property_id VARCHAR(255),
        property_name VARCHAR(255),
        guest_name VARCHAR(255),
        guest_phone VARCHAR(50),
        guest_email VARCHAR(255),
        check_in_date DATE,
        check_out_date DATE,
        guests INTEGER DEFAULT 1,
        booking_status VARCHAR(50) DEFAULT 'pending',
        total_amount DECIMAL(10,2) DEFAULT 0,
        platform VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add location_description column if missing (for existing databases)
    await pool.query(`
      ALTER TABLE property_configurations ADD COLUMN IF NOT EXISTS location_description TEXT
    `).catch(() => {});
    console.log('[v2-data] Tables ensured');
  } catch (err) {
    console.error('[v2-data] ensureTables error:', err.message);
  }
}

pool.query('SELECT NOW()')
  .then(() => { console.log('[v2-data] PostgreSQL connected'); return ensureTables(); })
  .catch(err => console.error('[v2-data] PostgreSQL connection failed:', err.message));

// ============================================
// LOCAL STORAGE (SQLite-backed via db.js)
// ============================================

function getLocalSection(section) {
  const defaults = {
    credentials: { telegramBotToken: '', openaiApiKey: '', whatsappApiKey: '', airbnbCalendarLink: '' },
    ai: { aiNotes: '', pricingRules: '' },
    media: { propertyPhotosLink: '', propertyVideosLink: '', documentationLink: '' },
    preferences: { language: 'en', timezone: 'UTC', currency: 'USD', paymentMethod: '' },
  };
  return localDb.getV2Setting(section) || defaults[section] || {};
}

function saveLocalSection(section, data) {
  const current = getLocalSection(section);
  const merged = { ...current, ...data };
  localDb.saveV2Setting(section, merged);
  return merged;
}

// Mask sensitive credential values for API responses
const SENSITIVE_KEYS = ['telegramBotToken', 'whatsappApiKey', 'n8n_api_key', 'openaiApiKey'];
function maskSensitiveCreds(creds) {
  const masked = { ...creds };
  for (const key of SENSITIVE_KEYS) {
    if (masked[key]) masked[key] = '********';
  }
  return masked;
}

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
    locationDescription: row.location_description || '',
    photos: s.photos || '',
    notes: s.notes || '',
    paymentLink: row.payment_link || '',
    paymentInstructions: row.payment_instructions || '',
    status: row.property_status || 'active',
    settings: s,
    color: s.color || '#1877f2',
  };
}

function propertyToDb(property) {
  const id = property.id || 'prop-' + Date.now();
  return {
    property_id: id,
    property_name: property.name || '',
    address: property.address || '',
    bedrooms: property.bedrooms || 0,
    bathrooms: property.bathrooms || 0,
    max_guests: property.maxGuests || 0,
    base_price: property.basePrice || 0,
    weekend_price: property.weekendPrice || 0,
    holiday_price: property.holidayPrice || 0,
    cleaning_fee: property.cleaningFee || 0,
    min_stay_nights: property.minStayNights || 1,
    max_stay_nights: property.maxStayNights || 30,
    calendar_url: property.calendarUrl || '',
    calendar_sync_enabled: property.calendarSyncEnabled || false,
    timezone: property.timezone || 'UTC',
    auto_approve_bookings: property.autoApproveBookings || false,
    require_screening: property.requireScreening !== false,
    owner_contact: property.ownerContact || '',
    owner_telegram: property.ownerTelegram || '',
    owner_name: property.ownerName || '',
    owner_phone: property.ownerPhone || '',
    owner_email: property.ownerEmail || '',
    payment_link: property.paymentLink || '',
    payment_instructions: property.paymentInstructions || '',
    location_description: property.locationDescription || '',
    property_status: property.status || 'active',
    settings: {
      property_type: property.type || 'apartment',
      check_in_time: property.checkInTime || '15:00',
      check_out_time: property.checkOutTime || '11:00',
      amenities: property.amenities || [],
      house_rules: property.houseRules || '',
      photos: property.photos || '',
      notes: property.notes || '',
    },
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
      recentNotifications: localDb.getNotifications(false).slice(0, 10).map(n => ({
        id: n.notification_id, type: n.type, title: n.title, message: n.message,
        read: !!n.read, createdAt: n.created_at,
      })),
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
      // Find existing owner or create a stable ID
      const existing = await pool.query('SELECT owner_id FROM owners ORDER BY created_at ASC LIMIT 1');
      const ownerId = existing.rows.length > 0 ? existing.rows[0].owner_id : 'owner-1';

      const ownerName = data.ownerName || data.name || '';
      const ownerEmail = data.ownerEmail || data.email || '';
      const ownerPhone = data.ownerPhone || data.phone || '';
      const chatId = data.telegramChatId || '';
      const platform = data.preferredPlatform || data.platform || 'telegram';

      await pool.query(`
        INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (owner_id) DO UPDATE SET
          owner_name = EXCLUDED.owner_name,
          owner_email = EXCLUDED.owner_email,
          owner_phone = EXCLUDED.owner_phone,
          owner_chat_id = EXCLUDED.owner_chat_id,
          preferred_platform = EXCLUDED.preferred_platform,
          updated_at = NOW()
      `, [ownerId, ownerName, ownerEmail, ownerPhone, chatId, platform]);

      // Also propagate to property_configurations so workflows pick it up immediately
      const propResult = await pool.query(`
        UPDATE property_configurations SET
          owner_name = $1,
          owner_phone = $2,
          owner_email = $3,
          owner_telegram = $4,
          owner_contact = COALESCE(NULLIF($4, ''), $2),
          updated_at = NOW()
        WHERE property_status = 'active'
      `, [ownerName, ownerPhone, ownerEmail, chatId]);
      console.log('[v2-data] saveOwner: updated', propResult.rowCount, 'property_configurations rows');

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
    const creds = getLocalSection('credentials');
    const ai = getLocalSection('ai');
    const media = getLocalSection('media');
    const booking = getLocalSection('booking');
    const notifications = getLocalSection('notifications');
    const budget = getLocalSection('budget');

    if (section === 'owner') return owner;
    if (section === 'credentials') return maskSensitiveCreds(creds);
    if (section === 'team') return getLocalSection('team') || [];
    if (section === 'ai') return ai;
    if (section === 'media') return media;
    if (section === 'booking') return booking;
    if (section === 'notifications') return notifications;
    if (section === 'budget') return budget;
    if (section === 'preferences') return getLocalSection('preferences');

    return {
      owner,
      credentials: maskSensitiveCreds(creds),
      team: getLocalSection('team') || [],
      ai,
      media,
      booking,
      notifications,
      budget,
      preferences: getLocalSection('preferences'),
    };
  },

  async saveSettings(section, data) {
    if (section === 'owner') {
      return await this.saveOwner(data);
    }
    const validSections = ['credentials', 'ai', 'media', 'preferences', 'booking', 'notifications', 'budget', 'team'];
    if (validSections.includes(section)) {
      const saved = saveLocalSection(section, data);
      return { success: true, section, data: saved };
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
      const pgProps = result.rows.map(propertyFromDb);
      // Merge with any locally-saved properties
      const localProps = (localDb.getV2Setting('properties') || [])
        .filter(p => p.property_status === 'active')
        .map(propertyFromDb);
      const pgIds = new Set(pgProps.map(p => p.id));
      const merged = [...pgProps, ...localProps.filter(p => !pgIds.has(p.id))];
      return merged;
    } catch (err) {
      console.error('[v2-data] getProperties PG error, using local:', err.message);
      return (localDb.getV2Setting('properties') || [])
        .filter(p => p.property_status === 'active')
        .map(propertyFromDb);
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
          property_id, property_name, address, location_description,
          bedrooms, bathrooms, max_guests,
          base_price, weekend_price, holiday_price, cleaning_fee,
          min_stay_nights, max_stay_nights,
          calendar_url, calendar_sync_enabled, timezone,
          auto_approve_bookings, require_screening,
          owner_contact, owner_telegram, owner_name, owner_phone, owner_email,
          payment_link, payment_instructions,
          property_status, settings, customer_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23,
          $24, $25,
          $26, $27::jsonb, $28
        )
        ON CONFLICT (property_id) DO UPDATE SET
          property_name = EXCLUDED.property_name,
          address = EXCLUDED.address,
          location_description = EXCLUDED.location_description,
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
          payment_link = EXCLUDED.payment_link,
          payment_instructions = EXCLUDED.payment_instructions,
          property_status = EXCLUDED.property_status,
          settings = EXCLUDED.settings,
          customer_id = EXCLUDED.customer_id
        RETURNING property_id
      `, [
        db.property_id, db.property_name, db.address, db.location_description,
        db.bedrooms, db.bathrooms, db.max_guests,
        db.base_price, db.weekend_price, db.holiday_price, db.cleaning_fee,
        db.min_stay_nights, db.max_stay_nights,
        db.calendar_url, db.calendar_sync_enabled, db.timezone,
        db.auto_approve_bookings, db.require_screening,
        db.owner_contact, db.owner_telegram, db.owner_name, db.owner_phone, db.owner_email,
        db.payment_link, db.payment_instructions,
        db.property_status, JSON.stringify(db.settings), customerId,
      ]);

      const savedId = result.rows[0].property_id;
      const saved = await this.getProperty(savedId);
      return { success: true, property: saved };
    } catch (err) {
      console.error('[v2-data] saveProperty PG error, using local fallback:', err.message);
      // SQLite fallback
      try {
        const db = propertyToDb(property);
        const existing = localDb.getV2Setting('properties') || [];
        const idx = existing.findIndex(p => p.property_id === db.property_id);
        const entry = { ...db, settings: db.settings, updated_at: new Date().toISOString() };
        if (idx >= 0) {
          existing[idx] = entry;
        } else {
          entry.created_at = new Date().toISOString();
          existing.push(entry);
        }
        localDb.saveV2Setting('properties', existing);
        return { success: true, property: propertyFromDb(entry) };
      } catch (localErr) {
        return { success: false, error: localErr.message };
      }
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
    } catch (err) {
      console.error('[v2-data] deleteProperty PG error:', err.message);
    }
    // Fallback: also remove from local SQLite store
    try {
      const existing = localDb.getV2Setting('properties') || [];
      const idx = existing.findIndex(p => p.property_id === id);
      if (idx >= 0) {
        existing[idx].property_status = 'inactive';
        localDb.saveV2Setting('properties', existing);
        return { success: true };
      }
    } catch (localErr) {
      console.error('[v2-data] deleteProperty local error:', localErr.message);
    }
    return { success: false, error: 'Property not found' };
  },

  // ============================================
  // BOOKINGS (PostgreSQL bookings table)
  // ============================================

  async getBookings(propertyId = null, startDate = null, endDate = null) {
    try {
      let query = "SELECT * FROM bookings WHERE booking_status != 'cancelled'";
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
  // BOOKING UPDATE / CANCEL
  // ============================================

  async updateBooking(bookingId, data) {
    try {
      const sets = [];
      const params = [];
      let idx = 1;

      if (data.guestName !== undefined) { sets.push(`guest_name = $${idx++}`); params.push(data.guestName); }
      if (data.guestPhone !== undefined) { sets.push(`guest_phone = $${idx++}`); params.push(data.guestPhone); }
      if (data.guestEmail !== undefined) { sets.push(`guest_email = $${idx++}`); params.push(data.guestEmail); }
      if (data.checkIn !== undefined) { sets.push(`check_in_date = $${idx++}`); params.push(data.checkIn); }
      if (data.checkOut !== undefined) { sets.push(`check_out_date = $${idx++}`); params.push(data.checkOut); }
      if (data.guests !== undefined) { sets.push(`guests = $${idx++}`); params.push(data.guests); }
      if (data.status !== undefined) { sets.push(`booking_status = $${idx++}`); params.push(data.status); }
      if (data.totalAmount !== undefined) { sets.push(`total_amount = $${idx++}`); params.push(data.totalAmount); }
      if (data.platform !== undefined) { sets.push(`platform = $${idx++}`); params.push(data.platform); }
      if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(data.notes); }

      if (sets.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      sets.push(`updated_at = NOW()`);
      params.push(bookingId);

      const query = `UPDATE bookings SET ${sets.join(', ')} WHERE booking_id = $${idx}`;
      const result = await pool.query(query, params);

      if (result.rowCount > 0) {
        return { success: true };
      }
      return { success: false, error: 'Booking not found' };
    } catch (err) {
      console.error('[v2-data] updateBooking error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async cancelBooking(bookingId) {
    try {
      const result = await pool.query(
        "UPDATE bookings SET booking_status = 'cancelled', updated_at = NOW() WHERE booking_id = $1",
        [bookingId]
      );
      if (result.rowCount > 0) {
        return { success: true };
      }
      return { success: false, error: 'Booking not found' };
    } catch (err) {
      console.error('[v2-data] cancelBooking error:', err.message);
      return { success: false, error: err.message };
    }
  },

  // ============================================
  // ACTIVATION
  // ============================================

  async activate(allData) {
    if (allData.owner) await this.saveOwner(allData.owner);
    if (allData.credentials) saveLocalSection('credentials', allData.credentials);
    if (allData.ai) saveLocalSection('ai', allData.ai);
    if (allData.media) saveLocalSection('media', allData.media);

    return {
      success: true,
      message: 'Settings saved. Activation would trigger deployment in production.',
    };
  },

  // ============================================
  // UTILITY
  // ============================================

  async resetToDemo() {
    localDb.addNotification({
      type: 'system',
      title: 'Demo Reset',
      message: 'Data has been reset. Properties still come from PostgreSQL.',
    });
    return { success: true, message: 'Local data reset. PostgreSQL data unchanged.' };
  },

  async seedDemoData() {
    const COLORS = ['#1877f2','#42b72a','#f44336','#ff9800','#9c27b0','#00bcd4','#e91e63','#795548','#607d8b'];
    const properties = [
      { id: 'prop-oceanview', name: 'Ocean View Villa', address: '123 Beachfront Rd, Miami FL', type: 'villa', bedrooms: 4, bathrooms: 3, maxGuests: 8, basePrice: 350, cleaningFee: 120 },
      { id: 'prop-downtown', name: 'Downtown Loft', address: '456 Main St, New York NY', type: 'apartment', bedrooms: 2, bathrooms: 1, maxGuests: 4, basePrice: 220, cleaningFee: 80 },
      { id: 'prop-mountain', name: 'Mountain Retreat', address: '789 Pine Trail, Aspen CO', type: 'cabin', bedrooms: 3, bathrooms: 2, maxGuests: 6, basePrice: 280, cleaningFee: 100 },
      { id: 'prop-lakehouse', name: 'Lakeside Cottage', address: '101 Lakeview Dr, Lake Tahoe CA', type: 'cottage', bedrooms: 2, bathrooms: 1, maxGuests: 4, basePrice: 190, cleaningFee: 70 },
      { id: 'prop-penthouse', name: 'City Penthouse', address: '200 Sky Tower, Los Angeles CA', type: 'penthouse', bedrooms: 3, bathrooms: 2, maxGuests: 6, basePrice: 450, cleaningFee: 150 },
      { id: 'prop-beachcondo', name: 'Sunset Beach Condo', address: '55 Coastal Hwy, San Diego CA', type: 'condo', bedrooms: 2, bathrooms: 2, maxGuests: 4, basePrice: 175, cleaningFee: 60 },
      { id: 'prop-farmhouse', name: 'Countryside Farmhouse', address: '320 Old Mill Rd, Nashville TN', type: 'farmhouse', bedrooms: 5, bathrooms: 3, maxGuests: 10, basePrice: 260, cleaningFee: 110 },
      { id: 'prop-studio', name: 'Urban Studio', address: '88 Arts District, Portland OR', type: 'studio', bedrooms: 1, bathrooms: 1, maxGuests: 2, basePrice: 95, cleaningFee: 40 },
      { id: 'prop-treehouse', name: 'Tropical Treehouse', address: '42 Rainforest Ln, Maui HI', type: 'treehouse', bedrooms: 1, bathrooms: 1, maxGuests: 2, basePrice: 310, cleaningFee: 90 },
    ];

    let propsCreated = 0;
    for (let i = 0; i < properties.length; i++) {
      const p = properties[i];
      try {
        await pool.query(`
          INSERT INTO property_configurations (
            property_id, property_name, address, bedrooms, bathrooms, max_guests,
            base_price, cleaning_fee, property_status, settings, timezone
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9::jsonb,'America/New_York')
          ON CONFLICT (property_id) DO UPDATE SET
            property_name = EXCLUDED.property_name,
            address = EXCLUDED.address,
            bedrooms = EXCLUDED.bedrooms,
            bathrooms = EXCLUDED.bathrooms,
            max_guests = EXCLUDED.max_guests,
            base_price = EXCLUDED.base_price,
            cleaning_fee = EXCLUDED.cleaning_fee,
            settings = EXCLUDED.settings
        `, [
          p.id, p.name, p.address, p.bedrooms, p.bathrooms, p.maxGuests,
          p.basePrice, p.cleaningFee,
          JSON.stringify({ property_type: p.type, check_in_time: '15:00', check_out_time: '11:00', amenities: ['WiFi','Kitchen','AC'], color: COLORS[i] }),
        ]);
        propsCreated++;
      } catch (err) {
        console.error('[seed] property error:', p.id, err.message);
      }
    }

    // Seed bookings (spread across current month and next month)
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const bookings = [
      { propIdx: 0, guest: 'Alex Wearing', dStart: 3, dEnd: 7, platform: 'airbnb', amount: 1400, status: 'confirmed' },
      { propIdx: 1, guest: 'Maria Santos', dStart: 5, dEnd: 9, platform: 'booking.com', amount: 880, status: 'confirmed' },
      { propIdx: 2, guest: 'James Chen', dStart: 10, dEnd: 14, platform: 'direct', amount: 1120, status: 'confirmed' },
      { propIdx: 3, guest: 'Sophie Laurent', dStart: 12, dEnd: 15, platform: 'vrbo', amount: 570, status: 'confirmed' },
      { propIdx: 4, guest: 'Robert Kim', dStart: 18, dEnd: 23, platform: 'airbnb', amount: 2250, status: 'confirmed' },
      { propIdx: 0, guest: 'Emma Thompson', dStart: 15, dEnd: 20, platform: 'direct', amount: 1750, status: 'confirmed' },
      { propIdx: 5, guest: 'David Martinez', dStart: 20, dEnd: 25, platform: 'airbnb', amount: 875, status: 'pending' },
      { propIdx: 6, guest: 'Lisa Anderson', dStart: 22, dEnd: 28, platform: 'booking.com', amount: 1560, status: 'confirmed' },
      { propIdx: 7, guest: 'Tom Wilson', dStart: 8, dEnd: 11, platform: 'direct', amount: 285, status: 'confirmed' },
      { propIdx: 8, guest: 'Nina Patel', dStart: 14, dEnd: 19, platform: 'airbnb', amount: 1550, status: 'confirmed' },
      // Next month bookings
      { propIdx: 0, guest: 'Carlos Ruiz', dStart: 33, dEnd: 38, platform: 'vrbo', amount: 1750, status: 'confirmed' },
      { propIdx: 2, guest: 'Amy Foster', dStart: 35, dEnd: 40, platform: 'airbnb', amount: 1400, status: 'pending' },
      { propIdx: 1, guest: 'Kevin O\'Brien', dStart: 30, dEnd: 34, platform: 'direct', amount: 880, status: 'confirmed' },
    ];

    let bookingsCreated = 0;
    for (const b of bookings) {
      const prop = properties[b.propIdx];
      const checkIn = new Date(y, m, b.dStart);
      const checkOut = new Date(y, m, b.dEnd);
      const bookingId = 'demo-' + prop.id + '-' + b.dStart;
      try {
        await pool.query(`
          INSERT INTO bookings (
            booking_id, property_id, property_name,
            guest_name, check_in_date, check_out_date,
            guests, booking_status, total_amount, platform, channel_type, payment_status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual','pending')
          ON CONFLICT (booking_id) DO UPDATE SET
            property_name = EXCLUDED.property_name,
            guest_name = EXCLUDED.guest_name,
            check_in_date = EXCLUDED.check_in_date,
            check_out_date = EXCLUDED.check_out_date,
            booking_status = EXCLUDED.booking_status,
            total_amount = EXCLUDED.total_amount,
            platform = EXCLUDED.platform
        `, [
          bookingId, prop.id, prop.name,
          b.guest, checkIn.toISOString().split('T')[0], checkOut.toISOString().split('T')[0],
          Math.floor(Math.random() * 4) + 1, b.status, b.amount, b.platform,
        ]);
        bookingsCreated++;
      } catch (err) {
        console.error('[seed] booking error:', bookingId, err.message);
      }
    }

    console.log(`[seed] Created ${propsCreated} properties and ${bookingsCreated} bookings`);
    return { success: true, properties: propsCreated, bookings: bookingsCreated };
  },
};

module.exports = V2DataService;
