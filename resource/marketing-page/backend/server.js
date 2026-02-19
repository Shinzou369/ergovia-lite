/**
 * ============================================
 * ERGOVIA LITE - MARKETING BACKEND SERVER
 * ============================================
 *
 * Handles:
 * - Lemon Squeezy payment webhooks
 * - Customer registration & provisioning
 * - Subscription management
 * - N8N workflow triggers
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const crypto = require('crypto');
const axios = require('axios');
const winston = require('winston');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// LOGGER SETUP
// ============================================

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ============================================
// DATABASE CONNECTION
// ============================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    logger.error('Database connection error:', err);
});

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Raw body for webhook signature verification
app.use('/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }));

// JSON parsing for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// ============================================
// LEMON SQUEEZY WEBHOOK VERIFICATION
// ============================================

function verifyLemonSqueezyWebhook(payload, signature) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
        logger.error('LEMONSQUEEZY_WEBHOOK_SECRET not configured');
        return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
    );
}

// ============================================
// N8N INTEGRATION HELPERS
// ============================================

async function triggerN8NWebhook(webhookUrl, data) {
    try {
        const response = await axios.post(webhookUrl, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.N8N_API_KEY}`
            },
            timeout: 30000
        });
        logger.info(`N8N webhook triggered: ${webhookUrl}`, { status: response.status });
        return response.data;
    } catch (error) {
        logger.error(`N8N webhook error: ${webhookUrl}`, { error: error.message });
        throw error;
    }
}

async function notifyAdmin(message, data = {}) {
    // Telegram notification
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        try {
            await axios.post(
                `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
                    text: `🔔 *Ergovia Lite*\n\n${message}\n\n${JSON.stringify(data, null, 2)}`,
                    parse_mode: 'Markdown'
                }
            );
        } catch (error) {
            logger.error('Telegram notification failed:', error.message);
        }
    }
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Get checkout URL
app.get('/api/checkout-url', (req, res) => {
    const checkoutUrl = `https://ergovia.lemonsqueezy.com/checkout/buy/${process.env.LEMONSQUEEZY_PRODUCT_ID}`;
    res.json({ url: checkoutUrl });
});

// Create checkout session with customer data
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { email, name, propertyCount } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Generate checkout URL with prefilled data
        const params = new URLSearchParams({
            'checkout[email]': email,
            'checkout[name]': name || '',
            'checkout[custom][property_count]': propertyCount || '1'
        });

        const checkoutUrl = `https://ergovia.lemonsqueezy.com/checkout/buy/${process.env.LEMONSQUEEZY_PRODUCT_ID}?${params.toString()}`;

        // Log lead
        await pool.query(
            `INSERT INTO leads (email, name, property_count, source, created_at)
             VALUES ($1, $2, $3, 'marketing_page', NOW())
             ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             property_count = EXCLUDED.property_count,
             updated_at = NOW()`,
            [email, name, propertyCount]
        );

        logger.info('Checkout session created', { email });

        res.json({
            success: true,
            checkoutUrl
        });

    } catch (error) {
        logger.error('Create checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ============================================
// LEMON SQUEEZY WEBHOOKS
// ============================================

app.post('/webhooks/lemonsqueezy', async (req, res) => {
    try {
        const signature = req.headers['x-signature'];
        const payload = req.body;

        // Verify webhook signature
        if (!verifyLemonSqueezyWebhook(payload, signature)) {
            logger.warn('Invalid webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const event = JSON.parse(payload.toString());
        const eventName = event.meta.event_name;
        const data = event.data;

        logger.info(`Lemon Squeezy webhook: ${eventName}`, { id: data.id });

        // Route to appropriate handler
        switch (eventName) {
            case 'order_created':
                await handleOrderCreated(data, event.meta);
                break;
            case 'subscription_created':
                await handleSubscriptionCreated(data, event.meta);
                break;
            case 'subscription_updated':
                await handleSubscriptionUpdated(data, event.meta);
                break;
            case 'subscription_cancelled':
                await handleSubscriptionCancelled(data, event.meta);
                break;
            case 'subscription_resumed':
                await handleSubscriptionResumed(data, event.meta);
                break;
            case 'subscription_expired':
                await handleSubscriptionExpired(data, event.meta);
                break;
            case 'subscription_payment_success':
                await handlePaymentSuccess(data, event.meta);
                break;
            case 'subscription_payment_failed':
                await handlePaymentFailed(data, event.meta);
                break;
            default:
                logger.info(`Unhandled webhook event: ${eventName}`);
        }

        res.json({ received: true });

    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ============================================
// WEBHOOK EVENT HANDLERS
// ============================================

async function handleOrderCreated(data, meta) {
    const attributes = data.attributes;
    const customerEmail = attributes.user_email;
    const customerName = attributes.user_name;
    const orderId = data.id;
    const total = attributes.total_formatted;

    logger.info('New order created', { orderId, customerEmail, total });

    // Insert or update customer
    const customerResult = await pool.query(
        `INSERT INTO customers (
            email, name, lemonsqueezy_customer_id, status, created_at
        ) VALUES ($1, $2, $3, 'pending', NOW())
        ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            lemonsqueezy_customer_id = EXCLUDED.lemonsqueezy_customer_id,
            updated_at = NOW()
        RETURNING id`,
        [customerEmail, customerName, attributes.customer_id]
    );

    const customerId = customerResult.rows[0].id;

    // Record the order
    await pool.query(
        `INSERT INTO orders (
            customer_id, lemonsqueezy_order_id, amount, currency, status, created_at
        ) VALUES ($1, $2, $3, $4, 'completed', NOW())`,
        [customerId, orderId, attributes.total, attributes.currency]
    );

    // Notify admin
    await notifyAdmin('💰 New Order!', {
        customer: customerName,
        email: customerEmail,
        amount: total
    });
}

async function handleSubscriptionCreated(data, meta) {
    const attributes = data.attributes;
    const customerEmail = attributes.user_email;
    const subscriptionId = data.id;
    const status = attributes.status;

    logger.info('Subscription created', { subscriptionId, customerEmail, status });

    // Update customer with subscription
    const customerResult = await pool.query(
        `UPDATE customers SET
            lemonsqueezy_subscription_id = $1,
            subscription_status = $2,
            subscription_created_at = NOW(),
            status = 'active',
            updated_at = NOW()
        WHERE email = $3
        RETURNING id, email, name`,
        [subscriptionId, status, customerEmail]
    );

    if (customerResult.rows.length === 0) {
        // Customer doesn't exist, create them
        await pool.query(
            `INSERT INTO customers (
                email, name, lemonsqueezy_subscription_id, subscription_status,
                subscription_created_at, status, created_at
            ) VALUES ($1, $2, $3, $4, NOW(), 'active', NOW())`,
            [customerEmail, attributes.user_name, subscriptionId, status]
        );
    }

    // Record subscription
    await pool.query(
        `INSERT INTO subscriptions (
            customer_email, lemonsqueezy_subscription_id, status,
            plan_name, billing_anchor, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (lemonsqueezy_subscription_id) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()`,
        [customerEmail, subscriptionId, status, 'ergovia_lite_monthly', attributes.billing_anchor]
    );

    // Trigger N8N workflow for new customer provisioning
    if (process.env.N8N_WEBHOOK_NEW_CUSTOMER) {
        await triggerN8NWebhook(process.env.N8N_WEBHOOK_NEW_CUSTOMER, {
            event: 'subscription_created',
            customer: {
                email: customerEmail,
                name: attributes.user_name,
                subscriptionId: subscriptionId
            },
            timestamp: new Date().toISOString()
        });
    }

    // Notify admin
    await notifyAdmin('🎉 New Subscription!', {
        customer: attributes.user_name,
        email: customerEmail,
        plan: 'Ergovia Lite Monthly ($297)'
    });
}

async function handleSubscriptionUpdated(data, meta) {
    const attributes = data.attributes;
    const subscriptionId = data.id;
    const status = attributes.status;

    logger.info('Subscription updated', { subscriptionId, status });

    await pool.query(
        `UPDATE subscriptions SET
            status = $1,
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $2`,
        [status, subscriptionId]
    );

    await pool.query(
        `UPDATE customers SET
            subscription_status = $1,
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $2`,
        [status, subscriptionId]
    );
}

async function handleSubscriptionCancelled(data, meta) {
    const attributes = data.attributes;
    const subscriptionId = data.id;
    const customerEmail = attributes.user_email;

    logger.info('Subscription cancelled', { subscriptionId, customerEmail });

    await pool.query(
        `UPDATE subscriptions SET
            status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );

    await pool.query(
        `UPDATE customers SET
            subscription_status = 'cancelled',
            status = 'churned',
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );

    // Trigger N8N workflow for cancellation
    if (process.env.N8N_WEBHOOK_SUBSCRIPTION_CANCELLED) {
        await triggerN8NWebhook(process.env.N8N_WEBHOOK_SUBSCRIPTION_CANCELLED, {
            event: 'subscription_cancelled',
            customer: {
                email: customerEmail,
                subscriptionId: subscriptionId
            },
            timestamp: new Date().toISOString()
        });
    }

    // Notify admin
    await notifyAdmin('😢 Subscription Cancelled', {
        email: customerEmail,
        subscriptionId: subscriptionId
    });
}

async function handleSubscriptionResumed(data, meta) {
    const attributes = data.attributes;
    const subscriptionId = data.id;

    logger.info('Subscription resumed', { subscriptionId });

    await pool.query(
        `UPDATE subscriptions SET
            status = 'active',
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );

    await pool.query(
        `UPDATE customers SET
            subscription_status = 'active',
            status = 'active',
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );

    // Trigger reactivation workflow
    if (process.env.N8N_WEBHOOK_SUBSCRIPTION_ACTIVE) {
        await triggerN8NWebhook(process.env.N8N_WEBHOOK_SUBSCRIPTION_ACTIVE, {
            event: 'subscription_resumed',
            subscriptionId: subscriptionId,
            timestamp: new Date().toISOString()
        });
    }
}

async function handleSubscriptionExpired(data, meta) {
    const subscriptionId = data.id;

    logger.info('Subscription expired', { subscriptionId });

    await pool.query(
        `UPDATE subscriptions SET
            status = 'expired',
            expired_at = NOW(),
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );

    await pool.query(
        `UPDATE customers SET
            subscription_status = 'expired',
            status = 'inactive',
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $1`,
        [subscriptionId]
    );
}

async function handlePaymentSuccess(data, meta) {
    const attributes = data.attributes;
    const subscriptionId = data.id;

    logger.info('Payment successful', { subscriptionId });

    // Record payment
    await pool.query(
        `INSERT INTO payments (
            subscription_id, amount, currency, status, created_at
        ) SELECT id, $1, $2, 'success', NOW()
        FROM subscriptions WHERE lemonsqueezy_subscription_id = $3`,
        [attributes.total || 29700, attributes.currency || 'USD', subscriptionId]
    );

    // Update subscription renewal date
    await pool.query(
        `UPDATE subscriptions SET
            last_payment_at = NOW(),
            next_payment_at = $1,
            updated_at = NOW()
        WHERE lemonsqueezy_subscription_id = $2`,
        [attributes.renews_at, subscriptionId]
    );
}

async function handlePaymentFailed(data, meta) {
    const attributes = data.attributes;
    const subscriptionId = data.id;
    const customerEmail = attributes.user_email;

    logger.error('Payment failed', { subscriptionId, customerEmail });

    // Record failed payment
    await pool.query(
        `INSERT INTO payments (
            subscription_id, amount, currency, status, created_at
        ) SELECT id, $1, $2, 'failed', NOW()
        FROM subscriptions WHERE lemonsqueezy_subscription_id = $3`,
        [attributes.total || 29700, attributes.currency || 'USD', subscriptionId]
    );

    // Trigger payment failed workflow
    if (process.env.N8N_WEBHOOK_PAYMENT_FAILED) {
        await triggerN8NWebhook(process.env.N8N_WEBHOOK_PAYMENT_FAILED, {
            event: 'payment_failed',
            customer: {
                email: customerEmail,
                subscriptionId: subscriptionId
            },
            timestamp: new Date().toISOString()
        });
    }

    // Notify admin
    await notifyAdmin('⚠️ Payment Failed', {
        email: customerEmail,
        subscriptionId: subscriptionId
    });
}

// ============================================
// ADMIN API ROUTES
// ============================================

// Simple API key auth middleware for admin routes
const adminAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Get all customers
app.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM customers ORDER BY created_at DESC LIMIT 100`
        );
        res.json({ customers: result.rows });
    } catch (error) {
        logger.error('Get customers error:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get customer by email
app.get('/api/admin/customers/:email', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*,
                    json_agg(DISTINCT s.*) as subscriptions,
                    json_agg(DISTINCT p.*) as payments
             FROM customers c
             LEFT JOIN subscriptions s ON c.email = s.customer_email
             LEFT JOIN payments p ON s.id = p.subscription_id
             WHERE c.email = $1
             GROUP BY c.id`,
            [req.params.email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ customer: result.rows[0] });
    } catch (error) {
        logger.error('Get customer error:', error);
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Get subscription stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM customers) as total_customers,
                (SELECT COUNT(*) FROM customers WHERE status = 'active') as active_customers,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'cancelled') as cancelled_subscriptions,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success') as total_revenue,
                (SELECT COUNT(*) FROM leads) as total_leads
        `);

        res.json({ stats: stats.rows[0] });
    } catch (error) {
        logger.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================
// CRON JOBS
// ============================================

// Daily stats report at 9 AM
cron.schedule('0 9 * * *', async () => {
    logger.info('Running daily stats report');

    try {
        const stats = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE) as new_customers_today,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
                (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' AND created_at >= CURRENT_DATE) as revenue_today
        `);

        await notifyAdmin('📊 Daily Stats Report', stats.rows[0]);
    } catch (error) {
        logger.error('Daily stats report error:', error);
    }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ============================================
// SERVER START
// ============================================

app.listen(PORT, () => {
    logger.info(`🚀 Ergovia Lite Backend running on port ${PORT}`);
    logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
