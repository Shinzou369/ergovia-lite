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

async function main() {
  console.log('=== Fix schema types for conversation_history & collected_data ===\n');

  const { data: wf } = await apiCall('GET', '/api/v1/workflows/' + WF2_ID);
  console.log('Downloaded: ' + wf.name + '\n');

  let changes = 0;

  for (const node of wf.nodes) {
    if (node.id === 'save-context' || node.id === 'save-conversation-competing') {
      const schema = node.parameters.columns && node.parameters.columns.schema;
      if (!schema) continue;

      for (const col of schema) {
        if ((col.id === 'conversation_history' || col.id === 'collected_data') && col.type === 'object') {
          console.log('  "' + node.name + '": ' + col.id + ' type object -> string');
          col.type = 'string';
          changes++;
        }
      }
    }
  }

  console.log('\n' + changes + ' schema types fixed.\n');

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
    console.log('ERROR: ' + update.status);
    await apiCall('POST', '/api/v1/workflows/' + WF2_ID + '/activate');
    return;
  }
  console.log('Upload OK');
  await sleep(1000);

  console.log('Activating...');
  const act = await apiCall('POST', '/api/v1/workflows/' + WF2_ID + '/activate');
  console.log(act.status === 200 ? 'ACTIVATED' : 'FAILED (' + act.status + ')');
}

main().catch(console.error);
