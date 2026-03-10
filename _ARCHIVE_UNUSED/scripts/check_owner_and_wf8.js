const { Client } = require("../ergovia-lite/node_modules/pg");
const https = require("https");

const DB_CONFIG = {
  host: "116.203.115.12",
  port: 5432,
  database: "ergovia_db",
  user: "ergovia_user",
  password: "ergovia_secure_2026",
  ssl: false,
  connectionTimeoutMillis: 10000,
};

const N8N_BASE = "https://n8n.ergovia-ai.com";
const N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5NTNiYTA4NS1lM2IzLTQxZjAtODQ3OS05OGRkNGYwNmY4YTciLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNjI5Mzc2fQ.h6jEs8Xh8DOfuhZapgItr8PgRDLuJmImAha4f_QHDNU";
const WF8_ID = "mLm2HaIRzNfIX5uh";

function fetchJSON(url, headers) {
  headers = headers || {};
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + ": " + data.slice(0, 500)));
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("JSON parse: " + e.message)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function sep(title) {
  console.log("\n" + "=".repeat(70));
  console.log("  " + title);
  console.log("=".repeat(70));
}

async function checkOwnerFields() {
  sep("PART 1: PostgreSQL - Property Owner Contact Fields");
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    console.log("\n[OK] Connected to PostgreSQL at " + DB_CONFIG.host);

    const colR = await client.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name =  ORDER BY ordinal_position", ["properties"]);
    console.log("\n--- All columns in properties table (" + colR.rows.length + " cols) ---");

    const ownerCols = [];
    for (const col of colR.rows) {
      const isOwner = /owner/i.test(col.column_name) || /contact/i.test(col.column_name);
      if (isOwner) ownerCols.push(col.column_name);
      console.log("  " + col.column_name.padEnd(35) + " " + col.data_type.padEnd(20) + " nullable=" + col.is_nullable + (isOwner ? " <<<" : ""));
    }

    if (ownerCols.length === 0) {
      console.log("\n[!] No owner/contact columns found in properties table.");
      const tR = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema =  ORDER BY table_name", ["public"]);
      console.log("\n--- All public tables ---");
      for (const t of tR.rows) {
        const m = /owner|contact|user/i.test(t.table_name) ? " <<<" : "";
        console.log("  " + t.table_name + m);
      }
    }

    const existingCols = colR.rows.map(r => r.column_name);
    const targetFields = ["owner_name","owner_phone","owner_email","owner_telegram","owner_contact","contact_name","contact_phone","contact_email","contact_telegram"];
    const selectCols = ["property_id","property_name"];
    for (const f of targetFields) { if (existingCols.includes(f) && !selectCols.includes(f)) selectCols.push(f); }
    for (const ec of existingCols) { if ((/owner|contact/i.test(ec)) && !selectCols.includes(ec)) selectCols.push(ec); }

    console.log("\n--- Querying: " + selectCols.join(", ") + " ---");

    const dq = String.fromCharCode(34);
    let q = "SELECT " + selectCols.map(c => dq + c + dq).join(", ") + " FROM properties WHERE property_id =  LIMIT 1";
    let r = await client.query(q, ["PROP-TEST-001"]);
    if (r.rows.length === 0) {
      console.log("  PROP-TEST-001 not found, fetching first 5...");
      q = "SELECT " + selectCols.map(c => dq + c + dq).join(", ") + " FROM properties ORDER BY created_at DESC NULLS LAST LIMIT 5";
      r = await client.query(q);
    }
    if (r.rows.length === 0) {
      console.log("  [!] No properties found.");
    } else {
      for (const row of r.rows) {
        console.log("\n  Property: " + (row.property_name || row.property_id));
        for (const [key, val] of Object.entries(row)) {
          console.log("    " + key.padEnd(30) + " = " + (val === null ? "(NULL)" : val));
        }
      }
    }
  } catch (err) {
    console.error("[ERROR]", err.message);
  } finally {
    await client.end();
  }
}

