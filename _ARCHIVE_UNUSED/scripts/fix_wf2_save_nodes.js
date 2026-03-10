const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
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

const WF2_ID = 'NPInwpKv4Oriq04F';

const NODE_FIXES = {
  // Fix 1: Save Conversation (save-context) - fix matchingColumns to use conversation_id
  'save-context': {
    parameters: {
      operation: 'upsert',
      schema: { __rl: true, mode: 'list', value: 'public' },
      table: { __rl: true, mode: 'list', value: 'conversations' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          conversation_id: "={{ $json.conversation_id || $json.sender_id + '_' + $json.property_id }}",
          contact_id: "={{ $json.sender_id || $json.contact_id }}",
          property_id: "={{ $json.property_id }}",
          conversation_stage: "={{ $json.stage || 'active' }}",
          conversation_history: "={{ JSON.stringify($json.history || $json.output || '') }}",
          collected_data: "={{ JSON.stringify($json.collected || {}) }}",
          channel: "={{ $json.channel }}",
          updated_at: "={{ $now.toISO() }}"
        },
        matchingColumns: ['conversation_id'],
        schema: [
          { id: 'conversation_id', displayName: 'conversation_id', required: true, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'contact_id', displayName: 'contact_id', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'property_id', displayName: 'property_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'conversation_stage', displayName: 'conversation_stage', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'conversation_history', displayName: 'conversation_history', required: false, defaultMatch: false, display: true, type: 'object', canBeUsedToMatch: false },
          { id: 'collected_data', displayName: 'collected_data', required: false, defaultMatch: false, display: true, type: 'object', canBeUsedToMatch: false },
          { id: 'channel', displayName: 'channel', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: false }
        ]
      },
      options: {}
    }
  },

  // Fix 2: Save Conversation (Competing) - add missing matchingColumns
  'save-conversation-competing': {
    parameters: {
      operation: 'upsert',
      schema: { __rl: true, mode: 'list', value: 'public' },
      table: { __rl: true, mode: 'list', value: 'conversations' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          conversation_id: "={{ $json.conversation_id || $json.contact_id + '_' + $json.property_id }}",
          contact_id: "={{ $json.contact_id }}",
          property_id: "={{ $json.property_id }}",
          conversation_stage: "={{ $json.stage || 'competing_offers' }}",
          conversation_history: "={{ JSON.stringify($json.history || '') }}",
          collected_data: "={{ JSON.stringify($json.collected || {}) }}",
          updated_at: "={{ $now.toISO() }}"
        },
        matchingColumns: ['conversation_id'],
        schema: [
          { id: 'conversation_id', displayName: 'conversation_id', required: true, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'contact_id', displayName: 'contact_id', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'property_id', displayName: 'property_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'conversation_stage', displayName: 'conversation_stage', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'conversation_history', displayName: 'conversation_history', required: false, defaultMatch: false, display: true, type: 'object', canBeUsedToMatch: false },
          { id: 'collected_data', displayName: 'collected_data', required: false, defaultMatch: false, display: true, type: 'object', canBeUsedToMatch: false },
          { id: 'updated_at', displayName: 'updated_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: false }
        ]
      },
      options: {}
    }
  },

  // Fix 3: Save Competing Deal - fix column names to match actual deals table
  'save-competing-deal': {
    parameters: {
      operation: 'insert',
      schema: { __rl: true, mode: 'list', value: 'public' },
      table: { __rl: true, mode: 'list', value: 'deals' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          deal_id: "={{ $json.new_deal_id }}",
          client_name: "={{ $json.collected.guest_name || $json.sender_name || 'Guest' }}",
          client_phone: "={{ $json.sender_id || $json.contact_id }}",
          property_id: "={{ $json.property_id }}",
          property_name: "={{ $json.property_name }}",
          check_in_date: "={{ $json.detected_check_in }}",
          check_out_date: "={{ $json.detected_check_out }}",
          guests: "={{ $json.collected.guests || 1 }}",
          price_quoted: "={{ $json.current_inquiry_estimated_total }}",
          status: "competing_offer",
          conflict_priority: "={{ $json.current_inquiry_score }}",
          channel_type: "={{ $json.channel }}",
          created_at: "={{ $now.toISO() }}",
          owner_notes: "Part of conflicting offers - awaiting owner decision"
        },
        schema: [
          { id: 'deal_id', displayName: 'deal_id', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'client_name', displayName: 'client_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'client_phone', displayName: 'client_phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'property_id', displayName: 'property_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'property_name', displayName: 'property_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'check_in_date', displayName: 'check_in_date', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: false },
          { id: 'check_out_date', displayName: 'check_out_date', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: false },
          { id: 'guests', displayName: 'guests', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: false },
          { id: 'price_quoted', displayName: 'price_quoted', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: false },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'conflict_priority', displayName: 'conflict_priority', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: false },
          { id: 'channel_type', displayName: 'channel_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          { id: 'created_at', displayName: 'created_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: false },
          { id: 'owner_notes', displayName: 'owner_notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false }
        ]
      },
      options: {}
    }
  }
};

