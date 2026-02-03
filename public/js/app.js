// ============================================
// ERGOVIA LITE - Frontend JavaScript
// ============================================

const API = {
  // Client data
  async getClient() {
    const res = await fetch('/api/client');
    return res.json();
  },

  async saveClientSection(section, data) {
    const res = await fetch(`/api/client/${section}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async saveAllClient(data) {
    const res = await fetch('/api/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async resetClient() {
    const res = await fetch('/api/client/reset', { method: 'POST' });
    return res.json();
  },

  // Deployment
  async getDeployment() {
    const res = await fetch('/api/deployment');
    return res.json();
  },

  async deploy() {
    const res = await fetch('/api/deploy', { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      console.error('Deployment failed:', data);
    }
    return data;
  },

  async undeploy() {
    const res = await fetch('/api/undeploy', { method: 'POST' });
    return res.json();
  },

  // Credentials
  async createCredentials() {
    const res = await fetch('/api/credentials/create', { method: 'POST' });
    return res.json();
  },

  async getCredentialsStatus() {
    const res = await fetch('/api/credentials/status');
    return res.json();
  },

  // Services (client-friendly view)
  async getServicesStatus() {
    const res = await fetch('/api/services/status');
    return res.json();
  },

  // Activity
  async getActivity(limit = 10) {
    const res = await fetch(`/api/activity?limit=${limit}`);
    return res.json();
  },

  // Status
  async getStatus() {
    const res = await fetch('/api/status');
    return res.json();
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;

  const container = document.querySelector('.container');
  if (container) {
    container.insertBefore(alertDiv, container.firstChild);
    setTimeout(() => alertDiv.remove(), 5000);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getFormData(formId) {
  const form = document.getElementById(formId);
  if (!form) return {};

  const formData = new FormData(form);
  const data = {};

  for (const [key, value] of formData.entries()) {
    // Handle array fields (like cleaners)
    if (key.endsWith('[]')) {
      const arrayKey = key.slice(0, -2);
      if (!data[arrayKey]) data[arrayKey] = [];
      data[arrayKey].push(value);
    } else {
      data[key] = value;
    }
  }

  // Special handling for platform checkboxes - store as enabledPlatforms array
  if (formId === 'step1-form') {
    const enabledPlatforms = [];
    if (form.querySelector('[name="hasTelegram"]')?.checked) enabledPlatforms.push('telegram');
    if (form.querySelector('[name="hasWhatsapp"]')?.checked) enabledPlatforms.push('whatsapp');
    if (form.querySelector('[name="hasSms"]')?.checked) enabledPlatforms.push('sms');
    data.enabledPlatforms = enabledPlatforms;

    // Clean up individual checkbox fields from data
    delete data.hasTelegram;
    delete data.hasWhatsapp;
    delete data.hasSms;
  }

  return data;
}

function populateForm(formId, data) {
  const form = document.getElementById(formId);
  if (!form || !data) return;

  for (const [key, value] of Object.entries(data)) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value || '';
      }
    }
  }

  // Special handling for enabledPlatforms array -> checkboxes
  if (formId === 'step1-form' && data.enabledPlatforms) {
    const platforms = data.enabledPlatforms;
    const telegramCb = form.querySelector('[name="hasTelegram"]');
    const whatsappCb = form.querySelector('[name="hasWhatsapp"]');
    const smsCb = form.querySelector('[name="hasSms"]');

    if (telegramCb) telegramCb.checked = platforms.includes('telegram');
    if (whatsappCb) whatsappCb.checked = platforms.includes('whatsapp');
    if (smsCb) smsCb.checked = platforms.includes('sms');
  }
}

// ============================================
// ONBOARDING WIZARD
// ============================================

class OnboardingWizard {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 5;
    this.data = {};
  }

  async init() {
    // Load existing data
    const result = await API.getClient();
    if (result.success && result.data) {
      this.data = result.data;
    }

    // Check which step to start from
    if (this.data.owner) this.currentStep = 2;
    if (this.data.property) this.currentStep = 3;
    if (this.data.guestAccess) this.currentStep = 4;
    if (this.data.calendars) this.currentStep = 5;

    this.render();
    this.bindEvents();
  }

  render() {
    this.updateStepIndicators();
    this.showCurrentStep();
    this.populateCurrentStep();

    // If on Step 5, update credential visibility based on Step 1 selections
    if (this.currentStep === 5) {
      this.updateCredentialSections();
    }
  }

  updateStepIndicators() {
    document.querySelectorAll('.step').forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'completed');

      if (stepNum < this.currentStep) {
        step.classList.add('completed');
      } else if (stepNum === this.currentStep) {
        step.classList.add('active');
      }
    });
  }

  showCurrentStep() {
    document.querySelectorAll('.step-content').forEach((content, index) => {
      content.classList.remove('active');
      if (index + 1 === this.currentStep) {
        content.classList.add('active');
      }
    });
  }

  populateCurrentStep() {
    const stepData = this.getStepData();
    if (stepData) {
      populateForm(`step${this.currentStep}-form`, stepData);
    }
  }

  getStepData() {
    const sections = ['owner', 'property', 'guestAccess', 'calendars', 'integrations'];
    return this.data[sections[this.currentStep - 1]];
  }

  bindEvents() {
    // Next buttons
    document.querySelectorAll('.btn-next').forEach(btn => {
      btn.addEventListener('click', () => this.nextStep());
    });

    // Previous buttons
    document.querySelectorAll('.btn-prev').forEach(btn => {
      btn.addEventListener('click', () => this.prevStep());
    });

    // Complete button
    const completeBtn = document.querySelector('.btn-complete');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => this.complete());
    }

    // Platform checkboxes - update primary dropdown when platforms change
    const platformCheckboxes = document.querySelectorAll('input[name^="has"]');
    platformCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.updatePrimaryPlatformOptions());
    });

    // Primary platform selection - show/hide conditional fields
    const primarySelect = document.getElementById('primaryPlatform');
    if (primarySelect) {
      primarySelect.addEventListener('change', (e) => {
        this.togglePlatformFields(e.target.value);
      });
    }

    // Initialize platform fields visibility
    this.updatePrimaryPlatformOptions();
    if (primarySelect) {
      this.togglePlatformFields(primarySelect.value);
    }
  }

  updatePrimaryPlatformOptions() {
    const primarySelect = document.getElementById('primaryPlatform');
    if (!primarySelect) return;

    const hasTelegram = document.querySelector('[name="hasTelegram"]')?.checked;
    const hasWhatsapp = document.querySelector('[name="hasWhatsapp"]')?.checked;
    const hasSms = document.querySelector('[name="hasSms"]')?.checked;

    // Get current selection
    const currentValue = primarySelect.value;

    // Update options based on checked platforms
    primarySelect.innerHTML = '';

    if (hasTelegram) {
      primarySelect.innerHTML += '<option value="telegram">Telegram</option>';
    }
    if (hasWhatsapp) {
      primarySelect.innerHTML += '<option value="whatsapp">WhatsApp</option>';
    }
    if (hasSms) {
      primarySelect.innerHTML += '<option value="sms">SMS</option>';
    }

    // Restore previous selection if still valid, otherwise use first option
    if (primarySelect.querySelector(`option[value="${currentValue}"]`)) {
      primarySelect.value = currentValue;
    }

    // Update conditional fields visibility
    this.togglePlatformFields(primarySelect.value);
  }

  togglePlatformFields(platform) {
    const telegramField = document.getElementById('telegram-field');
    const whatsappField = document.getElementById('whatsapp-field');

    // Show fields based on which platforms are enabled, not just primary
    const hasTelegram = document.querySelector('[name="hasTelegram"]')?.checked;
    const hasWhatsapp = document.querySelector('[name="hasWhatsapp"]')?.checked;

    if (telegramField) {
      telegramField.classList.toggle('hidden', !hasTelegram);
    }
    if (whatsappField) {
      whatsappField.classList.toggle('hidden', !hasWhatsapp);
    }
  }

  // Update credential sections in Step 5 based on platforms selected in Step 1
  updateCredentialSections() {
    // Get enabled platforms from saved data (Step 1)
    const enabledPlatforms = this.data.owner?.enabledPlatforms || [];

    const telegramCreds = document.getElementById('telegram-credentials');
    const whatsappCreds = document.getElementById('whatsapp-credentials');
    const twilioCreds = document.getElementById('twilio-credentials');
    const noPlatformsMsg = document.getElementById('no-platforms-message');

    const hasTelegram = enabledPlatforms.includes('telegram');
    const hasWhatsapp = enabledPlatforms.includes('whatsapp');
    const hasSms = enabledPlatforms.includes('sms');

    // Show/hide credential sections
    if (telegramCreds) {
      telegramCreds.classList.toggle('hidden', !hasTelegram);
    }
    if (whatsappCreds) {
      whatsappCreds.classList.toggle('hidden', !hasWhatsapp);
    }
    if (twilioCreds) {
      twilioCreds.classList.toggle('hidden', !hasSms);
    }

    // Show warning if no platforms selected
    if (noPlatformsMsg) {
      noPlatformsMsg.classList.toggle('hidden', hasTelegram || hasWhatsapp || hasSms);
    }
  }

  async saveCurrentStep() {
    const sections = ['owner', 'property', 'guestAccess', 'calendars', 'integrations'];
    const section = sections[this.currentStep - 1];
    const formData = getFormData(`step${this.currentStep}-form`);

    this.data[section] = formData;

    const result = await API.saveClientSection(section, formData);
    return result.success;
  }

  async nextStep() {
    if (await this.saveCurrentStep()) {
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
        this.render();
      }
    } else {
      showAlert('Failed to save. Please try again.', 'danger');
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.render();
    }
  }

  async complete() {
    if (await this.saveCurrentStep()) {
      showAlert('Onboarding complete!', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard.html';
      }, 1500);
    } else {
      showAlert('Failed to save. Please try again.', 'danger');
    }
  }
}

// ============================================
// DASHBOARD
// ============================================

class Dashboard {
  async init() {
    await this.loadStatus();
    await this.loadActivity();
    this.bindEvents();
  }

  async loadStatus() {
    const result = await API.getStatus();
    if (result.success) {
      const status = result.status;

      // Update stats
      const activeEl = document.getElementById('active-workflows');
      const totalEl = document.getElementById('total-workflows');
      const statusEl = document.getElementById('automation-status');
      const deployStatusEl = document.getElementById('deployment-status');
      const deployBtn = document.getElementById('deploy-btn');

      if (activeEl) activeEl.textContent = status.activeWorkflows;
      if (totalEl) totalEl.textContent = status.totalWorkflows || '25';

      // Update automation status badge
      if (statusEl) {
        const statusMap = {
          'connected': { text: 'Connected', class: 'badge-success' },
          'configured': { text: 'Ready', class: 'badge-success' },
          'not_configured': { text: 'Not Configured', class: 'badge-warning' },
          'error': { text: 'Error', class: 'badge-danger' }
        };
        const s = statusMap[status.automationStatus] || statusMap['not_configured'];
        statusEl.textContent = s.text;
        statusEl.className = 'badge ' + s.class;
      }

      // Update deployment status
      if (deployStatusEl) {
        const deployMap = {
          'deployed': { text: 'Deployed', class: 'badge-success' },
          'deploying': { text: 'Deploying...', class: 'badge-warning' },
          'not_deployed': { text: 'Not Deployed', class: 'badge-gray' },
          'failed': { text: 'Failed', class: 'badge-danger' }
        };
        const d = deployMap[status.deploymentStatus] || deployMap['not_deployed'];
        deployStatusEl.textContent = d.text;
        deployStatusEl.className = 'badge ' + d.class;
      }

      // Update deploy button
      if (deployBtn) {
        if (status.deploymentStatus === 'deployed') {
          deployBtn.textContent = 'Automations Active';
          deployBtn.className = 'btn btn-success btn-lg';
          deployBtn.disabled = true;
        } else if (status.deploymentStatus === 'deploying') {
          deployBtn.textContent = 'Deploying...';
          deployBtn.className = 'btn btn-secondary btn-lg';
          deployBtn.disabled = true;
        } else {
          deployBtn.textContent = 'Deploy Automations';
          deployBtn.className = 'btn btn-primary btn-lg';
          deployBtn.disabled = !status.onboardingComplete;
        }
      }

      // Update delete workflows button visibility
      const deleteBtn = document.getElementById('delete-workflows-btn');
      if (deleteBtn) {
        deleteBtn.style.display = status.deploymentStatus === 'deployed' ? 'block' : 'none';
      }
    }
  }

  async loadActivity() {
    const result = await API.getActivity(5);
    const list = document.getElementById('activity-list');
    if (!list || !result.success) return;

    if (result.activity.length === 0) {
      list.innerHTML = '<li class="activity-item"><p class="text-muted">No recent activity</p></li>';
      return;
    }

    list.innerHTML = result.activity.map(item => `
      <li class="activity-item">
        <div class="activity-icon">
          <span>${this.getActivityIcon(item.action)}</span>
        </div>
        <div class="activity-content">
          <p class="activity-text">${item.action.replace(/_/g, ' ')}</p>
          <p class="activity-time">${formatDate(item.created_at)}</p>
        </div>
      </li>
    `).join('');
  }

  getActivityIcon(action) {
    const icons = {
      'deployment_complete': '🚀',
      'workflows_updated': '🔄',
      'workflows_undeployed': '🗑️',
      'data_saved': '💾',
      'onboarding_completed': '🎉',
      'data_reset': '🔄',
      'apikey_added': '🔑'
    };
    return icons[action] || '•';
  }

  bindEvents() {
    // Deploy button
    const deployBtn = document.getElementById('deploy-btn');
    if (deployBtn) {
      deployBtn.addEventListener('click', async () => {
        deployBtn.disabled = true;
        deployBtn.textContent = 'Deploying...';

        const result = await API.deploy();

        if (result.success) {
          showAlert(result.message || 'Automations deployed successfully!', 'success');
          await this.loadStatus();
          await this.loadActivity();
        } else {
          showAlert(result.error || 'Deployment failed', 'danger');
          deployBtn.disabled = false;
          deployBtn.textContent = 'Deploy Automations';
        }
      });
    }

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all data? This will also remove all deployed automations.')) {
          const result = await API.resetClient();
          if (result.success) {
            showAlert('Data reset successfully', 'success');
            setTimeout(() => location.reload(), 1000);
          } else {
            showAlert('Reset failed', 'danger');
          }
        }
      });
    }

    // Delete workflows button
    const deleteBtn = document.getElementById('delete-workflows-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to DELETE all deployed workflows from n8n? This will stop all automations immediately.')) {
          return;
        }

        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';

        const result = await API.undeploy();

        if (result.success) {
          showAlert(result.message || 'All workflows deleted from n8n', 'success');
          await this.loadStatus();
          await this.loadActivity();
        } else {
          showAlert(result.error || 'Failed to delete workflows', 'danger');
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete All Workflows';
        }
      });
    }
  }
}

// ============================================
// AUTOMATIONS PAGE
// ============================================

class Automations {
  async init() {
    await this.loadCredentialsStatus();
    await this.loadDeployment();
    this.bindEvents();
  }

  async loadCredentialsStatus() {
    const result = await API.getCredentialsStatus();
    const container = document.getElementById('credentials-list');
    const countEl = document.getElementById('credentials-count');

    if (!container || !result.success) return;

    const { integrationStatus, storedCredentials, developerCredentials } = result;

    // Count created credentials
    const createdCount = storedCredentials.length;
    const enabledCount = Object.values(integrationStatus).filter(s => s.enabled).length;

    if (countEl) {
      countEl.textContent = `${createdCount} created / ${enabledCount} enabled`;
      countEl.className = `badge ${createdCount > 0 ? 'badge-success' : 'badge-warning'}`;
    }

    // Build credentials list
    let html = '<div class="grid grid-2">';

    // Client credentials (auto-created)
    html += '<div>';
    html += '<h4 class="mb-2">Client Credentials (Auto-created)</h4>';

    // Telegram
    const tgStatus = integrationStatus.telegram;
    const tgCred = storedCredentials.find(c => c.type === 'telegram');
    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">Telegram Bot</h4>
        <p class="service-desc">${tgStatus.enabled ? (tgStatus.hasToken ? (tgCred ? `Created: ${tgCred.credentialId}` : 'Token provided, not created yet') : 'Enabled but no token provided') : 'Not enabled in onboarding'}</p>
      </div>
      <span class="badge ${tgCred ? 'badge-success' : (tgStatus.enabled ? 'badge-warning' : 'badge-gray')}">${tgCred ? 'Created' : (tgStatus.enabled ? 'Pending' : 'Disabled')}</span>
    </div>`;

    // WhatsApp
    const waStatus = integrationStatus.whatsapp;
    const waCred = storedCredentials.find(c => c.type === 'whatsapp');
    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">WhatsApp Business</h4>
        <p class="service-desc">${waStatus.enabled ? (waStatus.hasToken ? (waCred ? `Created: ${waCred.credentialId}` : 'Token provided, not created yet') : 'Enabled but no token provided') : 'Not enabled in onboarding'}</p>
      </div>
      <span class="badge ${waCred ? 'badge-success' : (waStatus.enabled ? 'badge-warning' : 'badge-gray')}">${waCred ? 'Created' : (waStatus.enabled ? 'Pending' : 'Disabled')}</span>
    </div>`;

    // Twilio
    const twStatus = integrationStatus.twilio;
    const twCred = storedCredentials.find(c => c.type === 'twilio');
    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">Twilio SMS</h4>
        <p class="service-desc">${twStatus.enabled ? (twStatus.hasCredentials ? (twCred ? `Created: ${twCred.credentialId}` : 'Credentials provided, not created yet') : 'Enabled but no credentials provided') : 'Not enabled in onboarding'}</p>
      </div>
      <span class="badge ${twCred ? 'badge-success' : (twStatus.enabled ? 'badge-warning' : 'badge-gray')}">${twCred ? 'Created' : (twStatus.enabled ? 'Pending' : 'Disabled')}</span>
    </div>`;

    // OpenAI
    const oaiStatus = integrationStatus.openai || {};
    const oaiCred = storedCredentials.find(c => c.type === 'openai');
    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">OpenAI API</h4>
        <p class="service-desc">${oaiCred ? `Created: ${oaiCred.credentialId}` : (oaiStatus.hasAssignedKey ? 'Key assigned, not created yet' : (oaiStatus.availableInBank ? 'Key available in API Bank' : 'No keys in API Bank - add one in Admin'))}</p>
      </div>
      <span class="badge ${oaiCred ? 'badge-success' : (oaiStatus.hasAssignedKey || oaiStatus.availableInBank ? 'badge-warning' : 'badge-danger')}">${oaiCred ? 'Created' : (oaiStatus.hasAssignedKey || oaiStatus.availableInBank ? 'Pending' : 'No Key')}</span>
    </div>`;

    // PostgreSQL (auto-created from env)
    const pgStatus = integrationStatus.postgres || {};
    const pgCred = storedCredentials.find(c => c.type === 'postgres');
    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">PostgreSQL Database</h4>
        <p class="service-desc">${pgCred ? `Created: ${pgCred.credentialId}` : (pgStatus.isConfigured ? `Configured: ${pgStatus.host || 'Host set'}, not created yet` : 'Set POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD in environment')}</p>
      </div>
      <span class="badge ${pgCred ? 'badge-success' : (pgStatus.isConfigured ? 'badge-warning' : 'badge-danger')}">${pgCred ? 'Created' : (pgStatus.isConfigured ? 'Pending' : 'Not Set')}</span>
    </div>`;

    html += '</div>';

    // Developer credentials (manual - only email now)
    html += '<div>';
    html += '<h4 class="mb-2">Developer Credentials (Manual)</h4>';

    html += `<div class="service-item mb-2">
      <div class="service-info">
        <h4 class="service-name">Email SMTP</h4>
        <p class="service-desc">${developerCredentials.email ? 'Configured via N8N_EMAIL_CREDENTIAL_ID' : 'Set N8N_EMAIL_CREDENTIAL_ID (optional)'}</p>
      </div>
      <span class="badge ${developerCredentials.email ? 'badge-success' : 'badge-gray'}">${developerCredentials.email ? 'Configured' : 'Not Set'}</span>
    </div>`;

    html += '<p class="text-muted mt-2"><small>Note: PostgreSQL and OpenAI credentials are now auto-created from environment variables.</small></p>';

    html += '</div></div>';

    container.innerHTML = html;
  }

  async loadDeployment() {
    const result = await API.getDeployment();
    const container = document.getElementById('deployment-container');
    if (!container || !result.success) return;

    // Update summary
    const statusEl = document.getElementById('deploy-status-text');
    const countEl = document.getElementById('workflow-count');

    if (statusEl) {
      const statusMap = {
        'deployed': 'All automations are active and running',
        'deploying': 'Deployment in progress...',
        'not_deployed': 'Automations have not been deployed yet',
        'failed': 'Deployment failed - please try again'
      };
      statusEl.textContent = statusMap[result.status] || statusMap['not_deployed'];
    }

    if (countEl) {
      countEl.textContent = `${result.deployedCount} / ${result.totalCount || 25}`;
    }

    // Update workflow list
    const workflowList = document.getElementById('workflow-list');
    if (workflowList && result.workflows.length > 0) {
      // Group by trigger tag
      const grouped = {};
      for (const w of result.workflows) {
        const tag = w.triggerTag || 'Other';
        if (!grouped[tag]) grouped[tag] = [];
        grouped[tag].push(w);
      }

      workflowList.innerHTML = Object.entries(grouped).map(([tag, workflows]) => `
        <div class="workflow-group">
          <h4 class="workflow-group-title">
            <span class="badge badge-${this.getTagColor(tag)}">${tag}</span>
            <span class="workflow-group-count">${workflows.length} workflows</span>
          </h4>
          <ul class="workflow-items">
            ${workflows.map(w => `
              <li class="workflow-item">
                <span class="workflow-name">${w.name}</span>
                <span class="badge ${w.active ? 'badge-success' : 'badge-gray'}">${w.active ? 'Active' : 'Inactive'}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('');
    } else if (result.status === 'not_deployed') {
      workflowList.innerHTML = `
        <div class="text-center py-4">
          <p class="text-muted mb-3">No automations deployed yet.</p>
          <a href="/dashboard.html" class="btn btn-primary">Go to Dashboard to Deploy</a>
        </div>
      `;
    }

    // Update deploy/undeploy buttons
    const deployBtn = document.getElementById('deploy-all-btn');
    const undeployBtn = document.getElementById('undeploy-btn');

    if (deployBtn) {
      deployBtn.style.display = result.status === 'deployed' ? 'none' : 'inline-block';
    }
    if (undeployBtn) {
      undeployBtn.style.display = result.status === 'deployed' ? 'inline-block' : 'none';
    }
  }

  getTagColor(tag) {
    const colors = {
      'Webhook': 'info',
      'Scheduled': 'warning',
      'Message-Trigger': 'primary',
      'Event-Based': 'success',
      'Utility': 'gray'
    };
    return colors[tag] || 'gray';
  }

  bindEvents() {
    // Create Credentials button
    const createCredsBtn = document.getElementById('create-credentials-btn');
    if (createCredsBtn) {
      createCredsBtn.addEventListener('click', async () => {
        createCredsBtn.disabled = true;
        createCredsBtn.textContent = 'Creating...';

        const result = await API.createCredentials();

        if (result.success) {
          // Show success message
          showAlert(result.message || 'Credentials created in n8n!', 'success');

          // Show skipped credentials with reasons if any
          if (result.skippedCredentials && result.skippedCredentials.length > 0) {
            for (const skipped of result.skippedCredentials) {
              showAlert(`Skipped ${skipped.type}: ${skipped.reason}`, 'warning');
            }
          }

          await this.loadCredentialsStatus();
        } else {
          showAlert(result.error || 'Failed to create credentials', 'danger');
        }

        createCredsBtn.disabled = false;
        createCredsBtn.textContent = 'Create Credentials';
      });
    }

    // Deploy all button
    const deployBtn = document.getElementById('deploy-all-btn');
    if (deployBtn) {
      deployBtn.addEventListener('click', async () => {
        deployBtn.disabled = true;
        deployBtn.textContent = 'Deploying...';

        const result = await API.deploy();

        if (result.success) {
          showAlert(result.message || 'All automations deployed!', 'success');
          await this.loadCredentialsStatus();
          await this.loadDeployment();
        } else {
          showAlert(result.error || 'Deployment failed', 'danger');
        }

        deployBtn.disabled = false;
        deployBtn.textContent = 'Deploy All Automations';
      });
    }

    // Undeploy button
    const undeployBtn = document.getElementById('undeploy-btn');
    if (undeployBtn) {
      undeployBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to remove all automations? They will stop running immediately.')) {
          return;
        }

        undeployBtn.disabled = true;
        undeployBtn.textContent = 'Removing...';

        const result = await API.undeploy();

        if (result.success) {
          showAlert(result.message || 'All automations removed', 'success');
          await this.loadCredentialsStatus();
          await this.loadDeployment();
        } else {
          showAlert(result.error || 'Failed to remove automations', 'danger');
        }

        undeployBtn.disabled = false;
        undeployBtn.textContent = 'Remove All Automations';
      });
    }
  }
}

