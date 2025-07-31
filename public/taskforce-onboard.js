
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
            { key: 'pricing_info', label: 'Pricing Information', type: 'textarea', placeholder: 'Exam: $75, Vaccination: $45, etc.' },
            { key: 'booking_system_url', label: 'Online Booking URL', type: 'url', placeholder: 'https://your-booking-system.com' },
            { key: 'booking_phone', label: 'Booking Phone', type: 'tel', placeholder: '(555) 123-4567' },
            { key: 'on_call_staff_name', label: 'On-Call Staff Name', type: 'text', placeholder: 'Dr. Johnson', required: true },
            { key: 'on_call_phone', label: 'On-Call Phone', type: 'tel', placeholder: '(555) 987-6543', required: true },
            { key: 'staff_slack_channel', label: 'Slack Channel ID', type: 'text', placeholder: 'C1234567890' },
            { key: 'response_greeting', label: 'Welcome Message', type: 'text', placeholder: 'Hello! Welcome to Happy Paws Clinic' },
            { key: 'leads_sheet_id', label: 'Google Sheets ID', type: 'text', placeholder: '1YLIQeQ79ki6ZSHy4ik31KDby4SIHAIEK_47u_lWOeNs' },
            { key: 'faq_sheet_name', label: 'FAQ Sheet Name', type: 'text', placeholder: 'INFO' },
            { key: 'hitl_queue_sheet_name', label: 'Review Queue Sheet Name', type: 'text', placeholder: 'Sheet6' },
            { key: 'confidence_threshold', label: 'AI Confidence Threshold', type: 'number', placeholder: '95' }
        ]
    },
    'dental': {
        name: 'Dental Office Taskforce',
        icon: '🦷',
        description: 'AI dental assistant for appointment scheduling and patient care',
        serviceFields: [
            { key: 'office_hours', label: 'Office Hours', type: 'text', placeholder: 'Mon-Fri: 8AM-5PM' },
            { key: 'services_offered', label: 'Services Offered', type: 'textarea', placeholder: 'Cleanings, Fillings, Root Canals, Cosmetic Dentistry' },
            { key: 'dentist_name', label: 'Head Dentist', type: 'text', placeholder: 'Dr. Johnson' },
            { key: 'insurance_accepted', label: 'Insurance Accepted', type: 'textarea', placeholder: 'Delta Dental, Blue Cross, Aetna' }
        ]
    },
    'gym': {
        name: 'Gym & Fitness Center Taskforce',
        icon: '🏋️',
        description: 'AI fitness assistant for membership management and class scheduling',
        serviceFields: [
            { key: 'gym_hours', label: 'Gym Hours', type: 'text', placeholder: '24/7 or Mon-Sun: 5AM-11PM' },
            { key: 'membership_types', label: 'Membership Types', type: 'textarea', placeholder: 'Basic, Premium, VIP memberships' },
            { key: 'class_schedule', label: 'Class Schedule', type: 'textarea', placeholder: 'Yoga, Spin, CrossFit, etc.' },
            { key: 'personal_training', label: 'Personal Training', type: 'text', placeholder: 'Available with certified trainers' }
        ]
    },
    'contractors': {
        name: 'Local Contractors Taskforce',
        icon: '🔧',
        description: 'AI assistant for tradespeople and service appointments',
        serviceFields: [
            { key: 'service_area', label: 'Service Area', type: 'text', placeholder: 'City, State (radius)' },
            { key: 'services_offered', label: 'Services Offered', type: 'textarea', placeholder: 'Plumbing, Electrical, HVAC, Handyman' },
            { key: 'emergency_services', label: 'Emergency Services', type: 'text', placeholder: '24/7 Emergency available' },
            { key: 'license_info', label: 'License Information', type: 'text', placeholder: 'Licensed and Insured' }
        ]
    },
    'tutoring': {
        name: 'Tutoring & Review Centers Taskforce',
        icon: '📚',
        description: 'AI academic coordinator for class scheduling and parent communication',
        serviceFields: [
            { key: 'subjects_offered', label: 'Subjects Offered', type: 'textarea', placeholder: 'Math, Science, English, SAT/ACT Prep' },
            { key: 'grade_levels', label: 'Grade Levels', type: 'text', placeholder: 'K-12, College Prep' },
            { key: 'session_types', label: 'Session Types', type: 'text', placeholder: 'Individual, Group, Online' },
            { key: 'pricing_structure', label: 'Pricing Structure', type: 'textarea', placeholder: 'Individual: $50/hr, Group: $30/hr' }
        ]
    },
    'massage': {
        name: 'Massage Therapy Clinic Taskforce',
        icon: '💆',
        description: 'AI receptionist for session booking and customer service',
        serviceFields: [
            { key: 'clinic_hours', label: 'Clinic Hours', type: 'text', placeholder: 'Mon-Sat: 9AM-8PM' },
            { key: 'massage_types', label: 'Massage Types', type: 'textarea', placeholder: 'Swedish, Deep Tissue, Hot Stone, Prenatal' },
            { key: 'therapist_info', label: 'Therapist Information', type: 'text', placeholder: 'Licensed Massage Therapists' },
            { key: 'session_lengths', label: 'Session Lengths', type: 'text', placeholder: '30min, 60min, 90min sessions' }
        ]
    }
};