async function main() {
  console.log('=== Fix WF2 Save/Insert nodes ===\n');

  const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + WF2_ID);
  console.log('Downloaded: ' + wf.name + ' (' + wf.nodes.length + ' nodes)\n');

  let changes = 0;
  for (const node of wf.nodes) {
    if (NODE_FIXES[node.id]) {
      const fix = NODE_FIXES[node.id];
      console.log('Fixing: "' + node.name + '" (id: ' + node.id + ')');
      console.log('  operation: ' + (node.parameters.operation || 'insert') + ' -> ' + fix.parameters.operation);

      // Show column name changes for Save Competing Deal
      if (node.id === 'save-competing-deal') {
        const oldCols = Object.keys(node.parameters.columns.value);
        const newCols = Object.keys(fix.parameters.value || fix.parameters.columns.value);
        console.log('  old columns: ' + oldCols.join(', '));
        console.log('  new columns: ' + newCols.join(', '));
      }

      // Apply fix - keep node metadata, replace parameters
      node.parameters = fix.parameters;
      changes++;
    }
  }

  console.log('\n' + changes + ' nodes fixed.\n');

  // Deactivate -> Update -> Activate
  console.log('Deactivating...');
  await apiCall('POST', '/api/v1/workflows/' + WF2_ID + '/deactivate');
  await sleep(1000);

  console.log('Uploading...');
  const updateBody = {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  };
  const update = await apiCall('PUT', '/api/v1/workflows/' + WF2_ID, updateBody);
  if (update.status !== 200) {
    console.log('ERROR: ' + update.status + ' - ' + JSON.stringify(update.data).substring(0, 300));
    await apiCall('POST', '/api/v1/workflows/' + WF2_ID + '/activate');
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  // Verify
  console.log('\nVerifying...');
  const { data: v } = await apiCall('GET', '/api/v1/workflows/' + WF2_ID);
  for (const node of v.nodes) {
    if (NODE_FIXES[node.id]) {
      const hasMatching = node.parameters.columns && node.parameters.columns.matchingColumns;
      const op = node.parameters.operation || 'insert';
      console.log('  "' + node.name + '": op=' + op + ', matchingColumns=' + (hasMatching ? JSON.stringify(node.parameters.columns.matchingColumns) : 'none'));

      // Check for old column names in Save Competing Deal
      if (node.id === 'save-competing-deal') {
        const cols = Object.keys(node.parameters.columns.value || {});
        const badCols = ['contact_id', 'guest_name', 'guest_phone', 'num_guests', 'total_amount', 'deal_status', 'priority_score', 'channel', 'notes'];
        const found = cols.filter(c => badCols.includes(c));
        if (found.length > 0) {
          console.log('    WARNING: old columns still present: ' + found.join(', '));
        } else {
          console.log('    Column names correct');
        }
      }
    }
  }

  console.log('\nActivating...');
  const act = await apiCall('POST', '/api/v1/workflows/' + WF2_ID + '/activate');
  console.log(act.status === 200 ? 'ACTIVATED' : 'FAILED (' + act.status + ')');

  console.log('\n=== Summary ===');
  console.log('1. Save Conversation (save-context): upsert with matchingColumns=["conversation_id"]');
  console.log('2. Save Conversation Competing: upsert with matchingColumns=["conversation_id"]');
  console.log('3. Save Competing Deal: insert with correct column names (client_name, status, etc.)');
}

main().catch(console.error);
