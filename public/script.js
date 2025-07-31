
// Enhanced sidebar toggle with proper workspace expansion and hamburger animation
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const btn = document.querySelector(".toggle-btn");
  const workspace = document.querySelector(".workspace");
  const container = document.querySelector(".container");

  if (!sidebar || !btn) {
    console.warn("Sidebar or toggle button not found in the document.");
    return;
  }

  // Toggle sidebar hidden state
  sidebar.classList.toggle("hidden");

  // Correct animation logic - hamburger when visible, cross when hidden
  if (sidebar.classList.contains("hidden")) {
    // Sidebar is hidden, show hamburger lines (≡)
    btn.classList.remove("active");
  } else {
    // Sidebar is visible, show cross (×)
    btn.classList.add("active");
  }

  // Properly expand workspace when sidebar is hidden
  if (workspace) {
    workspace.classList.toggle("expanded", sidebar.classList.contains("hidden"));
  }

  // Adjust container for sidebar state
  if (container) {
    container.classList.toggle("sidebar-collapsed", sidebar.classList.contains("hidden"));
  }

  // Add body class to handle workspace adjustment
  document.body.classList.toggle("sidebar-hidden", sidebar.classList.contains("hidden"));
}

// Toggle theme function with proper icon updates
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // Update theme icon
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) {
    const iconName = newTheme === 'dark' ? 'sun' : 'moon';
    themeIcon.setAttribute('data-lucide', iconName);
    // Re-initialize Lucide icons to update the display
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
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

// Application state management
let customTraining = "You are TaskAI, a helpful assistant for marketing and productivity tasks.";
let threads = [];
let currentThreadId = null;
let conversation = [];
let isUserLoggedIn = false;
let authCheckInProgress = false;
let tokenCounter = null;
async function loadUserThreads() {
  if (!isUserLoggedIn) {
    threads = [];
    currentThreadId = null;
    conversation = [];
    // Clear output box when user is not logged in
    const outputBox = document.getElementById("output-box");
    if (outputBox) {
      outputBox.innerHTML = "";
    }
    // Hide token counter when not logged in
    if (tokenCounter) {
      tokenCounter.hidePopover();
    }
    return;
  }

  try {
    const response = await fetch('/api/threads');
    if (response.ok) {
      const data = await response.json();
      threads = data.threads || [];

      // If no threads exist, create a default one
      if (threads.length === 0) {
        await createNewThread();
      } else {
        // Load the first thread and display its messages
        currentThreadId = threads[0].id;
        conversation = [...threads[0].conversation]; // Create a copy

        // Clear output box and load this thread's messages
        const outputBox = document.getElementById("output-box");
        if (outputBox) {
          outputBox.innerHTML = "";

          // Display messages from the current thread
          conversation.forEach((msg) => {
            if (msg.role === "user" || msg.role === "assistant") {
              addMessage(msg.content, msg.role === "user" ? "user" : "gpt");
            }
          });
        }
      }
    } else {
      console.error('Failed to load threads');
      threads = [];
      await createNewThread();
    }
  } catch (error) {
    console.error('Error loading threads:', error);
    threads = [];
    await createNewThread();
  }
}

async function saveUserThreads() {
  if (!isUserLoggedIn || threads.length === 0) {
    return;
  }

  try {
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ threads })
    });

    if (!response.ok) {
      console.error('Failed to save threads');
    }
  } catch (error) {
    console.error('Error saving threads:', error);
  }
}

async function createNewThread() {
  const newThread = {
    id: Date.now(),
    title: "New Chat",
    conversation: [{ role: "system", content: customTraining }],
  };

  threads.unshift(newThread);
  currentThreadId = newThread.id;
  conversation = [...newThread.conversation]; // Create a copy

  // Clear the output box when creating new thread
  const outputBox = document.getElementById("output-box");
  if (outputBox) {
    outputBox.innerHTML = "";
  }

  if (isUserLoggedIn) {
    await saveUserThreads();
  }
}

