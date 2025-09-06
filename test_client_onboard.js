
```javascript
// Test script to simulate a client filling out the ETF onboarding form
const axios = require('axios');

async function testClientOnboarding() {
    console.log('🧪 Starting ETF Client Onboarding Test...');
    
    // Simulate a real pet clinic client data
    const testClientData = {
        // Core Business Information
        businessName: "Happy Paws Veterinary Clinic",
        businessEmail: "contact@happypaws.com", 
        businessPhone: "+1-555-123-4567",
        websiteUrl: "https://happypaws.com",
        businessAddress: "123 Pet Street, Animal City, AC 12345",
        
        // Business Configuration
        clinicName: "Happy Paws Veterinary Clinic",
        primary_veterinarian: "Dr. Sarah Johnson",
        managerName: "John Smith",
        billingEmail: "billing@happypaws.com",
        bookingUrl: "https://booking.happypaws.com",
        practiceName: "Happy Paws Veterinary Practice",
        clinicHours: "Mon-Fri: 8AM-6PM, Sat: 9AM-3PM, Sun: Emergency Only",
        emergencyContact: "+1-555-EMERGENCY",
        servicesOffered: "Vaccinations, Surgery, Dental Care, Emergency Services, Grooming, Boarding",
        vetLicense: "VET12345",
        supportEmail: "support@happypaws.com",
        businessColor: "#4CAF50",
        businessWebsite: "https://happypaws.com",
        businessCategory: "veterinary",
        veterinarian_names: "Dr. Sarah Johnson\nDr. Michael Chen\nDr. Emily Rodriguez",
        
        // API Credentials (using test/demo values)
        telegram_bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyzABCDEF123456",
        telegram_chat_id: "-1001234567890",
        twilio_account_sid: "AC1234567890abcdef1234567890abcdef12",
        twilio_auth_token: "your_twilio_auth_token_here",
        twilio_phone_number: "+15551234567",
        openai_api_key: "sk-test1234567890abcdefghijklmnopqrstuvwxyz",
        sendgrid_api_key: "SG.test_sendgrid_key_here",
        
        // Configuration Settings
        timezone: "America/New_York",
        reminder_interval: "2",
        cancellation_policy: "24-hour",
        cancellation_fee: "50",
        no_show_policy: "warning",
        data_retention_years: "5",
        
        // Email Configuration
        from_email: "noreply@happypaws.com",
        from_name: "Happy Paws Clinic",
        
        // Optional integrations
        calendly_api_key: "calendly_test_token",
        calendly_url: "https://calendly.com/happypaws",
        facebook_access_token: "facebook_test_token",
        twitter_api_key: "twitter_test_key",
        slack_bot_token: "xoxb-slack-test-token",
        
        // Social Media Config
        facebook_page_id: "1234567890123456",
        whatsapp_phone_id: "1234567890123456",
        
        // Payment Integration (optional)
        stripeSecretKey: "sk_test_stripe_secret_key",
        stripePublishableKey: "pk_test_stripe_publishable_key",
        
        // Advanced Settings
        webhook_secret: "auto_generated_webhook_secret",
        api_rate_limit: "1000",
        backup_frequency: "daily"
    };
    
    console.log('📋 Client Data Prepared:', {
        businessName: testClientData.businessName,
        businessEmail: testClientData.businessEmail,
        clinicName: testClientData.clinicName,
        primaryVet: testClientData.primary_veterinarian,
        timezone: testClientData.timezone
    });
    
    // Prepare deployment payload
    const deploymentPayload = {
        client_data: {
            name: testClientData.businessName,
            email: testClientData.businessEmail,
            phone: testClientData.businessPhone
        },
        config_data: testClientData,
        test_mode: true // Enable test mode to use TEST tagged workflows
    };
    
    console.log('🚀 Submitting ETF deployment request...');
    
    try {
        // Make the API call to deploy workflows
        const response = await axios.post('http://localhost:3000/api/etf/deploy', deploymentPayload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });
        
        if (response.data.success) {
            console.log('✅ ETF Deployment Successful!');
            console.log('📊 Results Summary:');
            console.log(`   • Client ID: ${response.data.client_id}`);
            console.log(`   • Total Workflows Processed: ${response.data.total_processed}`);
            console.log(`   • Successfully Activated: ${response.data.activated_workflows}`);
            console.log(`   • Need Credentials Setup: ${response.data.workflows_needing_credentials}`);
            console.log(`   • Failed Workflows: ${response.data.failed_workflows}`);
            console.log(`   • Client Tag Applied: ${response.data.tag_applied}`);
            
            if (response.data.openai_setup && response.data.openai_setup.success) {
                console.log('🔑 OpenAI Setup:', response.data.openai_setup);
            }
            
            console.log('\n📋 Workflow Details:');
            response.data.duplicated_workflows.forEach((workflow, index) => {
                console.log(`   ${index + 1}. ${workflow.new_name || workflow.original_name}`);
                console.log(`      • N8N ID: ${workflow.new_id}`);
                console.log(`      • Status: ${workflow.activation_status}`);
                if (workflow.activation_error) {
                    console.log(`      • Error: ${workflow.activation_error}`);
                }
            });
            
            console.log(`\n🎯 Message: ${response.data.message}`);
            
            return {
                success: true,
                data: response.data
            };
            
        } else {
            throw new Error(response.data.error || 'Unknown deployment error');
        }
        
    } catch (error) {
        console.error('❌ ETF Deployment Failed:');
        
        if (error.response) {
            console.error(`   • Status: ${error.response.status}`);
            console.error(`   • Error: ${error.response.data?.error || error.message}`);
            console.error(`   • Details: ${error.response.data?.details || 'No additional details'}`);
        } else if (error.request) {
            console.error('   • Network Error: No response received from server');
            console.error(`   • Request Details: ${error.message}`);
        } else {
            console.error(`   • Error: ${error.message}`);
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Additional test to check N8N workflow status
async function checkWorkflowStatus(clientTag) {
    console.log('\n🔍 Checking N8N Workflow Status...');
    
    try {
        const response = await axios.get('http://localhost:3000/api/etf/debug/workflows');
        
        if (response.data.success) {
            const petWorkflows = response.data.pet_workflows.list;
            console.log(`📊 Found ${petWorkflows.length} PET workflows in N8N:`);
            
            petWorkflows.forEach((workflow, index) => {
                console.log(`   ${index + 1}. ${workflow.name}`);
                console.log(`      • ID: ${workflow.id}`);
                console.log(`      • Active: ${workflow.active ? '✅' : '❌'}`);
                console.log(`      • Tags: ${workflow.tags.map(tag => typeof tag === 'string' ? tag : tag.name).join(', ')}`);
            });
            
            // Look for our client's workflows
            const clientWorkflows = petWorkflows.filter(w => 
                w.name.includes('Happy Paws') || 
                w.tags.some(tag => (typeof tag === 'string' ? tag : tag.name).includes('Happy Paws'))
            );
            
            if (clientWorkflows.length > 0) {
                console.log(`\n🎯 Found ${clientWorkflows.length} workflows for our test client:`);
                clientWorkflows.forEach((workflow, index) => {
                    console.log(`   ${index + 1}. ${workflow.name} (${workflow.active ? 'Active' : 'Inactive'})`);
                });
            } else {
                console.log('\n⚠️ No workflows found for our test client yet - they might still be processing');
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to check workflow status:', error.message);
    }
}

// Run the test
async function runFullTest() {
    console.log('🧪 === ETF CLIENT ONBOARDING SIMULATION ===\n');
    
    const result = await testClientOnboarding();
    
    if (result.success) {
        console.log('\n✅ Test completed successfully!');
        
        // Wait a moment then check workflow status
        setTimeout(() => {
            checkWorkflowStatus('PET[Happy Paws Veterinary Clinic]');
        }, 2000);
        
    } else {
        console.log('\n❌ Test failed. Please check the server logs and try again.');
    }
    
    console.log('\n🧪 === TEST COMPLETE ===');
}

// Export for use as module or run directly
if (require.main === module) {
    runFullTest().catch(console.error);
}

module.exports = {
    testClientOnboarding,
    checkWorkflowStatus,
    runFullTest
};
```
