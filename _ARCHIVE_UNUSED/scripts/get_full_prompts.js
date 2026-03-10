const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = {
      hostname: url.hostname, path: url.pathname, method: 'GET',
      headers: { 'X-N8N-API-KEY': API_KEY }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // WF1 AI Agent - full system message (currently just the user message text)
  const wf1 = await apiCall('/api/v1/workflows/LP7YknAVPiQsidWq');
  const wf1Agent = wf1.nodes.find(n => n.id === 'ai-agent');
  console.log('=== WF1 AI Agent ===');
  console.log('text (input): ' + JSON.stringify(wf1Agent.parameters.text));
  console.log('systemMessage: ' + JSON.stringify(wf1Agent.parameters.systemMessage || '(none)'));
  console.log('options: ' + JSON.stringify(wf1Agent.parameters.options || {}));
  console.log('All params keys: ' + Object.keys(wf1Agent.parameters).join(', '));

  // WF2 AI Booking Agent - full prompt
  const wf2 = await apiCall('/api/v1/workflows/NPInwpKv4Oriq04F');
  const wf2Agent = wf2.nodes.find(n => n.id === 'ai-agent');
  console.log('\n=== WF2 AI Booking Agent ===');
  console.log('text (input): ' + JSON.stringify(wf2Agent.parameters.text));
  console.log('systemMessage:\n' + (wf2Agent.parameters.systemMessage || '(none)'));
  console.log('\noptions: ' + JSON.stringify(wf2Agent.parameters.options || {}));

  // WF5 AI Maintenance Handler - full prompt
  const wf5 = await apiCall('/api/v1/workflows/JWEu9Uz2JJ5XZeIX');
  const wf5Agent = wf5.nodes.find(n => n.id === 'ai-maintenance');
  console.log('\n=== WF5 AI Maintenance Handler ===');
  console.log('systemMessage:\n' + (wf5Agent.parameters.systemMessage || wf5Agent.parameters.text || '(none)'));

  // WF8 AI Emergency Handler - full prompt
  const wf8 = await apiCall('/api/v1/workflows/mLm2HaIRzNfIX5uh');
  const wf8Emergency = wf8.nodes.find(n => n.id === 'ai-emergency');
  const wf8Screening = wf8.nodes.find(n => n.id === 'ai-screening');
  console.log('\n=== WF8 AI Emergency Handler ===');
  console.log('systemMessage:\n' + (wf8Emergency.parameters.systemMessage || wf8Emergency.parameters.text || '(none)'));
  console.log('\n=== WF8 AI Screening Agent ===');
  console.log('systemMessage:\n' + (wf8Screening.parameters.systemMessage || wf8Screening.parameters.text || '(none)'));

  // WF1 Process Response / Calculate Cost code
  const calcCost = wf1.nodes.find(n => n.id === 'calculate-cost');
  if (calcCost) {
    console.log('\n=== WF1 Calculate AI Cost ===');
    console.log(calcCost.parameters.jsCode || calcCost.parameters.code || '(no code)');
  }

  // WF2 Process AI Response code
  const processResp = wf2.nodes.find(n => n.id === 'process-response');
  if (processResp) {
    console.log('\n=== WF2 Process AI Response ===');
    console.log(processResp.parameters.jsCode || processResp.parameters.code || '(no code)');
  }
}

main().catch(console.error);