function clearUserData() {
  threads = [];
  currentThreadId = null;
  conversation = [];

  // Clear the output box
  const outputBox = document.getElementById("output-box");
  if (outputBox) {
    outputBox.innerHTML = "";
  }

  // Hide any typing indicators
  hideTypingIndicator();

  // Clear any localStorage remnants
  localStorage.removeItem("threads");
  localStorage.removeItem("customTraining");
}

function switchThread(threadId) {
  currentThreadId = threadId;
  const thread = threads.find((t) => t.id === threadId);
  if (thread) {
    conversation = [...thread.conversation]; // Create a copy to avoid reference issues

    // Always clear the output box first
    const outputBox = document.getElementById("output-box");
    if (outputBox) {
      outputBox.innerHTML = "";
    }

    // Hide typing indicator if it exists
    hideTypingIndicator();

    // Re-render only this thread's messages (excluding system messages)
    conversation.forEach((msg) => {
      if (msg.role === "user" || msg.role === "assistant") {
        addMessage(msg.content, msg.role === "user" ? "user" : "gpt");
      }
    });

    // Update active thread in sidebar
    document.querySelectorAll("#threads-list li").forEach((li) => {
      li.classList.toggle(
        "active",
        li.dataset.threadId === threadId.toString(),
      );
    });
  }
}

function updateUI() {
  const outputBox = document.getElementById("output-box");
  const threadsList = document.getElementById("threads-list");

  // Only clear chat content if user is not logged in, but keep website cards visible
  if (!isUserLoggedIn) {
    if (outputBox) outputBox.innerHTML = "";
    if (threadsList) threadsList.innerHTML = "";
    // Website cards should remain visible - they are handled separately
    return;
  }

  // Only update threads list - never touch the output box here
  if (threadsList) {
    threadsList.innerHTML = "";

    // Update threads list
    threads.forEach((thread) => {
      const li = document.createElement("li");
      const titleSpan = document.createElement("span");
      titleSpan.textContent = thread.title;
      titleSpan.onclick = () => switchThread(thread.id);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "×";
      deleteBtn.className = "delete-thread";
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (threads.length > 1) {
          threads = threads.filter((t) => t.id !== thread.id);
          if (currentThreadId === thread.id) {
            // Switch to the first available thread and clear output for it
            const nextThread = threads[0];
            switchThread(nextThread.id);
          }
          await saveUserThreads();
          updateUI();
        }
      };

      li.appendChild(titleSpan);
      li.appendChild(deleteBtn);
      li.dataset.threadId = thread.id;
      if (thread.id === currentThreadId) li.classList.add("active");
      threadsList.appendChild(li);
    });
  }
}

// === UI HELPERS ===
function formatMarkdown(text) {
  if (!text) return '';

  // Configure marked options
  marked.setOptions({
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined') {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            console.warn('Syntax highlighting failed:', err);
          }
        }
        return hljs.highlightAuto(code).value;
      }
      return code;
    },
    breaks: true,
    gfm: true,
    tables: true,
    sanitize: false,
    smartLists: true,
    smartypants: true
  });

  try {
    // Parse markdown
    let html = marked.parse(text);

    // Sanitize the HTML to prevent XSS attacks while preserving code highlighting
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'strike', 'del', 'ins', 
                       'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                       'ul', 'ol', 'li', 'blockquote', 
                       'pre', 'code', 'span',
                       'table', 'thead', 'tbody', 'tr', 'th', 'td',
                       'a', 'img', 'hr'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id'],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
      });
    }

    return html;
  } catch (error) {
    console.error('Markdown parsing failed:', error);
    return text.replace(/\n/g, '<br>');
  }
}

