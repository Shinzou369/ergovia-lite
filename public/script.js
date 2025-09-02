// Enhanced Ergovia-AI Chat Interface
let conversation = [];
let currentThreadId = null;
let threads = [];
let isTyping = false;

// DOM Elements
const outputBox = document.getElementById("output-box");
const promptInput = document.getElementById("prompt-input");
const submitBtn = document.getElementById("submit-btn");
const charCounter = document.getElementById("char-counter");

// Initialize the application
document.addEventListener("DOMContentLoaded", function() {
  initializeApp();
  loadThreads();
  setupEventListeners();
  initializeQuickButtons();
  initializeWebsiteCards(); // Add this line from the original code
});

function initializeApp() {
  // Set initial focus on input
  if (promptInput) {
    promptInput.focus();
  }

  // Load saved conversation if exists
  loadCurrentThread();

  // Initialize character counter
  updateCharCounter();
}

function setupEventListeners() {
  // Submit button click
  if (submitBtn) {
    submitBtn.addEventListener("click", handleSubmit);
  }

  // Enter key to submit (Shift+Enter for new line)
  if (promptInput) {
    promptInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    });

    // Character counter update
    promptInput.addEventListener("input", updateCharCounter);
  }
}

function updateCharCounter() {
  if (promptInput && charCounter) {
    const currentLength = promptInput.value.length;
    const maxLength = 1000;
    charCounter.textContent = `${currentLength}/${maxLength}`;

    if (currentLength > maxLength * 0.9) {
      charCounter.style.color = "var(--text-warning)";
    } else {
      charCounter.style.color = "var(--text-muted)";
    }
  }
}

async function handleSubmit() {
  const prompt = promptInput?.value?.trim();
  if (!prompt || isTyping) return;

  await sendMessage(prompt);
}