// ============================================
// SETTINGS PAGE
// ============================================

class Settings {
  async init() {
    await this.loadData();
    this.bindEvents();
  }

  async loadData() {
    const result = await API.getClient();
    if (result.success && result.data) {
      // Populate each section form
      populateForm('owner-form', result.data.owner);
      populateForm('property-form', result.data.property);
      populateForm('guestAccess-form', result.data.guestAccess);
      populateForm('calendars-form', result.data.calendars);
      populateForm('integrations-form', result.data.integrations);

      // Show deployment status
      if (result.deploymentStatus === 'deployed') {
        showAlert('Changes will automatically update all running automations', 'info');
      }
    }
  }

  bindEvents() {
    // Save buttons for each section
    document.querySelectorAll('.save-section-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const section = e.target.dataset.section;
        const formData = getFormData(`${section}-form`);

        btn.disabled = true;
        btn.textContent = 'Saving...';

        const result = await API.saveClientSection(section, formData);

        btn.disabled = false;
        btn.textContent = 'Save';

        if (result.success) {
          showAlert(`${section} settings saved. Automations updated.`, 'success');
        } else {
          showAlert('Failed to save settings', 'danger');
        }
      });
    });
  }
}

// ============================================
// PAGE INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  switch (page) {
    case 'onboarding':
      new OnboardingWizard().init();
      break;
    case 'dashboard':
      new Dashboard().init();
      break;
    case 'automations':
      new Automations().init();
      break;
    case 'settings':
      new Settings().init();
      break;
  }
});
