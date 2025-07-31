
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
    }
};

// Initialize onboarding
document.addEventListener('DOMContentLoaded', function() {
    console.log('Taskforce onboard script loaded');
    detectTaskforceType();
    updateProgress();
    
    // Auto-load service config if taskforce is detected
    if (selectedTaskforce) {
        loadServiceConfig(selectedTaskforce);
    }
    
    loadTaskforceOptions();
    
    // Add demo button with delay
    setTimeout(function() {
        addDemoButton();
    }, 2000);
});

function detectTaskforceType() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskforceParam = urlParams.get('type');
    
    if (taskforceParam && taskforceTypes[taskforceParam]) {
        selectedTaskforce = taskforceParam;
        console.log('Auto-selected taskforce:', selectedTaskforce);
    } else {
        selectedTaskforce = 'pet-clinic'; // Default
    }
}

function loadTaskforceOptions() {
    const container = document.getElementById('taskforceOptions');
    if (!container) return;
    
    Object.entries(taskforceTypes).forEach(function(entry) {
        const key = entry[0];
        const taskforce = entry[1];
        const card = document.createElement('div');
        card.className = 'taskforce-card';
        card.onclick = function() { selectTaskforce(key); };
        
        card.innerHTML = '<span class="taskforce-icon">' + taskforce.icon + '</span>' +
                        '<h3>' + taskforce.name + '</h3>' +
                        '<p>' + taskforce.description + '</p>';
        
        container.appendChild(card);
    });
}

function selectTaskforce(taskforceKey) {
    selectedTaskforce = taskforceKey;
    
    document.querySelectorAll('.taskforce-card').forEach(function(card) {
        card.classList.remove('selected');
    });
    
    // Find and select the clicked card
    const cards = document.querySelectorAll('.taskforce-card');
    cards.forEach(function(card) {
        if (card.onclick && card.onclick.toString().includes(taskforceKey)) {
            card.classList.add('selected');
        }
    });
    
    const nextBtn = document.getElementById('nextBtn1');
    if (nextBtn) nextBtn.disabled = false;
    
    loadServiceConfig(taskforceKey);
}

