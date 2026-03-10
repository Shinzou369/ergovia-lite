/**
 * M1 Affiliate Marketing — Seed Initial Data
 *
 * Seeds empty tables with starter data:
 * - ai_system_prompts (content_generator, closing_doctor, followup_generator)
 * - closing_script_stages (8 stages)
 * - closing_objections (6 common handlers)
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
  console.log('=== M1 Seed Data ===\n');

  const pg = new Client(PG_CONFIG);
  await pg.connect();

  // ─── 1. AI System Prompts ───
  const promptCount = await pg.query('SELECT COUNT(*) as c FROM ai_system_prompts');
  if (parseInt(promptCount.rows[0].c) === 0) {
    console.log('Seeding ai_system_prompts...');
    // Actual columns: prompt_id, prompt_name, niche, system_prompt, version, is_active
    await pg.query(`
      INSERT INTO ai_system_prompts (prompt_id, prompt_name, niche, system_prompt, version, is_active) VALUES
      ('content_generator', 'Daily Content Generator', 'general',
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
Platform: {platform}', 1, true),

      ('closing_doctor', 'Closing Doctor (Sales AI)', 'general',
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
6. Move naturally through stages: intro > problem > solution > offer > close
7. If they say "not interested", respect it but ask one clarifying question
8. When ready to close, transition smoothly to payment

Available objection handlers:
{objection_handlers}

Respond with your next message only. Keep it concise (1-3 sentences max).', 1, true),

      ('followup_generator', 'Follow-up Message Generator', 'general',
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
- Never guilt-trip or use urgency tactics', 1, true)
    `);
    console.log('  + 3 AI prompts seeded');
  } else {
    console.log(`ai_system_prompts already has ${promptCount.rows[0].c} rows`);
  }

  // ─── 2. Closing Script Stages ───
  const stageCount = await pg.query('SELECT COUNT(*) as c FROM closing_script_stages');
  if (parseInt(stageCount.rows[0].c) === 0) {
    console.log('Seeding closing_script_stages...');
    // Actual columns: stage_id, niche, stage_name, stage_order, stage_description,
    //   do_guidelines (ARRAY), dont_guidelines (ARRAY), example_messages (ARRAY),
    //   response_format, max_message_length, next_stage_triggers (ARRAY),
    //   fallback_stage, requires_response, is_active
    await pg.query(`
      INSERT INTO closing_script_stages (stage_id, niche, stage_name, stage_order, stage_description, do_guidelines, dont_guidelines, example_messages, max_message_length, next_stage_triggers, fallback_stage, requires_response, is_active) VALUES
      ('intro', 'general', 'Introduction', 1, 'Build rapport, understand who they are',
       ARRAY['Be friendly and warm', 'Ask their name', 'Thank them for reaching out'],
       ARRAY['Dont pitch immediately', 'Dont ask too many questions at once'],
       ARRAY['Hey! Thanks for reaching out. What''s your name?', 'Hi there! I''d love to learn a bit about you first.'],
       300, ARRAY['name_given', 'business_mentioned'], 'intro', true, true),

      ('problem', 'general', 'Problem Discovery', 2, 'Identify their pain points and current situation',
       ARRAY['Ask about their current workflow', 'Listen actively', 'Identify 2-3 pain points'],
       ARRAY['Dont assume their problems', 'Dont rush to solution'],
       ARRAY['What''s the biggest challenge you face right now with managing your properties?', 'How are you currently handling guest inquiries?'],
       400, ARRAY['pain_point_identified', 'problem_described'], 'intro', true, true),

      ('agitate', 'general', 'Agitate Pain', 3, 'Deepen understanding of consequences if they do nothing',
       ARRAY['Quantify the cost of their problem', 'Ask about time wasted', 'Explore emotional impact'],
       ARRAY['Dont be manipulative', 'Dont exaggerate'],
       ARRAY['How much time would you say that eats up every week?', 'What happens when you miss a guest inquiry?'],
       350, ARRAY['impact_acknowledged', 'desire_for_change'], 'problem', true, true),

      ('solution', 'general', 'Present Solution', 4, 'Show how your product/service solves their specific problem',
       ARRAY['Map features to their pain points', 'Use their language', 'Show relevant examples'],
       ARRAY['Dont overwhelm with features', 'Dont use jargon'],
       ARRAY['Based on what you''re telling me, here''s how we handle that...', 'So the cool thing is, this automates exactly that part you mentioned.'],
       500, ARRAY['interest_shown', 'question_about_features'], 'problem', true, true),

      ('social_proof', 'general', 'Social Proof', 5, 'Share testimonials, results, case studies',
       ARRAY['Share relevant success stories', 'Use specific numbers', 'Match their situation'],
       ARRAY['Dont make unverifiable claims', 'Dont over-promise'],
       ARRAY['One of our clients with 5 properties saved about 20 hours a week.', 'Maria from Cancun was in a similar spot - she automated her whole guest communication flow.'],
       400, ARRAY['asks_about_pricing', 'ready_for_offer'], 'solution', true, true),

      ('offer', 'general', 'Make the Offer', 6, 'Present pricing and packages clearly',
       ARRAY['Be transparent about pricing', 'Highlight value vs cost', 'Offer clear next steps'],
       ARRAY['Dont be pushy', 'Dont hide costs'],
       ARRAY['So here''s how it works - the plan that matches what you need is...', 'The investment for this is X/month, and based on what you told me, that saves you Y.'],
       400, ARRAY['asks_to_proceed', 'price_accepted'], 'social_proof', true, true),

      ('objection', 'general', 'Handle Objections', 7, 'Address concerns empathetically',
       ARRAY['Acknowledge their concern', 'Ask clarifying questions', 'Provide honest answers'],
       ARRAY['Dont dismiss concerns', 'Dont pressure'],
       ARRAY['That''s a totally fair point. Let me address that...', 'I completely understand. Most people wonder the same thing.'],
       350, ARRAY['concern_resolved', 'ready_to_buy'], 'offer', true, true),

      ('close', 'general', 'Close the Sale', 8, 'Secure commitment, send payment link',
       ARRAY['Summarize the value', 'Make it easy to say yes', 'Provide payment link'],
       ARRAY['Dont add last-minute conditions', 'Dont create unnecessary urgency'],
       ARRAY['Great! I''ll send you the payment link right now.', 'Awesome - here''s the link to get started. Once you''re in, I''ll personally help you set everything up.'],
       300, ARRAY['payment_sent', 'deal_closed'], 'objection', false, true)
    `);
    console.log('  + 8 closing stages seeded');
  } else {
    console.log(`closing_script_stages already has ${stageCount.rows[0].c} rows`);
  }

  // ─── 3. Closing Objections ───
  const objCount = await pg.query('SELECT COUNT(*) as c FROM closing_objections');
  if (parseInt(objCount.rows[0].c) === 0) {
    console.log('Seeding closing_objections...');
    // Actual columns: objection_id, niche, objection_type, objection_category,
    //   detection_keywords (ARRAY), detection_phrases (ARRAY), response_strategy,
    //   response_template, follow_up_question, max_attempts, escalate_to, is_active
    await pg.query(`
      INSERT INTO closing_objections (objection_id, niche, objection_type, objection_category, detection_keywords, detection_phrases, response_strategy, response_template, follow_up_question, max_attempts, is_active) VALUES
      ('too_expensive', 'general', 'price', 'financial',
       ARRAY['expensive', 'costly', 'afford', 'budget', 'cheap', 'price'],
       ARRAY['too expensive', 'can''t afford', 'out of budget', 'too much money'],
       'Acknowledge the concern, then reframe as ROI. Quantify the cost of their current problem versus the solution.',
       'I totally understand - it''s an investment. But let me ask: what''s it costing you right now NOT to solve this? Most of our clients found it paid for itself within the first month.',
       'If it did pay for itself, would the price still be a concern?', 3, true),

      ('need_to_think', 'general', 'stall', 'decision',
       ARRAY['think', 'consider', 'decide', 'sleep on it', 'mull'],
       ARRAY['need to think', 'let me think', 'think about it', 'give me time'],
       'Respect their need for time but gently probe what specific concerns remain. Often "think about it" means there''s an unspoken objection.',
       'Of course, take your time! Quick question though - what specifically would you want to think about? Sometimes I can help clarify things right now.',
       'Is there a specific concern I haven''t addressed?', 2, true),

      ('not_right_time', 'general', 'timing', 'logistics',
       ARRAY['busy', 'time', 'later', 'month', 'quarter', 'season'],
       ARRAY['not the right time', 'too busy', 'maybe later', 'next month'],
       'Empathize with being busy, then reframe - the tool actually saves time. Offer a specific follow-up time.',
       'I hear you - everyone''s busy! That''s actually why this works so well - it saves you time. When would be a better time to chat for 5 minutes?',
       'What if I showed you how this saves 2+ hours per day?', 2, true),

      ('need_to_ask', 'general', 'authority', 'decision',
       ARRAY['partner', 'spouse', 'husband', 'wife', 'boss', 'team'],
       ARRAY['ask my partner', 'check with my', 'discuss with', 'need approval'],
       'Validate the need to consult. Offer materials to share. Try to stay involved in the decision.',
       'That makes total sense! Would it help if I put together a quick summary you can share with them? What questions do you think they''d have?',
       'Would it help if I joined a quick call with both of you?', 2, true),

      ('tried_before', 'general', 'skepticism', 'experience',
       ARRAY['tried', 'before', 'similar', 'failed', 'didn''t work', 'scam'],
       ARRAY['tried something similar', 'didn''t work', 'been burned', 'tried before'],
       'Show genuine interest in their past experience. Identify what went wrong and differentiate your solution.',
       'I appreciate the honesty! What didn''t work about the previous solution? Knowing that helps me explain exactly how this is different.',
       'What would need to be different this time for you to feel confident?', 3, true),

      ('not_interested', 'general', 'rejection', 'hard_no',
       ARRAY['not interested', 'no thanks', 'pass', 'no'],
       ARRAY['not interested', 'no thank you', 'I''ll pass', 'not for me'],
       'Respect their decision immediately. Ask one soft clarifying question to understand if there''s a misalignment.',
       'No problem at all! Before I go - just curious, what made you reach out initially? Sometimes there''s a different way I can help.',
       NULL, 1, true)
    `);
    console.log('  + 6 objection handlers seeded');
  } else {
    console.log(`closing_objections already has ${objCount.rows[0].c} rows`);
  }

  // ─── 4. Verify ───
  console.log('\nVerification:');
  const tables = ['ai_system_prompts', 'closing_script_stages', 'closing_objections'];
  for (const t of tables) {
    const r = await pg.query(`SELECT COUNT(*) as c FROM ${t}`);
    console.log(`  ${t}: ${r.rows[0].c} rows`);
  }

  await pg.end();
  console.log('\n=== M1 Seed Complete ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