// Message display with system message support and syntax highlighting
function addMessage(content, type = "gpt", model = null, tokens = null) {
  const box = document.getElementById("output-box");
  if (!box) {
    console.warn("Output box not found in the document.");
    return;
  }

  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const msg = document.createElement("div");
  msg.classList.add("message", type);
  msg.id = messageId;

  // Handle different message types
  if (type === "gpt") {
    // Create rich GPT message with model info and metadata
    const modelDisplay = model ? model.replace('gpt-', 'GPT-').replace('deepseek-chat', 'DeepSeek') : 'GPT';
    const tokensDisplay = tokens ? ` • ${tokens} tokens` : '';

    msg.innerHTML = `
      <div class="message-bubble">
        <div class="message-content">
          <div class="gpt-content">${formatMarkdown(content)}</div>
        </div>
        <div class="message-actions">
          <button class="copy-btn" onclick="copyMessage('${messageId}')" title="Copy message">
            <i data-lucide="copy"></i>
          </button>
        </div>
      </div>
    `;

    // Initialize syntax highlighting for code blocks
    msg.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });

    // Add copy buttons to code blocks
    addCodeBlockCopyButtons(msg);

  } else if (type === "system") {
    // System messages for website switching, etc.
    msg.classList.add("system");
    msg.innerHTML = `<em>🔄 ${content}</em>`;
    msg.style.fontSize = "0.9rem";
    msg.style.opacity = "0.8";
    msg.style.fontStyle = "italic";
    msg.style.textAlign = "center";
    msg.style.background = "var(--bg-tertiary)";
    msg.style.border = "1px solid var(--border-color)";
    msg.style.color = "var(--text-muted)";
    msg.style.margin = "8px auto";
    msg.style.maxWidth = "60%";
  } else {
    // User messages
    msg.innerHTML = `
      <div class="message-content">
        <div class="message-text">${content.replace(/\n/g, '<br>')}</div>
        <button class="copy-btn" onclick="copyMessage('${messageId}')" title="Copy message">
          <i data-lucide="copy"></i>
        </button>
      </div>
    `;
  }

  // Add typing animation effect
  if (type === "gpt") {
    msg.style.opacity = "0";
    msg.style.transform = "translateY(20px)";
  }

  box.appendChild(msg);

  // Initialize Lucide icons immediately
  lucide.createIcons();

  // Animate message appearance
  if (type === "gpt") {
    setTimeout(() => {
      msg.style.transition = "all 0.3s ease-out";
      msg.style.opacity = "1";
      msg.style.transform = "translateY(0)";
    }, 50);
  }

  smoothScrollToBottom();
}

// Model selection based on prompt keywords
function selectModel(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("complex")) return "gpt-4-turbo";
  if (lower.includes("longer")) return "gpt-4";
  if (lower.includes("deeper")) return "gpt-3.5-turbo";
  if (lower.includes("quick")) return "deepseek-chat";
  return "gpt-3.5-turbo"; // default
}

// Error handling and user notifications
function showErrorMessage(message, type = 'error') {
  const errorDiv = document.createElement('div');
  errorDiv.className = `error-notification ${type}`;
  errorDiv.innerHTML = `
    <div class="error-content">
      <i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}"></i>
      <span>${message}</span>
      <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  // Add styles if not already present
  if (!document.querySelector('#error-styles')) {
    const errorStyles = document.createElement('style');
    errorStyles.id = 'error-styles';
    errorStyles.textContent = `
      .error-notification {
        position: fixed;
        top: 80px;
        right: 20px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
      }

      .error-notification.error {
        border-color: #ef4444;
        background: linear-gradient(135deg, rgba(239, 68, 44, 0.1), var(--bg-secondary));
      }

      .error-notification.warning {
        border-color: #f59e0b;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), var(--bg-secondary));
      }

      .error-notification.info {
        border-color: #3b82f6;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), var(--bg-secondary));
      }

      .error-content {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        color: var(--text-primary);
      }

      .error-content i {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
      }

      .error-content span {
        flex: 1;
        font-size: 0.9rem;
        line-height: 1.4;
      }

      .error-close {
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: var(--transition);
      }

      .error-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @media (max-width: 480px) {
        .error-notification {
          right: 10px;
          left: 10px;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(errorStyles);
  }

  document.body.appendChild(errorDiv);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => errorDiv.remove(), 300);
    }
  }, 5000);

  // Initialize lucide icons for the error message
  lucide.createIcons();
}

