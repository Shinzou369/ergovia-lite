/**
 * Workflow Sync Module - V2 Premium Dashboard
 * Handles syncing control panel changes to live n8n workflows
 */

const WorkflowSync = {
    // State
    needsSync: false,
    syncCategories: new Set(),
    isSyncing: false,

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.loadSyncStatus();
        this.renderSyncBanner();
        this.setupSystemPromptEditor();
    },

    // ============================================
    // SYNC STATUS
    // ============================================

    async loadSyncStatus() {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_STATUS}`);
            const result = await response.json();
            if (result.success) {
                this.lastSync = result.lastSync;
                this.deployedCount = result.deployedCount;
                this.n8nConfigured = result.n8nConfigured;

                // Populate system prompt editor if data exists
                if (result.systemPrompt) {
                    const promptEl = document.getElementById('systemPromptEditor');
                    const rulesEl = document.getElementById('pricingRulesEditor');
                    if (promptEl && !promptEl.value) {
                        promptEl.value = result.systemPrompt.systemPrompt || '';
                    }
                    if (rulesEl && !rulesEl.value) {
                        rulesEl.value = result.systemPrompt.pricingRules || '';
                    }
                }

                this.updateSyncStatusDisplay();
            }
        } catch (err) {
            console.error('[sync] Failed to load sync status:', err);
        }
    },

    updateSyncStatusDisplay() {
        const statusEl = document.getElementById('syncLastStatus');
        const countEl = document.getElementById('syncWorkflowCount');
        const banner = document.getElementById('syncBanner');

        if (statusEl) {
            if (!this.n8nConfigured) {
                statusEl.innerHTML = '<span style="color: #e74c3c;">n8n not configured</span>';
            } else if (this.deployedCount > 0) {
                const syncText = this.lastSync ? `Last synced ${this.timeAgo(new Date(this.lastSync.at))}` : 'Never synced';
                statusEl.innerHTML = `<span style="color: #42b72a;"><i class="fas fa-check-circle"></i> ${this.deployedCount} workflows connected</span> &middot; <span style="color: #8b8d91;">${syncText}</span>`;
            } else {
                statusEl.innerHTML = '<span style="color: #8b8d91;">Never synced</span>';
            }
        }

        if (countEl) {
            if (this.deployedCount > 0) {
                countEl.innerHTML = '';
            } else if (this.n8nConfigured) {
                countEl.innerHTML = `<span style="color: #ff9800;">No workflows linked</span>`;
            }
        }

        // Show import banner when n8n is configured but no workflows are registered
        if (this.n8nConfigured && this.deployedCount === 0 && banner) {
            banner.style.display = 'flex';
            banner.innerHTML = `
                <div style="flex: 1;">
                    <strong><i class="fas fa-exclamation-triangle"></i> No workflows connected</strong>
                    <div style="opacity: 0.85; margin-top: 4px; font-size: 13px;">Import your live n8n workflows to enable settings sync</div>
                </div>
                <button onclick="WorkflowSync.importLiveWorkflows()" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;">
                    <i class="fas fa-download"></i> Import from n8n
                </button>
            `;
        }
    },

    // ============================================
    // IMPORT LIVE WORKFLOWS
    // ============================================

    async importLiveWorkflows() {
        try {
            this.showToast('Importing workflows from n8n...', 'info');
            const response = await fetch(`${CONFIG.API.BASE_URL}/sync/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Import failed');

            this.deployedCount = result.imported;
            this.showToast(`Imported ${result.imported} workflows from n8n!`, 'success');
            this.updateSyncStatusDisplay();
        } catch (err) {
            this.showToast(`Import failed: ${err.message}`, 'error');
        }
    },

    // ============================================
    // SYNC BANNER (shows when changes need sync)
    // ============================================

    markNeedsSync(category) {
        this.needsSync = true;
        this.syncCategories.add(category);
        this.renderSyncBanner();
    },

    clearNeedsSync() {
        this.needsSync = false;
        this.syncCategories.clear();
        this.renderSyncBanner();
    },

    renderSyncBanner() {
        let banner = document.getElementById('syncBanner');
        if (!banner) return;

        if (!this.needsSync) {
            banner.style.display = 'none';
            return;
        }

        const categories = Array.from(this.syncCategories).join(', ');
        banner.style.display = 'flex';
        banner.innerHTML = `
            <div style="flex: 1;">
                <strong>Unsaved workflow changes</strong>
                <span style="opacity: 0.8; margin-left: 8px;">(${categories})</span>
            </div>
            <button onclick="WorkflowSync.syncAll()" class="sync-btn" ${this.isSyncing ? 'disabled' : ''}>
                ${this.isSyncing ? '<i class="fas fa-spinner fa-spin"></i> Syncing...' : '<i class="fas fa-sync-alt"></i> Sync to Workflows'}
            </button>
        `;
    },

    // ============================================
    // SYNC ACTIONS
    // ============================================

    async syncAll() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.renderSyncBanner();

        try {
            // Sync credentials if needed
            if (this.syncCategories.has('credentials')) {
                await this.syncCredentials();
            }

            // Sync system prompt if needed
            if (this.syncCategories.has('system-prompt')) {
                await this.syncSystemPrompt();
            }

            // Full workflow variable sync
            if (this.syncCategories.has('workflows')) {
                await this.syncWorkflows();
            }

            this.showToast('Workflows synced successfully!', 'success');
            this.clearNeedsSync();
            this.loadSyncStatus();
        } catch (err) {
            this.showToast(`Sync failed: ${err.message}`, 'error');
        } finally {
            this.isSyncing = false;
            this.renderSyncBanner();
        }
    },

    async syncWorkflows() {
        const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_WORKFLOWS}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Workflow sync failed');
        return result;
    },

    async syncSystemPrompt() {
        const promptEl = document.getElementById('systemPromptEditor');
        const rulesEl = document.getElementById('pricingRulesEditor');

        if (!promptEl || !promptEl.value.trim()) {
            throw new Error('System prompt is empty');
        }

        const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_SYSTEM_PROMPT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemPrompt: promptEl.value.trim(),
                pricingRules: rulesEl ? rulesEl.value.trim() : ''
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'System prompt sync failed');
        return result;
    },

    async syncCredentials() {
        // Collect credential values from form
        const types = [];

        const telegramToken = document.getElementById('telegramBotToken')?.value;
        if (telegramToken && !telegramToken.includes('*')) {
            types.push({ type: 'telegram', data: { botToken: telegramToken } });
        }

        const twilioSid = document.getElementById('twilioAccountSid')?.value;
        const twilioAuth = document.getElementById('twilioAuthToken')?.value;
        if (twilioSid && twilioAuth && !twilioSid.includes('*') && !twilioAuth.includes('*')) {
            types.push({ type: 'twilio', data: { accountSid: twilioSid, authToken: twilioAuth } });
        }

        for (const cred of types) {
            const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_CREDENTIALS}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cred)
            });
            const result = await response.json();
            if (!result.success) {
                console.error(`[sync] Failed to sync ${cred.type}:`, result.error);
            }
        }
    },

    // ============================================
    // SYSTEM PROMPT EDITOR
    // ============================================

    setupSystemPromptEditor() {
        const saveBtn = document.getElementById('saveSystemPromptBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveAndSyncPrompt());
        }
    },

    async saveAndSyncPrompt() {
        const btn = document.getElementById('saveSystemPromptBtn');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        btn.disabled = true;

        try {
            await this.syncSystemPrompt();
            this.showToast('AI system prompt updated and synced!', 'success');
            this.loadSyncStatus();
        } catch (err) {
            this.showToast(`Failed: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    // ============================================
    // UTILITIES
    // ============================================

    showToast(message, type = 'info') {
        // Use existing toast if available, else create one
        let toast = document.getElementById('syncToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'syncToast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:8px;color:#fff;font-size:14px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;';
            document.body.appendChild(toast);
        }

        toast.style.background = type === 'success' ? '#42b72a' : type === 'error' ? '#e74c3c' : '#1877f2';
        toast.textContent = message;
        toast.style.opacity = '1';

        setTimeout(() => { toast.style.opacity = '0'; }, 4000);
    },

    timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    WorkflowSync.init();
});
