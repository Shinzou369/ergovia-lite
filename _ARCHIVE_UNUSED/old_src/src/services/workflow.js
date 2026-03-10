'use strict';

const { logger } = require('../lib/logger');

const PLACEHOLDERS = {
  '{{BUSINESS_NAME}}': (d) => d.business_name || d.clinic_name || d.name || '',
  '{{BUSINESS_EMAIL}}': (d) => d.business_email || d.clinic_email || d.email || '',
  '{{BUSINESS_PHONE}}': (d) => d.business_phone || d.clinic_phone || d.phone || '',
  '{{CLINIC_NAME}}': (d) => d.clinic_name || d.business_name || d.name || '',
  '{{CLINIC_PHONE}}': (d) => d.clinic_phone || d.business_phone || d.phone || '',
  '{{CLINIC_EMAIL}}': (d) => d.clinic_email || d.business_email || d.email || '',
  '{{CLIENT_NAME}}': (d) => d.name || '',
  '{{CLIENT_EMAIL}}': (d) => d.email || '',
  '{{CLIENT_PHONE}}': (d) => d.phone || '',
  '{{WEBSITE_URL}}': (d) => d.website_url || '',
  '{{BOOKING_URL}}': (d) => d.booking_url || '',
  '{{CALENDLY_URL}}': (d) => d.calendly_url || '',
  '{{EMERGENCY_CONTACT}}': (d) => d.emergency_contact || d.business_phone || '',
  '{{VETERINARIAN_NAMES}}': (d) => {
    const names = d.veterinarian_names ? d.veterinarian_names.split('\n').filter(Boolean) : [];
    return names.join(', ');
  },
  '{{PRIMARY_VETERINARIAN}}': (d) => {
    const names = d.veterinarian_names ? d.veterinarian_names.split('\n').filter(Boolean) : [];
    return d.primary_veterinarian || names[0] || '';
  },
  '{{TELEGRAM_BOT_TOKEN}}': () => '',
  '{{TELEGRAM_CHAT_ID}}': () => '',
};

function escapeRegExp(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function personalizeString(str, configData, clientData) {
  if (typeof str !== 'string') return str;

  const merged = { ...clientData, ...configData };
  let result = str;

  for (const [placeholder, resolver] of Object.entries(PLACEHOLDERS)) {
    const value = resolver(merged);
    if (value !== null && value !== undefined) {
      result = result.replace(new RegExp(escapeRegExp(placeholder), 'g'), value);
    }
  }

  return result;
}

function personalizeNodes(nodes, configData, clientData, idMappings = {}) {
  return nodes.map((node) => {
    const clone = JSON.parse(JSON.stringify(node));

    if (clone.parameters) {
      let paramStr = JSON.stringify(clone.parameters);

      // Replace cross-workflow ID references
      for (const [templateId, newId] of Object.entries(idMappings)) {
        paramStr = paramStr.replace(new RegExp(`"${escapeRegExp(templateId)}"`, 'g'), `"${newId}"`);
      }

      paramStr = personalizeString(paramStr, configData, clientData);
      clone.parameters = JSON.parse(paramStr);
    }

    if (clone.name) {
      clone.name = personalizeString(clone.name, configData, clientData);
    }

    return clone;
  });
}

async function deployWorkflows(n8nClient, workflowIds, configData, clientData) {
  const results = [];
  const errors = [];
  const idMappings = {};

  // Pass 1: Create base workflows to get new IDs
  for (const id of workflowIds) {
    try {
      const original = await n8nClient.getWorkflow(id);
      const newWorkflow = await n8nClient.createWorkflow({
        name: `[${clientData.name}] ${original.name}`,
        nodes: original.nodes || [],
        connections: original.connections || {},
        settings: original.settings || {},
        staticData: original.staticData || {},
      });

      idMappings[id] = newWorkflow.id;
      results.push({ originalId: id, newId: newWorkflow.id, name: newWorkflow.name, success: true });
      logger.info('Workflow created', { originalId: id, newId: newWorkflow.id });
    } catch (err) {
      errors.push({ originalId: id, error: err.message });
      logger.error('Workflow creation failed', { workflowId: id, error: err.message });
    }
  }

  // Pass 2: Update with personalized content and resolved dependencies
  for (const result of results) {
    if (!result.success) continue;
    try {
      const original = await n8nClient.getWorkflow(result.originalId);
      const nodes = personalizeNodes(original.nodes || [], configData, clientData, idMappings);

      await n8nClient.updateWorkflow(result.newId, {
        name: result.name,
        nodes,
        connections: original.connections || {},
        settings: original.settings || {},
        staticData: original.staticData || {},
      });

      // Attempt activation
      const canActivate = await n8nClient.canActivate(result.newId);
      if (canActivate) {
        try {
          await n8nClient.activateWorkflow(result.newId);
          result.activation = 'activated';
        } catch (actErr) {
          result.activation = actErr.message.includes('credentials') ? 'needs_credentials' : 'failed';
          result.activationError = actErr.message;
        }
      } else {
        result.activation = 'no_trigger';
      }
    } catch (err) {
      result.dependencyError = err.message;
      logger.error('Workflow update failed', { workflowId: result.newId, error: err.message });
    }
  }

  return { results, errors, idMappings };
}

function extractTaskforceType(name = '', tags = []) {
  const normalized = name.toLowerCase();
  const tagStr = tags.map((t) => (typeof t === 'string' ? t : t?.name || '')).join(' ').toLowerCase();
  const combined = `${normalized} ${tagStr}`;

  const types = [
    { match: /veterinar|pet|animal/, type: 'veterinary' },
    { match: /dental|clinic/, type: 'dental' },
    { match: /gym|fitness|workout/, type: 'gym' },
    { match: /contractor|hvac|plumb/, type: 'contractors' },
    { match: /tutor|education|academic/, type: 'tutoring' },
    { match: /massage|spa|wellness/, type: 'massage' },
  ];

  const found = types.find((t) => t.match.test(combined));
  return found ? found.type : 'general';
}

module.exports = { personalizeString, personalizeNodes, deployWorkflows, extractTaskforceType };