function checkNetworkConnection() {
  return navigator.onLine;
}

function getErrorMessage(error, response) {
  if (!checkNetworkConnection()) {
    return "No internet connection. Please check your network and try again.";
  }

  if (response) {
    switch (response.status) {
      case 429:
        return "Too many requests. Please wait a moment before trying again.";
      case 401:
        return "Authentication failed. Please log in again.";
      case 403:
        return "Access denied. Please check your permissions.";
      case 500:
        return "Server error. Our team has been notified. Please try again in a few minutes.";
      case 503:
        return "Service temporarily unavailable. Please try again later.";
      default:
        if (response.status >= 400 && response.status < 500) {
          return "Client error. Please check your request and try again.";
        }
        return "Network error. Please check your connection and try again.";
    }
  }

  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  if (error.message.includes('timeout')) {
    return "Request timed out. The AI might be busy. Please try again.";
  }

  return "An unexpected error occurred. Please try again or contact support if the problem persists.";
}

// GPT API call with comprehensive error handling
async function getGPTResponse(model) {
  const maxRetries = 2;
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: conversation,
          thread_id: currentThreadId
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: 'Invalid response from server' };
        }

        const errorMessage = getErrorMessage(new Error(errorData.error), response);

        // Show specific error to user
        if (response.status === 429 && retryCount < maxRetries) {
          showErrorMessage(`Rate limit exceeded. Retrying in ${(retryCount + 1) * 2} seconds...`, 'warning');
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
          retryCount++;
          continue;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.message || !data.message.content) {
        throw new Error("Invalid response format from AI service");
      }

      return data.message.content.trim();

    } catch (error) {
      console.error(`API call attempt ${retryCount + 1} failed:`, error);

      if (error.name === 'AbortError') {
        const timeoutError = "Request timed out. The AI service might be busy. Please try again.";
        if (retryCount < maxRetries) {
          showErrorMessage(`${timeoutError} Retrying...`, 'warning');
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        } else {
          showErrorMessage(timeoutError, 'error');
          return "Sorry, the request timed out. Please try again with a shorter message or try again later.";
        }
      }

      if (retryCount < maxRetries && !error.message.includes('Authentication')) {
        showErrorMessage(`Error occurred. Retrying... (${retryCount + 1}/${maxRetries})`, 'warning');
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      } else {
        const userFriendlyError = getErrorMessage(error);
        showErrorMessage(userFriendlyError, 'error');
        return `Sorry, there was an error: ${userFriendlyError}`;
      }
    }
  }

  return "Sorry, I'm unable to process your request right now. Please try again later or contact support if the problem persists.";
}

