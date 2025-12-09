require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const { 
  initializeClientTable, 
  createClient, 
  validateApiKey, 
  getAllClients, 
  getClientById,
  resetClientKey, 
  deleteClient,
  updateClientUsage 
} = require('./keyManager');

const { 
  initializeUsageTable, 
  logUsage, 
  getClientUsageLogs,
  getUsageSummary 
} = require('./usageLogger');

const { 
  initializeOpenAI, 
  proxyChatCompletion, 
  getModels 
} = require('./openaiProxy');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.set('trust proxy', 1);

let db;

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'ergovia_proxy.sqlite'), async (err) => {
      if (err) {
        console.error('Database connection error:', err.message);
        reject(err);
        return;
      }

      console.log('Connected to SQLite database');

      try {
        await initializeClientTable(db);
        await initializeUsageTable(db);
        console.log('Database tables initialized');
        resolve(db);
      } catch (initErr) {
        reject(initErr);
      }
    });
  });
}

function apiKeyMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: { 
        message: 'Invalid API Key',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      } 
    });
  }

  const apiKey = authHeader.substring(7);

  validateApiKey(db, apiKey)
    .then(client => {
      if (!client) {
        return res.status(401).json({ 
          error: { 
            message: 'Invalid API Key',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          } 
        });
      }

      req.client = client;
      next();
    })
    .catch(err => {
      console.error('API key validation error:', err);
      res.status(500).json({ 
        error: { 
          message: 'Internal server error',
          type: 'api_error'
        } 
      });
    });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/admin/create-client', async (req, res) => {
  try {
    const { clientName } = req.body;

    if (!clientName || typeof clientName !== 'string' || clientName.trim() === '') {
      return res.status(400).json({ error: 'clientName is required' });
    }

    const result = await createClient(db, clientName.trim());

    res.status(201).json({
      clientId: result.clientId,
      apiKey: result.apiKey,
      clientName: result.clientName
    });
  } catch (err) {
    console.error('Error creating client:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.get('/admin/clients', async (req, res) => {
  try {
    const clients = await getAllClients(db);
    res.json({ clients });
  } catch (err) {
    console.error('Error getting clients:', err);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

app.get('/admin/usage/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await getClientById(db, clientId);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const logs = await getClientUsageLogs(db, clientId);
    const summary = await getUsageSummary(db, clientId);

    res.json({
      client,
      summary,
      logs
    });
  } catch (err) {
    console.error('Error getting usage:', err);
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});

app.post('/admin/reset-key', async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const result = await resetClientKey(db, clientId);

    res.json({
      clientId: result.clientId,
      apiKey: result.apiKey,
      message: 'API key has been reset. Old key is now invalid.'
    });
  } catch (err) {
    console.error('Error resetting key:', err);
    if (err.message === 'Client not found') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(500).json({ error: 'Failed to reset key' });
  }
});

app.post('/admin/delete-client', async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    await deleteClient(db, clientId);

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (err) {
    console.error('Error deleting client:', err);
    if (err.message === 'Client not found') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

app.get('/v1/models', apiKeyMiddleware, (req, res) => {
  res.json(getModels());
});

app.post('/v1/chat/completions', apiKeyMiddleware, async (req, res) => {
  try {
    const { messages, model, stream } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
          code: 'invalid_messages'
        }
      });
    }

    console.log(`[${req.client.clientId}] Proxying chat completion request - model: ${model || 'default'}, stream: ${!!stream}`);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = await proxyChatCompletion(req.body, true);

      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for await (const chunk of streamResponse) {
        if (chunk.usage) {
          totalPromptTokens = chunk.usage.prompt_tokens || 0;
          totalCompletionTokens = chunk.usage.completion_tokens || 0;
        }

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();

      if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
        await updateClientUsage(db, req.client.clientId, totalPromptTokens, totalCompletionTokens);
        await logUsage(db, req.client.clientId, model || 'unknown', totalPromptTokens, totalCompletionTokens);
        console.log(`[${req.client.clientId}] Streaming completed - tokens: ${totalPromptTokens + totalCompletionTokens}`);
      }
    } else {
      const response = await proxyChatCompletion(req.body, false);

      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      await updateClientUsage(db, req.client.clientId, usage.prompt_tokens, usage.completion_tokens);
      await logUsage(db, req.client.clientId, response.model || model || 'unknown', usage.prompt_tokens, usage.completion_tokens);

      console.log(`[${req.client.clientId}] Request completed - tokens: ${usage.total_tokens}`);

      res.json(response);
    }
  } catch (err) {
    console.error('OpenAI proxy error:', err);

    if (err.status) {
      return res.status(err.status).json({
        error: {
          message: err.message,
          type: err.type || 'api_error',
          code: err.code
        }
      });
    }

    res.status(500).json({
      error: {
        message: 'An error occurred while processing your request',
        type: 'api_error'
      }
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      type: 'invalid_request_error',
      code: 'not_found'
    }
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'api_error'
    }
  });
});

async function startServer() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('ERROR: OPENAI_API_KEY environment variable is required');
      process.exit(1);
    }

    await initializeDatabase();

    initializeOpenAI(process.env.OPENAI_API_KEY);
    console.log('OpenAI client initialized');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Ergovia API Proxy Server running on port ${PORT}`);
      console.log('Endpoints available:');
      console.log('  POST /admin/create-client - Create new client API key');
      console.log('  GET  /admin/clients - List all clients');
      console.log('  GET  /admin/usage/:clientId - Get client usage');
      console.log('  POST /admin/reset-key - Reset client API key');
      console.log('  POST /admin/delete-client - Delete a client');
      console.log('  GET  /v1/models - List available models (requires API key)');
      console.log('  POST /v1/chat/completions - Chat completions (requires API key)');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
