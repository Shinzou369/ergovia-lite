
// Reusable Credential Widget Component
class CredentialWidget {
    constructor(container, options = {}) {
        this.container = container;
        this.serviceType = options.serviceType;
        this.serviceName = options.serviceName || options.serviceType;
        this.authType = options.authType || 'oauth';
        this.onCredentialChange = options.onCredentialChange || (() => {});
        this.compact = options.compact || false;
        
        this.credentialStatus = 'disconnected';
        this.credentialData = null;
        
        this.init();
    }
    
    init() {
        this.render();
        this.loadCredentialStatus();
    }
    
    async loadCredentialStatus() {
        try {
            const response = await fetch('/api/credentials');
            if (response.ok) {
                const credentials = await response.json();
                const cred = credentials[this.serviceType];
                
                if (cred) {
                    this.credentialStatus = cred.status;
                    this.credentialData = cred;
                    this.render();
                    this.onCredentialChange(this.credentialStatus, this.credentialData);
                }
            }
        } catch (error) {
            console.error('Failed to load credential status:', error);
        }
    }
    
    render() {
        const isConnected = this.credentialStatus === 'connected';
        const needsAuth = this.credentialStatus === 'needs-auth';
        
        if (this.compact) {
            this.renderCompact(isConnected, needsAuth);
        } else {
            this.renderFull(isConnected, needsAuth);
        }
    }
    
    renderCompact(isConnected, needsAuth) {
        this.container.innerHTML = `
            <div class="credential-widget compact ${isConnected ? 'connected' : needsAuth ? 'needs-auth' : 'disconnected'}">
                <div class="credential-status-compact">
                    <span class="status-dot ${isConnected ? 'connected' : 'disconnected'}"></span>
                    <span class="service-name">${this.serviceName}</span>
                    ${!isConnected ? `
                        <button class="connect-btn-compact" onclick="credentialWidget_${this.serviceType}.showAuthModal()">
                            ${this.authType === 'oauth' ? 'Connect' : 'Setup'}
                        </button>
                    ` : `
                        <span class="connected-text">Connected</span>
                    `}
                </div>
            </div>
            
            <style>
                .credential-widget.compact {
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid #ddd;
                    background: white;
                }
                
                .credential-widget.compact.connected {
                    border-color: #28a745;
                    background: #f8fff9;
                }
                
                .credential-widget.compact.needs-auth {
                    border-color: #ffc107;
                    background: #fffbf0;
                }
                
                .credential-status-compact {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                }
                
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                
                .status-dot.connected {
                    background: #28a745;
                }
                
                .status-dot.disconnected {
                    background: #dc3545;
                }
                
                .connect-btn-compact {
                    padding: 4px 8px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                }
                
                .connected-text {
                    color: #28a745;
                    font-size: 12px;
                    font-weight: 500;
                }
            </style>
        `;
    }
    
    renderFull(isConnected, needsAuth) {
        this.container.innerHTML = `
            <div class="credential-widget full">
                <div class="credential-header">
                    <h4>${this.serviceName} Authentication</h4>
                    <div class="credential-status">
                        <span class="status-indicator ${isConnected ? 'connected' : 'disconnected'}"></span>
                        <span class="status-text">
                            ${isConnected ? `Connected${this.credentialData?.name ? ` as ${this.credentialData.name}` : ''}` : 'Not connected'}
                        </span>
                    </div>
                </div>
                
                <div class="credential-actions">
                    ${!isConnected ? `
                        <button class="connect-button ${this.authType}" onclick="credentialWidget_${this.serviceType}.showAuthModal()">
                            ${this.authType === 'oauth' ? '🔗 Connect Account' : '🔑 Add API Key'}
                        </button>
                    ` : `
                        <div class="connected-actions">
                            <button class="action-btn test" onclick="credentialWidget_${this.serviceType}.testConnection()">
                                Test Connection
                            </button>
                            <button class="action-btn disconnect" onclick="credentialWidget_${this.serviceType}.disconnect()">
                                Disconnect
                            </button>
                        </div>
                    `}
                </div>
                
                ${isConnected && this.credentialData?.lastTested ? `
                    <div class="credential-info">
                        <small>Last tested: ${new Date(this.credentialData.lastTested).toLocaleString()}</small>
                    </div>
                ` : ''}
            </div>
            
            <style>
                .credential-widget.full {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 16px;
                    margin: 12px 0;
                }
                
                .credential-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                
                .credential-header h4 {
                    margin: 0;
                    font-size: 14px;
                    color: #333;
                }
                
                .credential-status {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                }
                
                .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                
                .status-indicator.connected {
                    background: #28a745;
                }
                
                .status-indicator.disconnected {
                    background: #dc3545;
                }
                
                .connect-button {
                    width: 100%;
                    padding: 10px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                
                .connect-button.oauth {
                    background: #4285f4;
                    color: white;
                }
                
                .connect-button.oauth:hover {
                    background: #3367d6;
                }
                
                .connect-button.api-key {
                    background: #6c757d;
                    color: white;
                }
                
                .connect-button.api-key:hover {
                    background: #545b62;
                }
                
                .connected-actions {
                    display: flex;
                    gap: 8px;
                }
                
                .action-btn {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                
                .action-btn:hover {
                    background: #f8f9fa;
                }
                
                .action-btn.test {
                    color: #28a745;
                    border-color: #28a745;
                }
                
                .action-btn.disconnect {
                    color: #dc3545;
                    border-color: #dc3545;
                }
                
                .credential-info {
                    margin-top: 8px;
                    color: #666;
                }
            </style>
        `;
    }
    