// Main chat submission flow with animations and feedback
async function submitPrompt(promptText) {
  if (!promptText.trim()) return;

  // Check if user is logged in before proceeding
  if (!isUserLoggedIn) {
    showLoginModal();
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

  // Show typing indicator instead of "Thinking..."
  showTypingIndicator();

  conversation.push({ role: "user", content: promptText });

  const selectedModel = selectModel(promptText);

  try {
    const response = await getGPTResponse(selectedModel);

    // Check if response indicates an error
    if (response.startsWith("Sorry, there was an error:") || response.startsWith("Sorry, I'm unable to process")) {
      hideTypingIndicator();
      addMessage(response, "gpt", selectedModel);
      return;
    }

    // Hide typing indicator and add the GPT response
    hideTypingIndicator();
    addMessage(response, "gpt", selectedModel);

    // Increment token usage counter and ensure it's synced
    if (tokenCounter) {
      await tokenCounter.incrementUsage();
      // Always refresh from backend to ensure sync across browsers
      await tokenCounter.refreshUsage();
    }

    conversation.push({ role: "assistant", content: response });

    // Update the current thread's conversation
    const currentThread = threads.find((t) => t.id === currentThreadId);
    if (currentThread) {
      currentThread.conversation = [...conversation]; // Save updated conversation to thread
    }

    // Generate creative thread title using the AI's response (with error handling)
    if (currentThread && currentThread.title === "New Chat") {
      try {
        const titlePrompt = `Based on this conversation: "${promptText}", generate a creative and concise title (max 4 words).`;
        conversation.push({ role: "user", content: titlePrompt });
        const titleResponse = await getGPTResponse("gpt-3.5-turbo");
        conversation.pop(); // Remove the title prompt from conversation
        currentThread.conversation = [...conversation]; // Update thread after removing title prompt

        if (titleResponse && !titleResponse.startsWith("Sorry")) {
          currentThread.title = titleResponse.replace(/["']/g, "").slice(0, 40);
        } else {
          // Fallback title based on user input
          currentThread.title = promptText.slice(0, 30) + (promptText.length > 30 ? "..." : "");
        }
      } catch (titleError) {
        console.warn("Failed to generate thread title:", titleError);
        currentThread.title = promptText.slice(0, 30) + (promptText.length > 30 ? "..." : "");
      }
    }

    // Save threads to server with error handling
    try {
      await saveUserThreads();
      updateUI();
    } catch (storageError) {
      console.warn("Failed to save to server:", storageError);
      showErrorMessage("Unable to save conversation to server. Your chat may not be persistent.", "warning");
    }

  } catch (err) {
    console.error("Submit error:", err);
    hideTypingIndicator();

    // More specific error handling
    let errorMessage = "Sorry, there was an unexpected error. Please try again.";

    if (err.message.includes("Failed to fetch")) {
      errorMessage = "Unable to connect to the AI service. Please check your internet connection and try again.";
    } else if (err.message.includes("timeout")) {
      errorMessage = "The request timed out. Please try again with a shorter message.";
    } else if (err.message.includes("rate limit")) {
      errorMessage = "Too many requests. Please wait a moment before trying again.";
    }

    addMessage(errorMessage, "gpt");
    showErrorMessage("Failed to get AI response. " + errorMessage, "error");

  } finally {
    // Enhanced button state restoration
    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span class="submit-icon"><i data-lucide="send"></i></span>';
      submitBtn.style.transform = "scale(1)";
      lucide.createIcons(); // Re-initialize icons
    }

    hideTypingIndicator();
  }
}

// Copy functionality for messages
function addCopyButton(messageElement) {
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.innerHTML = '<i data-lucide="copy"></i>';
  copyBtn.title = "Copy message";
  copyBtn.onclick = async () => {
    try {
      const content = messageElement.textContent;
      await navigator.clipboard.writeText(content);
      copyBtn.innerHTML = "✓";
      copyBtn.style.background = "#10b981";
      copyBtn.style.color = "white";
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        lucide.createIcons();
        copyBtn.style.background = "";
        copyBtn.style.color = "";
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  messageElement.appendChild(copyBtn);
}

// Add copy buttons to code blocks
function addCodeBlockCopyButtons(messageElement) {
  const codeBlocks = messageElement.querySelectorAll('pre');
  codeBlocks.forEach((pre) => {
    const copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.innerHTML = '<i data-lucide="copy"></i>';
    copyBtn.title = "Copy code";
    copyBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      transition: all 0.2s ease;
      opacity: 0;
      z-index: 10;
    `;

    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const code = pre.querySelector('code');
        const text = code ? code.textContent : pre.textContent;
        await navigator.clipboard.writeText(text);
        copyBtn.innerHTML = "✓";
        copyBtn.style.background = "#10b981";
        copyBtn.style.color = "white";
        setTimeout(() => {
          copyBtn.innerHTML = '<i data-lucide="copy"></i>';
          lucide.createIcons();
          copyBtn.style.background = "rgba(255, 255, 255, 0.1)";
          copyBtn.style.color = "rgba(255, 255, 255, 0.7)";
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code: ', err);
      }
    };

    // Show/hide copy button on hover
    pre.style.position = "relative";
    pre.addEventListener('mouseenter', () => {
      copyBtn.style.opacity = "1";
    });
    pre.addEventListener('mouseleave', () => {
      copyBtn.style.opacity = "0";
    });

    pre.appendChild(copyBtn);
  });
}

// Smooth scroll to bottom function
function smoothScrollToBottom() {
  const box = document.getElementById("output-box");
  if (box) {
    box.scrollTo({
      top: box.scrollHeight,
      behavior: 'smooth'
    });
  }
}

// Customer service function for FAB - link to contact page
function openCustomerService() {
  window.location.href = '/contact.html';
}

// Payment modal functions
function showPaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
  }
}

function hidePaymentModal() {
  const modal = document.getElementById('payment-modal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

// Handle Token Usage button click - check if user is logged in
function handleTokenUsageClick() {
  if (typeof isUserLoggedIn !== 'undefined' && isUserLoggedIn) {
    window.location.href = '/token-dashboard.html';
  } else {
    showLoginModal();
  }
}

// Lemon Squeezy payment
function redirectToLemonSqueezy() {
  window.location.href = 'https://ergovia-ai.lemonsqueezy.com/buy/00ee131b-da5f-4eef-bf32-7c12aa28a11d';
}

// Copy message function
async function copyMessage(messageId) {
  const messageElement = document.getElementById(messageId);
  if (messageElement) {
    try {
      const content = messageElement.textContent || messageElement.innerText;
      await navigator.clipboard.writeText(content);
      
      // Find and update copy button
      const copyBtn = messageElement.querySelector('.copy-btn');
      if (copyBtn) {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓';
        copyBtn.style.background = '#10b981';
        copyBtn.style.color = 'white';
        
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.style.background = '';
          copyBtn.style.color = '';
          lucide.createIcons();
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  }
}

// Typing indicator functions
function showTypingIndicator() {
  const outputBox = document.getElementById("output-box");
  if (!outputBox) return;

  // Remove existing typing indicator
  hideTypingIndicator();

  const typingDiv = document.createElement("div");
  typingDiv.className = "message gpt typing-indicator";
  typingDiv.id = "typing-indicator";
  typingDiv.innerHTML = `
    <div class="message-bubble">
      <div class="typing-animation">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;

  outputBox.appendChild(typingDiv);
  smoothScrollToBottom();
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// New chat function
async function newChat() {
  await createNewThread();
  updateUI();
}

// Show login modal function
function showLoginModal() {
  // This function should be implemented in auth.js
  if (typeof window.showLoginModal === 'function') {
    window.showLoginModal();
  } else {
    window.location.href = '/login.html';
  }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  // Initialize website cards
  initializeWebsiteCards();

  // Set up prompt input event listeners
  const promptInput = document.getElementById('prompt-input');
  if (promptInput) {
    // Handle Enter key to submit
    promptInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.value.trim();
        if (text) {
          submitPrompt(text);
        }
      }
    });

    // Character counter
    const charCounter = document.getElementById('char-counter');
    if (charCounter) {
      promptInput.addEventListener('input', function() {
        const length = this.value.length;
        charCounter.textContent = `${length}/1000`;
        
        if (length > 1000) {
          charCounter.style.color = 'var(--error-color)';
        } else {
          charCounter.style.color = 'var(--text-muted)';
        }
      });
    }
  }

  // Set up submit button
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', function() {
      const promptInput = document.getElementById('prompt-input');
      if (promptInput) {
        const text = promptInput.value.trim();
        if (text) {
          submitPrompt(text);
        }
      }
    });
  }

  // Set up quick chat buttons
  const quickButtons = document.querySelectorAll('.quick-btn');
  quickButtons.forEach(button => {
    button.addEventListener('click', function() {
      const text = this.querySelector('.btn-text').textContent.trim();
      if (text) {
        submitPrompt(text);
      }
    });
  });

  console.log('ERGOVIA-AI script initialized successfully');
});