function loadServiceConfig(taskforceType) {
    const taskforce = taskforceTypes[taskforceType];
    const container = document.getElementById('serviceConfig');
    if (!container || !taskforce) return;
    
    let html = '<div class="form-section"><h3>' + taskforce.name + ' Configuration</h3>';
    
    taskforce.serviceFields.forEach(function(field) {
        if (field.type === 'textarea') {
            html += '<div class="form-group full-width">' +
                   '<label for="' + field.key + '">' + field.label + '</label>' +
                   '<textarea id="' + field.key + '" name="' + field.key + '" rows="3" ' +
                   'placeholder="' + field.placeholder + '"></textarea></div>';
        } else {
            html += '<div class="form-row"><div class="form-group">' +
                   '<label for="' + field.key + '">' + field.label + '</label>' +
                   '<input type="' + field.type + '" id="' + field.key + '" name="' + field.key + '" ' +
                   'placeholder="' + field.placeholder + '"></div></div>';
        }
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function nextStep() {
    if (currentStep < totalSteps) {
        collectStepData();
        
        const currentStepEl = document.getElementById('step' + currentStep);
        if (currentStepEl) currentStepEl.classList.remove('active');
        
        currentStep++;
        
        const nextStepEl = document.getElementById('step' + currentStep);
        if (nextStepEl) nextStepEl.classList.add('active');
        
        const dotEl = document.getElementById('dot' + (currentStep - 1));
        if (dotEl) dotEl.classList.add('completed');
        
        updateProgress();
        
        if (currentStep === 4) {
            populateReviewData();
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        const currentStepEl = document.getElementById('step' + currentStep);
        if (currentStepEl) currentStepEl.classList.remove('active');
        
        const dotEl = document.getElementById('dot' + (currentStep - 1));
        if (dotEl) dotEl.classList.remove('completed');
        
        currentStep--;
        
        const prevStepEl = document.getElementById('step' + currentStep);
        if (prevStepEl) prevStepEl.classList.add('active');
        
        updateProgress();
    }
}

function updateProgress() {
    const progress = (currentStep - 1) / (totalSteps - 1) * 100;
    const progressFill = document.getElementById('progressFill');
    if (progressFill) progressFill.style.width = progress + '%';
}

function collectStepData() {
    if (currentStep === 1) {
        // Collect business information
        clientData = {
            name: getElementValue('businessName'),
            email: getElementValue('businessEmail'),
            phone: getElementValue('businessPhone'),
            website_url: getElementValue('websiteUrl'),
            address: getElementValue('businessAddress')
        };
    } else if (currentStep === 2) {
        // Collect service configuration
        const taskforce = taskforceTypes[selectedTaskforce];
        if (taskforce) {
            taskforce.serviceFields.forEach(function(field) {
                const value = getElementValue(field.key);
                if (value) {
                    configData[field.key] = value;
                }
            });
        }
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
        
        integrationFields.forEach(function(field) {
            const value = getElementValue(field);
            if (value) {
                configData[field] = value;
            }
        });
    }
}

function getElementValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
}

function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
        console.log('Set ' + id + ' to: ' + value);
    } else {
        console.log('Element not found: ' + id);
    }
}

function populateReviewData() {
    const container = document.getElementById('reviewData');
    if (!container) return;
    
    const taskforce = taskforceTypes[selectedTaskforce];
    if (!taskforce) return;
    
    let html = '<div class="form-section">' +
              '<h3>Selected Taskforce</h3>' +
              '<p><strong>' + taskforce.name + '</strong> - ' + taskforce.description + '</p>' +
              '</div>' +
              '<div class="form-section">' +
              '<h3>Business Information</h3>' +
              '<p><strong>Business Name:</strong> ' + (clientData.name || 'Not provided') + '</p>' +
              '<p><strong>Email:</strong> ' + (clientData.email || 'Not provided') + '</p>' +
              '<p><strong>Phone:</strong> ' + (clientData.phone || 'Not provided') + '</p>';
              
    if (clientData.website_url) {
        html += '<p><strong>Website:</strong> ' + clientData.website_url + '</p>';
    }
    
    html += '</div><div class="form-section"><h3>Service Configuration</h3>';
    
    taskforce.serviceFields.forEach(function(field) {
        if (configData[field.key]) {
            html += '<p><strong>' + field.label + ':</strong> ' + configData[field.key] + '</p>';
        }
    });
    
    html += '</div>';
    
    const activeIntegrations = Object.keys(configData).filter(function(key) {
        return (key.includes('token') || key.includes('key') || key.includes('id')) && configData[key];
    });
    
    if (activeIntegrations.length > 0) {
        html += '<div class="form-section">' +
               '<h3>Active Integrations</h3>' +
               '<p>' + activeIntegrations.length + ' integration(s) configured</p>' +
               '</div>';
    }
    
    container.innerHTML = html;
}

async function deployTaskforce() {
    const currentStepEl = document.getElementById('step' + currentStep);
    if (currentStepEl) currentStepEl.classList.remove('active');
    
    currentStep = 5;
    const deployStepEl = document.getElementById('step' + currentStep);
    if (deployStepEl) deployStepEl.classList.add('active');
    
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
            setTimeout(function() {
                const deployStepEl = document.getElementById('step' + currentStep);
                if (deployStepEl) deployStepEl.classList.remove('active');
                
                currentStep = 6;
                const successStepEl = document.getElementById('step' + currentStep);
                if (successStepEl) successStepEl.classList.add('active');
                
                const dot5 = document.getElementById('dot5');
                if (dot5) dot5.classList.add('completed');
                
                updateProgress();
                
                const deploymentDetails = document.getElementById('deploymentDetails');
                if (deploymentDetails) {
                    deploymentDetails.innerHTML = 
                        '<div style="margin: 30px 0; padding: 30px; background: #f8f9fa; border-radius: 10px; text-align: left;">' +
                        '<h3>Deployment Details</h3>' +
                        '<p><strong>Taskforce Type:</strong> Pet Clinic Taskforce</p>' +
                        '<p><strong>Client ID:</strong> ' + (result.client_id || 'Generated') + '</p>' +
                        '<p><strong>Workflows Deployed:</strong> ' + (result.duplicated_workflows ? result.duplicated_workflows.length : (result.total_duplicated || 0)) + '</p>' +
                        '<p><strong>Status:</strong> Active and Ready</p>' +
                        '<br><h4>Your AI assistant is now ready to:</h4>' +
                        '<ul style="text-align: left; margin: 10px 0;">' +
                        '<li>📞 Handle customer inquiries 24/7</li>' +
                        '<li>📅 Manage appointments and scheduling</li>' +
                        '<li>🚨 Detect and route emergencies</li>' +
                        '<li>💬 Provide multi-platform support</li>' +
                        '</ul></div>';
                }
            }, 2000);
        } else {
            throw new Error(result.error || result.details || 'Deployment failed');
        }
    } catch (error) {
        console.error('Deployment error:', error);
        const deploymentDetails = document.getElementById('deploymentDetails');
        if (deploymentDetails) {
            deploymentDetails.innerHTML = 
                '<div style="color: #dc3545; padding: 20px;">' +
                '<h3>❌ Deployment Error</h3>' +
                '<p>There was an issue deploying your taskforce:</p>' +
                '<p><em>' + error.message + '</em></p>' +
                '<button class="btn btn-primary" onclick="location.reload()">Try Again</button>' +
                '</div>';
        }
    }
}

