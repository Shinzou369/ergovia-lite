
// Taskforce Onboarding JavaScript for ERGOVIA AI Integration
// This handles the client onboarding flow for taskforce-specific automation

let currentStep = 1;
let totalSteps = 6;
let selectedTaskforce = null;
let taskforceTemplates = [];
let clientData = {};
let configData = {};

// Taskforce definitions
const taskforceTypes = {
    'pet-clinic': {
        name: 'Pet Clinic Taskforce',
        icon: '🐾',
        description: 'AI veterinary assistant for appointment management and patient care',
        serviceFields: [
            { key: 'clinic_name', label: 'Clinic Name', type: 'text', placeholder: 'Happy Paws Veterinary Clinic', required: true },
            { key: 'clinic_location', label: 'Clinic Location', type: 'text', placeholder: 'Downtown Springfield', required: true },
            { key: 'clinic_hours', label: 'Clinic Hours', type: 'text', placeholder: 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM', required: true },
            { key: 'emergency_hours', label: 'Emergency Hours', type: 'text', placeholder: '24/7 Emergency Line Available' },
            { key: 'services_offered', label: 'Services Offered', type: 'textarea', placeholder: 'Vaccinations, Surgery, Dental Care, Emergency Services, Grooming', required: true },
            { key: 'head_veterinarian', label: 'Head Veterinarian', type: 'text', placeholder: 'Dr. Smith', required: true },
            { key: 'clinic_phone', label: 'Clinic Phone', type: 'tel', placeholder: '(555) 123-4567', required: true },
            { key: 'appointment_types', label: 'Appointment Types', type: 'textarea', placeholder: 'Wellness Exam, Vaccination, Surgery, Emergency', required: true },
            { key: 'pricing_info', label: 'Pricing Information', type: 'textarea', placeholder: 'Exam: $75, Vaccination: $45, etc.' }
        ]
    },
    'dental': {
        name: 'Dental Office Taskforce',
        icon: '🦷',
        description: 'AI front desk agent for appointment management and patient care',
        serviceFields: [
            { key: 'practice_name', label: 'Practice Name', type: 'text', required: true },
            { key: 'dentist_name', label: 'Lead Dentist', type: 'text', required: true },
            { key: 'office_hours', label: 'Office Hours', type: 'text', required: true },
            { key: 'services_offered', label: 'Services Offered', type: 'textarea', required: true }
        ]
    },
    'gym': {
        name: 'Gym & Fitness Center Taskforce', 
        icon: '🏋️',
        description: 'AI membership manager for lead generation and client engagement',
        serviceFields: [
            { key: 'gym_name', label: 'Gym Name', type: 'text', required: true },
            { key: 'membership_types', label: 'Membership Types', type: 'textarea', required: true },
            { key: 'operating_hours', label: 'Operating Hours', type: 'text', required: true },
            { key: 'facilities', label: 'Facilities & Equipment', type: 'textarea', required: true }
        ]
    },
    'contractors': {
        name: 'Local Contractors Taskforce',
        icon: '🔧', 
        description: 'AI office assistant for tradespeople and service appointments',
        serviceFields: [
            { key: 'company_name', label: 'Company Name', type: 'text', required: true },
            { key: 'services_provided', label: 'Services Provided', type: 'textarea', required: true },
            { key: 'service_area', label: 'Service Area', type: 'text', required: true },
            { key: 'emergency_services', label: 'Emergency Services', type: 'text', required: false }
        ]
    },
    'tutoring': {
        name: 'Tutoring & Review Centers Taskforce',
        icon: '📚',
        description: 'AI academic coordinator for class scheduling and parent communication',
        serviceFields: [
            { key: 'center_name', label: 'Center Name', type: 'text', required: true },
            { key: 'subjects_offered', label: 'Subjects Offered', type: 'textarea', required: true },
            { key: 'age_groups', label: 'Age Groups Served', type: 'text', required: true },
            { key: 'session_types', label: 'Session Types', type: 'textarea', required: true }
        ]
    },
    'massage': {
        name: 'Massage Therapy Clinic Taskforce',
        icon: '💆',
        description: 'AI receptionist for session booking and customer service',
        serviceFields: [
            { key: 'clinic_name', label: 'Clinic Name', type: 'text', required: true },
            { key: 'therapist_names', label: 'Therapist Names', type: 'textarea', required: true },
            { key: 'massage_types', label: 'Massage Types', type: 'textarea', required: true },
            { key: 'operating_hours', label: 'Operating Hours', type: 'text', required: true }
        ]
    }
};

// Initialize onboarding
document.addEventListener('DOMContentLoaded', function() {
    detectTaskforceType();
    loadTaskforceOptions();
    updateProgress();
    
    // Auto-load service config if taskforce is detected
    if (selectedTaskforce) {
        loadServiceConfig(selectedTaskforce);
    }
});

function detectTaskforceType() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskforceParam = urlParams.get('type');
    
    // Check URL parameter first
    if (taskforceParam && taskforceTypes[taskforceParam]) {
        selectedTaskforce = taskforceParam;
        return;
    }
    
    // Check URL path for taskforce type
    const path = window.location.pathname;
    if (path.includes('/pet-clinic/')) {
        selectedTaskforce = 'pet-clinic';
    } else if (path.includes('/dental/')) {
        selectedTaskforce = 'dental';
    } else if (path.includes('/gym/')) {
        selectedTaskforce = 'gym';
    } else if (path.includes('/contractors/')) {
        selectedTaskforce = 'contractors';
    } else if (path.includes('/tutoring/')) {
        selectedTaskforce = 'tutoring';
    } else if (path.includes('/massage/')) {
        selectedTaskforce = 'massage';
    } else {
        // Default fallback
        selectedTaskforce = 'pet-clinic';
    }
}

