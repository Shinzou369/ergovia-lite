/**
 * Fillup Form JavaScript
 * Handles the settings form — per-section save with immediate n8n sync
 */

let formData = {};
let teamMembers = [];

/**
 * Section-to-sync category map (mirrors server.js syncSections)
 * Each section only syncs its own category — no full-workflow rewrite.
 */
const SECTION_SYNC_MAP = {
    credentials: 'credentials',
    ai: 'system-prompt',
    owner: 'workflows',
    booking: 'booking-defaults',
    notifications: 'notifications',
    budget: 'budget',
    team: 'workflows',
    // media: no sync needed (no n8n workflows consume media links)
};

// Initialize form
document.addEventListener('DOMContentLoaded', async () => {
    await loadExistingSettings();
    setupFormListeners();
    setupPlatformToggle();
    loadDraft();
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
        setVal('ownerName', data.owner.name);
        setVal('ownerEmail', data.owner.email);
        setVal('ownerPhone', data.owner.phone);
        setVal('preferredPlatform', data.owner.platform);
        setVal('telegramChatId', data.owner.telegramChatId);
        setVal('whatsappNumber', data.owner.whatsappNumber);
    }

    // API Credentials
    if (data.credentials) {
        setVal('telegramBotToken', data.credentials.telegramBotToken);
        setVal('whatsappApiKey', data.credentials.whatsappApiKey);
        setVal('twilioAccountSid', data.credentials.twilioAccountSid);
        setVal('twilioAuthToken', data.credentials.twilioAuthToken);
        setVal('twilioPhoneNumber', data.credentials.twilioPhoneNumber);
    }

    // AI Assistant
    if (data.ai) {
        setVal('aiNotes', data.ai.aiNotes || data.ai.notes);
        setVal('pricingRules', data.ai.pricingRules);
        setVal('language', data.ai.language);
        setVal('aiModel', data.ai.aiModel);
        setCheckbox('autoReplyEnabled', data.ai.autoReplyEnabled !== false);
        if (data.ai.aiTemperature !== undefined) {
            setVal('aiTemperature', data.ai.aiTemperature);
            const tempLabel = document.getElementById('aiTempValue');
            if (tempLabel) tempLabel.textContent = data.ai.aiTemperature;
        }
    }

    // Fallback: load language from preferences if not in AI section
    if (data.preferences && !data.ai?.language) {
        setVal('language', data.preferences.language);
    }

    // Booking & Payment Defaults
    if (data.booking) {
        setVal('defaultCurrency', data.booking.defaultCurrency);
        setVal('defaultPaymentMethod', data.booking.defaultPaymentMethod);
        setVal('defaultCheckInTime', data.booking.defaultCheckInTime);
        setVal('defaultCheckOutTime', data.booking.defaultCheckOutTime);
        setVal('globalTimezone', data.booking.globalTimezone);
        setVal('minBookingLeadTime', data.booking.minBookingLeadTime);
        setVal('cancellationPolicy', data.booking.cancellationPolicy);
        setVal('competingOfferTimeout', data.booking.competingOfferTimeout);
        setVal('offerHoldDuration', data.booking.offerHoldDuration);
        setCheckbox('requirePaymentConfirmation', data.booking.requirePaymentConfirmation !== false);
        setVal('serviceFeePercent', data.booking.serviceFeePercent);
        setVal('weeklyDiscountPercent', data.booking.weeklyDiscountPercent);
    }

    // Fallback: load timezone/currency from preferences if not in booking section
    if (data.preferences && !data.booking?.globalTimezone) {
        setVal('globalTimezone', data.preferences.timezone);
    }
    if (data.preferences && !data.booking?.defaultCurrency) {
        setVal('defaultCurrency', data.preferences.currency);
    }
    if (data.preferences && !data.booking?.defaultPaymentMethod) {
        setVal('defaultPaymentMethod', data.preferences.paymentMethod);
    }

    // Notifications & Safety
    if (data.notifications) {
        setVal('emergencyContact1Name', data.notifications.emergencyContact1Name);
        setVal('emergencyContact1Phone', data.notifications.emergencyContact1Phone);
        setVal('emergencyContact2Name', data.notifications.emergencyContact2Name);
        setVal('emergencyContact2Phone', data.notifications.emergencyContact2Phone);
        setVal('guestScreeningDefault', data.notifications.guestScreeningDefault);
        setCheckbox('notifyOnNewBooking', data.notifications.notifyOnNewBooking !== false);
        setCheckbox('notifyOnCheckIn', data.notifications.notifyOnCheckIn !== false);
        setCheckbox('notifyOnCompetingOffer', data.notifications.notifyOnCompetingOffer !== false);
        setCheckbox('notifyDailyReport', data.notifications.notifyDailyReport !== false);
        setCheckbox('watchdogEnabled', data.notifications.watchdogEnabled !== false);
    }

    // Budget & Usage
    if (data.budget) {
        setVal('monthlyBudget', data.budget.monthlyBudget);
        setVal('fallbackMessage', data.budget.fallbackMessage);
        setCheckbox('budgetAlert50', data.budget.budgetAlert50 !== false);
        setCheckbox('budgetAlert80', data.budget.budgetAlert80 !== false);
        setCheckbox('budgetAlertLimit', data.budget.budgetAlertLimit !== false);
    }

    // Media
    if (data.media) {
        setVal('propertyPhotosLink', data.media.propertyPhotosLink || data.media.photosLink);
        setVal('propertyVideosLink', data.media.propertyVideosLink || data.media.videosLink);
        setVal('documentationLink', data.media.documentationLink);
    }

    // Team members
    if (data.team) {
        const members = Array.isArray(data.team) ? data.team : (data.team.members || []);
        if (members.length > 0) {
            teamMembers = members;
            renderTeamMembers();
        }
    }
}

