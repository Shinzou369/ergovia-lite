
# ETF Workflow Duplication - Transfer Package

## What This Package Contains

This is a complete transfer package for implementing ETF (multi-workflow) duplication functionality in another project.

## Package Contents

```
TRANSFER-PACKAGE/
├── core/
│   ├── workflow-duplicator.js     # Main duplication engine
│   ├── folder-manager.js          # Workflow organization
│   └── etf-handler.js            # ETF-specific logic
├── server/
│   ├── routes.js                 # API endpoints
│   └── middleware.js             # Request handling
├── frontend/
│   ├── etf-form.html            # Client onboarding form
│   └── etf-form.js              # Form logic
├── config/
│   ├── env-template.txt         # Environment variables
│   └── setup-guide.md           # Installation guide
└── examples/
    ├── sample-client-data.js    # Example implementations
    └── test-duplication.js      # Testing script
```

## Quick Integration Steps

1. **Copy core files** to your project
2. **Install dependencies**: `npm install axios express cors dotenv`
3. **Configure environment** using `config/env-template.txt`
4. **Add routes** from `server/routes.js` to your main server
5. **Test with examples** in `examples/` folder

## Key Features Included

- ✅ **Multi-workflow duplication** (ETF setup)
- ✅ **Automatic placeholder replacement**
- ✅ **Folder organization system**
- ✅ **Client data validation**
- ✅ **Workflow activation**
- ✅ **Error handling and logging**

## Environment Setup

```bash
# Required environment variables
N8N_BASE_URL=https://your-n8n-instance.com
N8N_API_KEY=your-n8n-api-key
PORT=5000

# Optional customization
TEMPLATE_FOLDER_PATH=Templates/Your-Category
DEFAULT_CLIENT_FOLDER=Clients/Your-Clients
```

## Usage Example

```javascript
const ETFDuplicator = require('./core/workflow-duplicator');

const duplicator = new ETFDuplicator({
    baseURL: process.env.N8N_BASE_URL,
    apiKey: process.env.N8N_API_KEY
});

// ETF duplication
const result = await duplicator.duplicateWorkflowFolder(
    'Templates/Pet-Clinic',
    clientData,
    { activate: true }
);
```

This package gives you everything needed to implement the ETF workflow duplication system in any Node.js project!
