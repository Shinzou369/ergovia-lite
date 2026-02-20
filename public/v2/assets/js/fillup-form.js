/**
 * Fillup Form JavaScript
 * Handles the comprehensive onboarding/settings form
 */

let formData = {};
let teamMembers = [];
let sectionsCompleted = {
    owner: false,
    credentials: false,
    budget: false,
    team: false,
    properties: false,
    ai: false,
    media: false,
};

// Initialize form
document.addEventListener('DOMContentLoaded', async () => {
    await loadExistingSettings();
    setupFormListeners();
    setupPlatformToggle();
    loadDraft();
    updateProgress();
});

/**
 * Load existing settings from backend
 */
async function loadExistingSettings() {
    try {
        const data = await Utils.apiCall(CONFIG.API.GET_SETTINGS);

        if (data.settings) {
            formData = data.settings;
            populateForm(formData);
            checkSectionsCompletion();
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

/**
 * Populate form with existing data
 */
function populateForm(data) {
    // Owner Information
    if (data.owner) {
        document.getElementById('ownerName').value = data.owner.name || '';
        document.getElementById('ownerEmail').value = data.owner.email || '';
        document.getElementById('ownerPhone').value = data.owner.phone || '';
        document.getElementById('preferredPlatform').value = data.owner.platform || '';

        if (data.owner.telegramChatId) {
            document.getElementById('telegramChatId').value = data.owner.telegramChatId;
        }
        if (data.owner.whatsappNumber) {
            document.getElementById('whatsappNumber').value = data.owner.whatsappNumber;
        }
    }

    // API Credentials (if pre-filled from Form A)
    if (data.credentials) {
        if (data.credentials.telegramBotToken) {
            document.getElementById('telegramBotToken').value = data.credentials.telegramBotToken;
        }
        if (data.credentials.openaiApiKey) {
            document.getElementById('openaiApiKey').value = data.credentials.openaiApiKey;
        }
        if (data.credentials.whatsappApiKey) {
            document.getElementById('whatsappApiKey').value = data.credentials.whatsappApiKey;
        }
        if (data.credentials.twilioAccountSid) {
            document.getElementById('twilioAccountSid').value = data.credentials.twilioAccountSid;
        }
        if (data.credentials.twilioAuthToken) {
            document.getElementById('twilioAuthToken').value = data.credentials.twilioAuthToken;
        }
        if (data.credentials.twilioPhoneNumber) {
            document.getElementById('twilioPhoneNumber').value = data.credentials.twilioPhoneNumber;
        }
    }

    // Budget
    if (data.budget) {
        if (data.budget.monthlyBudget) {
            document.getElementById('monthlyBudget').value = data.budget.monthlyBudget;
        }
    }

    // AI Configuration
    if (data.ai) {
        document.getElementById('aiNotes').value = data.ai.notes || '';
        document.getElementById('pricingRules').value = data.ai.pricingRules || '';
    }

    // Media
    if (data.media) {
        document.getElementById('propertyPhotosLink').value = data.media.photosLink || '';
        document.getElementById('propertyVideosLink').value = data.media.videosLink || '';
        document.getElementById('documentationLink').value = data.media.documentationLink || '';
    }

    // Preferences
    if (data.preferences) {
        if (data.preferences.language) {
            const el = document.getElementById('language');
            if (el) el.value = data.preferences.language;
        }
        if (data.preferences.timezone) {
            const el = document.getElementById('globalTimezone');
            if (el) el.value = data.preferences.timezone;
        }
        if (data.preferences.currency) {
            const el = document.getElementById('currency');
            if (el) el.value = data.preferences.currency;
        }
        if (data.preferences.paymentMethod) {
            const el = document.getElementById('paymentMethod');
            if (el) el.value = data.preferences.paymentMethod;
        }
    }

    // Team members
    if (data.team && data.team.length > 0) {
        teamMembers = data.team;
        renderTeamMembers();
    }
}

/**
 * Setup form input listeners for auto-save
 */
function setupFormListeners() {
    const form = document.getElementById('fillupForm');
    if (!form) return;

    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
        input.addEventListener('change', () => {
            saveDraft();
            checkSectionsCompletion();
            updateProgress();
        });
    });
}

/**
 * Setup platform toggle (show/hide fields based on selection)
 */
function setupPlatformToggle() {
    const platformSelect = document.getElementById('preferredPlatform');
    if (!platformSelect) return;

    platformSelect.addEventListener('change', (e) => {
        const platform = e.target.value;

        const telegramGroup = document.getElementById('telegramChatIdGroup');
        const whatsappGroup = document.getElementById('whatsappNumberGroup');

        telegramGroup.style.display = platform === 'telegram' ? 'block' : 'none';
        whatsappGroup.style.display = platform === 'whatsapp' ? 'block' : 'none';
    });

    // Trigger initial state
    platformSelect.dispatchEvent(new Event('change'));
}

/**
 * Save form draft to localStorage
 */
function saveDraft() {
    const form = document.getElementById('fillupForm');
    if (!form) return;

    const formDataObj = new FormData(form);
    const draftData = {};

    for (const [key, value] of formDataObj.entries()) {
        draftData[key] = value;
    }

    Utils.saveDraft(draftData);
}

/**
 * Load draft from localStorage
 */
function loadDraft() {
    const draft = Utils.loadDraft();
    if (!draft) return;

    // Populate form with draft data
    Object.keys(draft).forEach(key => {
        const input = document.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = draft[key];
        }
    });
}

/**
 * Save specific section
 */
async function saveSection(sectionName) {
    try {
        const sectionData = getSectionData(sectionName);

        const result = await Utils.apiCall(CONFIG.API.SAVE_SETTINGS, {
            section: sectionName,
            data: sectionData
        });

        Utils.showToast(`${getSectionTitle(sectionName)} saved!`, 'success');
        sectionsCompleted[sectionName] = true;
        updateProgress();

        // Trigger sync banner if this change affects live workflows
        if (result && result.needsSync && typeof WorkflowSync !== 'undefined') {
            WorkflowSync.markNeedsSync(result.syncCategory);
        }

    } catch (error) {
        console.error('Failed to save section:', error);
        Utils.showToast('Failed to save section', 'error');
    }
}

/**
 * Get data for a specific section
 */
function getSectionData(sectionName) {
    switch (sectionName) {
        case 'owner':
            return {
                name: document.getElementById('ownerName').value,
                email: document.getElementById('ownerEmail').value,
                phone: document.getElementById('ownerPhone').value,
                platform: document.getElementById('preferredPlatform').value,
                telegramChatId: document.getElementById('telegramChatId').value,
                whatsappNumber: document.getElementById('whatsappNumber').value,
            };

        case 'credentials':
            return {
                telegramBotToken: document.getElementById('telegramBotToken').value,
                openaiApiKey: document.getElementById('openaiApiKey').value,
                whatsappApiKey: document.getElementById('whatsappApiKey').value,
                twilioAccountSid: document.getElementById('twilioAccountSid').value,
                twilioAuthToken: document.getElementById('twilioAuthToken').value,
                twilioPhoneNumber: document.getElementById('twilioPhoneNumber').value,
            };

        case 'budget':
            return {
                monthlyBudget: parseFloat(document.getElementById('monthlyBudget').value) || 50,
            };

        case 'team':
            return {
                members: teamMembers
            };

        case 'ai':
            return {
                notes: document.getElementById('aiNotes').value,
                pricingRules: document.getElementById('pricingRules').value,
            };

        case 'media':
            return {
                photosLink: document.getElementById('propertyPhotosLink').value,
                videosLink: document.getElementById('propertyVideosLink').value,
                documentationLink: document.getElementById('documentationLink').value,
            };

        case 'preferences':
            return {
                language: document.getElementById('language').value,
                timezone: document.getElementById('globalTimezone').value,
                currency: document.getElementById('currency').value,
                paymentMethod: document.getElementById('paymentMethod').value,
            };

        default:
            return {};
    }
}

/**
 * Get section title
 */
function getSectionTitle(sectionName) {
    const titles = {
        owner: 'Owner Information',
        credentials: 'API Credentials',
        budget: 'Monthly AI Budget',
        team: 'Team & Contacts',
        properties: 'Property Details',
        ai: 'AI Assistant Notes',
        media: 'Photos & Videos',
        preferences: 'Preferences',
    };
    return titles[sectionName] || sectionName;
}

/**
 * Check which sections are completed
 */
function checkSectionsCompletion() {
    // Owner section
    sectionsCompleted.owner =
        document.getElementById('ownerName').value &&
        document.getElementById('ownerEmail').value &&
        document.getElementById('ownerPhone').value &&
        document.getElementById('preferredPlatform').value;

    // Credentials section (only Telegram Bot Token is required)
    sectionsCompleted.credentials =
        !!document.getElementById('telegramBotToken').value;

    // Budget section (always considered complete since it has a default)
    sectionsCompleted.budget = true;

    // Team section (optional, so mark as complete if at least attempted)
    sectionsCompleted.team = true;

    // Properties (check if they have at least one property)
    // This would be checked from backend
    sectionsCompleted.properties = true; // Will be updated from properties page

    // AI section (optional)
    sectionsCompleted.ai = true;

    // Media section (optional)
    sectionsCompleted.media = true;

    // Enable activate button if minimum required sections are complete
    const activateBtn = document.getElementById('activateBtn');
    const completionRequirement = document.getElementById('completionRequirement');

    const requiredComplete = sectionsCompleted.owner && sectionsCompleted.credentials;

    if (activateBtn) {
        activateBtn.disabled = !requiredComplete;
    }

    if (completionRequirement) {
        if (requiredComplete) {
            completionRequirement.innerHTML = `
                <i class="fas fa-check-circle"></i>
                All required sections completed! Ready to activate.
            `;
            completionRequirement.style.color = 'var(--success-green)';
        } else {
            completionRequirement.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                Please complete all required sections before activating
            `;
            completionRequirement.style.color = 'var(--text-gray)';
        }
    }
}

/**
 * Update progress bar
 */
function updateProgress() {
    const totalSections = Object.keys(sectionsCompleted).length;
    const completedCount = Object.values(sectionsCompleted).filter(v => v).length;
    const percentage = Math.round((completedCount / totalSections) * 100);

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    if (progressText) {
        progressText.textContent = `${percentage}% Complete`;
    }
}

/**
 * Handle form submission (Activate button)
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const activateBtn = document.getElementById('activateBtn');
    if (activateBtn.disabled) {
        Utils.showToast('Please complete all required sections', 'warning');
        return false;
    }

    // Show loading modal
    showLoadingModal();

    try {
        // Gather all form data
        const allData = {
            owner: getSectionData('owner'),
            credentials: getSectionData('credentials'),
            budget: getSectionData('budget'),
            team: getSectionData('team'),
            ai: getSectionData('ai'),
            media: getSectionData('media'),
        };

        // Call activation endpoint
        const response = await Utils.apiCall(CONFIG.API.ACTIVATE_WORKFLOWS, allData);

        // Simulate progress updates
        updateActivationProgress(20, 'Provisioning server...');
        await delay(2000);

        updateActivationProgress(40, 'Setting up workflows...');
        await delay(2000);

        updateActivationProgress(60, 'Configuring credentials...');
        await delay(2000);

        updateActivationProgress(80, 'Deploying AI assistant...');
        await delay(2000);

        updateActivationProgress(100, 'Complete!');
        await delay(1000);

        // Clear draft
        Utils.clearDraft();

        // Show success
        hideLoadingModal();
        Utils.showToast('AI Assistant activated successfully!', 'success');

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (error) {
        console.error('Activation failed:', error);
        hideLoadingModal();
        Utils.showToast('Activation failed. Please try again.', 'error');
    }

    return false;
}

/**
 * Show loading modal
 */
function showLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
}

/**
 * Hide loading modal
 */
function hideLoadingModal() {
    const modal = document.getElementById('loadingModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Update activation progress
 */
function updateActivationProgress(percentage, status) {
    const progressFill = document.getElementById('activationProgress');
    const statusText = document.getElementById('activationStatus');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    if (statusText) {
        statusText.textContent = status;
    }
}

/**
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Team Members Management
 */
function addTeamMember() {
    const member = {
        id: Date.now(),
        name: '',
        role: '',
        phone: '',
        email: '',
    };

    teamMembers.push(member);
    renderTeamMembers();
}

function removeTeamMember(memberId) {
    teamMembers = teamMembers.filter(m => m.id !== memberId);
    renderTeamMembers();
    saveDraft();
}

function renderTeamMembers() {
    const container = document.getElementById('teamMembersContainer');
    if (!container) return;

    if (teamMembers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-gray); text-align: center; padding: 20px;">No team members added yet</p>';
        return;
    }

    container.innerHTML = teamMembers.map((member, index) => `
        <div class="form-section" style="background-color: white; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                <h4>Team Member ${index + 1}</h4>
                <button type="button" class="btn-secondary" onclick="removeTeamMember(${member.id})"
                        style="padding: 8px 16px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label>
                        <i class="fas fa-user"></i> Name
                        <span class="required">*</span>
                    </label>
                    <input type="text" value="${member.name || ''}"
                           onchange="updateTeamMember(${member.id}, 'name', this.value)"
                           placeholder="John Doe">
                </div>

                <div class="form-group">
                    <label>
                        <i class="fas fa-briefcase"></i> Role
                        <span class="required">*</span>
                    </label>
                    <select onchange="updateTeamMember(${member.id}, 'role', this.value)">
                        <option value="">Select role...</option>
                        <option value="cleaner" ${member.role === 'cleaner' ? 'selected' : ''}>Cleaner</option>
                        <option value="maintenance" ${member.role === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                        <option value="on_ground" ${member.role === 'on_ground' ? 'selected' : ''}>On-Ground Contact</option>
                        <option value="assistant" ${member.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                        <option value="other" ${member.role === 'other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>
                        <i class="fas fa-phone"></i> Phone
                        <span class="required">*</span>
                    </label>
                    <input type="tel" value="${member.phone || ''}"
                           onchange="updateTeamMember(${member.id}, 'phone', this.value)"
                           placeholder="+1234567890">
                </div>

                <div class="form-group">
                    <label>
                        <i class="fas fa-envelope"></i> Email
                    </label>
                    <input type="email" value="${member.email || ''}"
                           onchange="updateTeamMember(${member.id}, 'email', this.value)"
                           placeholder="email@example.com">
                </div>
            </div>
        </div>
    `).join('');
}

function updateTeamMember(memberId, field, value) {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) {
        member[field] = value;
        saveDraft();
    }
}

/**
 * Help modals
 */
function showHelp(section) {
    const helpTexts = {
        owner: 'Enter your contact information. This is how the AI will reach you with important updates and questions.',
        credentials: 'These API keys allow your AI assistant to connect to messaging platforms. Telegram Bot Token is required. Twilio credentials are needed for WhatsApp and SMS.',
        budget: 'Set a monthly spending cap for AI API calls. The system will alert you at 50% and 80% usage, and send a polite fallback message when the budget is exhausted.',
        team: 'Add people who help manage your properties. The AI will know who to contact for specific tasks like cleaning or maintenance.',
        properties: 'Add details about your properties on the Properties page. The AI needs this information to manage bookings and answer guest questions.',
        ai: 'Share any special rules, preferences, or information that your AI assistant should know. This helps it make better decisions on your behalf.',
        media: 'Provide Google Drive links to folders containing photos and videos. The AI can share these with potential guests when they ask.',
    };

    alert(helpTexts[section] || 'Help information');
}

function showCredentialHelp(service) {
    const helpUrls = {
        telegram: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
        twilio: 'https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account',
    };

    if (helpUrls[service]) {
        window.open(helpUrls[service], '_blank');
    }
}

function showTelegramHelp() {
    alert('To find your Telegram Chat ID:\n\n1. Start a chat with @userinfobot\n2. Send any message\n3. The bot will reply with your Chat ID\n4. Copy that number here');
}