async function analyzeWF8() {
  sep("PART 2: n8n WF8 - Emergency Alert Flow Analysis");
  const url = N8N_BASE + "/api/v1/workflows/" + WF8_ID;
  console.log("\nFetching: " + url);

  const wf = await fetchJSON(url, { "X-N8N-API-KEY": N8N_API_KEY });
  console.log("\n[OK] Workflow: " + wf.name + " (" + (wf.nodes||[]).length + " nodes, active=" + wf.active + ")");

  const nodes = wf.nodes || [];
  const connections = wf.connections || {};

  console.log("\n--- All Nodes ---");
  for (const n of nodes) console.log("  [" + n.name + "]  type=" + n.type);

  console.log("\n--- Full Connections Map ---");
  const adj = {};
  for (const [src, outputs] of Object.entries(connections)) {
    if (!adj[src]) adj[src] = [];
    for (const oKey of Object.keys(outputs)) {
      const branches = outputs[oKey];
      if (!Array.isArray(branches)) continue;
      for (let bi = 0; bi < branches.length; bi++) {
        const tgts = branches[bi];
        if (!Array.isArray(tgts)) continue;
        for (const t of tgts) {
          adj[src].push({ target: t.node, branch: bi, oKey });
          console.log("  " + src + " --[" + oKey + ":" + bi + "]--> " + t.node);
        }
      }
    }
  }

  const normNode = nodes.find(n => /normalize.*event/i.test(n.name));
  const alertNodes = nodes.filter(n => /send.*alert|alert.*send|emergency|notify/i.test(n.name));

  console.log("\n--- Emergency Path Analysis ---");
  console.log("  Normalize Event node: " + (normNode ? normNode.name : "NOT FOUND"));
  console.log("  Alert nodes: " + (alertNodes.length > 0 ? alertNodes.map(n => n.name).join(", ") : "NOT FOUND"));

  if (normNode) {
    console.log("\n--- Tracing paths from " + normNode.name + " ---");
    const visited = new Set();
    const queue = [{ name: normNode.name, path: [normNode.name], depth: 0 }];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (visited.has(cur.name) || cur.depth > 20) continue;
      visited.add(cur.name);
      const tgts = adj[cur.name] || [];
      for (const t of tgts) {
        const np = [...cur.path, "--[" + t.oKey + ":" + t.branch + "]--> ", t.target];
        console.log("  PATH: " + np.join(" "));
        queue.push({ name: t.target, path: np, depth: cur.depth + 1 });
      }
      if (tgts.length === 0 && cur.depth > 0) console.log("  END: " + cur.path.join(" "));
    }
  }

  console.log("\n--- Nodes That Might Look Up Owner Contact Info ---");
  let found = false;
  for (const n of nodes) {
    const nm = /owner|property.*look|get.*property|fetch.*property|query.*propert|contact.*look/i.test(n.name);
    const ps = JSON.stringify(n.parameters || {});
    const pm = /owner_phone|owner_email|owner_telegram|owner_name|owner_contact|properties.*WHERE/i.test(ps);
    if (nm || pm) {
      found = true;
      console.log("\n  >>> Node: " + n.name + " (type: " + n.type + ")");
      console.log("      Name match: " + nm + ", Param match: " + pm);
      const p = JSON.stringify(n.parameters, null, 2);
      console.log("      Parameters: " + (p.length > 2000 ? p.slice(0, 2000) + "..." : p));
    }
  }
  if (!found) {
    console.log("  [!] NO nodes found that look up property owner contact info.");
    console.log("      WF8 may be missing the owner contact lookup step.");
  }

  console.log("\n--- Detailed Emergency-Related Nodes ---");
  const ek = /emergency|alert|normalize|critical|urgent|escalat|owner|contact|property/i;
  for (const n of nodes) {
    if (ek.test(n.name)) {
      console.log("\n  Node: " + n.name);
      console.log("    Type: " + n.type);
      const p = JSON.stringify(n.parameters || {}, null, 2);
      console.log("    Parameters: " + (p.length > 3000 ? p.slice(0, 3000) + "..." : p));
    }
  }
}

async function main() {
  console.log("Ergovia Diagnostic: Owner Fields + WF8 Emergency Flow");
  console.log("Timestamp: " + new Date().toISOString());
  await checkOwnerFields();
  await analyzeWF8();
  console.log("\n" + "=".repeat(70));
  console.log("  DONE");
  console.log("=".repeat(70));
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });