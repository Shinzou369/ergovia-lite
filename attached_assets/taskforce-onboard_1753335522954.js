
// Taskforce Onboarding JavaScript for Ergovia AI Integration
// This handles the client onboarding flow for taskforce-specific automation

let currentStep = 1;
let totalSteps = 6;
let selectedTaskforce = null;
let taskforceTemplates = [];
let clientData = {};
let configData = {};

// Taskforce definitions
const taskforceTypes = {
    'dental': {
        name: 'Dental Office Taskforce',
        icon: '🦷',
        description: 'AI front desk agent for appointment management and patient care'
    },
    'gym': {
        name: 'Gym & Fitness Center Taskforce', 
        icon: '🏋️',
        description: 'AI membership manager for lead generation and client engagement'
    },
    'contractors': {
        name: 'Local Contractors Taskforce',
        icon: '🔧', 
        description: 'AI office assistant for tradespeople and service appointments'
    },
    'tutoring': {
        name: 'Tutoring & Review Centers Taskforce',
        icon: '📚',
        description: 'AI academic coordinator for class scheduling and parent communication'
    },
    'massage': {
        name: 'Massage Therapy Clinic Taskforce',
        icon: '💆',
        description: 'AI receptionist for session booking and customer service'
    }
};

// Initialize onboarding
document.addEventListener('DOMContentLoaded', function() {
    detectTaskforceType();
    loadTaskforceOptions();
    updateProgress();
});

function detectTaskforceType() {
    // Try to detect taskforce type from URL or referrer
    const urlParams = new URLSearchParams(window.location.search);
    const taskforceParam = urlParams.get('type');
    
    if (taskforceParam && taskforceTypes[taskforceParam]) {
        selectedTaskforce = taskforceParam;
        // Auto-select if coming from specific taskforce page
        setTimeout(() => {
            selectTaskforce(taskforceParam);
        }, 500);
    }
}

function loadTaskforceOptions() {
    const container = document.getElementById('taskforceOptions');
    
    Object.entries(taskforceTypes).forEach(([key, taskforce]) => {
        const card = document.createElement('div');
        card.className = 'taskforce-card';
        card.onclick = () => selectTaskforce(key);
        
        card.innerHTML = `
            <span class="taskforce-icon">${taskforce.icon}</span>
            <h3>${taskforce.name}</h3>
            <p>${taskforce.description}</p>
        `;
        
        container.appendChild(card);
    });
}

function selectTaskforce(taskforceKey) {
    selectedTaskforce = taskforceKey;
    
    // Update UI
    document.querySelectorAll('.taskforce-card').forEach(card => {
        card.classList.remove('selected');
    });
    event?.target?.closest('.taskforce-card')?.classList.add('selected');
    
    // Enable next button
    document.getElementById('nextBtn1').disabled = false;
    
    // Load templates for this taskforce
    loadTaskforceTemplates(taskforceKey);
}

async function loadTaskforceTemplates(taskforceType) {
    try {
        const response = await fetch(`/api/taskforce/${taskforceType}/templates`);
        taskforceTemplates = await response.json();
        console.log(`Loaded ${taskforceTemplates.length} templates for ${taskforceType}`);
    } catch (error) {
        console.error('Error loading taskforce templates:', error);
        taskforceTemplates = [];
    }
}

function nextStep() {
    if (!validateCurrentStep()) return;
    
    if (currentStep < totalSteps - 1) {
        // Hide current step
        document.getElementById(`step${currentStep}`).classList.remove('active');
        
        // Update step indicator
        document.getElementById(`dot${currentStep}`).classList.remove('active');
        document.getElementById(`dot${currentStep}`).classList.add('completed');
        
        // Move to next step
        currentStep++;
        document.getElementById(`step${currentStep}`).classList.add('active');
        document.getElementById(`dot${currentStep}`).classList.add('active');
        
        updateProgress();
        
        // Handle step-specific logic
        if (currentStep === 3) {
            generateDynamicFields();
        } else if (currentStep === 4) {
            generateReviewContent();
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        // Hide current step
        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`dot${currentStep}`).classList.remove('active');
        
        // Move to previous step
        currentStep--;
        document.getElementById(`step${currentStep}`).classList.add('active');
        document.getElementById(`dot${currentStep}`).classList.remove('completed');
        document.getElementById(`dot${currentStep}`).classList.add('active');
        
        updateProgress();
    }
}

function updateProgress() {
    const progressPercent = ((currentStep - 1) / (totalSteps - 2)) * 100; // -2 because last step is success
    document.getElementById('progressFill').style.width = `${progressPercent}%`;
}

function validateCurrentStep() {
    switch (currentStep) {
        case 1:
            return selectedTaskforce !== null;
        
        case 2:
            const name = document.getElementById('businessName').value.trim();
            const email = document.getElementById('businessEmail').value.trim();
            const phone = document.getElementById('businessPhone').value.trim();
            
            if (!name || !email || !phone) {
                alert('Please fill in all required fields');
                return false;
            }
            
            clientData = { name, email, phone };
            return true;
        
        case 3:
            // Validate dynamic fields
            const requiredFields = document.querySelectorAll('#dynamicFields input[required], #dynamicFields select[required]');
            
            for (let field of requiredFields) {
                if (!field.value.trim()) {
                    alert(`Please fill in: ${field.previousElementSibling.textContent.replace(' *', '')}`);
                    field.focus();
                    return false;
                }
            }
            
            // Collect configuration data
            configData = {};
            const allFields = document.querySelectorAll('#dynamicFields input, #dynamicFields select, #dynamicFields textarea');
            allFields.forEach(field => {
                configData[field.name] = field.value;
            });
            
            return true;
        
        case 4:
            return true; // Review step, always valid
        
        default:
            return true;
    }
}

