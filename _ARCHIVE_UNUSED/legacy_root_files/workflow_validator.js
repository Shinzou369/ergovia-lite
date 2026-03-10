
// Workflow Template Variable Validator
// Validates that all required variables are provided before deployment

class WorkflowValidator {
  constructor() {
    this.requiredVariables = {
      // Core business variables (required for all workflows)
      core: [
        'CLINIC_NAME',
        'TIMEZONE', 
        'BUSINESS_EMAIL',
        'BUSINESS_PHONE_NUMBER'
      ],
      
      // Google Services
      google: [
        'GOOGLE_SHEETS_CREDENTIAL_ID',
        'APPOINTMENTS_SHEET_ID',
        'APPOINTMENTS_SHEET_NAME'
      ],
      
      // Communication services
      communication: [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN', 
        'TWILIO_PHONE_NUMBER',
        'SENDGRID_API_KEY'
      ],
      
      // AI and automation
      ai: [
        'OPENAI_API_KEY'
      ],
      
      // System integrations
      systems: [
        'BOOKING_SYSTEM_API_URL',
        'N8N_BASE_URL'
      ]
    };
  }

  // Extract all variables from a workflow template
  extractVariables(workflowJson) {
    const jsonString = JSON.stringify(workflowJson);
    const variableMatches = jsonString.match(/\{\{([A-Z_]+)\}\}/g);
    
    if (!variableMatches) return [];
    
    return [...new Set(variableMatches.map(match => 
      match.replace(/\{\{|\}\}/g, '')
    ))];
  }

  // Validate a workflow has all required variables
  validateWorkflow(workflowJson, providedConfig = {}) {
    const extractedVars = this.extractVariables(workflowJson);
    const missingVars = [];
    const warnings = [];

    // Check each extracted variable
    extractedVars.forEach(variable => {
      if (!providedConfig[variable.toLowerCase()]) {
        // Check if it's a critical variable
        const isCritical = [
          ...this.requiredVariables.core,
          ...this.requiredVariables.google
        ].includes(variable);

        if (isCritical) {
          missingVars.push(variable);
        } else {
          warnings.push(variable);
        }
      }
    });

    return {
      isValid: missingVars.length === 0,
      extractedVariables: extractedVars,
      missingRequired: missingVars,
      missingOptional: warnings,
      totalVariables: extractedVars.length
    };
  }

  // Generate configuration template for a workflow
  generateConfigTemplate(workflowJson) {
    const variables = this.extractVariables(workflowJson);
    const config = {};

    variables.forEach(variable => {
      const lowerVar = variable.toLowerCase();
      
      // Provide helpful placeholder values
      if (variable.includes('SHEET_ID')) {
        config[lowerVar] = 'your_google_sheet_id_here';
      } else if (variable.includes('EMAIL')) {
        config[lowerVar] = 'your_email@example.com';
      } else if (variable.includes('PHONE')) {
        config[lowerVar] = '+1234567890';
      } else if (variable.includes('API_KEY') || variable.includes('TOKEN')) {
        config[lowerVar] = 'your_api_key_here';
      } else if (variable === 'CLINIC_NAME') {
        config[lowerVar] = 'Your Clinic Name';
      } else if (variable === 'TIMEZONE') {
        config[lowerVar] = 'America/New_York';
      } else {
        config[lowerVar] = `your_${lowerVar}_here`;
      }
    });

    return config;
  }

  // Batch validate all workflow templates
  validateAllTemplates(templateDirectory = './workflow_templates/') {
    const fs = require('fs');
    const path = require('path');
    
    const results = {};
    
    try {
      const files = fs.readdirSync(templateDirectory)
        .filter(file => file.endsWith('.json'));

      files.forEach(filename => {
        const filePath = path.join(templateDirectory, filename);
        const workflowJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        results[filename] = this.validateWorkflow(workflowJson);
      });
      
      return results;
    } catch (error) {
      console.error('Error validating templates:', error);
      return {};
    }
  }

  // Generate deployment readiness report
  generateDeploymentReport(templateResults, clientConfig = {}) {
    let totalWorkflows = Object.keys(templateResults).length;
    let readyWorkflows = 0;
    let criticalIssues = 0;

    const report = {
      summary: {},
      workflows: {},
      recommendations: []
    };

    Object.entries(templateResults).forEach(([filename, validation]) => {
      const workflowName = filename.replace('_template.json', '');
      
      report.workflows[workflowName] = {
        status: validation.isValid ? 'READY' : 'MISSING_CONFIG',
        totalVariables: validation.totalVariables,
        missingRequired: validation.missingRequired,
        missingOptional: validation.missingOptional
      };

      if (validation.isValid) {
        readyWorkflows++;
      } else {
        criticalIssues += validation.missingRequired.length;
      }
    });

    report.summary = {
      totalWorkflows,
      readyWorkflows,
      readyPercentage: Math.round((readyWorkflows / totalWorkflows) * 100),
      criticalIssues
    };

    // Generate recommendations
    if (criticalIssues > 0) {
      report.recommendations.push('⚠️ Configure missing required variables before deployment');
      report.recommendations.push('📋 Use the Secrets tool to store API keys securely');
      report.recommendations.push('🔧 Test workflows individually after configuration');
    }

    return report;
  }
}

module.exports = WorkflowValidator;
