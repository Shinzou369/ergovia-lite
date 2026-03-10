const http = require('http');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyODU4NzQxfQ.qkP1qoSqw5g5uRx6au6C1HY_DWhop6NSXZQVkbIKxNU';

function apiReq(method, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '116.203.115.12', port: 5678, path: '/api/v1/' + path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    };
    const req = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const wf = await apiReq('GET', 'workflows/LMkR7as0CSGDtjbE');

  // 1. Check AI Agent maxIterations setting
  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  console.log('=== AI Agent settings ===');
  console.log('maxIterations:', agent?.parameters?.options?.maxIterations ?? '(not set = default 10)');
  console.log('returnIntermediateSteps:', agent?.parameters?.options?.returnIntermediateSteps);

  // 2. Check Merge Customer ID calendar loop
  const merge = wf.nodes.find(n => n.name === 'Merge Customer ID');
  const loopLine = merge?.parameters?.jsCode?.match(/for \(let i = 0; i < \d+; i\+\+\)/)?.[0];
  console.log('\n=== Merge Customer ID calendar loop ===');
  console.log(loopLine ?? '(not found)');

  // 3. Check Payment Processor Tool workflowInputs schema — look for array type issue
  const payTool = wf.nodes.find(n => n.name === 'Payment Processor Tool');
  console.log('\n=== Payment Processor Tool schema ===');
  const schema = payTool?.parameters?.workflowInputs?.schema;
  console.log('schema is array:', Array.isArray(schema));
  console.log('value type:', typeof payTool?.parameters?.workflowInputs?.value);
  // Check if any value is itself an array
  const val = payTool?.parameters?.workflowInputs?.value;
  if (val) {
    Object.entries(val).forEach(([k, v]) => {
      if (Array.isArray(v)) console.log(`  ✗ "${k}" is an array!`);
    });
    console.log('Sample value (property_id):', val.property_id?.slice(0, 80));
  }

  // 4. Check system message for Stage 1 hardness and day name rules
  const sysMsg = agent?.parameters?.options?.systemMessage || agent?.parameters?.systemMessage || '';
  console.log('\n=== System message spot checks ===');
  console.log('Has "STAGE 1" rule:', sysMsg.includes('STAGE 1'));
  console.log('Has "Never skip stages":', sysMsg.includes('never skip stages') || sysMsg.includes('Never skip stages'));
  console.log('Has 60-Day Calendar:', sysMsg.includes('60-Day Calendar'));
  console.log('Has hard boundary rule:', sysMsg.includes('Those dates are outside my visible calendar'));
  console.log('Has NEVER calculate day names:', sysMsg.includes('NEVER calculate or guess day names'));
  console.log('Has Payment Processor precondition:', sysMsg.includes('MANDATORY PRE') || sysMsg.includes('pre-flight') || sysMsg.includes('checklist'));

  // 5. Show the Stage 1 section and BOOKING ORDER section
  const stage1Idx = sysMsg.indexOf('STAGE 1');
  const bookingOrderIdx = sysMsg.indexOf('BOOKING ORDER');
  console.log('\n=== STAGE 1 section (first 400 chars) ===');
  console.log(sysMsg.slice(stage1Idx, stage1Idx + 400));
  console.log('\n=== BOOKING ORDER section ===');
  console.log(sysMsg.slice(bookingOrderIdx, bookingOrderIdx + 500));
})();
