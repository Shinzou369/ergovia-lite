const https = require('https');
const fs = require('fs');
const path = require('path');

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

const WORKFLOWS = [
  { id: 'LP7YknAVPiQsidWq', file: 'WF1_AI_Gateway.json', label: 'WF1: AI Gateway' },
  { id: 'NPInwpKv4Oriq04F', file: 'WF2_AI_Booking_Agent.json', label: 'WF2: AI Booking Agent' },
  { id: 'UZMWfhnV6JmuwJXC', file: 'SUB_Universal_Messenger.json', label: 'SUB: Universal Messenger' },
];

async function main() {
  const outDir = path.join(__dirname, '..', 'ergovia-lite', 'workflows');

  for (const wfInfo of WORKFLOWS) {
    console.log('\n========================================');
    console.log('  ' + wfInfo.label + ' (' + wfInfo.id + ')');
    console.log('========================================');

    const wf = await apiCall('/api/v1/workflows/' + wfInfo.id);

    // === Node count ===
    console.log('Nodes: ' + wf.nodes.length);
    console.log('Active: ' + wf.active);

    // === Always Output Data nodes ===
    const alwaysOutput = [];
    for (const node of wf.nodes) {
      if (node.onError === 'continueRegularOutput' ||
          (node.parameters && node.parameters.options && node.parameters.options.alwaysOutputData === true) ||
          node.alwaysOutputData === true) {
        alwaysOutput.push(node.name);
      }
    }
    if (alwaysOutput.length > 0) {
      console.log('\nAlways Output Data enabled on:');
      for (const n of alwaysOutput) {
        console.log('  - ' + n);
      }
    } else {
      console.log('\nNo nodes with Always Output Data (checking executeOnce/continueOnFail too...)');
      // Check for other non-standard settings
      for (const node of wf.nodes) {
        const flags = [];
        if (node.continueOnFail) flags.push('continueOnFail');
        if (node.alwaysOutputData) flags.push('alwaysOutputData');
        if (node.executeOnce) flags.push('executeOnce');
        if (node.onError) flags.push('onError=' + node.onError);
        if (flags.length > 0) {
          console.log('  ' + node.name + ': ' + flags.join(', '));
        }
      }
    }

    // === Credential Summary ===
    console.log('\nCredentials used:');
    const credMap = {};
    for (const node of wf.nodes) {
      if (node.credentials) {
        for (const [type, cred] of Object.entries(node.credentials)) {
          const key = cred.id + ' (' + cred.name + ')';
          if (!credMap[key]) credMap[key] = [];
          credMap[key].push(node.name);
        }
      }
    }
    for (const [key, nodes] of Object.entries(credMap)) {
      console.log('  ' + key + ' -> ' + nodes.length + ' nodes');
    }

    // === Node list ===
    console.log('\nAll nodes:');
    for (const node of wf.nodes) {
      const shortType = node.type.replace('n8n-nodes-base.', '').replace('@n8n/n8n-nodes-langchain.', 'LC:');
      const flags = [];
      if (node.disabled) flags.push('DISABLED');
      if (node.alwaysOutputData) flags.push('alwaysOutput');
      if (node.continueOnFail) flags.push('continueOnFail');
      if (node.onError) flags.push('onError=' + node.onError);
      const extra = flags.length > 0 ? ' [' + flags.join(', ') + ']' : '';
      console.log('  ' + node.id + ' | ' + node.name + ' (' + shortType + ')' + extra);
    }

    // === Save template ===
    const filePath = path.join(outDir, wfInfo.file);
    fs.writeFileSync(filePath, JSON.stringify(wf, null, 2));
    console.log('\nSaved: ' + filePath);
  }

  console.log('\n\n========================================');
  console.log('  ALL 3 TEMPLATES SAVED SUCCESSFULLY');
  console.log('========================================');
}

main().catch(console.error);
