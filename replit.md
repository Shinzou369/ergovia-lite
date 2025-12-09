# Ergovia API Key Proxy Backend

## Project Overview
A secure API Key Proxy Backend that generates client-specific API keys and proxies requests to OpenAI. Designed for n8n compatibility and multi-tenant API key management.

## Architecture
- **Node.js/Express** server on port 5000
- **SQLite** database (`src/ergovia_proxy.sqlite`)
- **OpenAI SDK** for proxying requests

## File Structure
```
/src
  app.js          - Main Express server (entry point)
  keyManager.js   - API key generation/validation with SHA256 hashing
  usageLogger.js  - Token usage logging to SQLite
  openaiProxy.js  - OpenAI API proxy functions
```

## Environment Variables
- `OPENAI_API_KEY` - Master OpenAI API key (required)
- `PORT` - Server port (optional, defaults to 5000)

## API Endpoints

### Admin Endpoints (no auth required)
- `POST /admin/create-client` - Create client, returns `sk-ergovia-xxx` key
- `GET /admin/clients` - List all clients with usage totals
- `GET /admin/usage/:clientId` - Detailed usage logs for a client
- `POST /admin/reset-key` - Regenerate client API key
- `POST /admin/delete-client` - Delete a client

### OpenAI-Compatible Endpoints (require Bearer token)
- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions proxy

## Security
- API keys are NEVER stored in plain text
- Only SHA256 hash stored in database
- Keys prefixed with `sk-ergovia-` for identification

## Usage Tracking
- Per-request logging: clientId, model, tokens (prompt/completion/total)
- Client totals updated in real-time
- lastUsedAt timestamp tracking

## n8n Integration
Configure n8n OpenAI Chat Model Node with:
- API URL: Your Replit deployment URL
- API Key: Client's `sk-ergovia-xxx` key