function generateDynamicFields() {
    const container = document.getElementById('dynamicFields');
    
    if (taskforceTemplates.length === 0) {
        container.innerHTML = '<p>Loading taskforce configuration...</p>';
        return;
    }
    
    // Get the first available template (you could allow selection if multiple)
    const template = taskforceTemplates[0];
    const fields = template.config_fields || [];
    
    if (fields.length === 0) {
        container.innerHTML = '<p>No additional configuration required for this taskforce.</p>';
        return;
    }
    
    const html = fields.map(field => {
        let inputHtml = '';
        
        if (field.type === 'select' && field.options) {
            inputHtml = `
                <select name="${field.key}" ${field.required ? 'required' : ''}>
                    <option value="">Select ${field.label}</option>
                    ${field.options.map(option => `<option value="${option}">${option}</option>`).join('')}
                </select>
            `;
        } else if (field.type === 'textarea') {
            inputHtml = `
                <textarea 
                    name="${field.key}" 
                    ${field.required ? 'required' : ''}
                    placeholder="Enter ${field.label.toLowerCase()}"
                    rows="4"
                ></textarea>
            `;
        } else {
            inputHtml = `
                <input 
                    type="${field.type}" 
                    name="${field.key}" 
                    ${field.required ? 'required' : ''}
                    placeholder="Enter ${field.label.toLowerCase()}"
                >
            `;
        }
        
        return `
            <div class="form-group">
                <label for="${field.key}">
                    ${field.label} 
                    ${field.required ? '<span class="required">*</span>' : ''}
                </label>
                ${inputHtml}
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function generateReviewContent() {
    const container = document.getElementById('reviewContent');
    const taskforceInfo = taskforceTypes[selectedTaskforce];
    
    let configItems = '';
    if (Object.keys(configData).length > 0) {
        configItems = Object.entries(configData).map(([key, value]) => {
            const displayKey = key.split('_').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            
            // Hide sensitive data
            const displayValue = key.includes('password') || key.includes('token') || key.includes('key') 
                ? '*'.repeat(Math.min(value.length, 8))
                : value;
            
            return `
                <div class="config-item">
                    <span class="config-label">${displayKey}:</span>
                    <span class="config-value">${displayValue}</span>
                </div>
            `;
        }).join('');
    }
    
    const html = `
        <h3>${taskforceInfo.icon} ${taskforceInfo.name}</h3>
        <p style="color: #6c757d; margin-bottom: 30px;">${taskforceInfo.description}</p>
        
        <h4 style="margin-bottom: 15px;">Business Information</h4>
        <div class="config-item">
            <span class="config-label">Business Name:</span>
            <span class="config-value">${clientData.name}</span>
        </div>
        <div class="config-item">
            <span class="config-label">Email:</span>
            <span class="config-value">${clientData.email}</span>
        </div>
        <div class="config-item">
            <span class="config-label">Phone:</span>
            <span class="config-value">${clientData.phone}</span>
        </div>
        
        ${configItems ? `
            <h4 style="margin: 30px 0 15px 0;">Automation Configuration</h4>
            ${configItems}
        ` : ''}
        
        <div style="margin-top: 30px; padding: 20px; background: #e8f5e8; border-radius: 10px; border-left: 4px solid #28a745;">
            <strong>Ready for Deployment</strong><br>
            Your personalized ${taskforceInfo.name.toLowerCase()} will be created and activated automatically.
        </div>
    `;
    
    container.innerHTML = html;
}

async function deployTaskforce() {
    // Move to deployment step
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep = 5;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateProgress();
    
    try {
        const deploymentData = {
            client_data: clientData,
            config_data: configData,
            template_id: taskforceTemplates[0]?.id || 'default'
        };
        
        const response = await fetch(`/api/taskforce/${selectedTaskforce}/deploy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(deploymentData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Success - move to final step
            setTimeout(() => {
                document.getElementById(`step${currentStep}`).classList.remove('active');
                currentStep = 6;
                document.getElementById(`step${currentStep}`).classList.add('active');
                document.getElementById(`dot5`).classList.add('completed');
                updateProgress();
                
                // Show deployment details
                const taskforceInfo = taskforceTypes[selectedTaskforce];
                document.getElementById('deploymentDetails').innerHTML = `
                    <div style="margin: 30px 0; padding: 30px; background: #f8f9fa; border-radius: 15px;">
                        <h3>${taskforceInfo.icon} ${result.workflow_name}</h3>
                        <div style="margin: 20px 0;">
                            <p><strong>Workflow ID:</strong> ${result.workflow_id}</p>
                            <p><strong>Status:</strong> Active & Running</p>
                            <p><strong>Client:</strong> ${clientData.name}</p>
                        </div>
                        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin-top: 20px;">
                            <strong>🎉 Your taskforce is now working for you!</strong><br>
                            The automation will start processing immediately and work 24/7 for your business.
                        </div>
                    </div>
                `;
            }, 2000);
        } else {
            throw new Error(result.error || 'Deployment failed');
        }
        
    } catch (error) {
        console.error('Deployment error:', error);
        alert(`Deployment failed: ${error.message}`);
        
        // Go back to review step
        document.getElementById(`step${currentStep}`).classList.remove('active');
        currentStep = 4;
        document.getElementById(`step${currentStep}`).classList.add('active');
        updateProgress();
    }
}

// Utility functions
function formatLabel(key) {
    return key.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}