// Helper: set input value if element exists and value is truthy
function setVal(id, value) {
    if (!value && value !== 0) return;
    const el = document.getElementById(id);
    if (el) el.value = value;
}

// Helper: set checkbox state
function setCheckbox(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
}

/**
 * Setup form input listeners for auto-draft
 */
function setupFormListeners() {
    const form = document.getElementById('fillupForm');
    if (!form) return;

    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            saveDraft();
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

        if (telegramGroup) telegramGroup.style.display = platform === 'telegram' ? 'block' : 'none';
        if (whatsappGroup) whatsappGroup.style.display = platform === 'whatsapp' ? 'block' : 'none';
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

    // Also save checkbox states (FormData doesn't include unchecked checkboxes)
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        draftData[cb.name] = cb.checked;
    });

    Utils.saveDraft(draftData);
}

/**
 * Load draft from localStorage
 */
function loadDraft() {
    const draft = Utils.loadDraft();
    if (!draft) return;

    Object.keys(draft).forEach(key => {
        const input = document.querySelector(`[name="${key}"]`);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = draft[key] === true || draft[key] === 'true';
            } else {
                input.value = draft[key];
            }
        }
    });
}

// ============================================
// SAVE & APPLY (per-section)
// ============================================

/**
 * Save a section and immediately sync to n8n workflows.
 * Button lifecycle: idle → Saving... → Syncing... → Saved & Applied! → idle
 */
async function saveSection(sectionName) {
    const btn = document.getElementById(`saveBtn-${sectionName}`);
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    const syncCategory = SECTION_SYNC_MAP[sectionName];
    const n8nConnected = typeof WorkflowSync !== 'undefined' && WorkflowSync.n8nConfigured;

    try {
        // Phase 1: Save to database
        setBtnState(btn, 'saving');
        const sectionData = getSectionData(sectionName);
        await Utils.post(CONFIG.API.SAVE_SETTINGS, {
            section: sectionName,
            data: sectionData
        });

        // Phase 2: Sync to n8n (if applicable and connected)
        if (syncCategory && n8nConnected) {
            setBtnState(btn, 'syncing');
            await WorkflowSync.syncByCategory(syncCategory);
            setBtnState(btn, 'success');
        } else {
            setBtnState(btn, 'saved-only');
        }

        // Phase 3: Revert button after 2s
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            btn.classList.remove('btn-state-success', 'btn-state-saved-only');
        }, 2000);

    } catch (error) {
        console.error(`Failed to save ${sectionName}:`, error);
        setBtnState(btn, 'error');
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            btn.classList.remove('btn-state-error');
        }, 2500);
    }
}

/**
 * Set visual button state during save/sync lifecycle
 */
function setBtnState(btn, state) {
    btn.disabled = true;
    btn.classList.remove('btn-state-saving', 'btn-state-syncing', 'btn-state-success', 'btn-state-saved-only', 'btn-state-error');

    switch (state) {
        case 'saving':
            btn.classList.add('btn-state-saving');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            break;
        case 'syncing':
            btn.classList.add('btn-state-syncing');
            btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Syncing to workflows...';
            break;
        case 'success':
            btn.classList.add('btn-state-success');
            btn.innerHTML = '<i class="fas fa-check"></i> Saved & Applied!';
            btn.disabled = false;
            break;
        case 'saved-only':
            btn.classList.add('btn-state-saved-only');
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            btn.disabled = false;
            break;
        case 'error':
            btn.classList.add('btn-state-error');
            btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed - try again';
            break;
    }
}

