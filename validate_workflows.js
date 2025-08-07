
// Quick workflow template validation script
const WorkflowValidator = require('./workflow_validator');
const fs = require('fs');
const path = require('path');

async function validateCurrentTemplates() {
  const validator = new WorkflowValidator();
  
  console.log('🔍 Validating Pet Clinic Workflow Templates...\n');
  
  const templateResults = validator.validateAllTemplates('./workflow_templates/');
  const report = validator.generateDeploymentReport(templateResults);
  
  console.log('📊 VALIDATION SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total Workflows: ${report.summary.totalWorkflows}`);
  console.log(`Ready for Deployment: ${report.summary.readyWorkflows}`);
  console.log(`Deployment Readiness: ${report.summary.readyPercentage}%`);
  console.log(`Critical Issues: ${report.summary.criticalIssues}\n`);
  
  console.log('📋 WORKFLOW STATUS');
  console.log('=' .repeat(50));
  
  Object.entries(report.workflows).forEach(([name, status]) => {
    const statusIcon = status.status === 'READY' ? '✅' : '⚠️';
    console.log(`${statusIcon} ${name}`);
    console.log(`   Variables: ${status.totalVariables}`);
    
    if (status.missingRequired.length > 0) {
      console.log(`   ❌ Missing Required: ${status.missingRequired.join(', ')}`);
    }
    
    if (status.missingOptional.length > 0) {
      console.log(`   ⚡ Optional: ${status.missingOptional.join(', ')}`);
    }
    console.log('');
  });
  
  if (report.recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS');
    console.log('=' .repeat(50));
    report.recommendations.forEach(rec => console.log(rec));
  }
  
  // Generate a sample config for the most common variables
  console.log('\n🔧 SAMPLE CONFIGURATION TEMPLATE');
  console.log('=' .repeat(50));
  
  // Get most common variables across all templates
  const allVariables = new Set();
  Object.values(templateResults).forEach(result => {
    result.extractedVariables.forEach(variable => allVariables.add(variable));
  });
  
  const sampleConfig = {};
  [...allVariables].sort().forEach(variable => {
    const lowerVar = variable.toLowerCase();
    if (variable.includes('SHEET_ID')) {
      sampleConfig[lowerVar] = 'your_google_sheet_id_here';
    } else if (variable.includes('EMAIL')) {
      sampleConfig[lowerVar] = 'clinic@example.com';
    } else if (variable.includes('PHONE')) {
      sampleConfig[lowerVar] = '+1234567890';
    } else if (variable.includes('API_KEY') || variable.includes('TOKEN')) {
      sampleConfig[lowerVar] = 'your_api_key_here';
    } else if (variable === 'CLINIC_NAME') {
      sampleConfig[lowerVar] = 'Happy Paws Veterinary Clinic';
    } else if (variable === 'TIMEZONE') {
      sampleConfig[lowerVar] = 'America/New_York';
    } else {
      sampleConfig[lowerVar] = `your_${lowerVar}_here`;
    }
  });
  
  console.log('Copy this template to your client configuration:');
  console.log(JSON.stringify(sampleConfig, null, 2));
}

// Run validation if called directly
if (require.main === module) {
  validateCurrentTemplates().catch(console.error);
}

module.exports = { validateCurrentTemplates };