    showAuthModal() {
        if (this.authType === 'oauth') {
            this.startOAuthFlow();
        } else {
            this.showApiKeyModal();
        }
    }
    
    startOAuthFlow() {
        // Create a popup for OAuth flow
        const authUrl = `/api/credentials/${this.serviceType}/oauth/authorize`;
        const popup = window.open(authUrl, 'oauth', 'width=500,height=600');
        
        // Listen for completion
        const checkClosed = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkClosed);
                // Refresh credential status
                setTimeout(() => this.loadCredentialStatus(), 1000);
            }
        }, 1000);
    }
    
    showApiKeyModal() {
        const modal = document.createElement('div');
        modal.className = 'credential-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Add ${this.serviceName} API Key</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
                </div>
                
                <div class="setup-instructions">
                    <p>To connect ${this.serviceName}, you'll need to provide an API key.</p>
                    ${this.getSetupInstructions()}
                </div>
                
                <form onsubmit="credentialWidget_${this.serviceType}.saveApiKey(event)">
                    <div class="form-group">
                        <label>API Key:</label>
                        <input type="password" id="apiKeyInput_${this.serviceType}" required 
                               placeholder="Paste your ${this.serviceName} API key here">
                    </div>
                    
                    <div class="form-group">
                        <label>Name (optional):</label>
                        <input type="text" id="nameInput_${this.serviceType}" 
                               placeholder="e.g., My ${this.serviceName} Account">
                    </div>
                    
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Save Credential</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.credential-modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
            
            <style>
                .credential-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .modal-content {
                    background: white;
                    border-radius: 8px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 16px;
                }
                
                .close-btn {
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                }
                
                .setup-instructions {
                    background: #f8f9fa;
                    padding: 16px;
                    border-radius: 6px;
                    margin-bottom: 16px;
                }
                
                .form-group {
                    margin-bottom: 16px;
                }
                
                .form-group label {
                    display: block;
                    margin-bottom: 4px;
                    font-weight: 500;
                }
                
                .form-group input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                }
                
                .form-actions {
                    display: flex;
                    gap: 12px;
                    margin-top: 20px;
                }
                
                .btn-primary, .btn-secondary {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                }
                
                .btn-primary {
                    background: #007bff;
                    color: white;
                }
                
                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
            </style>
        `;
        
        document.body.appendChild(modal);
    }
    
    getSetupInstructions() {
        const instructions = {
            openai: `
                <ol>
                    <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API Keys</a></li>
                    <li>Click "Create new secret key"</li>
                    <li>Copy the generated key</li>
                </ol>
            `,
            telegram: `
                <ol>
                    <li>Message <a href="https://t.me/botfather" target="_blank">@BotFather</a> on Telegram</li>
                    <li>Send <code>/newbot</code> and follow instructions</li>
                    <li>Copy the bot token provided</li>
                </ol>
            `,
            discord: `
                <ol>
                    <li>Go to <a href="https://discord.com/developers/applications" target="_blank">Discord Developer Portal</a></li>
                    <li>Create a new application and add a bot</li>
                    <li>Copy the bot token</li>
                </ol>
            `
        };
        
        return instructions[this.serviceType] || '<p>Please refer to the service documentation for API key setup.</p>';
    }
    
    async saveApiKey(event) {
        event.preventDefault();
        
        const apiKey = document.getElementById(`apiKeyInput_${this.serviceType}`).value;
        const name = document.getElementById(`nameInput_${this.serviceType}`).value;
        
        try {
            const response = await fetch(`/api/credentials/${this.serviceType}/api-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ apiKey, name })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.credentialStatus = 'connected';
                this.credentialData = { name: name || `${this.serviceName} API` };
                this.render();
                this.onCredentialChange(this.credentialStatus, this.credentialData);
                
                // Close modal
                document.querySelector('.credential-modal').remove();
                
                alert('Credential saved successfully!');
            } else {
                throw new Error('Failed to save credential');
            }
        } catch (error) {
            console.error('Error saving credential:', error);
            alert('Failed to save credential. Please try again.');
        }
    }
    
    async testConnection() {
        try {
            const response = await fetch(`/api/credentials/${this.serviceType}/test`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                this.loadCredentialStatus(); // Refresh status
            } else {
                alert('Connection test failed: ' + result.message);
            }
        } catch (error) {
            console.error('Error testing connection:', error);
            alert('Failed to test connection');
        }
    }
    
    async disconnect() {
        if (!confirm(`Are you sure you want to disconnect from ${this.serviceName}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/credentials/${this.serviceType}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.credentialStatus = 'disconnected';
                this.credentialData = null;
                this.render();
                this.onCredentialChange(this.credentialStatus, this.credentialData);
                alert(`Disconnected from ${this.serviceName}`);
            } else {
                throw new Error('Failed to disconnect');
            }
        } catch (error) {
            console.error('Error disconnecting:', error);
            alert('Failed to disconnect');
        }
    }
}

// Global registry for widget instances
window.credentialWidgets = {};

// Helper function to create credential widgets
function createCredentialWidget(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container not found: ${containerId}`);
        return null;
    }
    
    const widget = new CredentialWidget(container, options);
    
    // Register globally for easy access
    window[`credentialWidget_${options.serviceType}`] = widget;
    window.credentialWidgets[options.serviceType] = widget;
    
    return widget;
}
