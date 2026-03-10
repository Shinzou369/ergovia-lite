const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

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

async function main() {
  console.log('=== VERIFY WF3 STRUCTURE ===\n');

  // 1. Confirm the new nodes exist and connections are correct
  const { data: wf3 } = await apiCall('GET', '/api/v1/workflows/pEn69kwNtCEQ21y9');

  const nodeNames = wf3.nodes.map(n => n.name);
  const expected = ['Is Availability Check?', 'Check Availability', 'Format Availability Response'];
  for (const name of expected) {
    const found = nodeNames.includes(name);
    console.log('  ' + (found ? 'OK' : 'MISSING') + ': ' + name);
  }

  // 2. Verify the IF node checks is_availability_check
  const ifNode = wf3.nodes.find(n => n.name === 'Is Availability Check?');
  if (ifNode) {
    const cond = ifNode.parameters?.conditions?.conditions?.[0];
    console.log('\n  IF condition: ' + (cond?.leftValue || 'N/A'));
    console.log('  IF operator: ' + (cond?.operator?.operation || 'N/A'));
  }

  // 3. Verify Check Availability has correct credential
  const checkNode = wf3.nodes.find(n => n.name === 'Check Availability');
  if (checkNode) {
    const pgCred = checkNode.credentials?.postgres;
    console.log('\n  Check Availability credential: ' + (pgCred?.name || 'N/A') + ' (id=' + (pgCred?.id || 'N/A') + ')');
    console.log('  Credential OK: ' + (pgCred?.id === 'BWlLUMKn64aZsHi8'));
  }

  // 4. Verify Prepare Parameters sets is_availability_check
  const prepNode = wf3.nodes.find(n => n.name === 'Prepare Parameters');
  if (prepNode) {
    const code = prepNode.parameters?.jsCode || '';
    const hasFlag = code.includes('is_availability_check');
    console.log('\n  Prepare Parameters sets is_availability_check: ' + hasFlag);
  }

  // 5. Verify connection chain for availability path
  console.log('\n  === AVAILABILITY PATH CHAIN ===');
  const conns = wf3.connections;

  // Prepare → IF
  const prepTargets = conns['Prepare Parameters']?.main?.[0]?.map(c => c.node) || [];
  console.log('  Prepare Parameters → ' + prepTargets.join(', '));

  // IF [true] → Check Availability
  const ifTrue = conns['Is Availability Check?']?.main?.[0]?.map(c => c.node) || [];
  const ifFalse = conns['Is Availability Check?']?.main?.[1]?.map(c => c.node) || [];
  console.log('  Is Availability Check? [true] → ' + ifTrue.join(', '));
  console.log('  Is Availability Check? [false] → ' + ifFalse.join(', '));

  // Check → Format
  const checkTargets = conns['Check Availability']?.main?.[0]?.map(c => c.node) || [];
  console.log('  Check Availability → ' + checkTargets.join(', '));

  // Format → (end - no connection = implicit return)
  const formatTargets = conns['Format Availability Response']?.main?.[0]?.map(c => c.node) || [];
  console.log('  Format Availability Response → ' + (formatTargets.length > 0 ? formatTargets.join(', ') : '(end - returns to WF1)'));

  console.log('\n=== RESULT ===');
  const allOk = prepTargets.includes('Is Availability Check?')
    && ifTrue.includes('Check Availability')
    && ifFalse.includes('Get Properties')
    && checkTargets.includes('Format Availability Response')
    && formatTargets.length === 0;
  console.log(allOk ? '  ALL CONNECTIONS CORRECT - WF3 is ready as a tool for WF1' : '  SOME CONNECTIONS ARE WRONG - needs fixing');
}

main().catch(console.error);