// Initialize onboarding
document.addEventListener('DOMContentLoaded', function() {
    detectTaskforceType();
    updateProgress();
    
    // Auto-load service config if taskforce is detected
    if (selectedTaskforce) {
        loadServiceConfig(selectedTaskforce);
    }
});

function detectTaskforceType() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskforceParam = urlParams.get('type');
    
    if (taskforceParam && taskforceTypes[taskforceParam]) {
        selectedTaskforce = taskforceParam;
        console.log('Auto-selected taskforce:', selectedTaskforce);
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
    
    document.querySelectorAll('.taskforce-card').forEach(card => {
        card.classList.remove('selected');
    });
    event?.target?.closest('.taskforce-card')?.classList.add('selected');
    
    document.getElementById('nextBtn1').disabled = false;
    loadServiceConfig(taskforceKey);
}

function loadServiceConfig(taskforceType) {
    const taskforce = taskforceTypes[taskforceType];
    const container = document.getElementById('serviceConfig');
    
    let html = `
        <div class="form-section">
            <h3>${taskforce.name} Configuration</h3>
    `;
    
    taskforce.serviceFields.forEach(field => {
        if (field.type === 'textarea') {
            html += `
                <div class="form-group full-width">
                    <label for="${field.key}">${field.label}</label>
                    <textarea id="${field.key}" name="${field.key}" rows="3" 
                              placeholder="${field.placeholder}"></textarea>
                </div>
            `;
        } else {
            html += `
                <div class="form-row">
                    <div class="form-group">
                        <label for="${field.key}">${field.label}</label>
                        <input type="${field.type}" id="${field.key}" name="${field.key}" 
                               placeholder="${field.placeholder}">
                    </div>
                </div>
            `;
        }
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function nextStep() {
    if (currentStep < totalSteps) {
        collectStepData();
        document.getElementById(`step${currentStep}`).classList.remove('active');
        currentStep++;
        document.getElementById(`step${currentStep}`).classList.add('active');
        document.getElementById(`dot${currentStep - 1}`).classList.add('completed');
        updateProgress();
        
        if (currentStep === 4) {
            populateReviewData();
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        document.getElementById(`step${currentStep}`).classList.remove('active');
        document.getElementById(`dot${currentStep - 1}`).classList.remove('completed');
        currentStep--;
        document.getElementById(`step${currentStep}`).classList.add('active');
        updateProgress();
    }
}

function updateProgress() {
    const progress = (currentStep - 1) / (totalSteps - 1) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

function collectStepData() {
    if (currentStep === 1) {
        // Collect business information
        clientData = {
            name: document.getElementById('businessName').value,
            email: document.getElementById('businessEmail').value,
            phone: document.getElementById('businessPhone').value,
            website_url: document.getElementById('websiteUrl').value,
            address: document.getElementById('businessAddress').value
        };
    } else if (currentStep === 2) {
        // Collect service configuration
        const taskforce = taskforceTypes[selectedTaskforce];
        taskforce.serviceFields.forEach(field => {
            const element = document.getElementById(field.key);
            if (element) {
                configData[field.key] = element.value;
            }
        });
        configData.business_name = clientData.name;
        configData.business_email = clientData.email;
        configData.business_phone = clientData.phone;
        configData.website_url = clientData.website_url;
    } else if (currentStep === 3) {
        // Collect integration data
        const integrationFields = [
            'facebook_page_token', 'facebook_page_id', 'whatsapp_token', 'whatsapp_phone_id',
            'telegram_bot_token', 'telegram_chat_id', 'sendgrid_api_key', 'twilio_account_sid',
            'twilio_auth_token', 'twilio_phone_number', 'calendly_token', 'booking_url',
            'google_calendar_id', 'google_sheets_id', 'hubspot_api_key', 'google_analytics_id',
            'stripe_secret_key', 'paypal_client_id'
        ];
        
        integrationFields.forEach(field => {
            const element = document.getElementById(field);
            if (element && element.value) {
                configData[field] = element.value;
            }
        });
    }
}

function populateReviewData() {
    const container = document.getElementById('reviewData');
    const taskforce = taskforceTypes[selectedTaskforce];
    
    let html = `
        <div class="form-section">
            <h3>Selected Taskforce</h3>
            <p><strong>${taskforce.name}</strong> - ${taskforce.description}</p>
        </div>
        
        <div class="form-section">
            <h3>Business Information</h3>
            <p><strong>Business Name:</strong> ${clientData.name}</p>
            <p><strong>Email:</strong> ${clientData.email}</p>
            <p><strong>Phone:</strong> ${clientData.phone}</p>
            ${clientData.website_url ? `<p><strong>Website:</strong> ${clientData.website_url}</p>` : ''}
        </div>
        
        <div class="form-section">
            <h3>Service Configuration</h3>
    `;
    
    taskforce.serviceFields.forEach(field => {
        if (configData[field.key]) {
            html += `<p><strong>${field.label}:</strong> ${configData[field.key]}</p>`;
        }
    });
    
    html += '</div>';
    
    const activeIntegrations = Object.keys(configData).filter(key => 
        key.includes('token') || key.includes('key') || key.includes('id')
    );
    
    if (activeIntegrations.length > 0) {
        html += `
            <div class="form-section">
                <h3>Active Integrations</h3>
                <p>${activeIntegrations.length} integration(s) configured</p>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

async function deployTaskforce() {
    document.getElementById('step' + currentStep).classList.remove('active');
    currentStep = 5;
    document.getElementById('step' + currentStep).classList.add('active');
    updateProgress();
    
    try {
        const deploymentData = {
            client_data: {
                name: clientData.name,
                email: clientData.email,
                phone: clientData.phone,
                address: clientData.address
            },
            config_data: configData,
            template_id: selectedTaskforce
        };
        
        console.log('Deploying with data:', deploymentData);
        
        const response = await fetch('/api/etf/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(deploymentData)
        });
        
        const result = await response.json();
        console.log('Deployment response:', result);
        
        if (response.ok && result.success) {
            setTimeout(() => {
                document.getElementById('step' + currentStep).classList.remove('active');
                currentStep = 6;
                document.getElementById('step' + currentStep).classList.add('active');
                document.getElementById('dot5').classList.add('completed');
                updateProgress();
                
                document.getElementById('deploymentDetails').innerHTML = 
                    '<div style="margin: 30px 0; padding: 30px; background: #f8f9fa; border-radius: 10px; text-align: left;">' +
                    '<h3>Deployment Details</h3>' +
                    '<p><strong>Taskforce Type:</strong> Pet Clinic Taskforce</p>' +
                    '<p><strong>Client ID:</strong> ' + (result.client_id || 'Generated') + '</p>' +
                    '<p><strong>Workflows Deployed:</strong> ' + (result.duplicated_workflows?.length || result.total_duplicated || 0) + '</p>' +
                    '<p><strong>Status:</strong> Active and Ready</p>' +
                    '<br><h4>Your AI assistant is now ready to:</h4>' +
                    '<ul style="text-align: left; margin: 10px 0;">' +
                    '<li>📞 Handle customer inquiries 24/7</li>' +
                    '<li>📅 Manage appointments and scheduling</li>' +
                    '<li>🚨 Detect and route emergencies</li>' +
                    '<li>💬 Provide multi-platform support</li>' +
                    '</ul></div>';
            }, 2000);
        } else {
            throw new Error(result.error || result.details || 'Deployment failed');
        }
    } catch (error) {
        console.error('Deployment error:', error);
        document.getElementById('deploymentDetails').innerHTML = 
            '<div style="color: #dc3545; padding: 20px;">' +
            '<h3>❌ Deployment Error</h3>' +
            '<p>There was an issue deploying your taskforce:</p>' +
            '<p><em>' + error.message + '</em></p>' +
            '<button class="btn btn-primary" onclick="location.reload()">Try Again</button>' +
            '</div>';
    }
}

function toggleAdvanced() {
    const content = document.getElementById('advancedIntegrations');
    const btn = document.querySelector('.toggle-btn');
    
    if (content.classList.contains('show')) {
        content.classList.remove('show');
        btn.textContent = '+ Show Advanced Integrations (Optional)';
    } else {
        content.classList.add('show');
        btn.textContent = '- Hide Advanced Integrations';
    }
}

async function loadTaskforceTemplates(taskforceType) {
    try {
        const response = await fetch(`/api/etf/templates`);
        taskforceTemplates = await response.json();
        console.log(`Loaded ${taskforceTemplates.length} templates for ${taskforceType}`);
    } catch (error) {
        console.error('Error loading taskforce templates:', error);
        taskforceTemplates = [];
    }
}
