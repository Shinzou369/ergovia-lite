/**
 * patch-sub-messenger.js
 * Adds a "Sanitize Message" Code node before every Telegram send node
 * in [V4] SUB: Universal Messenger, and clears parse_mode.
 * Safe to run multiple times (skips if already patched).
 */
require('dotenv').config();
const https = require('https');
const http = require('http');

const N8N_BASE = process.env.N8N_URL || 'http://116.203.115.12:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WF_ID = 'MWFSKpUCpYfFzDTr'; // [V4] SUB: Universal Messenger

if (!N8N_API_KEY) { console.error('N8N_API_KEY not set'); process.exit(1); }

function n8nReq(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(N8N_BASE + '/api/v1/' + endpoint);
    const isHttps = url.protocol === 'https:';
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
    };
    const rb = body ? JSON.stringify(body) : undefined;
    if (rb) opts.headers['Content-Length'] = Buffer.byteLength(rb);
    const req = (isHttps ? https : http).request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (rb) req.write(rb);
    req.end();
  });
}

const SANITIZE_CODE = `const item = $input.first().json;

function stripMarkdown(text) {
  if (typeof text !== 'string') return String(text ?? '');
  return text
    .replace(/\\*\\*?(.*?)\\*\\*?/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\`{1,3}([\\s\\S]*?)\`{1,3}/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\\[([^\\]]+)\\]\\([^\\)]+\\)/g, '$1')
    .replace(/^#{1,6}\\s+/gm, '')
    .replace(/^>\\s+/gm, '')
    .replace(/^[-*_]{3,}$/gm, '')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}

return [{
  json: {
    ...item,
    message: stripMarkdown(item.message ?? item.text ?? ''),
    parse_mode: '',
  }
}];`;

async function main() {
  console.log('=== Patch SUB: Universal Messenger — Sanitize Message ===\n');

  // 1. Get current workflow
  const get = await n8nReq('GET', `workflows/${WF_ID}`);
  if (get.status !== 200) throw new Error(`Cannot GET workflow: ${get.status}`);
  const wf = get.body;
  console.log(`Loaded: ${wf.name} (${wf.nodes.length} nodes)`);

  // 2. Find all Telegram send nodes
  const telegramNodes = wf.nodes.filter(n =>
    n.type === 'n8n-nodes-base.telegram' &&
    (n.parameters?.operation === 'sendMessage' || !n.parameters?.operation)
  );

  if (telegramNodes.length === 0) {
    console.log('No Telegram send nodes found — nothing to patch.');
    return;
  }
  console.log(`Found ${telegramNodes.length} Telegram node(s): ${telegramNodes.map(n => n.name).join(', ')}`);

  // 3. Check if already patched
  const alreadyPatched = wf.nodes.some(n => n.name === 'Sanitize Message');
  if (alreadyPatched) {
    console.log('Already patched — "Sanitize Message" node exists. Skipping node insertion.');
    // Still ensure parse_mode is cleared and text field is correct
  }

  // 4. Build a map: node name → node (for connection lookup)
  const nodeByName = {};
  for (const n of wf.nodes) nodeByName[n.name] = n;

  // 5. Build reverse connection map: target node name → list of {sourceName, sourceOutput}
  // connections format: { [sourceName]: { main: [ [{node, type, index},...], ... ] } }
  const incoming = {}; // nodeName -> [{sourceName, outputIndex, inputIndex}]
  for (const [srcName, outputs] of Object.entries(wf.connections)) {
    const mainOutputs = outputs.main || [];
    mainOutputs.forEach((outputSlot, outputIdx) => {
      (outputSlot || []).forEach(conn => {
        if (!incoming[conn.node]) incoming[conn.node] = [];
        incoming[conn.node].push({ sourceName: srcName, outputIndex: outputIdx, inputIndex: conn.index || 0 });
      });
    });
  }

  // 6. For each Telegram node, insert a Sanitize node before it (if not already there)
  let patchCount = 0;
  for (const tgNode of telegramNodes) {
    const tgName = tgNode.name;
    const sanitizeName = `Sanitize Message${telegramNodes.length > 1 ? ' (' + tgName + ')' : ''}`;

    // Check if upstream is already a sanitize node
    const upstreams = incoming[tgName] || [];
    const alreadySanitized = upstreams.some(u => u.sourceName.startsWith('Sanitize Message'));
    if (alreadySanitized) {
      console.log(`  ⏭  ${tgName}: already has sanitize node upstream`);
      continue;
    }

    console.log(`\n  Patching: ${tgName}`);
    console.log(`  Upstream nodes: ${upstreams.map(u => u.sourceName).join(', ') || 'none'}`);

    // Place sanitize node slightly left of the Telegram node
    const sanitizePos = [
      tgNode.position[0] - 220,
      tgNode.position[1],
    ];

    // Create the Sanitize Message node
    const sanitizeNode = {
      id: `sanitize-${tgName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
      name: sanitizeName,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: sanitizePos,
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: SANITIZE_CODE,
      },
    };
    wf.nodes.push(sanitizeNode);

    // Rewire: for each upstream node that fed into tgNode, redirect to sanitizeNode
    for (const up of upstreams) {
      const srcConn = wf.connections[up.sourceName];
      if (!srcConn || !srcConn.main) continue;
      const outputSlot = srcConn.main[up.outputIndex] || [];
      for (const conn of outputSlot) {
        if (conn.node === tgName) {
          conn.node = sanitizeName; // redirect to sanitize
          console.log(`    Rewired: ${up.sourceName} → ${sanitizeName}`);
        }
      }
    }

    // Connect sanitize → tgNode
    if (!wf.connections[sanitizeName]) {
      wf.connections[sanitizeName] = { main: [[]] };
    }
    wf.connections[sanitizeName].main[0].push({ node: tgName, type: 'main', index: 0 });
    console.log(`    Connected: ${sanitizeName} → ${tgName}`);

    // 7. Fix Telegram node: clear parse_mode, set text to {{ $json.message }}
    if (tgNode.parameters) {
      tgNode.parameters.text = '={{ $json.message }}';
      // Clear or remove parse_mode
      if ('additionalFields' in tgNode.parameters) {
        tgNode.parameters.additionalFields = tgNode.parameters.additionalFields || {};
        tgNode.parameters.additionalFields.parse_mode = '';
      } else {
        tgNode.parameters.parse_mode = '';
      }
      console.log(`    Telegram node text → {{ $json.message }}, parse_mode cleared`);
    }

    patchCount++;
  }

  if (patchCount === 0 && alreadyPatched) {
    console.log('\nWorkflow already fully patched.');
  }

  // 8. Save
  console.log('\nSaving workflow...');
  await n8nReq('POST', `workflows/${WF_ID}/deactivate`);
  await new Promise(r => setTimeout(r, 500));

  const put = await n8nReq('PUT', `workflows/${WF_ID}`, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: 'v1' },
  });

  if (put.status !== 200) {
    console.error(`❌ Save failed (${put.status}): ${JSON.stringify(put.body).substring(0, 300)}`);
    process.exit(1);
  }
  console.log('✅ Saved');

  // 9. Activate
  await new Promise(r => setTimeout(r, 500));
  const act = await n8nReq('POST', `workflows/${WF_ID}/activate`);
  if (act.status === 200) {
    console.log('✅ Activated');
  } else {
    console.log(`⚠️  Activate failed: ${(act.body?.message || '').substring(0, 120)}`);
  }

  console.log('\n=== Done — SUB: Universal Messenger patched ===');
  console.log('Test: send a Telegram message with **bold** or _italic_ text from the AI and verify it sends without errors.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
