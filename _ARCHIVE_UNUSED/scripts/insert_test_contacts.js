/**
 * INSERT TEST CONTACT DATA
 *
 * Populates property_configurations and owners tables with real contact data
 * so SUB: Owner & Staff Notifier can resolve recipients and send notifications.
 *
 * Uses n8n API to execute SQL against the live PostgreSQL database
 * (same approach as other deployment scripts).
 *
 * Usage: node scripts/insert_test_contacts.js [telegram_chat_id]
 *
 * If no chat_id provided, uses a placeholder. You can get your Telegram chat_id by:
 *   1. Message @userinfobot on Telegram
 *   2. It replies with your chat ID
 */

const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const POSTGRES_CRED_ID = 'BWlLUMKn64aZsHi8'; // [Client] PostgreSQL

function apiCall(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://n8n.ergovia-ai.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const telegramChatId = process.argv[2] || 'REPLACE_WITH_YOUR_CHAT_ID';

  console.log('=== INSERT TEST CONTACT DATA ===\n');
  console.log('Telegram Chat ID:', telegramChatId);

  if (telegramChatId === 'REPLACE_WITH_YOUR_CHAT_ID') {
    console.log('\nWARNING: No Telegram chat_id provided.');
    console.log('Usage: node scripts/insert_test_contacts.js YOUR_CHAT_ID');
    console.log('Get your chat_id by messaging @userinfobot on Telegram.\n');
    console.log('Proceeding with placeholder value...\n');
  }

  // ============================================
  // Step 1: Run migration 002 (notification_log table)
  // ============================================
  console.log('--- Step 1: Run migration_002 (notification_log table) ---');

  const migrationSQL = `
    CREATE TABLE IF NOT EXISTS notification_log (
      id SERIAL PRIMARY KEY,
      notification_id UUID DEFAULT uuid_generate_v4(),
      property_id VARCHAR(255),
      recipient_type VARCHAR(50),
      recipient_name VARCHAR(255),
      channel VARCHAR(50),
      recipient_address VARCHAR(255),
      event_type VARCHAR(100),
      message TEXT,
      status VARCHAR(50) DEFAULT 'sent',
      error_message TEXT,
      customer_id UUID,
      execution_id VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notification_log_property ON notification_log(property_id);
    CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
  `;

  // We'll create a temporary workflow to run SQL
  const sqlWorkflow = {
    name: '_TEMP_Insert_Test_Data',
    nodes: [
      {
        parameters: {},
        id: 'trigger',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0]
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: migrationSQL,
          options: {}
        },
        id: 'run-migration',
        name: 'Run Migration',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [220, 0],
        credentials: {
          postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
        }
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: `
            -- List all properties so we know what property_ids exist
            SELECT property_id, property_name, owner_name, owner_telegram, owner_phone, preferred_platform
            FROM property_configurations
            ORDER BY created_at DESC
            LIMIT 10
          `,
          options: {}
        },
        id: 'list-properties',
        name: 'List Properties',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [440, 0],
        credentials: {
          postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
        }
      }
    ],
    connections: {
      'Manual Trigger': { main: [[{ node: 'Run Migration', type: 'main', index: 0 }]] },
      'Run Migration': { main: [[{ node: 'List Properties', type: 'main', index: 0 }]] }
    },
    settings: { executionOrder: 'v1' }
  };

  // Create temp workflow
  const createRes = await apiCall('POST', '/api/v1/workflows', sqlWorkflow);
  if (createRes.status !== 200 && createRes.status !== 201) {
    console.log('ERROR creating temp workflow:', createRes.status, JSON.stringify(createRes.data).substring(0, 300));
    return;
  }
  const tempWfId = createRes.data.id;
  console.log('  Created temp workflow:', tempWfId);

  // Execute it
  await sleep(1000);
  const execRes = await apiCall('POST', `/api/v1/workflows/${tempWfId}/run`, {});
  if (execRes.status !== 200 && execRes.status !== 201) {
    console.log('ERROR executing:', execRes.status, JSON.stringify(execRes.data).substring(0, 300));
    await apiCall('DELETE', `/api/v1/workflows/${tempWfId}`);
    return;
  }

  console.log('  Migration executed successfully');

  // Check execution result
  const execData = execRes.data;
  const listResult = execData?.data?.resultData?.runData?.['List Properties']?.[0]?.data?.main?.[0];

  if (listResult && listResult.length > 0) {
    console.log('\n  Current properties in database:');
    listResult.forEach(item => {
      const d = item.json;
      console.log(`    ${d.property_id} | ${d.property_name || '(unnamed)'} | telegram: ${d.owner_telegram || '(empty)'} | phone: ${d.owner_phone || '(empty)'}`);
    });
  } else {
    console.log('  No properties found in database (or query returned empty)');
  }

  // ============================================
  // Step 2: Update contacts for ALL properties
  // ============================================
  console.log('\n--- Step 2: Insert/update test contact data ---');

  const updateSQL = `
    -- Update ALL properties with test owner contact data
    UPDATE property_configurations SET
      owner_telegram = '${telegramChatId}',
      owner_phone = '+1234567890',
      owner_name = COALESCE(NULLIF(owner_name, ''), 'Test Owner'),
      preferred_platform = 'telegram',
      updated_at = NOW()
    WHERE owner_telegram IS NULL OR owner_telegram = '';

    -- Also update any with existing but wrong/placeholder values
    UPDATE property_configurations SET
      owner_telegram = '${telegramChatId}',
      preferred_platform = 'telegram',
      updated_at = NOW()
    WHERE owner_telegram = 'REPLACE_WITH_YOUR_CHAT_ID';

    -- Insert/update owners table
    INSERT INTO owners (owner_id, owner_name, owner_email, owner_phone, owner_chat_id, preferred_platform)
    VALUES ('test-owner-1', 'Test Owner', 'owner@test.com', '+1234567890', '${telegramChatId}', 'telegram')
    ON CONFLICT (owner_id) DO UPDATE SET
      owner_chat_id = '${telegramChatId}',
      preferred_platform = 'telegram',
      updated_at = NOW();

    -- Link owner to properties if not already linked
    UPDATE property_configurations SET
      owner_id = 'test-owner-1'
    WHERE owner_id IS NULL;
  `;

  // Update the temp workflow with step 2
  const step2Workflow = {
    name: '_TEMP_Insert_Test_Data',
    nodes: [
      {
        parameters: {},
        id: 'trigger',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0]
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: updateSQL,
          options: {}
        },
        id: 'update-contacts',
        name: 'Update Contacts',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [220, 0],
        credentials: {
          postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
        }
      },
      {
        parameters: {
          operation: 'executeQuery',
          query: `
            SELECT property_id, property_name, owner_telegram, owner_phone, owner_name, preferred_platform, owner_id
            FROM property_configurations
            ORDER BY created_at DESC
            LIMIT 10
          `,
          options: {}
        },
        id: 'verify',
        name: 'Verify',
        type: 'n8n-nodes-base.postgres',
        typeVersion: 2.5,
        position: [440, 0],
        credentials: {
          postgres: { id: POSTGRES_CRED_ID, name: '[Client] PostgreSQL' }
        }
      }
    ],
    connections: {
      'Manual Trigger': { main: [[{ node: 'Update Contacts', type: 'main', index: 0 }]] },
      'Update Contacts': { main: [[{ node: 'Verify', type: 'main', index: 0 }]] }
    },
    settings: { executionOrder: 'v1' }
  };

  await apiCall('PUT', `/api/v1/workflows/${tempWfId}`, step2Workflow);
  await sleep(1000);

  const exec2Res = await apiCall('POST', `/api/v1/workflows/${tempWfId}/run`, {});
  if (exec2Res.status !== 200 && exec2Res.status !== 201) {
    console.log('ERROR executing step 2:', exec2Res.status, JSON.stringify(exec2Res.data).substring(0, 300));
    await apiCall('DELETE', `/api/v1/workflows/${tempWfId}`);
    return;
  }

  const verify = exec2Res.data?.data?.resultData?.runData?.['Verify']?.[0]?.data?.main?.[0];

  if (verify && verify.length > 0) {
    console.log('\n  Updated properties:');
    verify.forEach(item => {
      const d = item.json;
      console.log(`    ${d.property_id} | ${d.property_name || '(unnamed)'} | telegram: ${d.owner_telegram} | phone: ${d.owner_phone} | platform: ${d.preferred_platform}`);
    });
  }

  // ============================================
  // Cleanup: Delete temp workflow
  // ============================================
  console.log('\n--- Cleanup ---');
  await apiCall('DELETE', `/api/v1/workflows/${tempWfId}`);
  console.log('  Deleted temp workflow');

  // ============================================
  // Summary
  // ============================================
  console.log('\n\n========================================');
  console.log(' TEST DATA INSERTION — COMPLETE');
  console.log('========================================');
  console.log('');
  console.log('Done:');
  console.log('  1. notification_log table created (migration_002)');
  console.log('  2. property_configurations.owner_telegram set to: ' + telegramChatId);
  console.log('  3. owners table updated with test-owner-1');
  console.log('  4. owner_id linked in property_configurations');
  console.log('');
  if (telegramChatId === 'REPLACE_WITH_YOUR_CHAT_ID') {
    console.log('NEXT: Re-run with your real Telegram chat_id:');
    console.log('  node scripts/insert_test_contacts.js YOUR_CHAT_ID');
  } else {
    console.log('NEXT: Trigger a WF5 operation to test end-to-end notifications.');
  }
}

main().catch(console.error);