function loadTaskforceOptions() {
    const taskforceSelect = document.getElementById('taskforceSelect');
    if (!taskforceSelect) return;
    
    taskforceSelect.innerHTML = '';
    
    Object.entries(taskforceTypes).forEach(([key, taskforce]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = taskforce.name;
        option.selected = key === selectedTaskforce;
        taskforceSelect.appendChild(option);
    });
}

function loadServiceConfig(taskforceType) {
    const configContainer = document.getElementById('serviceConfigFields');
    if (!configContainer) return;
    
    const taskforce = taskforceTypes[taskforceType];
    if (!taskforce) return;
    
    configContainer.innerHTML = '';
    
    taskforce.serviceFields.forEach(field => {
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = field.label + (field.required ? ' *' : '');
        label.htmlFor = field.key;
        
        let input;
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else {
            input = document.createElement('input');
            input.type = field.type;
        }
        
        input.id = field.key;
        input.name = field.key;
        input.placeholder = field.placeholder || '';
        input.required = field.required || false;
        input.className = 'form-control';
        
        fieldContainer.appendChild(label);
        fieldContainer.appendChild(input);
        configContainer.appendChild(fieldContainer);
    });
}

function updateProgress() {
    // Update progress bar
    const progressBar = document.querySelector('.progress-fill');
    if (progressBar) {
        const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
        progressBar.style.width = progressPercent + '%';
    }
    
    // Update progress dots
    for (let i = 1; i <= totalSteps; i++) {
        const dot = document.getElementById('dot' + i);
        if (dot) {
            dot.classList.remove('active', 'completed');
            if (i < currentStep) {
                dot.classList.add('completed');
            } else if (i === currentStep) {
                dot.classList.add('active');
            }
        }
    }
}

function validateCurrentStep() {
    const currentStepElement = document.getElementById('step' + currentStep);
    if (!currentStepElement) return true;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], textarea[required], select[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('error');
            isValid = false;
        } else {
            field.classList.remove('error');
        }
    });
    
    if (!isValid) {
        alert('Please fill in all required fields before continuing.');
    }
    
    return isValid;
}

function collectStepData() {
    const currentStepElement = document.getElementById('step' + currentStep);
    if (!currentStepElement) return;
    
    const formData = new FormData();
    const inputs = currentStepElement.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
        if (input.name) {
            if (currentStep === 2) {
                clientData[input.name] = input.value;
            } else if (currentStep === 3) {
                configData[input.name] = input.value;
            }
        }
    });
}

