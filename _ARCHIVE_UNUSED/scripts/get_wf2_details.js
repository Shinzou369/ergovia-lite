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
  const wf2 = await apiCall('/api/v1/workflows/NPInwpKv4Oriq04F');

  // Get Calculate Price Tool code
  const priceTool = wf2.nodes.find(n => n.id === 'tool-pricing');
  if (priceTool) {
    console.log('=== Calculate Price Tool (tool-pricing) ===');
    console.log('Full parameters:');
    console.log(JSON.stringify(priceTool.parameters, null, 2));
    console.log('\nFull node:');
    console.log(JSON.stringify(priceTool, null, 2));
  }

  // Nodes to REMOVE (AI Agent + sub-tools + main return path)
  const removeIds = [
    'ai-agent', 'openai-chat', 'memory',
    'tool-availability', 'tool-property', 'tool-pricing', 'tool-booking',
    'process-response', 'save-context', 'return-result'
  ];
  console.log('\n=== Nodes to REMOVE ===');
  for (const id of removeIds) {
    const node = wf2.nodes.find(n => n.id === id);
    if (node) {
      console.log('  ' + id + ' | "' + node.name + '" (' + node.type + ')');
    } else {
      console.log('  ' + id + ' | NOT FOUND');
    }
  }

  // Nodes to KEEP
  console.log('\n=== Nodes to KEEP ===');
  const keepNodes = wf2.nodes.filter(n => !removeIds.includes(n.id));
  for (const n of keepNodes) {
    console.log('  ' + n.id + ' | "' + n.name + '"');
  }

  // Show has-competing-check connections (need to rewire NO path)
  console.log('\n=== has-competing-check connections ===');
  const compConn = wf2.connections['Has Competing Offers?'];
  if (compConn) {
    console.log(JSON.stringify(compConn, null, 2));
  }

  // Show detect-competing code (what data it provides)
  const detect = wf2.nodes.find(n => n.id === 'detect-competing');
  if (detect) {
    console.log('\n=== Detect Competing Offers code ===');
    console.log(detect.parameters.jsCode || detect.parameters.code || '(no code)');
  }

  // Show return-result-competing code
  const retComp = wf2.nodes.find(n => n.id === 'return-result-competing');
  if (retComp) {
    console.log('\n=== Return Result (Competing) code ===');
    console.log(retComp.parameters.jsCode || retComp.parameters.code || '(no code)');
  }

  // Show Prepare Context code (to know what data is available)
  const prepCtx = wf2.nodes.find(n => n.id === 'prepare-context');
  if (prepCtx) {
    console.log('\n=== Prepare Context code ===');
    console.log(prepCtx.parameters.jsCode || prepCtx.parameters.code || '(no code)');
  }
}

main().catch(console.error);