async function sendMessage(promptText) {
  if (!promptText?.trim() || isTyping) {
    return;
  }

  const submitBtn = document.getElementById("submit-btn");
  const promptInput = document.getElementById("prompt-input");

  // Enhanced button state management
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span>';
  submitBtn.style.transform = "scale(0.95)";

  // Enhanced fade out animations
  const header = document.querySelector(".hero-section");
  const quickChat = document.querySelector(".quick-chat");
  const workspace = document.querySelector(".workspace");

  if (header) {
    header.classList.add("fade-out");
  }
  if (quickChat) {
    quickChat.classList.add("fade-out");
    // Add class to workspace to expand chat container
    if (workspace) {
      workspace.classList.add("no-quick-chat");
    }
  }

  // Clear input with animation
  if (promptInput) {
    promptInput.style.transform = "scale(0.98)";
    setTimeout(() => {
      promptInput.value = "";
      promptInput.style.transform = "scale(1)";
    }, 150);
  }

  // Add user message with animation
  addMessage(promptText, "user");

  // Show typing indicator
  showTypingIndicator();

  conversation.push({ role: "user", content: promptText });

  const selectedModel = selectModel(promptText);

  try {
    const response = await getGPTResponse(selectedModel, conversation);

    if (response && response.message) {
      hideTypingIndicator();
      addMessage(response.message.content, "assistant");
      conversation.push(response.message);

      // Save conversation to thread
      saveCurrentThread();

      // Update token usage
      await updateTokenUsage();
    } else {
      throw new Error("Invalid response format");
    }
  } catch (error) {
    console.error("Chat error:", error);
    hideTypingIndicator();

    let errorMessage = "I'm having trouble connecting right now. Please try again.";

    if (error.message?.includes("403") || error.message?.includes("Premium")) {
      errorMessage = "You've reached your usage limit. Please upgrade to continue chatting.";
      showPaymentModal();
    } else if (error.message?.includes("401")) {
      errorMessage = "Please log in to continue using the chat.";
    } else if (error.message?.includes("network") || error.message?.includes("fetch")) {
      errorMessage = "Network connection issue. Please check your internet and try again.";
    }

    addMessage(errorMessage, "error");
  } finally {
    // Reset button state
    isTyping = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="submit-icon"><i data-lucide="send"></i></span>';
    submitBtn.style.transform = "scale(1)";

    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// Model selection based on keywords
function selectModel(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return getModelConfig()?.default_model || "gpt-3.5-turbo";
  }
  
  const lower = prompt.toLowerCase();
  const modelConfig = getModelConfig();
  
  // Validate model config exists
  if (!modelConfig || typeof modelConfig !== 'object') {
    console.warn('Model configuration not available, using default model');
    return "gpt-3.5-turbo";
  }

  // Check for specific model triggers
  const modelTriggers = modelConfig.model_triggers || {};
  for (const [model, triggers] of Object.entries(modelTriggers)) {
    if (Array.isArray(triggers) && triggers.some(trigger => 
      typeof trigger === 'string' && lower.includes(trigger.toLowerCase())
    )) {
      return model;
    }
  }

  // Return default model
  return modelConfig.default_model || "gpt-3.5-turbo";
}

function getModelConfig() {
  // Try to load from localStorage or use defaults
  try {
    const saved = localStorage.getItem('modelConfig');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn("Failed to load model config:", e);
  }

  // Default configuration
  return {
    model_triggers: {
      "gpt-4-turbo": ["complex", "detailed", "thorough", "comprehensive", "advanced"],
      "gpt-4": ["longer", "extensive", "elaborate", "in-depth", "complete"],
      "gpt-3.5-turbo": ["quick", "simple", "basic", "fast", "brief"],
      "deepseek-chat": ["deeper", "creative", "deep", "innovative", "alternative"]
    },
    default_model: "gpt-3.5-turbo"
  };
}

async function getGPTResponse(model, messages) {
  const response = await fetch('/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages,
      model: model,
      thread_id: currentThreadId
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

function addMessage(content, role) {
  if (!outputBox) return;

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}-message animate__animated animate__fadeInUp`;

  if (role === "user") {
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-text">${escapeHtml(content)}</div>
      </div>
    `;
  } else if (role === "assistant") {
    const processedContent = processMarkdown(content);
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-text">${processedContent}</div>
        <div class="message-actions">
          <button class="action-btn copy-btn" onclick="copyMessage(this)" title="Copy">
            <i data-lucide="copy"></i>
          </button>
        </div>
      </div>
    `;
  } else if (role === "error") {
    messageDiv.className = "message error-message";
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="message-text error-text">
          <i data-lucide="alert-circle"></i>
          ${escapeHtml(content)}
        </div>
      </div>
    `;
  }

  outputBox.appendChild(messageDiv);
  outputBox.scrollTop = outputBox.scrollHeight;

  // Initialize icons for new message
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function showTypingIndicator() {
  if (!outputBox) return;

  isTyping = true;
  const typingDiv = document.createElement("div");
  typingDiv.className = "message assistant-message typing-indicator";
  typingDiv.id = "typing-indicator";
  typingDiv.innerHTML = `
    <div class="message-content">
      <div class="typing-animation">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  outputBox.appendChild(typingDiv);
  outputBox.scrollTop = outputBox.scrollHeight;
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
  isTyping = false;
}

function processMarkdown(content) {
  if (typeof marked !== 'undefined') {
    // Configure marked for security
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false // We'll use DOMPurify instead
    });

    let html = marked.parse(content);

    // Sanitize with DOMPurify if available
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html);
    }

    return html;
  }

  // Fallback: simple text processing
  return escapeHtml(content).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyMessage(button) {
  const messageText = button.closest('.message-content').querySelector('.message-text');
  const text = messageText.textContent || messageText.innerText;

  navigator.clipboard.writeText(text).then(() => {
    // Visual feedback
    const icon = button.querySelector('i');
    icon.setAttribute('data-lucide', 'check');
    lucide.createIcons();

    setTimeout(() => {
      icon.setAttribute('data-lucide', 'copy');
      lucide.createIcons();
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
  });
}

// Thread management
function newChat() {
  // Save current thread if it has messages
  if (conversation.length > 0) {
    saveCurrentThread();
  }

  // Reset conversation
  conversation = [];
  currentThreadId = null;

  // Clear output
  if (outputBox) {
    outputBox.innerHTML = '';
  }

  // Show hero section and quick chat again
  const header = document.querySelector(".hero-section");
  const quickChat = document.querySelector(".quick-chat");
  const workspace = document.querySelector(".workspace");

  if (header) {
    header.classList.remove("fade-out");
  }
  if (quickChat) {
    quickChat.classList.remove("fade-out");
  }
  if (workspace) {
    workspace.classList.remove("no-quick-chat");
  }

  // Focus input
  if (promptInput) {
    promptInput.focus();
  }
}

function loadThreads() {
  try {
    const saved = localStorage.getItem('chatThreads');
    if (saved) {
      threads = JSON.parse(saved);
      updateThreadsList();
    }
  } catch (e) {
    console.error('Failed to load threads:', e);
    threads = [];
  }
}

function saveCurrentThread() {
  if (conversation.length === 0) return;

  const thread = {
    id: currentThreadId || Date.now(),
    title: conversation[0]?.content?.substring(0, 50) + "..." || "New Chat",
    messages: [...conversation],
    timestamp: new Date().toISOString()
  };

  // Update or add thread
  const existingIndex = threads.findIndex(t => t.id === thread.id);
  if (existingIndex >= 0) {
    threads[existingIndex] = thread;
  } else {
    threads.unshift(thread);
  }

  // Limit to 50 threads
  if (threads.length > 50) {
    threads = threads.slice(0, 50);
  }

  currentThreadId = thread.id;

  // Save to localStorage
  try {
    localStorage.setItem('chatThreads', JSON.stringify(threads));
    updateThreadsList();
  } catch (e) {
    console.error('Failed to save threads:', e);
  }
}

function loadCurrentThread() {
  // Load the most recent thread if no active conversation
  if (conversation.length === 0 && threads.length > 0) {
    const latestThread = threads[0];
    conversation = [...latestThread.messages];
    currentThreadId = latestThread.id;

    // Display messages
    conversation.forEach(msg => {
      if (msg.role !== 'system') {
        addMessage(msg.content, msg.role);
      }
    });
  }
}

function updateThreadsList() {
  const threadsList = document.getElementById('threads-list');
  if (!threadsList) return;

  threadsList.innerHTML = '';

  threads.forEach(thread => {
    const li = document.createElement('li');
    li.className = 'thread-item';
    if (thread.id === currentThreadId) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <div class="thread-info" onclick="loadThread(${thread.id})">
        <div class="thread-title">${escapeHtml(thread.title)}</div>
        <div class="thread-time">${formatTime(thread.timestamp)}</div>
      </div>
      <button class="delete-thread" onclick="deleteThread(${thread.id})" title="Delete">
        <i data-lucide="trash-2"></i>
      </button>
    `;

    threadsList.appendChild(li);
  });

  // Initialize icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function loadThread(threadId) {
  const thread = threads.find(t => t.id === threadId);
  if (!thread) return;

  // Save current thread first
  if (conversation.length > 0 && currentThreadId !== threadId) {
    saveCurrentThread();
  }

  // Load selected thread
  conversation = [...thread.messages];
  currentThreadId = threadId;

  // Clear and display messages
  if (outputBox) {
    outputBox.innerHTML = '';
  }

  conversation.forEach(msg => {
    if (msg.role !== 'system') {
      addMessage(msg.content, msg.role);
    }
  });

  // Hide hero section
  const header = document.querySelector(".hero-section");
  const quickChat = document.querySelector(".quick-chat");

  if (header && conversation.length > 0) {
    header.classList.add("fade-out");
  }
  if (quickChat && conversation.length > 0) {
    quickChat.classList.add("fade-out");
  }

  updateThreadsList();
}