function nextStep() {
    if (validateCurrentStep()) {
        collectStepData();
        
        document.getElementById('step' + currentStep).classList.remove('active');
        
        if (currentStep < totalSteps) {
            currentStep++;
            document.getElementById('step' + currentStep).classList.add('active');
            updateProgress();
            
            // Special handling for review step
            if (currentStep === 4) {
                populateReviewStep();
            }
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        document.getElementById('step' + currentStep).classList.remove('active');
        currentStep--;
        document.getElementById('step' + currentStep).classList.add('active');
        updateProgress();
    }
}

function populateReviewStep() {
    const reviewContainer = document.getElementById('reviewDetails');
    if (!reviewContainer) return;
    
    const taskforce = taskforceTypes[selectedTaskforce];
    
    let reviewHTML = `
        <div class="review-section">
            <h4>Selected Taskforce</h4>
            <p><strong>${taskforce.name}</strong></p>
            <p>${taskforce.description}</p>
        </div>
        
        <div class="review-section">
            <h4>Business Information</h4>
            <p><strong>Name:</strong> ${clientData.business_name || 'Not provided'}</p>
            <p><strong>Email:</strong> ${clientData.business_email || 'Not provided'}</p>
            <p><strong>Phone:</strong> ${clientData.business_phone || 'Not provided'}</p>
        </div>
        
        <div class="review-section">
            <h4>Service Configuration</h4>
    `;
    
    Object.entries(configData).forEach(([key, value]) => {
        if (value) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            reviewHTML += `<p><strong>${label}:</strong> ${value}</p>`;
        }
    });
    
    reviewHTML += '</div>';
    reviewContainer.innerHTML = reviewHTML;
}

async function deployTaskforce() {
    // Move to deployment step
    document.getElementById('step4').classList.remove('active');
    currentStep = 5;
    document.getElementById('step5').classList.add('active');
    updateProgress();
    
    try {
        const deploymentData = {
            client_data: {
                name: clientData.business_name,
                email: clientData.business_email,
                phone: clientData.business_phone
            },
            config_data: configData,
            taskforce_type: selectedTaskforce
        };
        
        const response = await fetch('/api/etf/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(deploymentData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Move to success step
            document.getElementById('step5').classList.remove('active');
            currentStep = 6;
            document.getElementById('step6').classList.add('active');
            updateProgress();
            
            // Show deployment details
            const detailsContainer = document.getElementById('deploymentDetails');
            if (detailsContainer) {
                detailsContainer.innerHTML = `
                    <div class="deployment-success">
                        <h4>Deployment Details</h4>
                        <p><strong>Client ID:</strong> ${result.client_id}</p>
                        <p><strong>Workflows Created:</strong> ${result.total_duplicated}</p>
                        <div class="workflow-list">
                            ${result.duplicated_workflows.map(workflow => `
                                <div class="workflow-item">
                                    <strong>${workflow.new_name}</strong>
                                    <small>ID: ${workflow.new_id}</small>
                                </div>
                            `).join('')}
                        </div>
                        <p class="success-message">${result.message}</p>
                    </div>
                `;
            }
        } else {
            throw new Error(result.error || 'Deployment failed');
        }
    } catch (error) {
        console.error('Deployment error:', error);
        
        // Show error message
        const errorContainer = document.getElementById('step5');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <h3>Deployment Failed</h3>
                    <p>There was an error deploying your taskforce: ${error.message}</p>
                    <button class="btn btn-secondary" onclick="retryDeployment()">Try Again</button>
                    <button class="btn btn-secondary" onclick="prevStep()">Go Back</button>
                </div>
            `;
        }
    }
}

function retryDeployment() {
    // Reset to deployment step
    const step5 = document.getElementById('step5');
    if (step5) {
        step5.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <h3>Deploying Your Taskforce...</h3>
                <p>Creating your personalized AI automation workflow...</p>
            </div>
        `;
    }
    
    // Retry deployment
    setTimeout(deployTaskforce, 1000);
}

// Handle taskforce selection change
function onTaskforceSelect() {
    const select = document.getElementById('taskforceSelect');
    if (select) {
        selectedTaskforce = select.value;
        loadServiceConfig(selectedTaskforce);
    }
}

// Add event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const taskforceSelect = document.getElementById('taskforceSelect');
    if (taskforceSelect) {
        taskforceSelect.addEventListener('change', onTaskforceSelect);
    }
});
