/**
 * Workflow Sync Module - V2 Premium Dashboard
 * Handles n8n connection, workflow import, and live variable sync
 */

const WorkflowSync = {
    // State
    needsSync: false,
    syncCategories: new Set(),
    isSyncing: false,
    n8nConfigured: false,
    deployedCount: 0,
    n8nUrl: null,

    // Auth helper - returns headers with JWT token
    authHeaders(extra = {}) {
        const token = localStorage.getItem('ergovia_token');
        const headers = { 'Content-Type': 'application/json', ...extra };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        return headers;
    },

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.loadSyncStatus();
        this.renderSyncBanner();
        this.setupSystemPromptEditor();
    },

    // ============================================
    // SYNC STATUS & CONNECTION UI
    // ============================================

    async loadSyncStatus() {
        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_STATUS}`, { headers: this.authHeaders() });
            const result = await response.json();
            if (result.success) {
                this.lastSync = result.lastSync;
                this.deployedCount = result.deployedCount;
                this.n8nConfigured = result.n8nConfigured;
                this.n8nUrl = result.n8nUrl || null;

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

                this.updateConnectionCard();
            }
        } catch (err) {
            console.error('[sync] Failed to load sync status:', err);
            // Still update the card to show "not connected" state
            this.updateConnectionCard();
        }
    },

    updateConnectionCard() {
        const notConnected = document.getElementById('n8nNotConnected');
        const connected = document.getElementById('n8nConnected');
        const statusEl = document.getElementById('syncLastStatus');
        const countEl = document.getElementById('n8nConnectedCount');
        const urlEl = document.getElementById('n8nConnectedUrl');

        if (this.n8nConfigured && this.deployedCount > 0) {
            // Connected with workflows
            if (notConnected) notConnected.style.display = 'none';
            if (connected) connected.style.display = 'block';
            if (urlEl) urlEl.textContent = this.n8nUrl || 'Connected to n8n';
            if (countEl) countEl.textContent = `${this.deployedCount} workflows linked`;
            if (statusEl) {
                const syncText = this.lastSync ? `Last synced ${this.timeAgo(new Date(this.lastSync.at))}` : 'Never synced';
                statusEl.textContent = syncText;
            }
        } else if (this.n8nConfigured) {
            // Connected but no workflows (show connected card, prompt reimport)
            if (notConnected) notConnected.style.display = 'none';
            if (connected) connected.style.display = 'block';
            if (urlEl) urlEl.textContent = this.n8nUrl || 'Connected to n8n';
            if (countEl) {
                countEl.innerHTML = '<span style="color:#ff9800;">No workflows found - <a href="#" onclick="WorkflowSync.importLiveWorkflows();return false;" style="color:#1877f2;text-decoration:underline;">reimport</a></span>';
            }
            if (statusEl) statusEl.textContent = '';
        } else {
            // Not connected — show connect form
            if (notConnected) notConnected.style.display = 'block';
            if (connected) connected.style.display = 'none';
        }
    },

    // ============================================
    // CONNECT TO N8N
    // ============================================

    async connectN8n() {
        const urlInput = document.getElementById('n8nUrl');
        const keyInput = document.getElementById('n8nApiKey');
        const btn = document.getElementById('n8nConnectBtn');

        if (!urlInput || !keyInput) return;

        const n8nUrl = urlInput.value.trim();
        const apiKey = keyInput.value.trim();

        if (!n8nUrl || !apiKey) {
            this.showToast('Please enter both n8n URL and API Key', 'error');
            return;
        }

        // Show loading state
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        btn.disabled = true;

        try {
            const response = await fetch(`${CONFIG.API.BASE_URL}/n8n/connect`, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({ n8nUrl, apiKey })
            });
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Connection failed');
            }

            this.n8nConfigured = true;
            this.deployedCount = result.workflows || 0;
            this.n8nUrl = result.n8nUrl || n8nUrl;

            this.showToast(result.message || `Connected! ${result.workflows} workflows imported.`, 'success');
            this.updateConnectionCard();
        } catch (err) {
            this.showToast(`Connection failed: ${err.message}`, 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    disconnectN8n() {
        if (!confirm('Disconnect from n8n? You can reconnect anytime.')) return;
        // Just reset the UI — the config stays in DB for easy reconnect
        this.n8nConfigured = false;
        this.deployedCount = 0;
        this.n8nUrl = null;
        this.updateConnectionCard();
        this.showToast('Disconnected from n8n', 'info');
    },

    // ============================================
    // IMPORT LIVE WORKFLOWS
    // ============================================

    async importLiveWorkflows() {
        try {
            this.showToast('Importing workflows from n8n...', 'info');
            const response = await fetch(`${CONFIG.API.BASE_URL}/sync/import`, {
                method: 'POST',
                headers: this.authHeaders()
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Import failed');

            this.deployedCount = result.imported;
            this.showToast(`Imported ${result.imported} workflows from n8n!`, 'success');
            this.updateConnectionCard();
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
            if (this.syncCategories.has('credentials')) {
                await this.syncCredentials();
            }
            if (this.syncCategories.has('system-prompt')) {
                await this.syncSystemPrompt();
            }
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
            headers: this.authHeaders()
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Workflow sync failed');
        return result;
    },

    async syncSystemPrompt() {
        const promptEl = document.getElementById('systemPromptEditor');
        const rulesEl = document.getElementById('pricingRulesEditor');

        // Send whatever custom prompt/rules exist — backend appends to existing WF1 prompt
        // and also injects language preference from saved settings
        const response = await fetch(`${CONFIG.API.BASE_URL}${CONFIG.API.SYNC_SYSTEM_PROMPT}`, {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify({
                systemPrompt: promptEl ? promptEl.value.trim() : '',
                pricingRules: rulesEl ? rulesEl.value.trim() : ''
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'System prompt sync failed');
        if (result.language) {
            this.showToast(`Language set to ${result.language}`, 'info');
        }
        return result;
    },

    async syncCredentials() {
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
                headers: this.authHeaders(),
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
