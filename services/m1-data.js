/**
 * M1 Data Service - Affiliate Marketing Data Layer
 *
 * All data lives in PostgreSQL (same DB as n8n workflows).
 * Tables: affiliates, affiliate_daily_content, niche_problems,
 *         ai_system_prompts, marketing_leads, lead_messages,
 *         closing_script_stages, closing_objections,
 *         scheduled_followups, marketing_error_log
 */

const { Pool } = require('pg');

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

// ─── Dashboard Stats ───

async function getDashboardStats() {
  try {
    const [affiliates, leads, content, errors] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active
        FROM affiliates`),
      pool.query(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE status = 'in_conversation') as in_conversation,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE status = 'closed_won') as closed_won,
        COUNT(*) FILTER (WHERE status = 'closed_lost' OR status = 'lost') as closed_lost,
        COALESCE(SUM(deal_value) FILTER (WHERE status = 'closed_won'), 0) as total_revenue
        FROM marketing_leads`),
      pool.query(`SELECT COUNT(*) as total FROM affiliate_daily_content`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'new') as unresolved FROM marketing_error_log`),
    ]);

    return {
      affiliates: affiliates.rows[0],
      leads: leads.rows[0],
      content: { total: parseInt(content.rows[0].total) },
      errors: { unresolved: parseInt(errors.rows[0].unresolved) },
    };
  } catch (err) {
    console.error('M1 getDashboardStats error:', err.message);
    return {
      affiliates: { total: 0, active: 0 },
      leads: { total: 0, new_leads: 0, in_conversation: 0, qualified: 0, closed_won: 0, closed_lost: 0, total_revenue: 0 },
      content: { total: 0 },
      errors: { unresolved: 0 },
    };
  }
}

// ─── Affiliates ───

async function getAffiliates() {
  const { rows } = await pool.query(
    'SELECT * FROM affiliates ORDER BY created_at DESC'
  );
  return rows;
}

async function getAffiliate(id) {
  const { rows } = await pool.query(
    'SELECT * FROM affiliates WHERE id = $1', [id]
  );
  return rows[0] || null;
}

async function createAffiliate(data) {
  const { rows } = await pool.query(`
    INSERT INTO affiliates (name, email, phone, telegram_chat_id, whatsapp_number,
      preferred_channel, assigned_niche, timezone, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    data.name, data.email || null, data.phone || null,
    data.telegram_chat_id || null, data.whatsapp_number || null,
    data.preferred_channel || 'telegram', data.assigned_niche || 'general',
    data.timezone || 'UTC', data.is_active !== false,
  ]);
  return rows[0];
}