function toggleAdvanced() {
    const content = document.getElementById('advancedIntegrations');
    const btn = document.querySelector('.toggle-btn');
    
    if (content && btn) {
        if (content.classList.contains('show')) {
            content.classList.remove('show');
            btn.textContent = '+ Show Advanced Integrations (Optional)';
        } else {
            content.classList.add('show');
            btn.textContent = '- Hide Advanced Integrations';
        }
    }
}

async function loadTaskforceTemplates(taskforceType) {
    try {
        const response = await fetch('/api/etf/templates');
        taskforceTemplates = await response.json();
        console.log('Loaded ' + taskforceTemplates.length + ' templates for ' + taskforceType);
    } catch (error) {
        console.error('Error loading taskforce templates:', error);
        taskforceTemplates = [];
    }
}

// Auto-fill form with demo data for testing
function fillDemoData() {
    try {
        console.log('🎯 Filling demo data...');
        
        // Business Information
        setElementValue('businessName', 'Demo Pet Clinic');
        setElementValue('businessEmail', 'demo@petclinic.com');
        setElementValue('businessPhone', '(555) 123-4567');
        setElementValue('websiteUrl', 'https://demopetclinic.com');
        setElementValue('businessAddress', '123 Main Street, Demo City, DC 12345');
        
        // Service Configuration (if pet-clinic is selected)
        if (selectedTaskforce === 'pet-clinic') {
            setElementValue('clinic_name', 'Demo Pet Clinic');
            setElementValue('clinic_location', 'Downtown Demo City');
            setElementValue('clinic_hours', 'Mon-Fri: 8AM-6PM, Sat: 9AM-3PM');
            setElementValue('emergency_hours', '24/7 Emergency Line Available');
            setElementValue('services_offered', 'Vaccinations, Surgery, Dental Care, Emergency Services, Grooming');
            setElementValue('head_veterinarian', 'Dr. Demo Smith');
            setElementValue('clinic_phone', '(555) 123-4567');
            setElementValue('appointment_types', 'Wellness Exam, Vaccination, Surgery, Emergency');
            setElementValue('pricing_info', 'Exam: $75, Vaccination: $45, Surgery: $200+');
            setElementValue('on_call_staff_name', 'Dr. Demo Johnson');
            setElementValue('on_call_phone', '(555) 987-6543');
            setElementValue('response_greeting', 'Hello! Welcome to Demo Pet Clinic');
            setElementValue('faq_sheet_name', 'INFO');
            setElementValue('hitl_queue_sheet_name', 'Sheet6');
            setElementValue('confidence_threshold', '95');
        }
        
        console.log('✅ Demo data filled successfully');
        alert('Demo data has been filled! You can now proceed through the steps.');
    } catch (error) {
        console.error('❌ Error filling demo data:', error);
        alert('Error filling demo data: ' + error.message);
    }
}

// Add a button to fill demo data automatically
function addDemoButton() {
    try {
        const step1 = document.getElementById('step1');
        if (step1 && !document.getElementById('demoButton')) {
            console.log('Adding demo button...');
            
            const demoBtn = document.createElement('button');
            demoBtn.id = 'demoButton';
            demoBtn.type = 'button';
            demoBtn.className = 'btn btn-secondary';
            demoBtn.textContent = '🎯 Fill Demo Data';
            demoBtn.onclick = fillDemoData;
            demoBtn.style.cssText = 
                'margin: 20px 0;' +
                'padding: 12px 24px;' +
                'background-color: #28a745;' +
                'color: white;' +
                'border: none;' +
                'border-radius: 8px;' +
                'font-weight: bold;' +
                'cursor: pointer;' +
                'display: block;' +
                'width: 200px;' +
                'font-size: 14px;';
            
            // Add hover effect
            demoBtn.onmouseover = function() {
                this.style.backgroundColor = '#218838';
            };
            demoBtn.onmouseout = function() {
                this.style.backgroundColor = '#28a745';
            };
            
            // Insert before the navigation section
            const navigation = step1.querySelector('.navigation');
            if (navigation) {
                step1.insertBefore(demoBtn, navigation);
            } else {
                step1.appendChild(demoBtn);
            }
            
            console.log('✅ Demo button added successfully');
        } else if (document.getElementById('demoButton')) {
            console.log('Demo button already exists');
        } else {
            console.log('Step1 element not found');
        }
    } catch (error) {
        console.error('❌ Error adding demo button:', error);
    }
}
