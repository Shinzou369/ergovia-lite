
// Load model configuration from JSON file
let modelConfig = {
  model_triggers: {
    "gpt-4-turbo": ["complex", "detailed", "thorough", "comprehensive", "advanced"],
    "gpt-4": ["longer", "extensive", "elaborate", "in-depth", "complete"],
    "gpt-3.5-turbo": ["quick", "simple", "basic", "fast", "brief"],
    "deepseek-chat": ["deeper", "creative", "deep", "innovative", "alternative"]
  },
  default_model: "gpt-3.5-turbo"
};

// Default configuration (for reset functionality)
const defaultConfig = JSON.parse(JSON.stringify(modelConfig));

// Load the configuration
async function loadConfig() {
  try {
    const response = await fetch('/model-config');
    if (response.ok) {
      modelConfig = await response.json();
      console.log("Model configuration loaded successfully");
    } else {
      console.warn("Could not load model config from server, using defaults");
    }
  } catch (err) {
    console.warn("Error loading model config:", err);
  }

  renderModelTriggers();

  // Set default model in dropdown
  const defaultModelSelect = document.getElementById('default-model');
  if (defaultModelSelect) {
    defaultModelSelect.value = modelConfig.default_model;
  }
}

// Save the configuration
async function saveConfig() {
  try {
    // Update default model from dropdown
    modelConfig.default_model = document.getElementById('default-model').value;

    const response = await fetch('/save-model-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modelConfig)
    });

    if (response.ok) {
      alert('Configuration saved successfully!');
    } else {
      alert('Error saving configuration.');
    }
  } catch (err) {
    console.error("Error saving config:", err);
    alert('Error saving configuration: ' + err.message);
  }
}

// Reset to default configuration
function resetToDefaults() {
  if (confirm('Are you sure you want to reset to default configuration?')) {
    modelConfig = JSON.parse(JSON.stringify(defaultConfig));
    renderModelTriggers();
    document.getElementById('default-model').value = modelConfig.default_model;
  }
}

// Render the model triggers UI
function renderModelTriggers() {
  const container = document.getElementById('model-triggers');
  if (!container) {
    console.error('Model triggers container not found');
    return;
  }
  
  container.innerHTML = '';

  Object.entries(modelConfig.model_triggers).forEach(([model, triggers]) => {
    const modelSection = document.createElement('div');
    modelSection.className = 'model-trigger-row';

    const modelName = document.createElement('div');
    modelName.className = 'model-name';
    modelName.textContent = formatModelName(model);

    const triggerTags = document.createElement('div');
    triggerTags.className = 'trigger-tags';

    triggers.forEach(trigger => {
      const tag = document.createElement('div');
      tag.className = 'trigger-tag';
      tag.innerHTML = `${trigger} <span class="remove-trigger" data-model="${model}" data-trigger="${trigger}">×</span>`;
      triggerTags.appendChild(tag);
    });

    const addTrigger = document.createElement('div');
    addTrigger.className = 'add-trigger';
    addTrigger.innerHTML = `
      <input type="text" placeholder="Add new trigger word" class="new-trigger-input" data-model="${model}">
      <button class="add-trigger-btn" data-model="${model}">Add</button>
    `;

    modelSection.appendChild(modelName);
    modelSection.appendChild(triggerTags);
    modelSection.appendChild(addTrigger);

    container.appendChild(modelSection);
  });

  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-trigger').forEach(btn => {
    btn.addEventListener('click', function() {
      const model = this.dataset.model;
      const trigger = this.dataset.trigger;
      const index = modelConfig.model_triggers[model].indexOf(trigger);
      if (index > -1) {
        modelConfig.model_triggers[model].splice(index, 1);
        renderModelTriggers();
      }
    });
  });

  // Add event listeners for add buttons
  document.querySelectorAll('.add-trigger-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const model = this.dataset.model;
      const input = document.querySelector(`.new-trigger-input[data-model="${model}"]`);
      const newTrigger = input.value.trim().toLowerCase();

      if (newTrigger && !modelConfig.model_triggers[model].includes(newTrigger)) {
        modelConfig.model_triggers[model].push(newTrigger);
        renderModelTriggers();
      } else if (modelConfig.model_triggers[model].includes(newTrigger)) {
        alert('This trigger already exists for this model!');
      }
    });
  });
}

// Format model name for display
function formatModelName(model) {
  switch(model) {
    case 'gpt-3.5-turbo': return 'GPT-3.5 Turbo';
    case 'gpt-4': return 'GPT-4';
    case 'gpt-4-turbo': return 'GPT-4 Turbo';
    case 'deepseek-chat': return 'DeepSeek Chat';
    default: return model;
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  // Set up event listeners with safety checks
  const saveBtn = document.getElementById('save-config');
  const resetBtn = document.getElementById('reset-defaults');
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveConfig);
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToDefaults);
  }
});
