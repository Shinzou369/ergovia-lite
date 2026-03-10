'use strict';

const { Router } = require('express');
const OpenAI = require('openai');
const { logger } = require('../lib/logger');
const { requireAuth } = require('../middleware/auth');

function createChatRoutes({ config }) {
  const router = Router();
  const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

  router.post('/', requireAuth, async (req, res) => {
    if (!openai) return res.status(503).json({ success: false, error: { code: 'AI_DISABLED', message: 'OpenAI not configured' } });

    try {
      const { message, model = 'gpt-4o-mini', thread_id } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_MESSAGE', message: 'Message is required' } });
      }

      const userEmail = req.session.user?.email || 'anonymous';
      logger.debug('Chat request', { user: userEmail, model, threadId: thread_id });

      const systemPrompt = buildSystemPrompt(req.session.user);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      const completion = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: 4000,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content || '';

      res.json({
        success: true,
        data: {
          reply,
          model,
          usage: completion.usage,
        },
      });
    } catch (err) {
      logger.error('Chat completion failed', { error: err.message });
      res.status(500).json({ success: false, error: { code: 'CHAT_ERROR', message: 'Chat request failed' } });
    }
  });

  return router;
}

function buildSystemPrompt(user) {
  const name = user?.name || 'there';
  return `You are a helpful AI assistant for business automation. You help users manage their workflows, understand their data, and optimize their operations. Be concise and actionable. The user's name is ${name}.`;
}

module.exports = { createChatRoutes };
