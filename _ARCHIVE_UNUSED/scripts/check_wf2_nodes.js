const https = require('https');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU';

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://n8n.ergovia-ai.com');
    const options = { hostname: url.hostname, path: url.pathname, method, headers: { 'X-N8N-API-KEY': API_KEY } };
    const req = https.request(options, (res) => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data))); });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const wf2 = await apiCall('GET', '/api/v1/workflows/NPInwpKv4Oriq04F');
  console.log('=== WF2 Postgres nodes with $1 ===');
  for (const n of wf2.nodes) {
    if (n.type && n.type.includes('postgres') && n.parameters && n.parameters.query && n.parameters.query.includes('$1')) {
      const hasAF = !!(n.parameters.additionalFields && n.parameters.additionalFields.queryParameters);
      const hasOpt = !!(n.parameters.options && n.parameters.options.queryParameters);
      console.log(`  id=${n.id} | name="${n.name}" | additionalFields=${hasAF} | options=${hasOpt}`);
    }
  }
})();