// ============================================
// SECTION DATA EXTRACTION
// ============================================

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
                whatsappApiKey: document.getElementById('whatsappApiKey').value,
                twilioAccountSid: document.getElementById('twilioAccountSid').value,
                twilioAuthToken: document.getElementById('twilioAuthToken').value,
                twilioPhoneNumber: document.getElementById('twilioPhoneNumber').value,
            };

        case 'ai':
            return {
                aiNotes: document.getElementById('aiNotes').value,
                pricingRules: document.getElementById('pricingRules').value,
                language: document.getElementById('language').value,
                aiModel: document.getElementById('aiModel').value,
                aiTemperature: document.getElementById('aiTemperature').value,
                autoReplyEnabled: document.getElementById('autoReplyEnabled').checked,
            };

        case 'booking':
            return {
                defaultCurrency: document.getElementById('defaultCurrency').value,
                defaultPaymentMethod: document.getElementById('defaultPaymentMethod').value,
                defaultCheckInTime: document.getElementById('defaultCheckInTime').value,
                defaultCheckOutTime: document.getElementById('defaultCheckOutTime').value,
                globalTimezone: document.getElementById('globalTimezone').value,
                minBookingLeadTime: document.getElementById('minBookingLeadTime').value,
                cancellationPolicy: document.getElementById('cancellationPolicy').value,
                competingOfferTimeout: document.getElementById('competingOfferTimeout').value,
                offerHoldDuration: document.getElementById('offerHoldDuration').value,
                requirePaymentConfirmation: document.getElementById('requirePaymentConfirmation').checked,
                serviceFeePercent: document.getElementById('serviceFeePercent').value,
                weeklyDiscountPercent: document.getElementById('weeklyDiscountPercent').value,
            };

        case 'notifications':
            return {
                emergencyContact1Name: document.getElementById('emergencyContact1Name').value,
                emergencyContact1Phone: document.getElementById('emergencyContact1Phone').value,
                emergencyContact2Name: document.getElementById('emergencyContact2Name').value,
                emergencyContact2Phone: document.getElementById('emergencyContact2Phone').value,
                notifyOnNewBooking: document.getElementById('notifyOnNewBooking').checked,
                notifyOnCheckIn: document.getElementById('notifyOnCheckIn').checked,
                notifyOnCompetingOffer: document.getElementById('notifyOnCompetingOffer').checked,
                notifyDailyReport: document.getElementById('notifyDailyReport').checked,
                guestScreeningDefault: document.getElementById('guestScreeningDefault').value,
                watchdogEnabled: document.getElementById('watchdogEnabled').checked,
            };

        case 'budget':
            return {
                monthlyBudget: document.getElementById('monthlyBudget').value,
                budgetAlert50: document.getElementById('budgetAlert50').checked,
                budgetAlert80: document.getElementById('budgetAlert80').checked,
                budgetAlertLimit: document.getElementById('budgetAlertLimit').checked,
                fallbackMessage: document.getElementById('fallbackMessage').value,
            };

        case 'team':
            return {
                members: teamMembers
            };

        case 'media':
            return {
                propertyPhotosLink: document.getElementById('propertyPhotosLink').value,
                propertyVideosLink: document.getElementById('propertyVideosLink').value,
                documentationLink: document.getElementById('documentationLink').value,
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
        ai: 'AI Assistant',
        booking: 'Booking & Payment Defaults',
        notifications: 'Notifications & Safety',
        budget: 'Budget & Usage',
        team: 'Team & Contacts',
        media: 'Media & Documentation',
    };
    return titles[sectionName] || sectionName;
}

// ============================================
// TEAM MEMBERS MANAGEMENT
// ============================================

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
        container.innerHTML = '<p style="color: var(--prestige-text-muted); text-align: center; padding: 20px;">No team members added yet</p>';
        return;
    }

    container.innerHTML = teamMembers.map((member, index) => `
        <div class="team-member-card">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <h4 style="margin:0;font-size:14px;color:var(--prestige-text-primary);">Team Member ${index + 1}</h4>
                <button type="button" class="btn-secondary" onclick="removeTeamMember(${member.id})"
                        style="padding: 6px 12px; font-size: 12px;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label><i class="fas fa-user"></i> Name <span class="required">*</span></label>
                    <input type="text" value="${member.name || ''}"
                           onchange="updateTeamMember(${member.id}, 'name', this.value)"
                           placeholder="John Doe">
                </div>

                <div class="form-group">
                    <label><i class="fas fa-briefcase"></i> Role <span class="required">*</span></label>
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
                    <label><i class="fas fa-phone"></i> Phone <span class="required">*</span></label>
                    <input type="tel" value="${member.phone || ''}"
                           onchange="updateTeamMember(${member.id}, 'phone', this.value)"
                           placeholder="+1234567890">
                </div>

                <div class="form-group">
                    <label><i class="fas fa-envelope"></i> Email</label>
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

// ============================================
// HELP MODALS
// ============================================

function showHelp(section) {
    const helpTexts = {
        owner: 'Enter your contact information. This is how the AI will reach you with important updates and questions.',
        credentials: 'These API keys allow your AI assistant to connect to messaging platforms. Telegram Bot Token is required. Twilio credentials are needed for WhatsApp and SMS.',
        ai: 'Control how your AI concierge behaves. Set the language, creativity level, model, and custom instructions. Changes sync directly to the live WF1 AI Gateway workflow.',
        booking: 'Set global booking and payment defaults. These are used by WF2 (Offer Conflict Manager) and WF4 (Payment Processor). Per-property overrides can be set on the Properties page.',
        notifications: 'Configure emergency contacts, notification preferences, and guest screening mode. Emergency contacts are used by WF8 for escalation. Notification toggles control what the SUB Notifier sends you.',
        budget: 'Set a monthly spending cap for AI API calls. The system will alert you at configurable thresholds and send a fallback message when the budget is exhausted.',
        team: 'Add people who help manage your properties. The AI will know who to contact for specific tasks like cleaning, maintenance, or key handoff.',
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
