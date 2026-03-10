/**
 * examine_all_param_nodes.js
 * 
 * Downloads WF2, WF3, WF4, WF5, WF7 from live n8n instance and examines
 * all PostgreSQL nodes that use $1 parameters - showing queries, node params,
 * inbound connections, and source node details.
 */

const https = require('https');

const BASE_URL = 'https://n8n.ergovia-ai.com';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

const WORKFLOWS = {
  'WF2': 'NPInwpKv4Oriq04F',
  'WF3': 'pEn69kwNtCEQ21y9',
  'WF4': '5loDH75zrEDh9x5H',
  'WF5': 'JWEu9Uz2JJ5XZeIX',
  'WF7': 'Ay5QOyGAHG2l40s7',
};

function fetchWorkflow(id) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/api/v1/workflows/${id}`;
    const opts = {
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Accept': 'application/json',
      },
    };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${id}: ${body.substring(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error for ${id}: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Build a reverse-connection map: targetNodeName -> [{ sourceNode, sourceOutput, targetInput }]
 */
function buildInboundMap(connections) {
  const inbound = {};
  for (const [sourceName, outputs] of Object.entries(connections || {})) {
    if (!outputs.main) continue;
    for (let outputIdx = 0; outputIdx < outputs.main.length; outputIdx++) {
      const targets = outputs.main[outputIdx];
      if (!targets) continue;
      for (const target of targets) {
        const targetName = target.node;
        if (!inbound[targetName]) inbound[targetName] = [];
        inbound[targetName].push({
          sourceNode: sourceName,
          sourceOutput: outputIdx,
          targetInput: target.index || 0,
        });
      }
    }
  }
  return inbound;
}

function findNodeByName(nodes, name) {
  return nodes.find(n => n.name === name);
}

function truncate(str, max) {
  max = max || 3000;
  if (!str) return '(empty)';
  if (str.length <= max) return str;
  return str.substring(0, max) + '\n... (truncated, ' + str.length + ' chars total)';
}

async function main() {
  const sep = '='.repeat(100);
  const subSep = '-'.repeat(80);

  for (const [label, wfId] of Object.entries(WORKFLOWS)) {
    console.log('\n' + sep);
    console.log('  WORKFLOW: ' + label + ' (ID: ' + wfId + ')');
    console.log(sep);

    let wf;
    try {
      wf = await fetchWorkflow(wfId);
    } catch (err) {
      console.error('  ERROR fetching ' + label + ': ' + err.message);
      continue;
    }

    console.log('  Name: ' + wf.name);
    console.log('  Nodes: ' + wf.nodes.length);
    console.log('  Active: ' + wf.active);

    const nodes = wf.nodes;
    const inboundMap = buildInboundMap(wf.connections);

    // Find all Postgres nodes with $1 in query
    const pgNodes = nodes.filter(function(n) {
      if (n.type !== 'n8n-nodes-base.postgres') return false;
      var query = (n.parameters && n.parameters.query) || '';
      return query.includes('$1');
    });

    if (pgNodes.length === 0) {
      console.log('\n  No PostgreSQL nodes with $1 parameters found.\n');
      continue;
    }

    console.log('\n  Found ' + pgNodes.length + ' PostgreSQL node(s) with $1 parameters:\n');

    for (var i = 0; i < pgNodes.length; i++) {
      var pgNode = pgNodes[i];
      console.log(subSep);
      console.log('  [' + (i + 1) + '/' + pgNodes.length + '] Node: "' + pgNode.name + '"');
      console.log(subSep);

      // 1. Full query
      var query = (pgNode.parameters && pgNode.parameters.query) || '(no query)';
      console.log('\n  QUERY:');
      console.log('  ' + query.replace(/\n/g, '\n  '));

      // 2. Full node parameters
      console.log('\n  FULL NODE PARAMETERS:');
      console.log('  ' + JSON.stringify(pgNode.parameters, null, 2).replace(/\n/g, '\n  '));

      // 3. Operation mode
      if (pgNode.parameters && pgNode.parameters.operation) {
        console.log('\n  Operation: ' + pgNode.parameters.operation);
      }

      // 4. Inbound connections
      var inbound = inboundMap[pgNode.name] || [];
      console.log('\n  INBOUND CONNECTIONS (' + inbound.length + '):');

      if (inbound.length === 0) {
        console.log('    (none - this node has no incoming connections)');
      }

      for (var j = 0; j < inbound.length; j++) {
        var conn = inbound[j];
        console.log('\n    Source: "' + conn.sourceNode + '" (output ' + conn.sourceOutput + ' -> input ' + conn.targetInput + ')');

        var srcNode = findNodeByName(nodes, conn.sourceNode);
        if (!srcNode) {
          console.log('    WARNING: Source node "' + conn.sourceNode + '" not found in nodes list!');
          continue;
        }

        console.log('    Source Type: ' + srcNode.type);

        // Show source node parameters
        console.log('    Source Parameters:');
        var paramStr = JSON.stringify(srcNode.parameters, null, 2);
        console.log('    ' + truncate(paramStr, 3000).replace(/\n/g, '\n    '));

        // If the source is a Code/Function node, highlight the code
        if (srcNode.parameters && srcNode.parameters.jsCode) {
          console.log('\n    === SOURCE CODE (jsCode) ===');
          console.log('    ' + truncate(srcNode.parameters.jsCode, 3000).replace(/\n/g, '\n    '));
        }
        if (srcNode.parameters && srcNode.parameters.functionCode) {
          console.log('\n    === SOURCE CODE (functionCode) ===');
          console.log('    ' + truncate(srcNode.parameters.functionCode, 3000).replace(/\n/g, '\n    '));
        }
        if (srcNode.parameters && srcNode.parameters.value) {
          console.log('\n    VALUE: ' + truncate(JSON.stringify(srcNode.parameters.value, null, 2), 1500));
        }
        if (srcNode.parameters && srcNode.parameters.assignments && srcNode.parameters.assignments.assignments) {
          console.log('\n    ASSIGNMENTS:');
          var assigns = srcNode.parameters.assignments.assignments;
          for (var k = 0; k < assigns.length; k++) {
            console.log('      ' + assigns[k].name + ' = ' + assigns[k].value);
          }
        }
      }

      console.log('');
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('  SCAN COMPLETE');
  console.log('='.repeat(100));
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
