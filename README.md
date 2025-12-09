# Ergovia API Key Proxy Backend

A secure API Key Proxy Backend that provides OpenAI-compatible API access with client-specific API keys.

## Features

- Client-specific API keys (prefixed with `sk-ergovia-xxxxxx`)
- Secure API key storage (SHA256 hash only, never raw keys)
- Usage tracking per client (input/output tokens)
- Full OpenAI API compatibility for `/v1/chat/completions`
- Admin endpoints for client management
- Compatible with n8n OpenAI Chat Model Node

## Environment Variables

```
OPENAI_API_KEY=your-openai-api-key
PORT=5000 (optional, defaults to 5000)
```

## API Endpoints

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/create-client` | Create new client with API key |
| GET | `/admin/clients` | List all clients with usage |
| GET | `/admin/usage/:clientId` | Get detailed usage for client |
| POST | `/admin/reset-key` | Regenerate client API key |
| POST | `/admin/delete-client` | Delete a client |

### OpenAI-Compatible Endpoints (require API key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/models` | List available models |
| POST | `/v1/chat/completions` | Chat completions |

## Usage

### 1. Create a Client

```bash
curl -X POST http://localhost:5000/admin/create-client \
  -H "Content-Type: application/json" \
  -d '{"clientName": "My Client"}'
```

Response:
```json
{
  "clientId": "abc123",
  "apiKey": "sk-ergovia-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "clientName": "My Client"
}
```

### 2. Use the API Key

```bash
curl -X POST http://localhost:5000/v1/chat/completions \
  -H "Authorization: Bearer sk-ergovia-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 3. Check Usage

```bash
curl http://localhost:5000/admin/clients
```

## n8n Integration

Configure n8n OpenAI Chat Model Node:
- **API URL**: `https://your-replit-url.replit.dev`
- **API Key**: Your client's `sk-ergovia-xxxxx` key

## File Structure

```
/src
  app.js          - Main Express server
  keyManager.js   - API key generation and validation
  usageLogger.js  - Token usage logging
  openaiProxy.js  - OpenAI API proxy
```
