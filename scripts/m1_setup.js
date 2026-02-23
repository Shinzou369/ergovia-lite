/**
 * M1 Affiliate Marketing — Full Setup
 *
 * 1. Check/create all M1 database tables
 * 2. Seed initial data (ai_system_prompts, closing stages)
 * 3. Audit which workflows need credential swap
 */

const { Client } = require('pg');

const PG_CONFIG = {
  host: '116.203.115.12',
  port: 5432,
  database: 'ergovia_db',
  user: 'ergovia_user',
  password: 'ergovia_secure_2026'
};

async function main() {
  console.log('=== M1 Affiliate Marketing — Database Setup ===\n');

  const pg = new Client(PG_CONFIG);
  await pg.connect();
  console.log('Connected to PostgreSQL\n');

  // ─── 1. Check which M1 tables exist ───
  console.log('1. Checking existing tables...');
  const m1Tables = [
    'affiliates', 'affiliate_daily_content', 'niche_problems',
    'ai_system_prompts', 'marketing_leads', 'lead_messages',
    'closing_script_stages', 'closing_objections',
    'scheduled_followups', 'marketing_error_log'
  ];

  const existingRes = await pg.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = ANY($1)
  `, [m1Tables]);

  const existing = existingRes.rows.map(r => r.table_name);
  const missing = m1Tables.filter(t => !existing.includes(t));

  console.log(`  Existing: ${existing.join(', ') || 'none'}`);
  console.log(`  Missing:  ${missing.join(', ') || 'none'}\n`);

  // ─── 2. Create missing tables ───
  if (missing.length > 0) {
    console.log('2. Creating missing tables...\n');

    const schemas = {
      affiliates: `
        CREATE TABLE IF NOT EXISTS affiliates (
          id SERIAL PRIMARY KEY,
          affiliate_id VARCHAR(50) UNIQUE NOT NULL DEFAULT 'AFF-' || nextval('affiliates_id_seq')::text,
          name VARCHAR(255) NOT NULL,
          telegram_id VARCHAR(50),
          phone VARCHAR(50),
          email VARCHAR(255),
          niche VARCHAR(100),
          status VARCHAR(30) DEFAULT 'active',
          commission_rate DECIMAL(5,2) DEFAULT 10.00,
          total_leads INTEGER DEFAULT 0,
          total_conversions INTEGER DEFAULT 0,
          total_earnings DECIMAL(10,2) DEFAULT 0.00,
          preferred_channel VARCHAR(20) DEFAULT 'telegram',
          timezone VARCHAR(50) DEFAULT 'UTC',
          content_schedule_time TIME DEFAULT '09:00',
          reminder_time TIME DEFAULT '14:00',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_active_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      affiliate_daily_content: `
        CREATE TABLE IF NOT EXISTS affiliate_daily_content (
          id SERIAL PRIMARY KEY,
          affiliate_id VARCHAR(50) REFERENCES affiliates(affiliate_id),
          content_date DATE NOT NULL DEFAULT CURRENT_DATE,
          content_text TEXT NOT NULL,
          problems_used TEXT[],
          status VARCHAR(30) DEFAULT 'generated',
          sent_at TIMESTAMP,
          reminder_sent_at TIMESTAMP,
          posted_at TIMESTAMP,
          posted_proof TEXT,
          engagement_score INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(affiliate_id, content_date)
        )`,

      niche_problems: `
        CREATE TABLE IF NOT EXISTS niche_problems (
          id SERIAL PRIMARY KEY,
          niche VARCHAR(100) NOT NULL,
          problem_title VARCHAR(255) NOT NULL,
          problem_description TEXT,
          pain_level INTEGER DEFAULT 5 CHECK (pain_level BETWEEN 1 AND 10),
          keywords TEXT[],
          last_used_at TIMESTAMP,
          use_count INTEGER DEFAULT 0,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      ai_system_prompts: `
        CREATE TABLE IF NOT EXISTS ai_system_prompts (
          id SERIAL PRIMARY KEY,
          prompt_key VARCHAR(100) UNIQUE NOT NULL,
          prompt_name VARCHAR(255) NOT NULL,
          prompt_text TEXT NOT NULL,
          model VARCHAR(50) DEFAULT 'gpt-4o-mini',
          temperature DECIMAL(3,2) DEFAULT 0.7,
          max_tokens INTEGER DEFAULT 2000,
          active BOOLEAN DEFAULT true,
          version INTEGER DEFAULT 1,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      marketing_leads: `
        CREATE TABLE IF NOT EXISTS marketing_leads (
          id SERIAL PRIMARY KEY,
          lead_id VARCHAR(50) UNIQUE NOT NULL DEFAULT 'LEAD-' || nextval('marketing_leads_id_seq')::text,
          affiliate_id VARCHAR(50) REFERENCES affiliates(affiliate_id),
          name VARCHAR(255),
          phone VARCHAR(50),
          telegram_id VARCHAR(50),
          email VARCHAR(255),
          channel VARCHAR(20) DEFAULT 'telegram',
          status VARCHAR(30) DEFAULT 'new',
          closing_stage VARCHAR(50) DEFAULT 'intro',
          temperature VARCHAR(20) DEFAULT 'warm',
          objections_count INTEGER DEFAULT 0,
          last_message_at TIMESTAMP,
          last_followup_at TIMESTAMP,
          followup_count INTEGER DEFAULT 0,
          payment_link VARCHAR(500),
          payment_status VARCHAR(30),
          payment_amount DECIMAL(10,2),
          converted_at TIMESTAMP,
          source VARCHAR(100),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      lead_messages: `
        CREATE TABLE IF NOT EXISTS lead_messages (
          id SERIAL PRIMARY KEY,
          lead_id VARCHAR(50) REFERENCES marketing_leads(lead_id),
          direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
          channel VARCHAR(20),
          message_text TEXT NOT NULL,
          message_type VARCHAR(30) DEFAULT 'text',
          ai_generated BOOLEAN DEFAULT false,
          closing_stage VARCHAR(50),
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          delivered BOOLEAN DEFAULT true,
          metadata JSONB
        )`,

      closing_script_stages: `
        CREATE TABLE IF NOT EXISTS closing_script_stages (
          id SERIAL PRIMARY KEY,
          stage_key VARCHAR(50) UNIQUE NOT NULL,
          stage_name VARCHAR(100) NOT NULL,
          stage_order INTEGER NOT NULL,
          description TEXT,
          objective TEXT,
          sample_messages TEXT[],
          transition_triggers TEXT[],
          max_messages INTEGER DEFAULT 5,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      closing_objections: `
        CREATE TABLE IF NOT EXISTS closing_objections (
          id SERIAL PRIMARY KEY,
          objection_key VARCHAR(50) UNIQUE NOT NULL,
          objection_text TEXT NOT NULL,
          category VARCHAR(50),
          handler_response TEXT NOT NULL,
          follow_up TEXT,
          severity INTEGER DEFAULT 5 CHECK (severity BETWEEN 1 AND 10),
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      scheduled_followups: `
        CREATE TABLE IF NOT EXISTS scheduled_followups (
          id SERIAL PRIMARY KEY,
          lead_id VARCHAR(50) REFERENCES marketing_leads(lead_id),
          followup_type VARCHAR(30) NOT NULL,
          scheduled_at TIMESTAMP NOT NULL,
          sent_at TIMESTAMP,
          message_template TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          attempt_count INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          cancelled_at TIMESTAMP,
          cancel_reason VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

      marketing_error_log: `
        CREATE TABLE IF NOT EXISTS marketing_error_log (
          id SERIAL PRIMARY KEY,
          workflow_name VARCHAR(100),
          node_name VARCHAR(100),
          error_message TEXT,
          error_type VARCHAR(50),
          input_data JSONB,
          retry_count INTEGER DEFAULT 0,
          max_retries INTEGER DEFAULT 3,
          status VARCHAR(20) DEFAULT 'new',
          resolved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    };

    for (const table of missing) {
      if (schemas[table]) {
        try {
          await pg.query(schemas[table]);
          console.log(`  ✓ Created: ${table}`);
        } catch (err) {
          // Handle sequence issues for DEFAULT expressions
          if (err.message.includes('does not exist')) {
            // Create without the dynamic default
            const simpleSchema = schemas[table]
              .replace(/DEFAULT 'AFF-' \|\| nextval\([^)]+\)::text/, "DEFAULT 'AFF-' || currval('affiliates_id_seq')::text")
              .replace(/DEFAULT 'LEAD-' \|\| nextval\([^)]+\)::text/, "DEFAULT 'LEAD-' || currval('marketing_leads_id_seq')::text");
            try {
              await pg.query(simpleSchema);
              console.log(`  ✓ Created: ${table} (simplified default)`);
            } catch (err2) {
              console.log(`  ✗ ${table}: ${err2.message}`);
            }
          } else {
            console.log(`  ✗ ${table}: ${err.message}`);
          }
        }
      }
    }

    // Create indexes
    console.log('\n  Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status)',
      'CREATE INDEX IF NOT EXISTS idx_affiliates_telegram ON affiliates(telegram_id)',
      'CREATE INDEX IF NOT EXISTS idx_adc_affiliate_date ON affiliate_daily_content(affiliate_id, content_date)',
      'CREATE INDEX IF NOT EXISTS idx_adc_status ON affiliate_daily_content(status)',
      'CREATE INDEX IF NOT EXISTS idx_niche_problems_niche ON niche_problems(niche, active)',
      'CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON marketing_leads(status)',
      'CREATE INDEX IF NOT EXISTS idx_marketing_leads_affiliate ON marketing_leads(affiliate_id)',
      'CREATE INDEX IF NOT EXISTS idx_marketing_leads_telegram ON marketing_leads(telegram_id)',
      'CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id, sent_at)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_followups_due ON scheduled_followups(scheduled_at, status) WHERE status = \'pending\'',
      'CREATE INDEX IF NOT EXISTS idx_marketing_errors_status ON marketing_error_log(status)'
    ];

    for (const idx of indexes) {
      try {
        await pg.query(idx);
      } catch (e) {
        // Ignore if table doesn't exist yet
      }
    }
    console.log('  ✓ Indexes created');

    // Add updated_at triggers
    const triggerTables = ['affiliates', 'ai_system_prompts', 'marketing_leads'];
    for (const t of triggerTables) {
      try {
        await pg.query(`
          CREATE TRIGGER update_${t}_updated_at BEFORE UPDATE ON ${t}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        console.log(`  ✓ Trigger: update_${t}_updated_at`);
      } catch (e) {
        if (e.message.includes('already exists')) {
          console.log(`  - Trigger for ${t} already exists`);
        }
      }
    }
  }

  // ─── 3. Seed AI prompts if empty ───
  console.log('\n3. Seeding initial data...');

  const promptCount = await pg.query('SELECT COUNT(*) as c FROM ai_system_prompts');
  if (parseInt(promptCount.rows[0].c) === 0) {
    console.log('  Seeding AI system prompts...');
    await pg.query(`
      INSERT INTO ai_system_prompts (prompt_key, prompt_name, prompt_text, model, temperature) VALUES
      ('content_generator', 'Daily Content Generator',
       'You are a social media content creator for affiliate marketers. Given 3 problem topics in the {niche} niche, create an engaging social media post that:
- Hooks with a relatable problem statement
- Agitates the pain point
- Hints at a solution (without being salesy)
- Ends with a CTA to DM for more info
- Uses emojis naturally
- Keep it under 280 characters for story format, or 500 for feed posts
- Match the affiliate''s tone: casual, professional, or motivational

Problems to address:
{problems}

Affiliate name: {affiliate_name}
Platform: {platform}', 'gpt-4o-mini', 0.8),

      ('closing_doctor', 'Closing Doctor (Sales AI)',
       'You are a skilled sales closer having a natural conversation via chat. Your goal is to guide the lead toward purchasing the product/service.

Current stage: {stage}
Stage objective: {stage_objective}
Lead name: {lead_name}
Lead temperature: {temperature}
Objections so far: {objections_count}
Previous messages: {recent_messages}

Rules:
1. Be conversational and natural - never sound scripted
2. Ask questions to understand their situation
3. Use their pain points to show how the product helps
4. Handle objections empathetically
5. Never be pushy - build rapport first
6. Move naturally through stages: intro → problem → solution → offer → close
7. If they say "not interested", respect it but ask one clarifying question
8. When ready to close, transition smoothly to payment

Available objection handlers:
{objection_handlers}

Respond with your next message only. Keep it concise (1-3 sentences max).', 'gpt-4o-mini', 0.7),

      ('followup_generator', 'Follow-up Message Generator',
       'Generate a natural follow-up message for a lead who hasn''t responded.

Lead name: {lead_name}
Last message: {last_message}
Days since last contact: {days_silent}
Lead temperature: {temperature}
Closing stage: {stage}

Rules:
- Be casual and non-pushy
- Reference the previous conversation naturally
- Provide value (tip, insight, or question)
- Keep it to 1-2 sentences
- If 3+ days silent, try a different angle
- Never guilt-trip or use urgency tactics', 'gpt-4o-mini', 0.7)
    `);
    console.log('  ✓ 3 AI prompts seeded');
  } else {
    console.log(`  AI prompts already exist (${promptCount.rows[0].c} rows)`);
  }

  // Seed closing stages
  const stageCount = await pg.query('SELECT COUNT(*) as c FROM closing_script_stages');
  if (parseInt(stageCount.rows[0].c) === 0) {
    console.log('  Seeding closing script stages...');
    await pg.query(`
      INSERT INTO closing_script_stages (stage_key, stage_name, stage_order, objective, max_messages) VALUES
      ('intro', 'Introduction', 1, 'Build rapport, understand who they are', 3),
      ('problem', 'Problem Discovery', 2, 'Identify their pain points and current situation', 5),
      ('agitate', 'Agitate Pain', 3, 'Deepen understanding of consequences if they do nothing', 3),
      ('solution', 'Present Solution', 4, 'Show how your product/service solves their problem', 4),
      ('social_proof', 'Social Proof', 5, 'Share testimonials, results, case studies', 3),
      ('offer', 'Make the Offer', 6, 'Present pricing and packages clearly', 3),
      ('objection', 'Handle Objections', 7, 'Address concerns empathetically', 5),
      ('close', 'Close the Sale', 8, 'Secure commitment, send payment link', 3)
    `);
    console.log('  ✓ 8 closing stages seeded');
  } else {
    console.log(`  Closing stages already exist (${stageCount.rows[0].c} rows)`);
  }

  // Seed common objections
  const objCount = await pg.query('SELECT COUNT(*) as c FROM closing_objections');
  if (parseInt(objCount.rows[0].c) === 0) {
    console.log('  Seeding closing objections...');
    await pg.query(`
      INSERT INTO closing_objections (objection_key, objection_text, category, handler_response, severity) VALUES
      ('too_expensive', 'It''s too expensive / I can''t afford it', 'price',
       'I totally understand - it''s an investment. But let me ask: what''s it costing you right now NOT to solve this? Most of our clients found it paid for itself within the first month.', 7),
      ('need_to_think', 'I need to think about it', 'stall',
       'Of course, take your time! Quick question though - what specifically would you want to think about? Sometimes I can help clarify things right now.', 5),
      ('not_right_time', 'Not the right time / too busy', 'timing',
       'I hear you - everyone''s busy! That''s actually why this works so well - it saves you time. When would be a better time to chat for 5 minutes?', 6),
      ('need_to_ask', 'I need to ask my partner/spouse', 'authority',
       'That makes total sense! Would it help if I put together a quick summary you can share with them? What questions do you think they''d have?', 5),
      ('seen_before', 'I''ve tried something similar before', 'skepticism',
       'I appreciate the honesty! What didn''t work about the previous solution? Knowing that helps me explain exactly how this is different.', 6),
      ('not_interested', 'I''m not interested', 'rejection',
       'No problem at all! Before I go - just curious, what made you reach out initially? Sometimes there''s a different way I can help.', 8)
    `);
    console.log('  ✓ 6 objection handlers seeded');
  } else {
    console.log(`  Objections already exist (${objCount.rows[0].c} rows)`);
  }

  // ─── 4. Final verification ───
  console.log('\n4. Final verification...');
  for (const table of m1Tables) {
    const res = await pg.query(`
      SELECT COUNT(*) as c FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    const count = await pg.query(`SELECT COUNT(*) as c FROM ${table}`).catch(() => ({ rows: [{ c: '?' }] }));
    const exists = parseInt(res.rows[0].c) > 0;
    console.log(`  ${exists ? '✓' : '✗'} ${table} ${exists ? `(${count.rows[0].c} rows)` : 'MISSING'}`);
  }

  // ─── 5. List M1 workflows and their Telegram credential refs ───
  console.log('\n5. M1 Telegram credential references:');
  console.log('  All M1 workflows currently use: [Client] Telegram Bot (6ltptOrFLUaZzC1C)');
  console.log('  User will provide a SEPARATE bot credential for M1 marketing');
  console.log('  → Need to create new credential in n8n and swap in all 9 M1 workflows\n');

  await pg.end();
  console.log('=== M1 Database Setup Complete ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