function deleteThread(threadId) {
  threads = threads.filter(t => t.id !== threadId);

  // If deleting current thread, reset
  if (currentThreadId === threadId) {
    newChat();
  }

  // Save and update
  try {
    localStorage.setItem('chatThreads', JSON.stringify(threads));
    updateThreadsList();
  } catch (e) {
    console.error('Failed to save threads after deletion:', e);
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString();
}

// Quick buttons functionality
function initializeQuickButtons() {
  const quickButtons = document.querySelectorAll('.quick-btn');
  quickButtons.forEach(button => {
    button.addEventListener('click', () => {
      const text = button.querySelector('.btn-text').textContent;
      if (promptInput) {
        promptInput.value = text;
        handleSubmit();
      }
    });
  });
}

// Token usage tracking
async function updateTokenUsage() {
  try {
    await fetch('/api/token-usage/increment-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.warn('Failed to update token usage:', error);
  }
}

// Payment modal functions
function showPaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  }
}

function hidePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
}

// Customer service function
function openCustomerService() {
  // For now, redirect to contact page
  window.location.href = '/contact.html';
}

// Token usage button handler
function handleTokenUsageClick() {
  window.location.href = '/token-dashboard.html';
}

// Theme toggle (if not in auth.js)
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // Update theme icon
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', newTheme === 'dark' ? 'sun' : 'moon');
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// Sidebar toggle
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const workspace = document.querySelector('.workspace');

  if (sidebar && workspace) {
    sidebar.classList.toggle('hidden');
    workspace.classList.toggle('expanded', sidebar.classList.contains('hidden'));
  }
}

// Website card interaction functionality
function initializeWebsiteCards() {
  const websiteCards = document.querySelectorAll(".website-card");

  websiteCards.forEach(card => {
    card.addEventListener("click", function(e) {
      // Check if this is the taskforce main link
      if (this.classList.contains("taskforce-main-link")) {
        e.preventDefault();
        // Get the href from onclick attribute or use default
        const href = this.getAttribute('onclick');
        if (href && href.includes('taskforce.html')) {
          window.location.href = '/taskforce.html';
        } else if (href && href.includes('token-dashboard.html')) {
          window.location.href = '/token-dashboard.html';
        }
        return;
      }

      // Remove active class from all cards
      websiteCards.forEach(c => c.classList.remove("active"));

      // Add active class to clicked card
      this.classList.add("active");

      // Get website info
      const websiteId = this.dataset.website;
      const websiteName = this.querySelector(".website-name");

      if (websiteName) {
        addMessage(`Switched to ${websiteName.textContent}`, "system");
        console.log(`Selected website: ${websiteName.textContent} (ID: ${websiteId})`);
      }
    });
  });
}

// Export functions for global access
window.sendMessage = sendMessage;
window.newChat = newChat;
window.loadThread = loadThread;
window.deleteThread = deleteThread;
window.showPaymentModal = showPaymentModal;
window.hidePaymentModal = hidePaymentModal;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.openCustomerService = openCustomerService;
window.handleTokenUsageClick = handleTokenUsageClick;