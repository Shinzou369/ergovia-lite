/**
 * V2 Data Service - Premium Dashboard Data Layer
 *
 * This service abstracts the data layer for the V2 premium dashboard.
 * Currently uses mock data but is designed to be easily swapped with real database.
 *
 * WHEN SCHEMA IS FINALIZED:
 * 1. Update the data retrieval methods to use actual database queries
 * 2. Keep the return format the same (frontend expects this structure)
 * 3. The SchemaMapper in config.js handles field name mapping
 */

// In-memory storage for development (replace with database later)
let mockData = {
  owner: {
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    preferredPlatform: 'telegram',
    telegramChatId: '',
    whatsappNumber: '',
  },
  credentials: {
    telegramBotToken: '',
    whatsappApiKey: '',
    googleServiceAccount: '',
    airbnbCalendarLink: '',
  },
  team: [],
  ai: {
    aiNotes: '',
    pricingRules: '',
  },
  media: {
    propertyPhotosLink: '',
    propertyVideosLink: '',
    documentationLink: '',
  },
  properties: [],
  bookings: [],
  tasks: [],
  notifications: [],
};

// Initialize with some demo data for testing
function initializeDemoData() {
  // Demo properties
  mockData.properties = [
    {
      id: 'prop_1',
      name: 'Sunset Beach Villa',
      address: '123 Ocean Drive, Miami Beach, FL',
      type: 'villa',
      bedrooms: 3,
      bathrooms: 2,
      maxGuests: 6,
      airbnbUrl: 'https://airbnb.com/rooms/123456',
      doorCode: '1234',
      accessInstructions: 'Use front door. Lockbox is beside the door.',
      cleanerName: 'Maria Santos',
      cleanerPhone: '+1 555-0101',
      maintenanceName: 'John Maintenance',
      maintenancePhone: '+1 555-0102',
      amenities: ['wifi', 'pool', 'parking', 'ac'],
      notes: 'Great ocean view from the balcony',
      color: '#1877f2',
    },
    {
      id: 'prop_2',
      name: 'Downtown Loft',
      address: '456 Main Street, Apt 12B, New York, NY',
      type: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      maxGuests: 2,
      airbnbUrl: 'https://airbnb.com/rooms/789012',
      doorCode: '5678',
      accessInstructions: 'Building has a doorman. Tell them you\'re checking in.',
      cleanerName: 'Lisa Clean',
      cleanerPhone: '+1 555-0201',
      amenities: ['wifi', 'gym', 'doorman'],
      notes: 'Quiet building, great for business travelers',
      color: '#42b72a',
    },
  ];

  // Demo bookings
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekEnd = new Date(nextWeek);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 4);

  mockData.bookings = [
    {
      id: 'book_1',
      propertyId: 'prop_1',
      propertyName: 'Sunset Beach Villa',
      guestName: 'John Smith',
      guestPhone: '+1 555-1234',
      checkIn: tomorrow.toISOString().split('T')[0],
      checkOut: new Date(tomorrow.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      guests: 4,
      status: 'confirmed',
      totalPrice: 450,
      color: '#1877f2',
    },
    {
      id: 'book_2',
      propertyId: 'prop_2',
      propertyName: 'Downtown Loft',
      guestName: 'Jane Doe',
      guestPhone: '+1 555-5678',
      checkIn: nextWeek.toISOString().split('T')[0],
      checkOut: nextWeekEnd.toISOString().split('T')[0],
      guests: 2,
      status: 'confirmed',
      totalPrice: 320,
      color: '#42b72a',
    },
  ];

  // Demo tasks
  mockData.tasks = [
    {
      id: 'task_1',
      title: 'Complete your property setup',
      description: 'Add all your property details to enable full automation',
      priority: 'high',
      icon: 'exclamation-circle',
      actionLink: '/v2/settings.html',
      actionText: 'Complete Now',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'task_2',
      title: 'Review guest message',
      description: 'A guest has asked about late check-in options',
      priority: 'medium',
      icon: 'comment-dots',
      actionLink: null,
      actionText: 'View',
      status: 'pending',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ];

  // Demo notifications
  mockData.notifications = [
    {
      id: 'notif_1',
      type: 'booking',
      title: 'New Booking!',
      message: 'John Smith booked Sunset Beach Villa for 3 nights',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'notif_2',
      type: 'message',
      title: 'Guest Message',
      message: 'Jane Doe asked about parking options',
      read: false,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 'notif_3',
      type: 'system',
      title: 'AI Assistant Active',
      message: 'Your AI assistant is now handling guest inquiries',
      read: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

// Initialize demo data on module load
initializeDemoData();

/**
 * V2 Data Service API
 */
const V2DataService = {
  // ============================================
  // DASHBOARD
  // ============================================

  getDashboardData() {
    const activeBookings = mockData.bookings.filter(b => {
      const checkOut = new Date(b.checkOut);
      return checkOut >= new Date();
    });

    return {
      owner: mockData.owner,
      stats: {
        totalBookings: activeBookings.length,
        totalProperties: mockData.properties.length,
        activeConversations: 3, // Mock value
        monthlyRevenue: activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      },
      upcomingBookings: activeBookings.slice(0, 5),
      tasks: mockData.tasks.filter(t => t.status === 'pending').slice(0, 5),
      recentNotifications: mockData.notifications.slice(0, 10),
    };
  },

  getStats() {
    const activeBookings = mockData.bookings.filter(b => {
      const checkOut = new Date(b.checkOut);
      return checkOut >= new Date();
    });

    return {
      totalBookings: activeBookings.length,
      totalProperties: mockData.properties.length,
      activeConversations: 3,
      monthlyRevenue: activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    };
  },

  // ============================================
  // SETTINGS
  // ============================================

  getSettings(section = null) {
    if (section) {
      return mockData[section] || null;
    }
    return {
      owner: mockData.owner,
      credentials: {
        // Mask credentials for security
        telegramBotToken: mockData.credentials.telegramBotToken ? '********' : '',
        whatsappApiKey: mockData.credentials.whatsappApiKey ? '********' : '',
        googleServiceAccount: mockData.credentials.googleServiceAccount ? '********' : '',
        airbnbCalendarLink: mockData.credentials.airbnbCalendarLink || '',
      },
      team: mockData.team,
      ai: mockData.ai,
      media: mockData.media,
    };
  },

  saveSettings(section, data) {
    if (mockData.hasOwnProperty(section)) {
      mockData[section] = { ...mockData[section], ...data };
      return { success: true, section, data: mockData[section] };
    }
    return { success: false, error: `Unknown section: ${section}` };
  },

  // ============================================
  // PROPERTIES
  // ============================================

  getProperties() {
    return mockData.properties;
  },

  getProperty(id) {
    return mockData.properties.find(p => p.id === id) || null;
  },

  saveProperty(property) {
    if (property.id) {
      // Update existing
      const index = mockData.properties.findIndex(p => p.id === property.id);
      if (index !== -1) {
        mockData.properties[index] = { ...mockData.properties[index], ...property };
        return { success: true, property: mockData.properties[index] };
      }
    }

    // Create new
    const newProperty = {
      ...property,
      id: property.id || 'prop_' + Date.now(),
      color: property.color || '#1877f2',
    };
    mockData.properties.push(newProperty);
    return { success: true, property: newProperty };
  },

  deleteProperty(id) {
    const index = mockData.properties.findIndex(p => p.id === id);
    if (index !== -1) {
      mockData.properties.splice(index, 1);
      // Also delete related bookings
      mockData.bookings = mockData.bookings.filter(b => b.propertyId !== id);
      return { success: true };
    }
    return { success: false, error: 'Property not found' };
  },

  // ============================================
  // BOOKINGS
  // ============================================

  getBookings(propertyId = null, startDate = null, endDate = null) {
    let bookings = [...mockData.bookings];

    if (propertyId && propertyId !== 'all') {
      bookings = bookings.filter(b => b.propertyId === propertyId);
    }

    if (startDate) {
      bookings = bookings.filter(b => new Date(b.checkOut) >= new Date(startDate));
    }

    if (endDate) {
      bookings = bookings.filter(b => new Date(b.checkIn) <= new Date(endDate));
    }

    // Add property color to each booking
    return bookings.map(b => {
      const property = mockData.properties.find(p => p.id === b.propertyId);
      return {
        ...b,
        color: property?.color || b.color || '#1877f2',
        propertyName: property?.name || b.propertyName || 'Unknown Property',
      };
    });
  },

  // ============================================
  // TASKS
  // ============================================

  getTasks(status = null) {
    let tasks = [...mockData.tasks];
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    return tasks;
  },

  completeTask(taskId) {
    const task = mockData.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      return { success: true, task };
    }
    return { success: false, error: 'Task not found' };
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================

  getNotifications(unreadOnly = false) {
    let notifications = [...mockData.notifications];
    if (unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }
    return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markNotificationRead(notificationId) {
    const notification = mockData.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      return { success: true };
    }
    return { success: false, error: 'Notification not found' };
  },

  markAllNotificationsRead() {
    mockData.notifications.forEach(n => n.read = true);
    return { success: true };
  },

  getUnreadCount() {
    return mockData.notifications.filter(n => !n.read).length;
  },

  // ============================================
  // ACTIVATION (Trigger workflow deployment)
  // ============================================

  async activate(allData) {
    // This would trigger the actual deployment
    // For now, just save the data and return success
    if (allData.owner) mockData.owner = allData.owner;
    if (allData.credentials) mockData.credentials = allData.credentials;
    if (allData.team) mockData.team = allData.team;
    if (allData.ai) mockData.ai = allData.ai;
    if (allData.media) mockData.media = allData.media;

    return {
      success: true,
      message: 'Settings saved. Activation would trigger deployment in production.',
    };
  },

  // ============================================
  // UTILITY
  // ============================================

  resetToDemo() {
    initializeDemoData();
    return { success: true, message: 'Reset to demo data' };
  },
};

module.exports = V2DataService;