async function updateAffiliate(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = ['name', 'email', 'phone', 'telegram_chat_id', 'whatsapp_number',
    'preferred_channel', 'assigned_niche', 'timezone', 'is_active',
    'post_1_send_time', 'post_2_send_time', 'post_3_send_time', 'reminder_time'];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE affiliates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deleteAffiliate(id) {
  const { rowCount } = await pool.query('DELETE FROM affiliates WHERE id = $1', [id]);
  return rowCount > 0;
}

// ─── AI System Prompts ───

async function getPrompts() {
  const { rows } = await pool.query(
    'SELECT * FROM ai_system_prompts ORDER BY id'
  );
  return rows;
}

async function updatePrompt(id, data) {
  const { rows } = await pool.query(`
    UPDATE ai_system_prompts
    SET prompt_name = COALESCE($1, prompt_name),
        system_prompt = COALESCE($2, system_prompt),
        niche = COALESCE($3, niche),
        is_active = COALESCE($4, is_active),
        version = version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `, [data.prompt_name || null, data.system_prompt || null,
      data.niche || null, data.is_active, id]);
  return rows[0] || null;
}

// ─── Closing Script Stages ───

async function getClosingStages() {
  const { rows } = await pool.query(
    'SELECT * FROM closing_script_stages ORDER BY stage_order'
  );
  return rows;
}

async function updateClosingStage(id, data) {
  const { rows } = await pool.query(`
    UPDATE closing_script_stages
    SET stage_name = COALESCE($1, stage_name),
        stage_description = COALESCE($2, stage_description),
        max_message_length = COALESCE($3, max_message_length),
        is_active = COALESCE($4, is_active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `, [data.stage_name || null, data.stage_description || null,
      data.max_message_length || null, data.is_active, id]);
  return rows[0] || null;
}

// ─── Closing Objections ───

async function getObjections() {
  const { rows } = await pool.query(
    'SELECT * FROM closing_objections ORDER BY id'
  );
  return rows;
}

async function updateObjection(id, data) {
  const { rows } = await pool.query(`
    UPDATE closing_objections
    SET response_strategy = COALESCE($1, response_strategy),
        response_template = COALESCE($2, response_template),
        follow_up_question = COALESCE($3, follow_up_question),
        max_attempts = COALESCE($4, max_attempts),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
  `, [data.response_strategy || null, data.response_template || null,
      data.follow_up_question || null, data.max_attempts || null,
      data.is_active, id]);
  return rows[0] || null;
}

// ─── Marketing Leads ───

async function getLeads(filters = {}) {
  let where = 'WHERE 1=1';
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    where += ` AND ml.status = $${params.length}`;
  }
  if (filters.affiliate_id) {
    params.push(filters.affiliate_id);
    where += ` AND ml.affiliate_id = $${params.length}`;
  }

  const { rows } = await pool.query(`
    SELECT ml.*, a.name as affiliate_name
    FROM marketing_leads ml
    LEFT JOIN affiliates a ON ml.affiliate_id = a.id
    ${where}
    ORDER BY ml.last_message_at DESC NULLS LAST, ml.created_at DESC
    LIMIT 100
  `, params);
  return rows;
}

async function getLead(id) {
  const { rows } = await pool.query(
    'SELECT * FROM marketing_leads WHERE id = $1', [id]
  );
  return rows[0] || null;
}

async function getLeadMessages(leadId) {
  const { rows } = await pool.query(`
    SELECT * FROM lead_messages
    WHERE lead_id = (SELECT lead_id FROM marketing_leads WHERE id = $1)
    ORDER BY created_at DESC
    LIMIT 50
  `, [leadId]);
  return rows;
}

// ─── Niche Problems ───

async function getNicheProblems() {
  const { rows } = await pool.query(
    'SELECT * FROM niche_problems ORDER BY niche, id'
  );
  return rows;
}

async function createNicheProblem(data) {
  const { rows } = await pool.query(`
    INSERT INTO niche_problems (niche, problem_title, problem_description, pain_level, keywords)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [data.niche, data.problem_title, data.problem_description || null,
      data.pain_level || 5, data.keywords || null]);
  return rows[0];
}

async function updateNicheProblem(id, data) {
  const { rows } = await pool.query(`
    UPDATE niche_problems
    SET problem_title = COALESCE($1, problem_title),
        problem_description = COALESCE($2, problem_description),
        pain_level = COALESCE($3, pain_level),
        active = COALESCE($4, active)
    WHERE id = $5
    RETURNING *
  `, [data.problem_title || null, data.problem_description || null,
      data.pain_level || null, data.active, id]);
  return rows[0] || null;
}

async function deleteNicheProblem(id) {
  const { rowCount } = await pool.query('DELETE FROM niche_problems WHERE id = $1', [id]);
  return rowCount > 0;
}

// ─── Error Log ───

async function getErrors(limit = 20) {
  const { rows } = await pool.query(
    'SELECT * FROM marketing_error_log ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

module.exports = {
  getDashboardStats,
  getAffiliates, getAffiliate, createAffiliate, updateAffiliate, deleteAffiliate,
  getPrompts, updatePrompt,
  getClosingStages, updateClosingStage,
  getObjections, updateObjection,
  getLeads, getLead, getLeadMessages,
  getNicheProblems, createNicheProblem, updateNicheProblem, deleteNicheProblem,
  getErrors,
};
