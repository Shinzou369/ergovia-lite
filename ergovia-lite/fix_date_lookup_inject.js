const http = require('http');
const fs = require('fs');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcyODU4NzQxfQ.qkP1qoSqw5g5uRx6au6C1HY_DWhop6NSXZQVkbIKxNU';
const WF1_ID = 'LMkR7as0CSGDtjbE';

function apiReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '116.203.115.12', port: 5678, path: '/api/v1/' + path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}) }
    };
    const req = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, b: JSON.parse(d) }); } catch { resolve({ s: res.statusCode, b: d }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const { b: wf } = await apiReq('GET', `workflows/${WF1_ID}`);

  // ── FIX 1: Merge Customer ID — add DATE LOOKUP injection ─────────────────────
  const mergeNode = wf.nodes.find(n => n.name === 'Merge Customer ID');
  if (!mergeNode) { console.error('Merge Customer ID node not found'); return; }

  const DATE_LOOKUP_CODE = `
// ══════ DATE LOOKUP INJECTION ══════
// Scan message for dates and compute correct day names server-side (100% accurate)
function computeDayName(year, month0, day) {
  const d = new Date(year, month0, day);
  return days[d.getDay()];
}

const MONTH_MAP = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};

const msgText = normalized.message_text || '';
const dateMatches = [];

// Match "Month DD" or "Month DD to/- DD" (e.g. "March 25 to 27", "March 25-27")
const reMonth = /\\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\s+(\\d{1,2})(?:\\s*(?:to|-)\\s*(\\d{1,2}))?\\b/gi;
let m;
while ((m = reMonth.exec(msgText)) !== null) {
  const mon = m[1].toLowerCase();
  const mon0 = MONTH_MAP[mon];
  const d1 = parseInt(m[2]);
  const curYear = now.getFullYear();
  const checkDate = new Date(curYear, mon0, d1);
  const useYear = checkDate < now ? curYear + 1 : curYear;
  const label1 = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + d1;
  dateMatches.push({ label: label1, mon0, day: d1, year: useYear });
  if (m[3]) {
    const d2 = parseInt(m[3]);
    const label2 = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + d2;
    dateMatches.push({ label: label2, mon0, day: d2, year: useYear });
  }
}

// Match YYYY-MM-DD
const reISO = /\\b(\\d{4})-(\\d{2})-(\\d{2})\\b/g;
while ((m = reISO.exec(msgText)) !== null) {
  const y = parseInt(m[1]), mo = parseInt(m[2]) - 1, d = parseInt(m[3]);
  dateMatches.push({ label: months[mo] + ' ' + d, mon0: mo, day: d, year: y });
}

// Deduplicate by label
const seen = new Set();
const uniqueMatches = dateMatches.filter(dm => {
  if (seen.has(dm.label)) return false;
  seen.add(dm.label);
  return true;
});

let dateLookupPrefix = '';
if (uniqueMatches.length > 0) {
  const parts = uniqueMatches.map(dm => {
    const dn = computeDayName(dm.year, dm.mon0, dm.day);
    const dateStr = dm.year + '-' + String(dm.mon0 + 1).padStart(2, '0') + '-' + String(dm.day).padStart(2, '0');
    return dm.label + ', ' + dm.year + ' = ' + dn + ' (' + dateStr + ')';
  });
  dateLookupPrefix = '[DATE LOOKUP: ' + parts.join(' | ') + ']\\n\\n';
}

const messageTextFinal = dateLookupPrefix + msgText;
`;

  // The return statement to find and update
  const OLD_RETURN = `return {
  ...normalized,
  customer_id: customerId,
  property_id: customerResult?.property_id || null,
  property_name: customerResult?.property_name || null,
  timezone: timezone,
  is_owner: isOwner,
  today: today,
  today_full: todayFull,
  today_year: String(yyyy),
  today_day: dayName,
  tomorrow_full: tomorrowFull,
  next_days: nextDays,
  calendar: calendar,`;

  const NEW_RETURN = DATE_LOOKUP_CODE + `
return {
  ...normalized,
  message_text: messageTextFinal,
  customer_id: customerId,
  property_id: customerResult?.property_id || null,
  property_name: customerResult?.property_name || null,
  timezone: timezone,
  is_owner: isOwner,
  today: today,
  today_full: todayFull,
  today_year: String(yyyy),
  today_day: dayName,
  tomorrow_full: tomorrowFull,
  next_days: nextDays,
  calendar: calendar,`;

  if (!mergeNode.parameters.jsCode.includes(OLD_RETURN)) {
    console.error('✗ Could not find return statement to patch in Merge Customer ID');
    console.log('First 200 chars of return area:', mergeNode.parameters.jsCode.slice(-500));
    return;
  }
  mergeNode.parameters.jsCode = mergeNode.parameters.jsCode.replace(OLD_RETURN, NEW_RETURN);
  console.log('✓ Fix 1: Date lookup injection added to Merge Customer ID');

  // ── FIX 2: AI Agent system message — Stage 3 date confirmation note ──────────
  const agentNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!agentNode) { console.error('AI Agent node not found'); return; }

  let sys = agentNode.parameters.options.systemMessage;

  const OLD_DATE_FMT = `DATE CONFIRMATION FORMAT (after looking up calendar):`;
  const NEW_DATE_FMT = `⚠️ Day names MUST be taken from the [DATE LOOKUP: ...] block at the START of the guest's message (computed server-side, 100% accurate). If no DATE LOOKUP block is present, do NOT guess a day name — just write the date without one.

DATE CONFIRMATION FORMAT (after looking up calendar):`;

  if (sys.includes(OLD_DATE_FMT)) {
    sys = sys.replace(OLD_DATE_FMT, NEW_DATE_FMT);
    console.log('✓ Fix 2: DATE LOOKUP instruction added to Stage 3');
  } else {
    console.warn('✗ Fix 2: DATE CONFIRMATION FORMAT text not found — skipping');
  }

  agentNode.parameters.options.systemMessage = sys;

  // ── Save ──────────────────────────────────────────────────────────────────────
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: false });
  await sleep(600);
  const { s } = await apiReq('PUT', `workflows/${WF1_ID}`, {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  });
  await sleep(600);
  await apiReq('PATCH', `workflows/${WF1_ID}`, { active: true });

  console.log(s === 200 ? '\n✓ Done — WF1 saved and reactivated' : `\n✗ Failed: HTTP ${s}`);
})();
