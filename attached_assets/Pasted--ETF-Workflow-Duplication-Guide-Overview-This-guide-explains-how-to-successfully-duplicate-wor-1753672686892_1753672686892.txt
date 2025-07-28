
# ETF Workflow Duplication Guide

## Overview
This guide explains how to successfully duplicate workflows using the ETF (Exchange Traded Fund) setup after filling out the onboarding form.

## Prerequisites
- N8N instance running with API access
- Client onboarding server configured
- Template workflows created in N8N
- API key for N8N instance

## Step-by-Step Process

### 1. Template Workflow Setup

Before duplication can work, ensure your N8N instance has properly configured template workflows:

```
Template Naming Convention:
- End with "_TEMPLATE" or add "template" tag
- Use placeholders like {{CLIENT_NAME}}, {{CLIENT_EMAIL}}
- Example: "PET_CLINIC_TEMPLATE"
```

### 2. ETF Onboarding Form Completion

When filling out the ETF onboarding form:

**Required Fields:**
- Business Name: `{{CLIENT_NAME}}`
- Contact Email: `{{CLIENT_EMAIL}}`
- Phone Number: `{{CLIENT_PHONE}}`
- Business Type: Select appropriate type

**ETF-Specific Fields:**
- Workflow Type: Select "ETF" or "Multiple Workflows"
- Template Selection: Choose which template folder to duplicate
- Custom Fields: Any business-specific placeholders

### 3. Duplication Process

The system performs these steps automatically:

```javascript
// 1. Detects ETF setup request
const isETFSetup = clientData.workflowType === 'etf';

// 2. Calls folder duplication instead of single workflow
if (isETFSetup) {
    result = await duplicator.duplicateWorkflowFolder(
        'Business/Pet Clinics', // Folder path
        workflowClientData,
        { activate: true }
    );
}

// 3. Creates multiple personalized workflows
// 4. Organizes them into appropriate folders
// 5. Activates all workflows
```

### 4. What Gets Created

For an ETF setup, the system creates:
- **Multiple workflow instances** (not just one)
- **Personalized names**: "TEMPLATE_NAME - CLIENT_NAME"
- **Custom parameters** replaced with client data
- **Automatic folder organization**
- **All workflows activated** and ready to use

### 5. Verification Steps

After duplication, verify:

1. **Check N8N Dashboard**: See multiple new workflows
2. **Verify Names**: Should include client name
3. **Test Placeholders**: Ensure {{CLIENT_EMAIL}} became actual email
4. **Folder Organization**: Workflows in correct folders
5. **Activation Status**: All workflows should be active

## Transfer Package for Another Project

Here's what you need to transfer this functionality:

### Core Files to Copy

1. **Workflow Duplicator**: `tools/workflow-duplicator.js`
2. **Folder Manager**: `client-onboarding/server/folder-manager.js`
3. **Main Server**: `client-onboarding/server/app.js`
4. **Frontend Forms**: `client-onboarding/public/`

### Configuration Required

```javascript
// Environment variables needed
N8N_BASE_URL=https://your-n8n-instance.com
N8N_API_KEY=your-api-key
PORT=5000

// Template workflow IDs
const PET_CLINIC_TEMPLATE_ID = 'your-template-id';
```

### Installation Steps

1. **Copy core files** to new project
2. **Install dependencies**: `npm install axios express cors body-parser dotenv`
3. **Set environment variables**
4. **Configure template workflow IDs**
5. **Test with sample client data**

## Troubleshooting Common Issues

### Issue 1: Single Workflow Created Instead of Multiple
**Solution**: Ensure `workflowType: 'etf'` is set in form data

### Issue 2: Placeholders Not Replaced
**Solution**: Check template workflows have proper `{{PLACEHOLDER}}` format

### Issue 3: Workflows Not Activated
**Solution**: Verify N8N API key has activation permissions

### Issue 4: Folder Organization Fails
**Solution**: Check folder manager initialization and permissions

## Example ETF Client Data

```javascript
const etfClientData = {
    name: "Downtown Pet Clinic",
    email: "info@downtownpets.com",
    phone: "+1-555-PET-CARE",
    company: "Downtown Pet Clinic LLC",
    businessType: "Pet Clinic",
    workflowType: "etf", // Key for ETF setup
    multipleWorkflows: true,
    customFields: {
        '{{CLINIC_ADDRESS}}': '123 Main St, Downtown',
        '{{APPOINTMENT_URL}}': 'https://book.downtownpets.com',
        '{{BUSINESS_HOURS}}': 'Mon-Fri 8AM-6PM'
    }
};
```

## Success Indicators

A successful ETF duplication will show:
- ✅ Multiple workflows created (not just one)
- ✅ Client name in all workflow titles
- ✅ All placeholders replaced with actual data
- ✅ Workflows organized in appropriate folders
- ✅ All workflows activated and functional

## Next Steps After Successful Duplication

1. **Test workflows** with sample data
2. **Verify webhook URLs** are accessible
3. **Check email/SMS integrations** work
4. **Provide client** with workflow dashboard access
5. **Monitor workflow** performance and logs

This ETF setup allows you to deploy complete automation suites for clients in minutes instead of hours!
