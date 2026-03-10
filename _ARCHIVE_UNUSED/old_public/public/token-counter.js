// Token Usage Counter Module
function TokenCounter() {
  this.maxTokens = 100; // Configurable budget
  this.currentUsage = null; // Use null to indicate loading state
  this.init();
}

TokenCounter.prototype.constructor = TokenCounter;

  TokenCounter.prototype.init = async function() {
  await this.loadUsage();
};

TokenCounter.prototype.loadUsage = async function() {
  try {
    const response = await fetch('/api/token-usage');
    if (response.ok) {
      const data = await response.json();
      // Handle both old format (number) and new format (object)
      if (typeof data.usage === 'number') {
        this.currentUsage = data.usage;
      } else {
        this.currentUsage = (data.usage && data.usage.tokens) || 0;
      }
    } else {
      console.warn('Failed to load token usage from backend');
      // Keep null to show loading state instead of 0
    }
  } catch (error) {
    console.warn('Failed to load token usage:', error);
    // Keep null to show loading state instead of 0
  }
};

// Redirect to token dashboard instead of showing popover
TokenCounter.prototype.openDashboard = function() {
  window.location.href = '/token-dashboard';
};

TokenCounter.prototype.incrementUsage = async function() {
  try {
    const response = await fetch('/api/token-usage/increment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      // Handle both old format (number) and new format (object)
      if (typeof data.usage === 'number') {
        this.currentUsage = data.usage;
      } else {
        this.currentUsage = (data.usage && data.usage.tokens) || 0;
      }
      console.log('Token usage incremented to: ' + this.currentUsage);
    } else {
      console.warn('Failed to increment token usage');
    }
  } catch (error) {
    console.warn('Failed to increment token usage:', error);
  }
};

TokenCounter.prototype.refreshUsage = async function() {
  await this.loadUsage();
};

TokenCounter.prototype.resetUsage = async function() {
  try {
    const response = await fetch('/api/token-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ usage: 0 })
    });

    if (response.ok) {
      this.currentUsage = 0;
    } else {
      console.warn('Failed to reset token usage');
    }
  } catch (error) {
    console.warn('Failed to reset token usage:', error);
  }
};

TokenCounter.prototype.getUsage = function() {
  return {
    current: this.currentUsage,
    max: this.maxTokens,
    percentage: (this.currentUsage / this.maxTokens) * 100
  };
};

// Export for use in other modules
window.TokenCounter = TokenCounter;